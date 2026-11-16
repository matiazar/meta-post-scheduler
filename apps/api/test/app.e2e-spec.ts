import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/modules/errors/all-exceptions.filter.js';
import { ErrorReporterService } from '../src/modules/errors/error-reporter.service.js';
import { HealthController } from '../src/modules/health/health.controller.js';
import { HealthService } from '../src/modules/health/health.service.js';

/**
 * Test de humo HTTP: controller + filtro global reales, DB y Redis simulados.
 * El e2e contra Postgres y Redis reales se agrega cuando haya DB de test (etapa 2).
 */
describe('GET /health (humo)', () => {
  let app: INestApplication;
  const check = vi.fn();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { check } },
        { provide: ErrorReporterService, useValue: { report: vi.fn() } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 cuando todo esta arriba', async () => {
    check.mockResolvedValue({ status: 'ok', db: 'up', redis: 'up' });
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('503 con detalle cuando algo esta caido', async () => {
    check.mockResolvedValue({ status: 'error', db: 'down', redis: 'up' });
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ db: 'down', redis: 'up' });
  });
});
