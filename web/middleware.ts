import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://fonts.bunny.net",
  "img-src 'self' data: https://image.tmdb.org https://artworks.thetvdb.com https://assets.fanart.tv https://thetvdb.com https://images.plex.tv https://metadata-static.plex.tv",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Content-Security-Policy', CSP)
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return res
}

function csrfOk(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return true
  const origin  = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host    = request.headers.get('host') ?? request.nextUrl.host
  const check   = origin ?? referer
  if (!check) return false
  try { return new URL(check).host === host } catch { return false }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths — skip auth but still apply security headers
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next')
  ) {
    return withSecurityHeaders(NextResponse.next())
  }

  // API token auth — bypasses CSRF and session checks (for app clients)
  if (pathname.startsWith('/api/')) {
    const apiToken    = request.headers.get('x-ctrlr-token')
    const apiSecret   = process.env.CTRLR_API_TOKEN
    if (apiSecret && apiToken === apiSecret) {
      return withSecurityHeaders(NextResponse.next())
    }
  }

  // CSRF check for all mutating requests (browser clients only — token auth bypassed above)
  if (!csrfOk(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // API routes: require valid session, return 401 instead of redirecting
  if (pathname.startsWith('/api/')) {
    const session = request.cookies.get('ctrlr-session')?.value
    const secret  = process.env.AUTH_SECRET
    if (!secret || session !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return withSecurityHeaders(NextResponse.next())
  }

  // Page routes: redirect to login if no valid session
  const session = request.cookies.get('ctrlr-session')?.value
  const secret  = process.env.AUTH_SECRET
  if (!secret || session !== secret) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
