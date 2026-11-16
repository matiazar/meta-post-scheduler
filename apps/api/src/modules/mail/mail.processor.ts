import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MAIL_QUEUE, type MailJobData } from './mail.service.js';

export const MAIL_TRANSPORT = 'MAIL_TRANSPORT';

export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

/** Envia los mails encolados. Solo corre en el worker. Si falla, BullMQ reintenta. */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    await this.transport.sendMail({
      from: this.env.MAIL_FROM,
      to: job.data.to,
      subject: job.data.subject,
      text: job.data.text,
    });
  }
}
