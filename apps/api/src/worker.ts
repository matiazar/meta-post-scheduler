import './common/ipv4-first.js';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { redactString } from './common/redact.js';
import { ErrorReporterService } from './modules/errors/error-reporter.service.js';
import { WorkerModule } from './worker.module.js';

const logger = new Logger('Worker');
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();

// Errores fuera de un job: se reportan al admin (spec 9b). Un uncaughtException
// deja el proceso en estado indefinido: se reporta y se sale para que lo reinicie el supervisor.
const reporter = app.get(ErrorReporterService);

process.on('unhandledRejection', (reason) => {
  logger.error(redactString(String(reason)));
  void reporter.report(reason, { source: 'worker:unhandledRejection' });
});

process.on('uncaughtException', (error) => {
  logger.error(redactString(error.message));
  const exit = () => process.exit(1);
  void reporter
    .report(error, { source: 'worker:uncaughtException' })
    .then(exit, exit);
  setTimeout(exit, 5000).unref();
});
