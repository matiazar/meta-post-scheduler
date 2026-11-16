import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

export const MAIL_QUEUE = 'mail';

export interface MailJobData {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJobData>,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Encola un mail para el admin (ADMIN_EMAIL). El envio real lo hace el worker. */
  async notifyAdmin(subject: string, text: string): Promise<void> {
    await this.queue.add(
      'send',
      { to: this.env.ADMIN_EMAIL, subject, text },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
