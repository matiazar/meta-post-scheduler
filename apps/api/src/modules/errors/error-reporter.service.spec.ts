import type { Env } from '../../config/env.js';
import type { MailService } from '../mail/mail.service.js';
import { ErrorReporterService } from './error-reporter.service.js';

function setup(nodeEnv: Env['NODE_ENV']) {
  const notifyAdmin = vi.fn().mockResolvedValue(undefined);
  const mail = { notifyAdmin } as unknown as MailService;
  const reporter = new ErrorReporterService(mail, { NODE_ENV: nodeEnv } as Env);
  return { reporter, notifyAdmin };
}

describe('ErrorReporterService', () => {
  it('en produccion manda mail al admin', async () => {
    const { reporter, notifyAdmin } = setup('production');
    await reporter.report(new Error('boom'), { url: '/x' });
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(notifyAdmin.mock.calls[0][0]).toContain('boom');
  });

  it.each(['development', 'test'] as const)(
    'en %s no reporta',
    async (nodeEnv) => {
      const { reporter, notifyAdmin } = setup(nodeEnv);
      await reporter.report(new Error('boom'));
      expect(notifyAdmin).not.toHaveBeenCalled();
    },
  );

  it('redacta tokens en mensaje y contexto', async () => {
    const { reporter, notifyAdmin } = setup('production');
    await reporter.report(new Error('fallo ?access_token=SECRET123'), {
      headers: { authorization: 'Bearer SECRET456' },
    });
    const [subject, body] = notifyAdmin.mock.calls[0];
    expect(`${subject}${body}`).not.toContain('SECRET123');
    expect(`${subject}${body}`).not.toContain('SECRET456');
  });

  it('manda 1 mail por firma de error cada 10 minutos', async () => {
    const { reporter, notifyAdmin } = setup('production');
    const error = new Error('repetido');
    await reporter.report(error, {}, 0);
    await reporter.report(error, {}, 9 * 60 * 1000);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    await reporter.report(error, {}, 11 * 60 * 1000);
    expect(notifyAdmin).toHaveBeenCalledTimes(2);
  });

  it('si falla el envio no lanza', async () => {
    const { reporter, notifyAdmin } = setup('production');
    notifyAdmin.mockRejectedValue(new Error('redis caido'));
    await expect(reporter.report(new Error('boom'))).resolves.toBeUndefined();
  });

  it('el mismo error con distinto mensaje (ids variables) cuenta como uno solo', async () => {
    const { reporter, notifyAdmin } = setup('production');
    const fail = (id: number) => new Error(`registro ${id} no encontrado`);
    await reporter.report(fail(1), {}, 0);
    await reporter.report(fail(2), {}, 1000);
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it('si el envio falla no queda throttled: el proximo intento reporta', async () => {
    const { reporter, notifyAdmin } = setup('production');
    const error = new Error('boom');
    notifyAdmin.mockRejectedValueOnce(new Error('redis caido'));
    await reporter.report(error, {}, 0);
    await reporter.report(error, {}, 1000);
    expect(notifyAdmin).toHaveBeenCalledTimes(2);
  });
});
