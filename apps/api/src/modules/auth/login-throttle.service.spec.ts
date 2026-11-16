import { TooManyLoginAttemptsException } from './auth.exceptions.js';
import {
  LOGIN_WINDOW_MS,
  LoginThrottleService,
  MAX_FAILED_LOGINS,
  MAX_TRACKED_KEYS,
} from './login-throttle.service.js';

function attempts(
  service: LoginThrottleService,
  key: string,
  n: number,
  at = 0,
) {
  for (let i = 0; i < n; i++) service.registerAttempt(key, at);
}

describe('LoginThrottleService', () => {
  it('permite hasta el maximo de intentos y bloquea el siguiente', () => {
    const service = new LoginThrottleService();
    attempts(service, 'ip1', MAX_FAILED_LOGINS);
    expect(() => service.registerAttempt('ip1', 1000)).toThrow(
      TooManyLoginAttemptsException,
    );
  });

  it('el bloqueo es por clave: otra IP no se afecta', () => {
    const service = new LoginThrottleService();
    attempts(service, 'ip1', MAX_FAILED_LOGINS);
    expect(() => service.registerAttempt('ip2', 1000)).not.toThrow();
  });

  it('se libera al pasar la ventana de 15 minutos', () => {
    const service = new LoginThrottleService();
    attempts(service, 'ip1', MAX_FAILED_LOGINS);
    expect(() => service.registerAttempt('ip1', LOGIN_WINDOW_MS - 1)).toThrow();
    expect(() => service.registerAttempt('ip1', LOGIN_WINDOW_MS)).not.toThrow();
  });

  it('reset borra los intentos acumulados', () => {
    const service = new LoginThrottleService();
    attempts(service, 'ip1', MAX_FAILED_LOGINS);
    service.reset('ip1');
    expect(() => service.registerAttempt('ip1', 1000)).not.toThrow();
  });

  it('el mapa tiene un tope duro aunque todas las claves esten vigentes', () => {
    const service = new LoginThrottleService();
    for (let i = 0; i < MAX_TRACKED_KEYS + 50; i++) {
      service.registerAttempt(`ip-${i}`, 1000);
    }
    expect(service.trackedKeys).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
    // la clave mas reciente sigue registrada
    attempts(
      service,
      `ip-${MAX_TRACKED_KEYS + 49}`,
      MAX_FAILED_LOGINS - 1,
      1000,
    );
    expect(() =>
      service.registerAttempt(`ip-${MAX_TRACKED_KEYS + 49}`, 1000),
    ).toThrow(TooManyLoginAttemptsException);
  });
});
