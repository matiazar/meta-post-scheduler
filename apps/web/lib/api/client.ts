export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Error de la API ya traducido a un mensaje que se le puede mostrar al usuario. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACKS: Record<number, string> = {
  401: 'Tu sesión venció. Iniciá sesión de nuevo',
  413: 'El archivo es demasiado grande',
  429: 'Demasiados intentos seguidos. Esperá unos minutos e intentá de nuevo',
  503: 'El servicio no está disponible por ahora. Probá de nuevo en unos minutos',
};

/** Nest devuelve `message` como texto o como lista (errores de validacion). */
export function messageFromBody(body: unknown, status: number): string {
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message: unknown }).message
      : undefined;
  // El 413 de multer llega en ingles: se reemplaza siempre
  if (status === 413) return FALLBACKS[413];
  if (typeof message === 'string' && message.length > 0) return message;
  if (Array.isArray(message) && message.length > 0) {
    return message.filter((m) => typeof m === 'string').join('. ');
  }
  return FALLBACKS[status] ?? 'Algo salió mal. Probá de nuevo en unos minutos';
}

let onUnauthorized: (() => void) | null = null;

/** La navegacion la registra el layout de la app (usa el router de Next). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Llama a la API con la cookie de sesion. Si la sesion vencio (401) lleva al login,
 * salvo en el propio login, donde un 401 significa "credenciales incorrectas".
 */
export async function api<T>(
  path: string,
  { method = 'GET', body }: Options = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo',
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      onUnauthorized?.();
    }
    throw new ApiError(messageFromBody(data, response.status), response.status);
  }
  return data as T;
}
