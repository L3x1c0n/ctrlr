import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ENV_PATH = process.env.CTRLR_ENV_PATH ?? resolve(process.cwd(), '.env.local')

function updateEnvFile(key: string, value: string) {
  let lines: string[] = []
  try { lines = readFileSync(ENV_PATH, 'utf-8').split('\n') } catch { /* new file */ }
  const idx = lines.findIndex(l => l.startsWith(`${key}=`) || l.startsWith(`${key} =`))
  if (idx >= 0) lines[idx] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  writeFileSync(ENV_PATH, lines.filter(Boolean).join('\n') + '\n', 'utf-8')
}

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (
    !process.env.AUTH_PASSWORD ||
    username !== process.env.AUTH_USERNAME ||
    password !== process.env.AUTH_PASSWORD
  ) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('ctrlr-session', process.env.AUTH_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
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
