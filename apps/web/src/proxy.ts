import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/sign-in', '/sign-up', '/shared/', '/welcome', '/landing/'];

/** Optimistic check only: no session cookie → landing page (/) or sign-in. The API verifies the token itself. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (request.cookies.has('easyfi_at') || request.cookies.has('easyfi_rt'))
    return NextResponse.next();
  const url = request.nextUrl.clone();
  if (pathname === '/') {
    url.pathname = '/welcome';
    return NextResponse.redirect(url);
  }
  url.pathname = '/sign-in';
  url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|ico)$).*)'],
};
