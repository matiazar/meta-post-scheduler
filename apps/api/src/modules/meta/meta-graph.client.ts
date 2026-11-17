import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { mapGraphError } from './graph-error.js';
import { MetaApiException } from './meta.exceptions.js';

const TIMEOUT_MS = 30_000;

type Params = Record<string, string | number | boolean | undefined>;

/**
 * Unico punto de acceso a la Graph API de Meta. Hace fetch con timeout y
 * traduce los errores a MetaApiException (sin tokens ni URLs en el mensaje).
 */
@Injectable()
export class MetaGraphClient {
  protected baseUrl: string;

  constructor(@Inject(ENV) env: Env) {
    this.baseUrl = `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;
  }

  get<T>(path: string, params: Params = {}, token?: string): Promise<T> {
    return this.request<T>('GET', path, params, token);
  }

  post<T>(path: string, params: Params = {}, token?: string): Promise<T> {
    return this.request<T>('POST', path, params, token);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Params,
    token?: string,
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
    if (token) search.set('access_token', token);

    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    let fullUrl = url;
    if (method === 'GET') {
      fullUrl = `${url}?${search.toString()}`;
    } else {
      // En POST los parametros (y el token) viajan en el body, no en la URL
      init.body = search;
    }

    let response: Response;
    try {
      response = await fetch(fullUrl, init);
    } catch (error) {
      // Timeout o red caida: transitorio. No se incluye el error original (puede traer la URL)
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      // Solo el codigo de la causa (ej. UND_ERR_CONNECT_TIMEOUT, ENOTFOUND): sirve para diagnosticar y no trae URL ni token
      const cause = error instanceof Error ? error.cause : undefined;
      const code =
        cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
          ? cause.code
          : null;
      throw new MetaApiException(
        timedOut
          ? 'Meta no respondió a tiempo'
          : `No se pudo conectar con Meta${code ? ` (${code})` : ''}`,
        null,
        null,
        true,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) throw mapGraphError(response.status, body);
    return body as T;
  }
}
