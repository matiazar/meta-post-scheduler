import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { redactString } from '../../common/redact.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUBLISH_QUEUE } from '../publisher/publisher.constants.js';

export interface HealthResult {
  status: 'ok' | 'error';
  db: 'up' | 'down';
  redis: 'up' | 'down';
}

const CHECK_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PUBLISH_QUEUE) private readonly queue: Queue,
  ) {}

  async check(): Promise<HealthResult> {
    const [db, redis] = await Promise.all([
      this.probe('db', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.probe('redis', async () => {
        await this.queue.getJobCounts();
      }),
    ]);
    return {
      status: db && redis ? 'ok' : 'error',
      db: db ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
    };
  }

  private async probe(name: string, fn: () => Promise<void>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
    });
    try {
      await Promise.race([fn(), timeout]);
      return true;
    } catch (error) {
      const detail =
        error instanceof Error
          ? `${error.name} ${(error as { code?: string }).code ?? ''} ${error.message}`
          : String(error);
      this.logger.warn(`Health ${name} fallo: ${redactString(detail.trim())}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
