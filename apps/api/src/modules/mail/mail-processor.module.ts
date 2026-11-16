import { Module } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MailModule } from './mail.module.js';
import { MAIL_TRANSPORT, MailProcessor } from './mail.processor.js';

/** Solo lo importa el worker: la API no consume la cola de mails. */
@Module({
  imports: [MailModule],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ENV],
      useFactory: (env: Env) =>
        nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
          connectionTimeout: 30_000,
          socketTimeout: 30_000,
        }),
    },
    MailProcessor,
  ],
})
export class MailProcessorModule {}
