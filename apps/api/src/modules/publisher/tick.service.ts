import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PostsService } from '../posts/posts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublishService } from './publish.service.js';
import {
  PUBLISH_QUEUE,
  PUBLISHING_STALE_MS,
  QUEUED_STALE_MS,
  TICK_BATCH,
} from './publisher.constants.js';

export interface PublishJobData {
  targetId: string;
}

export interface TickResult {
  queued: number;
  requeued: number;
  hung: number;
}

interface DueTarget {
  id: string;
  postId: string;
  attempts: number;
}

/**
 * El tick (cada minuto): rescata destinos colgados, toma los vencidos con
 * FOR UPDATE SKIP LOCKED y encola un job de publicacion por cada uno (DEC-02).
 */
@Injectable()
export class TickService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly publisher: PublishService,
    @InjectQueue(PUBLISH_QUEUE) private readonly queue: Queue<PublishJobData>,
  ) {}

  async tick(now: Date = new Date()): Promise<TickResult> {
    const requeued = await this.recoverQueued(now);
    const hung = await this.recoverPublishing(now);
    const due = await this.claimDue(now);
    if (due.length > 0) {
      await this.queue.addBulk(
        due.map((target) => ({
          name: 'publish',
          data: { targetId: target.id },
          opts: {
            jobId: `${target.id}-${target.attempts}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        })),
      );
    }
    return { queued: due.length, requeued, hung };
  }

  /** QUEUED que nadie tomo: el job se perdio. Vuelve a PENDING sin gastar intento. */
  private async recoverQueued(now: Date): Promise<number> {
    const stale = await this.prisma.postTarget.findMany({
      where: {
        status: 'QUEUED',
        queuedAt: { lt: new Date(now.getTime() - QUEUED_STALE_MS) },
      },
      select: { id: true, postId: true },
    });
    if (stale.length === 0) return 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.postTarget.updateMany({
        where: { id: { in: stale.map((t) => t.id) }, status: 'QUEUED' },
        data: { status: 'PENDING', queuedAt: null },
      });
      for (const postId of new Set(stale.map((t) => t.postId))) {
        await this.posts.recomputeStatus(postId, tx);
      }
    });
    return stale.length;
  }

  private async recoverPublishing(now: Date): Promise<number> {
    const hung = await this.prisma.postTarget.findMany({
      where: {
        status: 'PUBLISHING',
        startedAt: { lt: new Date(now.getTime() - PUBLISHING_STALE_MS) },
      },
      select: {
        id: true,
        postId: true,
        attempts: true,
        dailyLimitSince: true,
        socialAccount: { select: { name: true, network: true } },
      },
    });
    for (const target of hung) {
      await this.publisher.recoverHungPublishing(target);
    }
    return hung.length;
  }

  /** Toma los vencidos y los marca QUEUED en la misma transaccion (SKIP LOCKED: sin duplicados). */
  private async claimDue(now: Date): Promise<DueTarget[]> {
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<DueTarget[]>`
        SELECT t."id", t."postId", t."attempts"
        FROM "post_targets" t
        JOIN "posts" p ON p."id" = t."postId"
        WHERE t."status" = 'PENDING'
          AND p."status" NOT IN ('DRAFT', 'CANCELLED')
          AND p."scheduledAt" <= ${now}
          AND (t."nextAttemptAt" IS NULL OR t."nextAttemptAt" <= ${now})
        ORDER BY p."scheduledAt" ASC
        LIMIT ${TICK_BATCH}
        FOR UPDATE OF t SKIP LOCKED`;
      if (due.length === 0) return [];
      await tx.postTarget.updateMany({
        where: { id: { in: due.map((t) => t.id) } },
        data: { status: 'QUEUED', queuedAt: now },
      });
      for (const postId of new Set(due.map((t) => t.postId))) {
        await this.posts.recomputeStatus(postId, tx);
      }
      return due;
    });
  }
}
