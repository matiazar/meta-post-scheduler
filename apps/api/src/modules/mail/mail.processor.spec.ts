import type { Job } from 'bullmq';
import type { Env } from '../../config/env.js';
import { MailProcessor } from './mail.processor.js';
import type { MailJobData } from './mail.service.js';

const env = { MAIL_FROM: 'Panel <no-reply@example.com>' } as Env;
const job = {
  data: { to: 'admin@example.com', subject: 'Asunto', text: 'Cuerpo' },
} as Job<MailJobData>;

describe('MailProcessor', () => {
  it('envia el mail encolado con el remitente de MAIL_FROM', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await new MailProcessor({ sendMail }, env).process(job);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Panel <no-reply@example.com>',
      to: 'admin@example.com',
      subject: 'Asunto',
      text: 'Cuerpo',
    });
  });

  it('si el SMTP falla propaga el error para que BullMQ reintente', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('SMTP caido'));
    await expect(
      new MailProcessor({ sendMail }, env).process(job),
    ).rejects.toThrow('SMTP caido');
  });
});
