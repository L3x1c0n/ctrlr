import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'

function readEnv(): Record<string, string> {
  const path = process.env.CTRLR_ENV_PATH ?? ''
  const result: Record<string, string> = {}
  try {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq === -1 || line.startsWith('#')) continue
      result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
  } catch { /* ignore */ }
  return result
}

function writeTokens(data: { access_token: string; refresh_token: string; expires_in: number }) {
  const path = process.env.CTRLR_ENV_PATH ?? ''
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in
  const updates: Record<string, string> = {
    TRAKT_ACCESS_TOKEN: data.access_token,
    TRAKT_REFRESH_TOKEN: data.refresh_token,
    TRAKT_TOKEN_EXPIRES_AT: String(expiresAt),
  }
  const lines = readFileSync(path, 'utf-8').split('\n')
  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`))
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`
    } else {
      lines.push(`${key}=${value}`)
    }
    process.env[key] = value
  }
  writeFileSync(path, lines.join('\n'), 'utf-8')
}

export async function POST(req: NextRequest) {
  const { action, device_code } = await req.json()
  const env = readEnv()
  const clientId = env.TRAKT_CLIENT_ID ?? ''
  const clientSecret = env.TRAKT_CLIENT_SECRET ?? ''

  if (!clientId) return NextResponse.json({ error: 'TRAKT_CLIENT_ID not set — save it first' }, { status: 400 })

  if (action === 'code') {
    const res = await fetch('https://api.trakt.tv/oauth/device/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CTRLr/1.0)',
      },
      body: JSON.stringify({ client_id: clientId }),
    })
    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ error: `Trakt returned: ${text.slice(0, 200)}` }, { status: 502 })
    }
  }

  if (action === 'poll') {
    if (!clientSecret) return NextResponse.json({ error: 'TRAKT_CLIENT_SECRET not set' }, { status: 400 })
    const res = await fetch('https://api.trakt.tv/oauth/device/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CTRLr/1.0)',
      },
      body: JSON.stringify({ code: device_code, client_id: clientId, client_secret: clientSecret }),
    })
    if (res.status === 200) {
      const data = await res.json()
      writeTokens(data)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ pending: true, status: res.status })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
