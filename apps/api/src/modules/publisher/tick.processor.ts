import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ErrorReporterService } from '../errors/error-reporter.service.js';
import { TICK_EVERY_MS, TICK_QUEUE } from './publisher.constants.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { TickService } from './tick.service.js';

const SCHEDULER_ID = 'publisher-tick';
/** Cada cuanto se revisa si hay tokens por renovar (los de Threads vencen a los 60 dias) */
const REFRESH_CHECK_EVERY_MS = 60 * 60_000;

/** Corre el tick cada minuto (job repetible de BullMQ). Solo vive en el worker. */
@Processor(TICK_QUEUE)
export class TickProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(TickProcessor.name);
  private lastRefreshCheck = 0;

  constructor(
    private readonly tickService: TickService,
    private readonly connections: ConnectionsService,
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
    // Despues del tick: renovar tokens puede tardar (cada pedido tiene timeout) y no debe demorar publicaciones
    await this.refreshTokens();
  }

  /** Una vez por hora. Si falla no frena el tick: el publicador no depende de esto. */
  private async refreshTokens(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefreshCheck < REFRESH_CHECK_EVERY_MS) return;
    this.lastRefreshCheck = now;
    try {
      const refreshed = await this.connections.refreshDue();
      if (refreshed > 0) {
        this.logger.log(`${refreshed} token(s) de conexiones renovados`);
      }
    } catch (error) {
      await this.reporter.report(error, { source: 'connections-refresh' });
    }
  }
}
