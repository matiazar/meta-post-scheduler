import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import type { ErrorReporterService } from './error-reporter.service.js';

function setup() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', originalUrl: '/algo' }),
    }),
  } as unknown as ArgumentsHost;
  const report = vi.fn().mockResolvedValue(undefined);
  const filter = new AllExceptionsFilter({
    report,
  } as unknown as ErrorReporterService);
  return { filter, host, status, json, report };
}

describe('AllExceptionsFilter', () => {
  it('responde los 4xx tal cual y no reporta', () => {
    const { filter, host, status, json, report } = setup();
    filter.catch(new BadRequestException('dato invalido'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'dato invalido' }),
    );
    expect(report).not.toHaveBeenCalled();
  });

  it('un error no controlado da 500 generico y se reporta', () => {
    const { filter, host, status, json, report } = setup();
    const error = new Error('detalle tecnico interno');
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain(
      'detalle tecnico',
    );
    expect(report).toHaveBeenCalledWith(error, { method: 'GET', url: '/algo' });
  });

  it('503 intencional se responde tal cual y no se reporta', () => {
    const { filter, host, status, report } = setup();
    filter.catch(new ServiceUnavailableException({ db: 'down' }), host);
    expect(status).toHaveBeenCalledWith(503);
    expect(report).not.toHaveBeenCalled();
  });

  it('otro HttpException 5xx conserva su status y se reporta', () => {
    const { filter, host, status, report } = setup();
    filter.catch(new InternalServerErrorException('x'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
