import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { HealthService, type HealthResult } from './health.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(): Promise<HealthResult> {
    const result = await this.health.check();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
