import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ENV_PATH = process.env.CTRLR_ENV_PATH ?? resolve(process.cwd(), '.env.local')

// ── rate limiting ─────────────────────────────────────────────────────────────

const ATTEMPTS_MAX    = 5
const LOCKOUT_MS      = 15 * 60 * 1000 // 15 minutes
const attempts = new Map<string, { count: number; lockedUntil: number }>()

function getIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function checkRateLimit(ip: string): { blocked: boolean; retryAfter?: number } {
  const now = Date.now()
  const record = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }
  if (record.lockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) }
  }
  return { blocked: false }
}

function recordFailure(ip: string) {
  const now = Date.now()
  const record = attempts.get(ip) ?? { count: 0, lockedUntil: 0 }
  const count = record.count + 1
  attempts.set(ip, {
    count,
    lockedUntil: count >= ATTEMPTS_MAX ? now + LOCKOUT_MS : 0,
  })
}

function clearAttempts(ip: string) {
  attempts.delete(ip)
}

function updateEnvFile(key: string, value: string) {
  let lines: string[] = []
  try { lines = readFileSync(ENV_PATH, 'utf-8').split('\n') } catch { /* new file */ }
  const idx = lines.findIndex(l => l.startsWith(`${key}=`) || l.startsWith(`${key} =`))
  if (idx >= 0) lines[idx] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  writeFileSync(ENV_PATH, lines.filter(Boolean).join('\n') + '\n', 'utf-8')
}

export async function POST(req: Request) {
  const ip = getIp(req)
  const { blocked, retryAfter } = checkRateLimit(ip)
  if (blocked) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const { username, password } = await req.json()

  if (
    !process.env.AUTH_PASSWORD ||
    username !== process.env.AUTH_USERNAME ||
    password !== process.env.AUTH_PASSWORD
  ) {
    recordFailure(ip)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  clearAttempts(ip)

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ctrlr-session', process.env.AUTH_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  return res
}

export async function PUT(req: Request) {
  try {
    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    if (currentPassword !== process.env.AUTH_PASSWORD)
      return NextResponse.json({ error: 'Current password incorrect' }, { status: 401 })
    if (newPassword.length < 8)
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    updateEnvFile('AUTH_PASSWORD', newPassword)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('ctrlr-session')
  return res
}
