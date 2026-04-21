import { ArrQueue, ArrCalendarItem } from '@/types'

const BASE = process.env.SONARR_URL!
const KEY = process.env.SONARR_API_KEY!

const headers = { 'X-Api-Key': KEY }

export async function getQueue(): Promise<ArrQueue> {
  const res = await fetch(`${BASE}/api/v3/queue?pageSize=50&includeUnknownSeriesItems=true`, {
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
    body: JSON.stringify({ name: 'SeriesSearch', seriesId: id }),
    cache: 'no-store',
  })
}

export async function getSeriesDetail(seriesId: number) {
  const res = await fetch(`${BASE}/api/v3/series/${seriesId}`, { headers, cache: 'no-store' })
  return res.json()
}

export async function getQualityProfiles() {
  const res = await fetch(`${BASE}/api/v3/qualityprofile`, { headers, cache: 'no-store' })
  return res.json()
}

export async function updateSeries(seriesId: number, patch: object) {
  const current = await getSeriesDetail(seriesId)
  const res = await fetch(`${BASE}/api/v3/series/${seriesId}`, {
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

export async function findByTvdb(tvdbId: number): Promise<number | null> {
  const res = await fetch(`${BASE}/api/v3/series`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const series: Array<{ id: number; tvdbId: number }> = await res.json()
  return series.find(s => s.tvdbId === tvdbId)?.id ?? null
}

export async function findEpisodeId(seriesId: number, season: number, episode: number): Promise<number | null> {
  const res = await fetch(`${BASE}/api/v3/episode?seriesId=${seriesId}`, { headers, cache: 'no-store' })
  if (!res.ok) return null
  const eps: Array<{ id: number; seasonNumber: number; episodeNumber: number }> = await res.json()
  return eps.find(e => e.seasonNumber === season && e.episodeNumber === episode)?.id ?? null
}

export interface SonarrEpisode {
  id: number
  seasonNumber: number
  episodeNumber: number
  title: string
  airDateUtc?: string
  hasFile: boolean
  monitored: boolean
}

export async function getEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  const res = await fetch(`${BASE}/api/v3/episode?seriesId=${seriesId}`, { headers, cache: 'no-store' })
  if (!res.ok) return []
  return res.json()
}

export async function getNextEpisodeId(seriesId: number): Promise<number | null> {
  const eps = await getEpisodes(seriesId)
  const now = Date.now()
  const next = eps
    .filter(e => e.monitored && !e.hasFile && e.airDateUtc && new Date(e.airDateUtc).getTime() > now)
    .sort((a, b) => new Date(a.airDateUtc!).getTime() - new Date(b.airDateUtc!).getTime())
  return next[0]?.id ?? null
}

export async function searchEpisode(episodeId: number): Promise<void> {
  await fetch(`${BASE}/api/v3/command`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'EpisodeSearch', episodeIds: [episodeId] }),
    cache: 'no-store',
  })
}

export async function searchReleases(episodeId: number): Promise<Release[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${BASE}/api/v3/release?episodeId=${episodeId}`, { headers, cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`Sonarr ${res.status}: ${await res.text()}`)
    return res.json()
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Sonarr timed out after 30s')
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

export interface MonitoredSeries {
  id: number
  title: string
  status: string   // continuing | ended
  monitored: boolean
  statistics: {
    episodeFileCount: number
    totalEpisodeCount: number
    percentOfEpisodes: number
  }
  nextAiring?: string
}

export async function getCalendarToday(): Promise<ArrCalendarItem[]> {
  const start = new Date().toISOString().slice(0, 10)
  const end   = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const res = await fetch(`${BASE}/api/v3/calendar?start=${start}&end=${end}&includeSeries=true`, { headers, cache: 'no-store' })
  if (!res.ok) return []
  const items: Array<{
    id: number; seriesId: number; seasonNumber: number; episodeNumber: number
    title: string; hasFile: boolean; monitored: boolean
    series: { title: string }
  }> = await res.json()
  return items
    .filter(e => e.monitored && !e.hasFile)
    .map(e => ({
      id:       e.id,
      seriesId: e.seriesId,
      title:    `${e.series.title} - S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} - ${e.title}`,
    }))
}

// Returns downloaded episode keys + which tvdbIds are in Sonarr at all
export async function getEpisodeFileStatus(tvdbIds: number[]): Promise<{ downloaded: Set<string>; inArr: Set<number> }> {
  const downloaded = new Set<string>()
  const inArr      = new Set<number>()
  if (tvdbIds.length === 0) return { downloaded, inArr }

  const seriesRes = await fetch(`${BASE}/api/v3/series`, { headers, cache: 'no-store' })
  if (!seriesRes.ok) return { downloaded, inArr }
  const allSeries: Array<{ id: number; tvdbId: number }> = await seriesRes.json()
  const wanted    = new Set(tvdbIds)
  const tvdbToId  = new Map(allSeries.map(s => [s.tvdbId, s.id]))

  const matchingSeries = allSeries.filter(s => wanted.has(s.tvdbId))
  for (const s of matchingSeries) inArr.add(s.tvdbId)

  const seriesIds = matchingSeries.map(s => s.id)
  if (seriesIds.length === 0) return { downloaded, inArr }

  await Promise.all(seriesIds.map(async seriesId => {
    const series = allSeries.find(s => s.id === seriesId)!
    const epRes = await fetch(`${BASE}/api/v3/episode?seriesId=${seriesId}`, { headers, cache: 'no-store' })
    if (!epRes.ok) return
    const eps: Array<{ seasonNumber: number; episodeNumber: number; hasFile: boolean }> = await epRes.json()
    for (const ep of eps) {
      if (ep.hasFile) downloaded.add(`${series.tvdbId}:${ep.seasonNumber}:${ep.episodeNumber}`)
    }
  }))

  return { downloaded, inArr }
}

export interface RecentEpisode {
  seriesId: number
  seriesTitle: string
  seasonNumber: number
  episodeNumber: number
  title: string
  dateAdded: string
}

export async function getRecentlyAdded(limit = 7): Promise<RecentEpisode[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  let res: Response
  try {
    res = await fetch(`${BASE}/api/v3/history?pageSize=${limit}&eventType=3&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true`, { headers, cache: 'no-store', signal: controller.signal })
  } catch { return [] } finally { clearTimeout(timeout) }
  if (!res.ok) return []
  const data = await res.json()
  const seen = new Set<string>()
  const results: RecentEpisode[] = []
  for (const r of (data.records ?? [])) {
    const key = `${r.seriesId}-${r.episode?.seasonNumber}-${r.episode?.episodeNumber}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      seriesId:      r.seriesId,
      seriesTitle:   r.series?.title ?? '',
      seasonNumber:  r.episode?.seasonNumber ?? 0,
      episodeNumber: r.episode?.episodeNumber ?? 0,
      title:         r.episode?.title ?? r.sourceTitle ?? '',
      dateAdded:     r.date,
    })
  }
  return results
}

export async function getMonitored(): Promise<MonitoredSeries[]> {
  const res = await fetch(`${BASE}/api/v3/series`, { headers, cache: 'no-store' })
  if (!res.ok) return []
  const all = await res.json()
  const now = Date.now()
  return (all as MonitoredSeries[])
    .filter(s => s.monitored && s.nextAiring && new Date(s.nextAiring).getTime() > now)
    .sort((a, b) => new Date(a.nextAiring!).getTime() - new Date(b.nextAiring!).getTime())
}
