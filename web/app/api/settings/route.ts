import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ENV_PATH = process.env.CTRLR_ENV_PATH ?? resolve(process.cwd(), '.env.local')

const KEYS = [
  'QBIT_URL', 'QBIT_USERNAME',
  'RADARR_URL', 'RADARR_API_KEY',
  'SONARR_URL', 'SONARR_API_KEY',
  'SEER_URL', 'SEER_API_KEY',
  'PLEX_URL', 'PLEX_TOKEN',
  'TAUTULLI_URL', 'TAUTULLI_API_KEY',
  'TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'TRAKT_ACCESS_TOKEN',
  'PROWLARR_URL', 'PROWLARR_API_KEY',
  'AUTOBRR_URL',
]

export async function GET() {
  const values: Record<string, string> = {}
  for (const key of KEYS) {
    values[key] = process.env[key] ?? ''
  }
  return NextResponse.json(values)
}

export async function POST(req: NextRequest) {
  try {
    const body: Record<string, string> = await req.json()
    // Read existing file to preserve any keys not in KEYS (like TRAKT_ACCESS_TOKEN written by auth flow)
    let existing: Record<string, string> = {}
    try {
      const lines = readFileSync(ENV_PATH, 'utf-8').split('\n')
      for (const line of lines) {
        const eq = line.indexOf('=')
        if (eq === -1 || line.startsWith('#')) continue
        existing[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
      }
    } catch { /* file may not exist yet */ }

    const merged = { ...existing, ...body }
    const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`)
    writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
