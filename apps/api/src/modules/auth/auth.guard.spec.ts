import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { SESSION_COOKIE } from './auth.constants.js';
import { SessionRequiredException } from './auth.exceptions.js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

function setup(opts: { isPublic: boolean; cookies?: Record<string, unknown> }) {
  const request = { cookies: opts.cookies } as unknown as AuthenticatedRequest;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(opts.isPublic),
  } as unknown as Reflector;
  const verifySession = vi.fn();
  const guard = new AuthGuard(reflector, {
    verifySession,
  } as unknown as AuthService);
  return { guard, context, request, verifySession };
}

describe('AuthGuard', () => {
  it('deja pasar las rutas publicas sin mirar la cookie', async () => {
    const { guard, context, verifySession } = setup({ isPublic: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { [SESSION_COOKIE]: '' }, { [SESSION_COOKIE]: 123 }])(
    'sin cookie de sesion valida lanza SessionRequired (%j)',
    async (cookies) => {
      const { guard, context } = setup({ isPublic: false, cookies });
      await expect(guard.canActivate(context)).rejects.toThrow(
        SessionRequiredException,
      );
    },
  );

  it('con sesion valida adjunta el usuario al request', async () => {
    const { guard, context, request, verifySession } = setup({
      isPublic: false,
      cookies: { [SESSION_COOKIE]: 'token' },
    });
    verifySession.mockResolvedValue({ email: 'admin@example.com' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ email: 'admin@example.com' });
  });

  it('con token invalido propaga el error', async () => {
    const { guard, context, verifySession } = setup({
      isPublic: false,
      cookies: { [SESSION_COOKIE]: 'malo' },
    });
    verifySession.mockRejectedValue(new SessionRequiredException());
    await expect(guard.canActivate(context)).rejects.toThrow(
      SessionRequiredException,
    );
  });
});
