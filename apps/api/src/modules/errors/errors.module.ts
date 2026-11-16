import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MailModule } from '../mail/mail.module.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { ErrorReporterService } from './error-reporter.service.js';

@Module({
  imports: [MailModule],
  providers: [
    ErrorReporterService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [ErrorReporterService],
})
export class ErrorsModule {}
