import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DecryptionFailedException } from './crypto.exceptions.js';

const VERSION_PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Cifrado AES-256-GCM para los tokens de Meta guardados en la DB.
 * Formato: "v1:" + base64(iv(12) | tag(16) | texto cifrado). IV aleatorio por cada cifrado.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.TOKEN_ENC_KEY, 'base64');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return VERSION_PREFIX + Buffer.concat([iv, tag, data]).toString('base64');
  }

  decrypt(payload: string): string {
    if (!payload.startsWith(VERSION_PREFIX)) {
      throw new DecryptionFailedException();
    }
    const buffer = Buffer.from(payload.slice(VERSION_PREFIX.length), 'base64');
    if (buffer.length < IV_BYTES + TAG_BYTES) {
      throw new DecryptionFailedException();
    }
    const iv = buffer.subarray(0, IV_BYTES);
    const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const data = buffer.subarray(IV_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      // La libreria lanza errores genericos (auth tag invalido, etc.): se unifican y no se filtra detalle
      throw new DecryptionFailedException();
    }
  }
}
