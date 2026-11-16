import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Mismo nombre que la cookie que pone la API (auth.constants.ts)
const SESSION_COOKIE = 'sp_session';

/**
 * Chequeo optimista: sin cookie de sesion se manda al login y con cookie no se
 * muestra el login. La validez real la decide la API en cada llamada (401 -> login).
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isLogin = request.nextUrl.pathname === '/login';

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
