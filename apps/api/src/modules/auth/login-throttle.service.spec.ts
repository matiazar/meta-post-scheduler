import { TooManyLoginAttemptsException } from './auth.exceptions.js';
import {
  LOGIN_WINDOW_MS,
  LoginThrottleService,
  MAX_FAILED_LOGINS,
} from './login-throttle.service.js';

function failTimes(
  service: LoginThrottleService,
  key: string,
  n: number,
  at = 0,
) {
  for (let i = 0; i < n; i++) service.recordFailure(key, at);
}

describe('LoginThrottleService', () => {
  it('permite hasta el maximo de fallos y bloquea el siguiente intento', () => {
    const service = new LoginThrottleService();
    failTimes(service, 'ip1', MAX_FAILED_LOGINS - 1);
    expect(() => service.assertAllowed('ip1', 1000)).not.toThrow();
    failTimes(service, 'ip1', 1);
    expect(() => service.assertAllowed('ip1', 1000)).toThrow(
      TooManyLoginAttemptsException,
    );
  });

  it('el bloqueo es por clave: otra IP no se afecta', () => {
    const service = new LoginThrottleService();
    failTimes(service, 'ip1', MAX_FAILED_LOGINS);
    expect(() => service.assertAllowed('ip2', 1000)).not.toThrow();
  });

  it('se libera al pasar la ventana de 15 minutos', () => {
    const service = new LoginThrottleService();
    failTimes(service, 'ip1', MAX_FAILED_LOGINS);
    expect(() => service.assertAllowed('ip1', LOGIN_WINDOW_MS - 1)).toThrow();
    expect(() => service.assertAllowed('ip1', LOGIN_WINDOW_MS)).not.toThrow();
  });

  it('reset borra los fallos acumulados', () => {
    const service = new LoginThrottleService();
    failTimes(service, 'ip1', MAX_FAILED_LOGINS);
    service.reset('ip1');
    expect(() => service.assertAllowed('ip1', 1000)).not.toThrow();
  });
});
