import { JwtService } from '@nestjs/jwt';
import {
  makeTestEnv,
  TEST_JWT_SECRET,
  TEST_PASSWORD,
} from '../../../test/helpers/test-env.js';
import {
  InvalidCredentialsException,
  SessionRequiredException,
  TooManyLoginAttemptsException,
} from './auth.exceptions.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';

const env = makeTestEnv();

function jwtService(secret = TEST_JWT_SECRET) {
  return new JwtService({
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: 3600 },
    verifyOptions: { algorithms: ['HS256'] },
  });
}

function setup() {
  return new AuthService(jwtService(), new LoginThrottleService(), env);
}

describe('AuthService.login', () => {
  it('con credenciales correctas devuelve un token de sesion valido', async () => {
    const auth = setup();
    const { token } = await auth.login(env.ADMIN_EMAIL, TEST_PASSWORD, 'ip');
    await expect(auth.verifySession(token)).resolves.toEqual({
      email: env.ADMIN_EMAIL,
    });
  });

  it('ignora mayusculas y espacios del email', async () => {
    await expect(
      setup().login('  ADMIN@Example.com ', TEST_PASSWORD, 'ip'),
    ).resolves.toEqual({
      token: expect.any(String),
      email: env.ADMIN_EMAIL,
    });
  });

  it('rechaza contraseña incorrecta', async () => {
    await expect(
      setup().login(env.ADMIN_EMAIL, 'incorrecta-123', 'ip'),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('rechaza email incorrecto aunque la contraseña sea la correcta, con el mismo error', async () => {
    await expect(
      setup().login('otro@example.com', TEST_PASSWORD, 'ip'),
    ).rejects.toThrow(InvalidCredentialsException);
  });

  it('tras 5 fallos bloquea incluso con la contraseña correcta', async () => {
    const auth = setup();
    for (let i = 0; i < 5; i++) {
      await expect(auth.login(env.ADMIN_EMAIL, 'mal', 'ip')).rejects.toThrow(
        InvalidCredentialsException,
      );
    }
    await expect(
      auth.login(env.ADMIN_EMAIL, TEST_PASSWORD, 'ip'),
    ).rejects.toThrow(TooManyLoginAttemptsException);
  });

  it('las peticiones en paralelo cuentan: no se pasa del limite de intentos', async () => {
    const auth = setup();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        auth.login(env.ADMIN_EMAIL, 'mal', 'ip'),
      ),
    );
    const rejected = results.map((r) =>
      r.status === 'rejected' ? r.reason : null,
    );
    expect(
      rejected.filter((e) => e instanceof InvalidCredentialsException),
    ).toHaveLength(5);
    expect(
      rejected.filter((e) => e instanceof TooManyLoginAttemptsException),
    ).toHaveLength(7);
  });

  it('un login correcto reinicia el contador de fallos', async () => {
    const auth = setup();
    for (let i = 0; i < 4; i++) {
      await expect(auth.login(env.ADMIN_EMAIL, 'mal', 'ip')).rejects.toThrow(
        InvalidCredentialsException,
      );
    }
    await auth.login(env.ADMIN_EMAIL, TEST_PASSWORD, 'ip');
    for (let i = 0; i < 4; i++) {
      await expect(auth.login(env.ADMIN_EMAIL, 'mal', 'ip')).rejects.toThrow(
        InvalidCredentialsException,
      );
    }
  });
});

describe('AuthService.verifySession', () => {
  const auth = setup();

  it('rechaza un token malformado', async () => {
    await expect(auth.verifySession('no-es-un-jwt')).rejects.toThrow(
      SessionRequiredException,
    );
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const forged = await jwtService('otro-secreto-'.padEnd(48, 'y')).signAsync({
      sub: env.ADMIN_EMAIL,
    });
    await expect(auth.verifySession(forged)).rejects.toThrow(
      SessionRequiredException,
    );
  });

  it('rechaza un token vencido', async () => {
    const expired = await jwtService().signAsync(
      { sub: env.ADMIN_EMAIL },
      { expiresIn: -10 },
    );
    await expect(auth.verifySession(expired)).rejects.toThrow(
      SessionRequiredException,
    );
  });

  it('rechaza un token valido de otro sujeto', async () => {
    const other = await jwtService().signAsync({ sub: 'otro@example.com' });
    await expect(auth.verifySession(other)).rejects.toThrow(
      SessionRequiredException,
    );
  });

  it('rechaza un token con algoritmo "none"', async () => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: env.ADMIN_EMAIL })}.`;
    await expect(auth.verifySession(unsigned)).rejects.toThrow(
      SessionRequiredException,
    );
  });
});
