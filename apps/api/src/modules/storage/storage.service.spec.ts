import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { makeTestEnv } from '../../../test/helpers/test-env.js';
import { StorageException } from './storage.exceptions.js';
import { StorageService } from './storage.service.js';

function setup(send: (cmd: unknown, opts: unknown) => Promise<unknown>) {
  const client = { send: vi.fn(send) };
  const service = new StorageService(
    client as never,
    makeTestEnv({ R2_PUBLIC_BASE_URL: 'https://media.example.com/' }),
  );
  return { client, service };
}

describe('StorageService', () => {
  it('publicUrl arma la URL sin barras dobles', () => {
    const { service } = setup(() => Promise.resolve({}));
    expect(service.publicUrl('originals/2026/11/a.jpg')).toBe(
      'https://media.example.com/originals/2026/11/a.jpg',
    );
  });

  it('put envia bucket, key, tipo y un timeout', async () => {
    const { service, client } = setup(() => Promise.resolve({}));
    await service.put('k.jpg', Buffer.from('x'), 'image/jpeg');
    const [cmd, opts] = client.send.mock.calls[0] as [
      PutObjectCommand,
      { abortSignal: AbortSignal },
    ];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'k.jpg',
      ContentType: 'image/jpeg',
    });
    expect(opts.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('get devuelve los bytes', async () => {
    const { service, client } = setup(() =>
      Promise.resolve({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(new Uint8Array([1, 2, 3])),
        },
      }),
    );
    expect(await service.get('k')).toEqual(Buffer.from([1, 2, 3]));
    expect((client.send.mock.calls[0][0] as GetObjectCommand).input.Key).toBe(
      'k',
    );
  });

  it('get sin cuerpo falla', async () => {
    const { service } = setup(() => Promise.resolve({}));
    await expect(service.get('k')).rejects.toBeInstanceOf(StorageException);
  });

  it('delete envia DeleteObject', async () => {
    const { service, client } = setup(() => Promise.resolve({}));
    await service.delete('k');
    expect(client.send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('un fallo del SDK se unifica y no filtra detalles (endpoint, claves)', async () => {
    const { service } = setup(() =>
      Promise.reject(
        new Error('https://acc.r2.cloudflarestorage.com AccessKey=SECRET'),
      ),
    );
    const error = await service.put('k', Buffer.alloc(1), 'image/jpeg').then(
      () => null,
      (e: unknown) => e as StorageException,
    );
    expect(error).toBeInstanceOf(StorageException);
    expect(error!.message).not.toContain('SECRET');
    expect(error!.getStatus()).toBe(503);
  });
});
