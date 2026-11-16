import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ErrorReporterService } from '../errors/error-reporter.service.js';
import { TICK_EVERY_MS, TICK_QUEUE } from './publisher.constants.js';
import { TickService } from './tick.service.js';

const SCHEDULER_ID = 'publisher-tick';

/** Corre el tick cada minuto (job repetible de BullMQ). Solo vive en el worker. */
@Processor(TICK_QUEUE)
export class TickProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(TickProcessor.name);

  constructor(
    private readonly tickService: TickService,
    private readonly reporter: ErrorReporterService,
    @InjectQueue(TICK_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /** Idempotente: si el scheduler ya existe en Redis se actualiza, no se duplica. */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { every: TICK_EVERY_MS },
      {
        name: 'tick',
        opts: { removeOnComplete: true, removeOnFail: 20 },
      },
    );
  }

  async process(): Promise<void> {
    try {
      const result = await this.tickService.tick();
      if (result.queued + result.requeued + result.hung > 0) {
        this.logger.log(
          `tick: ${result.queued} encolados, ${result.requeued} QUEUED rescatados, ${result.hung} PUBLISHING colgados`,
        );
      }
    } catch (error) {
      // El proximo tick (en un minuto) lo vuelve a intentar: se reporta y no se relanza
      await this.reporter.report(error, { source: 'tick' });
      this.logger.error(
        `El tick fallo: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }
}
