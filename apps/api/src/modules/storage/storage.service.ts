import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { StorageException } from './storage.exceptions.js';

export const S3_CLIENT = 'S3_CLIENT';

/** Uploads de imagenes: 60 s (spec 9b) */
const TIMEOUT_MS = 60_000;

/** Unico punto de acceso a Cloudflare R2. */
@Injectable()
export class StorageService {
  private readonly publicBase: string;
  private readonly bucket: string;

  constructor(
    @Inject(S3_CLIENT) private readonly client: Pick<S3Client, 'send'>,
    @Inject(ENV) env: Env,
  ) {
    this.bucket = env.R2_BUCKET;
    this.publicBase = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.run(
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
          { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
        ),
      'guardar',
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.run(
      () =>
        this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
        ),
      'leer',
    );
    if (!res.Body) throw new StorageException('leer');
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.run(
      () =>
        this.client.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
        ),
      'borrar',
    );
  }

  /** Cualquier fallo del SDK se unifica: el detalle (puede traer endpoint o claves) no sale. */
  private async run<T>(
    fn: () => Promise<T>,
    action: 'guardar' | 'leer' | 'borrar',
  ): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new StorageException(action);
    }
  }
}
