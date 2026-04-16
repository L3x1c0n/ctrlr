import { TraktMovie, TraktEpisode } from '@/types'
import { readFileSync, writeFileSync } from 'fs'

function getEnvPath(): string {
  return process.env.CTRLR_ENV_PATH ?? ''
}

function getCredentials() {
  const path = getEnvPath()
  const env: Record<string, string> = {}
  try {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq === -1 || line.startsWith('#')) continue
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
  } catch { /* fall back to process.env */ }
  return {
    clientId:      env.TRAKT_CLIENT_ID      ?? process.env.TRAKT_CLIENT_ID      ?? '',
    clientSecret:  env.TRAKT_CLIENT_SECRET  ?? process.env.TRAKT_CLIENT_SECRET  ?? '',
    accessToken:   env.TRAKT_ACCESS_TOKEN   ?? process.env.TRAKT_ACCESS_TOKEN   ?? '',
    refreshToken:  env.TRAKT_REFRESH_TOKEN  ?? process.env.TRAKT_REFRESH_TOKEN  ?? '',
    expiresAt:     parseInt(env.TRAKT_TOKEN_EXPIRES_AT ?? process.env.TRAKT_TOKEN_EXPIRES_AT ?? '0', 10),
  }
}

function writeEnvValues(updates: Record<string, string>) {
  const path = getEnvPath()
  if (!path) return
  try {
    const lines = readFileSync(path, 'utf-8').split('\n')
    for (const [key, value] of Object.entries(updates)) {
      const idx = lines.findIndex(l => l.startsWith(`${key}=`))
      if (idx >= 0) {
        lines[idx] = `${key}=${value}`
      } else {
        lines.push(`${key}=${value}`)
      }
    }
    writeFileSync(path, lines.join('\n'), 'utf-8')
    // Keep process.env in sync so subsequent reads in this process see the new values
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value
    }
  } catch (e) {
    console.error('[trakt] failed to write env:', e)
  }
}

// ── token refresh ─────────────────────────────────────────────────────────────

let refreshPromise: Promise<void> | null = null

async function refreshAccessToken(): Promise<void> {
  const { clientId, clientSecret, refreshToken } = getCredentials()
  if (!refreshToken || !clientSecret) {
    console.error('[trakt] cannot refresh: missing refresh token or client secret')
    return
  }
  const res = await fetch('https://api.trakt.tv/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) {
    console.error('[trakt] refresh failed:', res.status, await res.text())
    return
  }
  const data = await res.json()
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in
  writeEnvValues({
    TRAKT_ACCESS_TOKEN:    data.access_token,
    TRAKT_REFRESH_TOKEN:   data.refresh_token,
    TRAKT_TOKEN_EXPIRES_AT: String(expiresAt),
  })
  console.log('[trakt] access token refreshed, expires', new Date(expiresAt * 1000).toISOString())
}

async function ensureFreshToken(): Promise<void> {
  const { expiresAt } = getCredentials()
  if (!expiresAt) return
  const nowSec = Math.floor(Date.now() / 1000)
  // Refresh if less than 24 hours remaining
  if (nowSec < expiresAt - 86400) return
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
  }
  await refreshPromise
}

// ── headers ───────────────────────────────────────────────────────────────────

async function getHeaders() {
  await ensureFreshToken()
  const { clientId, accessToken } = getCredentials()
  return {
    'Content-Type':      'application/json',
    'trakt-api-version': '2',
    'trakt-api-key':     clientId,
    'Authorization':     `Bearer ${accessToken}`,
    'User-Agent':        'Mozilla/5.0 (compatible; CTRLr/1.0)',
  }
}

function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export async function getUpcomingMovies(): Promise<TraktMovie[]> {
  const start = dateOffset(-7)
  const res = await fetch(
    `https://api.trakt.tv/calendars/my/movies/${start}/37`,
    { headers: await getHeaders(), cache: 'no-store' }
  )
  if (!res.ok) return []
  return res.json()
}

export async function getUpcomingEpisodes(): Promise<TraktEpisode[]> {
  const start = dateOffset(-7)
  const res = await fetch(
    `https://api.trakt.tv/calendars/my/shows/${start}/21`,
    { headers: await getHeaders(), cache: 'no-store' }
  )
  if (!res.ok) return []
  return res.json()
}

export async function getTraktMovieDetail(slug: string): Promise<object | null> {
  const res = await fetch(`https://api.trakt.tv/movies/${slug}?extended=full`, {
    headers: await getHeaders(), cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

export async function getTraktEpisodeDetail(slug: string, season: number, episode: number): Promise<object | null> {
  const res = await fetch(
    `https://api.trakt.tv/shows/${slug}/seasons/${season}/episodes/${episode}?extended=full`,
    { headers: await getHeaders(), cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}
