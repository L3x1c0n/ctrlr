import { ArrQueue, ArrCalendarItem } from '@/types'

const BASE = process.env.RADARR_URL!
const KEY = process.env.RADARR_API_KEY!

const headers = { 'X-Api-Key': KEY }

export async function getQueue(): Promise<ArrQueue> {
  const res = await fetch(`${BASE}/api/v3/queue?pageSize=50&includeUnknownMovieItems=true`, {
    headers,
    cache: 'no-store',
  })
  return res.json()
}

export async function deleteQueueItem(id: number, blacklist = false): Promise<void> {
  await fetch(`${BASE}/api/v3/queue/${id}?blacklist=${blacklist}&removeFromClient=true`, {
    method: 'DELETE',
    headers,
    cache: 'no-store',
  })
}

export async function triggerSearch(id: number): Promise<void> {
  await fetch(`${BASE}/api/v3/command`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'MoviesSearch', movieIds: [id] }),
    cache: 'no-store',
  })
}

export async function rescanLibrary(): Promise<void> {
  await fetch(`${BASE}/api/v3/command`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'RescanMovie' }),
    cache: 'no-store',
  })
}

export async function getMovieDetail(movieId: number) {
  const res = await fetch(`${BASE}/api/v3/movie/${movieId}`, { headers, cache: 'no-store' })
  return res.json()
}

export async function getQualityProfiles() {
  const res = await fetch(`${BASE}/api/v3/qualityprofile`, { headers, cache: 'no-store' })
  return res.json()
}

export async function updateMovie(movieId: number, patch: object) {
  const current = await getMovieDetail(movieId)
  const res = await fetch(`${BASE}/api/v3/movie/${movieId}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...current, ...patch }),
    cache: 'no-store',
  })
  return res.json()
}

export async function getHealth(): Promise<{ source: string; type: string; message: string }[]> {
  const res = await fetch(`${BASE}/api/v3/health`, { headers, cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

export interface MonitoredMovie {
  id: number
  title: string
  year: number
  monitored: boolean
  hasFile: boolean
  status: string  // announced | inCinemas | released | deleted
  runtime: number
  inCinemas?: string
  physicalRelease?: string
  digitalRelease?: string
}

export function upcomingReleaseDate(m: MonitoredMovie): Date | null {
  const now = Date.now()
  const candidates = [m.digitalRelease, m.physicalRelease, m.inCinemas]
    .filter(Boolean)
    .map(d => new Date(d!))
    .filter(d => d.getTime() > now)
  if (!candidates.length) return null
  return candidates.reduce((a, b) => a.getTime() < b.getTime() ? a : b)
}

export async function getCalendarToday(): Promise<ArrCalendarItem[]> {
  const start = new Date().toISOString().slice(0, 10)
  const end   = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const res = await fetch(`${BASE}/api/v3/calendar?start=${start}&end=${end}`, { headers, cache: 'no-store' })
  if (!res.ok) return []
  const items: Array<{ id: number; title: string; hasFile: boolean }> = await res.json()
  return items
    .filter(m => !m.hasFile)
    .map(m => ({ id: m.id, title: m.title }))
}

// Returns a set of tmdbIds for movies that have a file
export async function getMovieFileStatus(tmdbIds: number[]): Promise<{ downloaded: Set<number>; inArr: Set<number> }> {
  const downloaded = new Set<number>()
  const inArr      = new Set<number>()
  if (tmdbIds.length === 0) return { downloaded, inArr }
  const res = await fetch(`${BASE}/api/v3/movie`, { headers, cache: 'no-store' })
  if (!res.ok) return { downloaded, inArr }
  const movies: Array<{ tmdbId: number; hasFile: boolean }> = await res.json()
  const wanted = new Set(tmdbIds)
  for (const m of movies) {
    if (wanted.has(m.tmdbId)) {
      inArr.add(m.tmdbId)
      if (m.hasFile) downloaded.add(m.tmdbId)
    }
  }
  return { downloaded, inArr }
}

export interface RecentMovie {
  id: number
  title: string
  year: number
  dateAdded: string
}

export async function getRecentlyAdded(limit = 7): Promise<RecentMovie[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch(`${BASE}/api/v3/history?pageSize=${limit}&eventType=3&sortKey=date&sortDirection=descending&includeMovie=true`, { headers, cache: 'no-store', signal: controller.signal })
  } catch { return [] } finally { clearTimeout(timeout) }
  if (!res.ok) return []
  const data = await res.json()
  const seen = new Set<number>()
  const results: RecentMovie[] = []
  for (const r of (data.records ?? [])) {
    if (!r.movie || seen.has(r.movieId)) continue
    seen.add(r.movieId)
    results.push({ id: r.movieId, title: r.movie.title, year: r.movie.year, dateAdded: r.date })
  }
  return results
}

export async function getMonitored(): Promise<MonitoredMovie[]> {
  const res = await fetch(`${BASE}/api/v3/movie?monitored=true`, { headers, cache: 'no-store' })
  if (!res.ok) return []
  const all = await res.json()
  const now = Date.now()
  return (all as MonitoredMovie[])
    .filter(m => m.monitored && !m.hasFile)
    .filter(m => {
      // Keep if it has any upcoming release date
      const upcoming = upcomingReleaseDate(m)
      if (upcoming) return true
      // Or if announced/inCinemas with no release dates yet
      return m.status === 'announced' || m.status === 'inCinemas'
    })
    .sort((a, b) => {
      const da = upcomingReleaseDate(a)
      const db = upcomingReleaseDate(b)
      if (da && db) return da.getTime() - db.getTime()
      if (da) return -1
      if (db) return 1
      return a.title.localeCompare(b.title)
    })
}

export interface Release {
  guid: string
  indexerId: number
  indexer: string
  title: string
  size: number
  age: number
  ageHours: number
  protocol: 'torrent' | 'usenet'
  quality: { quality: { name: string } }
  languages?: { name: string }[]
  customFormatScore?: number
  customFormats?: { name: string }[]
  seeders?: number
  leechers?: number
  rejected: boolean
  rejections: string[]
}

export async function findByTmdb(tmdbId: number): Promise<number | null> {
  const res = await fetch(`${BASE}/api/v3/movie`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const movies: Array<{ id: number; tmdbId: number }> = await res.json()
  return movies.find(m => m.tmdbId === tmdbId)?.id ?? null
}

export async function searchMovie(movieId: number): Promise<void> {
  await fetch(`${BASE}/api/v3/command`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'MoviesSearch', movieIds: [movieId] }),
    cache: 'no-store',
  })
}

export async function searchReleases(movieId: number): Promise<Release[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${BASE}/api/v3/release?movieId=${movieId}`, { headers, cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`Radarr ${res.status}: ${await res.text()}`)
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Radarr timed out after 30s')
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

export async function grabRelease(guid: string, indexerId: number): Promise<void> {
  await fetch(`${BASE}/api/v3/release`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ guid, indexerId }),
    cache: 'no-store',
  })
}

export async function retryQueueItem(id: number): Promise<void> {
  await fetch(`${BASE}/api/v3/queue/${id}`, {
    method: 'DELETE',
    headers,
    cache: 'no-store',
  })
  // trigger a new search — we don't have movieId here so use command with generic retry
}
