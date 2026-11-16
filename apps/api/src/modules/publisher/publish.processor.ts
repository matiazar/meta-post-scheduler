import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ErrorReporterService } from '../errors/error-reporter.service.js';
import { PublishService } from './publish.service.js';
import { PUBLISH_QUEUE } from './publisher.constants.js';
import type { PublishJobData } from './tick.service.js';

/** Publica un destino por job. Varios en paralelo: IG puede tardar hasta un minuto por imagen. */
@Processor(PUBLISH_QUEUE, { concurrency: 3 })
export class PublishProcessor extends WorkerHost {
  constructor(
    private readonly publisher: PublishService,
    private readonly reporter: ErrorReporterService,
  ) {
    super();
  }

  async process(job: Job<PublishJobData>): Promise<void> {
    await this.publisher.publishTarget(job.data.targetId);
  }

  /**
   * publishTarget no lanza por errores de Meta, asi que si un job falla es por algo
   * inesperado (DB, bug). El destino queda PUBLISHING y el tick lo rescata a los 15 min.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<PublishJobData> | undefined, error: Error) {
    await this.reporter.report(error, {
      source: 'publish-job',
      targetId: job?.data.targetId,
    });
  }
}
