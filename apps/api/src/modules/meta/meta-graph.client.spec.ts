import { makeTestEnv } from '../../../test/helpers/test-env.js';
import { MetaGraphClient } from './meta-graph.client.js';
import { MetaApiException } from './meta.exceptions.js';

const client = new MetaGraphClient(makeTestEnv());

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

async function caught(promise: Promise<unknown>): Promise<MetaApiException> {
  try {
    await promise;
  } catch (error) {
    return error as MetaApiException;
  }
  throw new Error('se esperaba que fallara');
}

afterEach(() => vi.unstubAllGlobals());

describe('MetaGraphClient', () => {
  it('GET: usa la version fijada y manda el token en la query', async () => {
    const fetchMock = stubFetch(() => json({ id: '1' }));
    await expect(client.get('/me', { fields: 'id' }, 'TOK')).resolves.toEqual({
      id: '1',
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('https://graph.facebook.com/v24.0/me?');
    expect(url).toContain('fields=id');
    expect(url).toContain('access_token=TOK');
  });

  it('POST: el token va en el body, nunca en la URL', async () => {
    const fetchMock = stubFetch(() => json({ id: 'p1' }));
    await client.post('/123/photos', { url: 'https://x/y.jpg' }, 'TOK');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v24.0/123/photos');
    expect(init.method).toBe('POST');
    expect((init.body as URLSearchParams).toString()).toContain(
      'access_token=TOK',
    );
  });

  it('omite parametros undefined', async () => {
    const fetchMock = stubFetch(() => json({}));
    await client.get('/me/accounts', { after: undefined, limit: 5 });
    expect(fetchMock.mock.calls[0][0]).not.toContain('after');
  });

  it('traduce un error de Graph sin filtrar el token', async () => {
    stubFetch(() =>
      json({ error: { message: 'Invalid OAuth token', code: 190 } }, 401),
    );
    const error = await caught(client.get('/me', {}, 'SECRET-TOKEN'));
    expect(error).toBeInstanceOf(MetaApiException);
    expect(error.code).toBe(190);
    expect(JSON.stringify(error.message)).not.toContain('SECRET-TOKEN');
  });

  it('un fallo de red o timeout es transitorio y no expone la URL', async () => {
    stubFetch(() =>
      Promise.reject(new Error('fetch failed https://x?access_token=SECRET')),
    );
    const error = await caught(client.get('/me', {}, 'SECRET'));
    expect(error).toBeInstanceOf(MetaApiException);
    expect(error.isTransient).toBe(true);
    expect(error.message).not.toContain('SECRET');

    const timeout = new Error('t');
    timeout.name = 'TimeoutError';
    stubFetch(() => Promise.reject(timeout));
    const t = await caught(client.get('/me'));
    expect(t.message).toContain('a tiempo');
  });

  it('un fallo de conexion incluye solo el codigo de la causa, sin URL ni token', async () => {
    const failure = new TypeError('fetch failed https://x?access_token=SECRET', {
      cause: Object.assign(new Error('connect timeout'), {
        code: 'UND_ERR_CONNECT_TIMEOUT',
      }),
    });
    stubFetch(() => Promise.reject(failure));
    const error = await caught(client.get('/me', {}, 'SECRET'));
    expect(error.message).toBe(
      'No se pudo conectar con Meta (UND_ERR_CONNECT_TIMEOUT)',
    );
    expect(error.isTransient).toBe(true);
  });

  it('una respuesta no JSON con error HTTP igual se mapea', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>', { status: 502 })));
    const error = await caught(client.get('/me'));
    expect(error.isTransient).toBe(true);
  });
});
