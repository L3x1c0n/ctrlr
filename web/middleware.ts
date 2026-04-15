import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  // API routes still require a valid session cookie (sent automatically by browser)
  // but return 401 instead of redirecting, so the client knows what happened
  if (pathname.startsWith('/api/')) {
    const session = request.cookies.get('ctrlr-session')?.value
    const secret = process.env.AUTH_SECRET
    if (!secret || session !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  const session = request.cookies.get('ctrlr-session')?.value
  const secret = process.env.AUTH_SECRET

  if (!secret || session !== secret) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
