import { TraktMovie, TraktEpisode } from '@/types'
import { readFileSync } from 'fs'

function getCredentials() {
  const path = process.env.CTRLR_ENV_PATH ?? ''
  const env: Record<string, string> = {}
  try {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq === -1 || line.startsWith('#')) continue
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
  } catch { /* fall back to process.env */ }
  return {
    clientId: env.TRAKT_CLIENT_ID ?? process.env.TRAKT_CLIENT_ID ?? '',
    accessToken: env.TRAKT_ACCESS_TOKEN ?? process.env.TRAKT_ACCESS_TOKEN ?? '',
  }
}

function headers() {
  const { clientId, accessToken } = getCredentials()
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
    'Authorization': `Bearer ${accessToken}`,
    'User-Agent': 'Mozilla/5.0 (compatible; CTRLr/1.0)',
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
    { headers: headers(), cache: 'no-store' }
  )
  if (!res.ok) return []
  return res.json()
}

export async function getUpcomingEpisodes(): Promise<TraktEpisode[]> {
  const start = dateOffset(-7)
  const res = await fetch(
    `https://api.trakt.tv/calendars/my/shows/${start}/21`,
    { headers: headers(), cache: 'no-store' }
  )
  if (!res.ok) return []
  return res.json()
}

export async function getTraktMovieDetail(slug: string): Promise<object | null> {
  const res = await fetch(`https://api.trakt.tv/movies/${slug}?extended=full`, {
    headers: headers(), cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

export async function getTraktEpisodeDetail(slug: string, season: number, episode: number): Promise<object | null> {
  const res = await fetch(
    `https://api.trakt.tv/shows/${slug}/seasons/${season}/episodes/${episode}?extended=full`,
    { headers: headers(), cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}
