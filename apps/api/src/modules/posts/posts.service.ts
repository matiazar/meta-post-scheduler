import { Injectable } from '@nestjs/common';
import type {
  AspectRatio,
  FitMode,
  Network,
  PostStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { BrandNotFoundException } from '../brands/brands.exceptions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreatePostDto,
  ListPostsQuery,
  PostTargetDto,
  UpdatePostDto,
} from './dto/post.dto.js';
import { derivePostStatus } from './post-status.js';
import { PostMediaService, type GeneratedMedia } from './post-media.service.js';
import {
  CaptionTooLongException,
  CarouselSizeException,
  InvalidPostException,
  PostActionNotAllowedException,
  PostNotEditableException,
  PostNotFoundException,
  ScheduledAtInPastException,
  TargetNotInBrandException,
} from './posts.exceptions.js';

export const IG_CAPTION_LIMIT = 2200;
export const MAX_MEDIA = 10;
const MAX_RANGE_DAYS = 100;
const MAX_LIST = 500;
const EDITABLE: PostStatus[] = ['DRAFT', 'SCHEDULED'];

const POST_INCLUDE = {
  brand: { select: { id: true, name: true, slug: true, color: true } },
  media: {
    orderBy: { position: 'asc' },
    include: { media: { select: { originalFilename: true } } },
  },
  targets: {
    orderBy: { createdAt: 'asc' },
    include: {
      socialAccount: {
        select: { network: true, name: true, username: true, pictureUrl: true },
      },
      attemptLog: {
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          startedAt: true,
          finishedAt: true,
          ok: true,
          errorCode: true,
          errorMessage: true,
        },
      },
    },
  },
} satisfies Prisma.PostInclude;

type PostWithRelations = Prisma.PostGetPayload<{
  include: typeof POST_INCLUDE;
}>;

export interface PostView {
  id: string;
  brand: { id: string; name: string; slug: string; color: string };
  caption: string;
  scheduledAt: Date | null;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
  media: {
    mediaId: string;
    position: number;
    filename: string;
    publicUrl: string | null;
    width: number | null;
    height: number | null;
  }[];
  targets: {
    id: string;
    socialAccountId: string;
    network: Network;
    accountName: string;
    username: string | null;
    pictureUrl: string | null;
    captionOverride: string | null;
    status: string;
    attempts: number;
    nextAttemptAt: Date | null;
    lastError: string | null;
    lastErrorCode: string | null;
    externalPostId: string | null;
    permalink: string | null;
    publishedAt: Date | null;
    attemptLog: {
      startedAt: Date;
      finishedAt: Date | null;
      ok: boolean;
      errorCode: string | null;
      errorMessage: string | null;
    }[];
  }[];
}

export interface PostListItem {
  id: string;
  brand: { id: string; name: string; color: string };
  caption: string;
  scheduledAt: Date | null;
  status: PostStatus;
  aspectRatio: AspectRatio;
  thumbnailUrl: string | null;
  mediaCount: number;
  targets: { network: Network; accountName: string; status: string }[];
}

interface Draft {
  caption: string;
  aspectRatio: AspectRatio;
  fitMode: FitMode;
  scheduledAt: Date | null;
  mediaIds: string[];
  targets: { socialAccountId: string; captionOverride: string | null }[];
}

/** Cantidad de caracteres como los cuenta Instagram (puntos de codigo, no unidades UTF-16). */
export function countChars(text: string): number {
  return Array.from(text).length;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postMedia: PostMediaService,
  ) {}

  async create(dto: CreatePostDto): Promise<PostView> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: dto.brandId },
      select: { id: true },
    });
    if (!brand) throw new BrandNotFoundException();

    const draft: Draft = {
      caption: dto.caption ?? '',
      aspectRatio: dto.aspectRatio ?? 'SQUARE',
      fitMode: dto.fitMode ?? 'CROP',
      scheduledAt: dto.scheduledAt ?? null,
      mediaIds: dto.mediaIds ?? [],
      targets: this.normalizeTargets(dto.targets),
    };
    await this.validateDraft(dto.brandId, draft);

    const generated = await this.postMedia.generate(
      draft.mediaIds,
      draft.aspectRatio,
      draft.fitMode,
    );
    try {
      const post = await this.prisma.post.create({
        data: {
          brandId: dto.brandId,
          caption: draft.caption,
          scheduledAt: draft.scheduledAt,
          aspectRatio: draft.aspectRatio,
          fitMode: draft.fitMode,
          targets: { create: draft.targets },
          media: { create: this.mediaRows(generated) },
        },
        select: { id: true },
      });
      return await this.get(post.id);
    } catch (error) {
      await this.postMedia.deleteKeys(generated.map((g) => g.processedKey));
      throw error;
    }
  }

  async update(id: string, dto: UpdatePostDto): Promise<PostView> {
    const existing = await this.findForUpdate(id);
    if (!EDITABLE.includes(existing.status))
      throw new PostNotEditableException();

    const draft: Draft = {
      caption: dto.caption ?? existing.caption,
      aspectRatio: dto.aspectRatio ?? existing.aspectRatio,
      fitMode: dto.fitMode ?? existing.fitMode,
      scheduledAt:
        dto.scheduledAt !== undefined ? dto.scheduledAt : existing.scheduledAt,
      mediaIds: dto.mediaIds ?? existing.media.map((m) => m.mediaId),
      targets: dto.targets
        ? this.normalizeTargets(dto.targets)
        : existing.targets.map((t) => ({
            socialAccountId: t.socialAccountId,
            captionOverride: t.captionOverride,
          })),
    };
    await this.validateDraft(existing.brandId, draft);

    if (existing.status === 'SCHEDULED') {
      // Un post programado tiene que seguir siendo publicable despues del cambio
      this.assertSchedulable(draft);
      if (dto.scheduledAt !== undefined) this.assertFuture(draft.scheduledAt);
    }

    const sameMedia =
      draft.mediaIds.length === existing.media.length &&
      draft.mediaIds.every((m, i) => m === existing.media[i].mediaId);
    const regenerate =
      !sameMedia ||
      draft.aspectRatio !== existing.aspectRatio ||
      draft.fitMode !== existing.fitMode;
    const generated = regenerate
      ? await this.postMedia.generate(
          draft.mediaIds,
          draft.aspectRatio,
          draft.fitMode,
        )
      : [];

    try {
      await this.prisma.$transaction(async (tx) => {
        // Si el publicador tomo el post mientras tanto, no se pisa
        const claimed = await tx.post.updateMany({
          where: { id, status: { in: EDITABLE } },
          data: {
            caption: draft.caption,
            aspectRatio: draft.aspectRatio,
            fitMode: draft.fitMode,
            scheduledAt: draft.scheduledAt,
          },
        });
        if (claimed.count === 0) throw new PostNotEditableException();
        // El publicador puede haber encolado un destino sin haber cambiado aun el estado del post:
        // borrarlo o regenerar las imagenes en ese momento romperia la publicacion en curso
        const touched = await tx.postTarget.count({
          where: { postId: id, status: { not: 'PENDING' } },
        });
        if (touched > 0) throw new PostNotEditableException();

        if (regenerate) {
          await tx.postMedia.deleteMany({ where: { postId: id } });
          await tx.postMedia.createMany({
            data: this.mediaRows(generated).map((row) => ({
              ...row,
              postId: id,
            })),
          });
        }
        await this.syncTargets(tx, id, draft.targets);
      });
    } catch (error) {
      await this.postMedia.deleteKeys(generated.map((g) => g.processedKey));
      throw error;
    }

    if (regenerate) {
      await this.postMedia.deleteKeys(
        existing.media.map((m) => m.processedKey),
      );
    }
    return this.get(id);
  }

  async get(id: string): Promise<PostView> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post) throw new PostNotFoundException();
    return this.toView(post);
  }

  /** Calendario: posts con fecha dentro de [from, to). Tambien filtra por marca y estado. */
  async list(query: ListPostsQuery): Promise<PostListItem[]> {
    const { from, to, brandId, status } = query;
    if ((from && !to) || (!from && to)) {
      throw new InvalidPostException('Indicá from y to juntos');
    }
    if (!from && !status) {
      throw new InvalidPostException('Indicá un rango (from y to) o un estado');
    }
    if (from && to) {
      if (to <= from)
        throw new InvalidPostException('to tiene que ser posterior a from');
      if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
        throw new InvalidPostException(
          `El rango no puede superar ${MAX_RANGE_DAYS} días`,
        );
      }
    }

    const posts = await this.prisma.post.findMany({
      where: {
        ...(from && to ? { scheduledAt: { gte: from, lt: to } } : {}),
        ...(brandId ? { brandId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      take: MAX_LIST,
      include: {
        brand: { select: { id: true, name: true, color: true } },
        media: {
          orderBy: { position: 'asc' },
          select: { publicUrl: true },
        },
        targets: {
          orderBy: { createdAt: 'asc' },
          select: {
            status: true,
            socialAccount: { select: { network: true, name: true } },
          },
        },
      },
    });
    return posts.map((p) => ({
      id: p.id,
      brand: p.brand,
      caption: p.caption.slice(0, 140),
      scheduledAt: p.scheduledAt,
      status: p.status,
      aspectRatio: p.aspectRatio,
      thumbnailUrl: p.media[0]?.publicUrl ?? null,
      mediaCount: p.media.length,
      targets: p.targets.map((t) => ({
        network: t.socialAccount.network,
        accountName: t.socialAccount.name,
        status: t.status,
      })),
    }));
  }

  /** Programa un borrador o reprograma uno ya programado. */
  async schedule(id: string, scheduledAt?: Date): Promise<PostView> {
    const post = await this.findForUpdate(id);
    if (!EDITABLE.includes(post.status)) throw new PostNotEditableException();
    const at = scheduledAt ?? post.scheduledAt;
    if (!at) throw new InvalidPostException('Falta la fecha de publicación');
    this.assertFuture(at);
    await this.markScheduled(post, at);
    return this.get(id);
  }

  /** Programa para ahora: el tick del publicador lo toma en el proximo minuto. */
  async publishNow(id: string): Promise<PostView> {
    const post = await this.findForUpdate(id);
    if (!EDITABLE.includes(post.status)) throw new PostNotEditableException();
    await this.markScheduled(post, new Date());
    return this.get(id);
  }

  async cancel(id: string): Promise<PostView> {
    const post = await this.findForUpdate(id);
    const cancellable: PostStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHING'];
    if (!cancellable.includes(post.status)) {
      throw new PostActionNotAllowedException(
        'Solo se pueden cancelar posts en borrador, programados o con reintentos pendientes',
      );
    }
    if (
      post.targets.some(
        (t) => t.status === 'QUEUED' || t.status === 'PUBLISHING',
      )
    ) {
      throw new PostActionNotAllowedException(
        'El post se está publicando en este momento y no se puede cancelar',
      );
    }
    const res = await this.prisma.post.updateMany({
      where: { id, status: { in: cancellable } },
      data: { status: 'CANCELLED' },
    });
    if (res.count === 0) throw new PostNotEditableException();
    return this.get(id);
  }

  /** Reintenta los destinos fallidos (attempts=0, ahora). Los publicados no se tocan. */
  async retry(id: string): Promise<PostView> {
    const post = await this.findForUpdate(id);
    if (post.status !== 'FAILED' && post.status !== 'PARTIAL') {
      throw new PostActionNotAllowedException(
        'Solo se pueden reintentar posts que fallaron o se publicaron parcialmente',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.postTarget.updateMany({
        where: { postId: id, status: 'FAILED' },
        data: {
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
          lastError: null,
          lastErrorCode: null,
        },
      });
      await this.recomputeStatus(id, tx);
    });
    return this.get(id);
  }

  /** Solo borradores y cancelados. Lo publicado queda como historial. */
  async remove(id: string): Promise<void> {
    const post = await this.findForUpdate(id);
    if (post.status !== 'DRAFT' && post.status !== 'CANCELLED') {
      throw new PostActionNotAllowedException(
        'Solo se pueden eliminar borradores y posts cancelados',
      );
    }
    const res = await this.prisma.post.deleteMany({
      where: { id, status: { in: ['DRAFT', 'CANCELLED'] } },
    });
    if (res.count === 0) throw new PostNotEditableException();
    await this.postMedia.deleteKeys(post.media.map((m) => m.processedKey));
  }

  /**
   * Recalcula el estado del post desde sus destinos (DEC-07). Lo usa el publicador
   * despues de cada cambio de un target. No toca DRAFT ni CANCELLED.
   */
  async recomputeStatus(
    postId: string,
    db: Pick<PrismaService, 'post' | 'postTarget'> = this.prisma,
  ): Promise<PostStatus> {
    const post = await db.post.findUnique({
      where: { id: postId },
      select: { status: true },
    });
    if (!post) throw new PostNotFoundException();
    const targets = await db.postTarget.findMany({
      where: { postId },
      select: { status: true, attempts: true },
    });
    const next = derivePostStatus(post.status, targets);
    if (next !== post.status) {
      await db.post.update({ where: { id: postId }, data: { status: next } });
    }
    return next;
  }

  // ---- internos ----

  private async findForUpdate(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        media: { orderBy: { position: 'asc' } },
        targets: true,
      },
    });
    if (!post) throw new PostNotFoundException();
    return post;
  }

  private async markScheduled(
    post: Awaited<ReturnType<PostsService['findForUpdate']>>,
    at: Date,
  ): Promise<void> {
    this.assertSchedulable({
      mediaIds: post.media.map((m) => m.mediaId),
      targets: post.targets,
    });
    const res = await this.prisma.post.updateMany({
      where: { id: post.id, status: { in: EDITABLE } },
      data: { status: 'SCHEDULED', scheduledAt: at },
    });
    if (res.count === 0) throw new PostNotEditableException();
  }

  private normalizeTargets(
    targets: PostTargetDto[] | undefined,
  ): Draft['targets'] {
    return (targets ?? []).map((t) => ({
      socialAccountId: t.socialAccountId,
      captionOverride: t.captionOverride?.trim() ? t.captionOverride : null,
    }));
  }

  private assertFuture(at: Date | null): void {
    if (!at || at.getTime() <= Date.now())
      throw new ScheduledAtInPastException();
  }

  /** Lo minimo para programar: al menos una imagen y una cuenta. */
  private assertSchedulable(draft: {
    mediaIds: string[];
    targets: unknown[];
  }): void {
    if (draft.mediaIds.length === 0) {
      throw new InvalidPostException('Falta al menos una imagen');
    }
    if (draft.targets.length === 0) {
      throw new InvalidPostException('Falta elegir al menos una cuenta');
    }
  }

  /** Reglas que valen siempre, tambien para borradores. */
  private async validateDraft(brandId: string, draft: Draft): Promise<void> {
    if (draft.mediaIds.length > MAX_MEDIA) throw new CarouselSizeException();
    await this.postMedia.assertExist(draft.mediaIds);

    const ids = draft.targets.map((t) => t.socialAccountId);
    if (new Set(ids).size !== ids.length) {
      throw new InvalidPostException('Hay cuentas repetidas');
    }
    const accounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        brandId: true,
        active: true,
        network: true,
        name: true,
      },
    });
    if (accounts.length !== ids.length) {
      throw new InvalidPostException(
        'Alguna de las cuentas elegidas no existe',
      );
    }
    if (accounts.some((a) => a.brandId !== brandId)) {
      throw new TargetNotInBrandException();
    }
    const inactive = accounts.find((a) => !a.active);
    if (inactive) {
      throw new InvalidPostException(
        `La cuenta "${inactive.name}" está inactiva. Sincronizá con Meta o elegí otra`,
      );
    }

    const networkById = new Map(accounts.map((a) => [a.id, a.network]));
    for (const target of draft.targets) {
      if (networkById.get(target.socialAccountId) !== 'INSTAGRAM') continue;
      const effective = target.captionOverride ?? draft.caption;
      if (countChars(effective) > IG_CAPTION_LIMIT) {
        throw new CaptionTooLongException(IG_CAPTION_LIMIT);
      }
    }
  }

  private mediaRows(generated: GeneratedMedia[]) {
    return generated.map((g, position) => ({
      mediaId: g.mediaId,
      position,
      processedKey: g.processedKey,
      publicUrl: g.publicUrl,
      width: g.width,
      height: g.height,
    }));
  }

  /** Deja los destinos del post exactamente como la lista: borra los que sobran, crea y actualiza. */
  private async syncTargets(
    tx: Prisma.TransactionClient,
    postId: string,
    targets: Draft['targets'],
  ): Promise<void> {
    await tx.postTarget.deleteMany({
      where: {
        postId,
        socialAccountId: { notIn: targets.map((t) => t.socialAccountId) },
      },
    });
    const current = await tx.postTarget.findMany({
      where: { postId },
      select: { socialAccountId: true },
    });
    const have = new Set(current.map((c) => c.socialAccountId));
    for (const target of targets) {
      if (have.has(target.socialAccountId)) {
        await tx.postTarget.update({
          where: {
            postId_socialAccountId: {
              postId,
              socialAccountId: target.socialAccountId,
            },
          },
          data: { captionOverride: target.captionOverride },
        });
      } else {
        await tx.postTarget.create({ data: { postId, ...target } });
      }
    }
  }

  private toView(post: PostWithRelations): PostView {
    return {
      id: post.id,
      brand: post.brand,
      caption: post.caption,
      scheduledAt: post.scheduledAt,
      aspectRatio: post.aspectRatio,
      fitMode: post.fitMode,
      status: post.status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      media: post.media.map((m) => ({
        mediaId: m.mediaId,
        position: m.position,
        filename: m.media.originalFilename,
        publicUrl: m.publicUrl,
        width: m.width,
        height: m.height,
      })),
      targets: post.targets.map((t) => ({
        id: t.id,
        socialAccountId: t.socialAccountId,
        network: t.socialAccount.network,
        accountName: t.socialAccount.name,
        username: t.socialAccount.username,
        pictureUrl: t.socialAccount.pictureUrl,
        captionOverride: t.captionOverride,
        status: t.status,
        attempts: t.attempts,
        nextAttemptAt: t.nextAttemptAt,
        lastError: t.lastError,
        lastErrorCode: t.lastErrorCode,
        externalPostId: t.externalPostId,
        permalink: t.permalink,
        publishedAt: t.publishedAt,
        attemptLog: t.attemptLog,
      })),
    };
  }
}
