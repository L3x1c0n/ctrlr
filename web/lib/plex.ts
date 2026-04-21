import { PlexMedia } from '@/types'

const PLEX_URL = process.env.PLEX_URL!
const TOKEN    = process.env.PLEX_TOKEN!
const DAYS     = parseInt(process.env.PLEX_RECENT_DAYS ?? '30')
const MAX      = parseInt(process.env.PLEX_MAX_ITEMS  ?? '15')

// Section IDs on this server: 1=Movies, 2=TV Shows, 3=Specials
const MOVIE_SECTIONS = ['1', '3']
const TV_SECTION     = '2'

const headers = {
  'X-Plex-Token': TOKEN,
  Accept: 'application/json',
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function fetchSection(sectionId: string, type: number, since?: number): Promise<PlexMedia[]> {
  const filter = since ? `&addedAt>>=${since}` : ''
  const url    = `${PLEX_URL}/library/sections/${sectionId}/all?type=${type}&sort=addedAt:desc${filter}`
  try {
    const res  = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return data?.MediaContainer?.Metadata ?? []
  } catch {
    return []
  }
}

function dedupeByShow(episodes: PlexMedia[]): PlexMedia[] {
  const seen = new Set<string>()
  const out: PlexMedia[] = []
  for (const ep of episodes) {
    const key = ep.grandparentRatingKey ?? ep.ratingKey
    if (!seen.has(key)) {
      seen.add(key)
      out.push({
        ...ep,
        title: ep.grandparentTitle ?? ep.title,
        thumb: ep.grandparentThumb ?? ep.thumb,
      })
    }
  }
  return out
}

async function fillToMax(sections: string[], type: number, since: number, dedupe: boolean): Promise<PlexMedia[]> {
  const recent = await Promise.all(sections.map(id => fetchSection(id, type, since)))
  let items = recent.flat().sort((a, b) => b.addedAt - a.addedAt)
  if (dedupe) items = dedupeByShow(items)
  if (items.length >= MAX) return items.slice(0, MAX)

  const all  = await Promise.all(sections.map(id => fetchSection(id, type)))
  let pool   = all.flat().sort((a, b) => b.addedAt - a.addedAt)
  if (dedupe) pool = dedupeByShow(pool)

  const existingKeys = new Set(items.map(i => i.ratingKey))
  const topUp = pool.filter(i => !existingKeys.has(i.ratingKey))
  return [...items, ...topUp].slice(0, MAX)
}

// ── public API ────────────────────────────────────────────────────────────────

export async function getRecentlyAdded(): Promise<{ movies: PlexMedia[]; shows: PlexMedia[]; days: number; max: number }> {
  const since = Math.floor((Date.now() - DAYS * 24 * 60 * 60 * 1000) / 1000)
  const [shows, movies] = await Promise.all([
    fillToMax([TV_SECTION], 4, since, true),
    fillToMax(MOVIE_SECTIONS, 1, since, false),
  ])
  return { movies, shows, days: DAYS, max: MAX }
}

// Check if a TMDB item exists in the Plex library using GUID filter
export async function isInLibrary(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<boolean> {
  const sections = mediaType === 'movie' ? MOVIE_SECTIONS : [TV_SECTION]
  const type     = mediaType === 'movie' ? 1 : 2
  const guid     = `tmdb://${tmdbId}`
  for (const sectionId of sections) {
    try {
      const res = await fetch(
        `${PLEX_URL}/library/sections/${sectionId}/all?guid=${encodeURIComponent(guid)}&type=${type}`,
        { headers, cache: 'no-store' }
      )
      if (!res.ok) continue
      const data  = await res.json()
      const items = data?.MediaContainer?.Metadata ?? []
      if (items.length > 0) return true
    } catch { continue }
  }
  return false
}

export async function deleteMedia(ratingKey: string): Promise<void> {
  await fetch(`${PLEX_URL}/library/metadata/${ratingKey}`, {
    method: 'DELETE', headers, cache: 'no-store',
  })
}

export function resolveThumb(thumb: string): string {
  if (thumb.startsWith('http')) return thumb
  return `${PLEX_URL}${thumb}?X-Plex-Token=${TOKEN}`
}

export function posterUrl(thumb: string): string {
  return resolveThumb(thumb)
}

export async function getMediaDetail(ratingKey: string) {
  const res  = await fetch(`${PLEX_URL}/library/metadata/${ratingKey}`, { headers, cache: 'no-store' })
  const data = await res.json()
  return data?.MediaContainer?.Metadata?.[0] ?? null
}

// ── artwork ───────────────────────────────────────────────────────────────────

export interface PlexPhoto {
  key:      string
  selected: boolean
  thumb:    string
  provider?: string
}

async function getPhotos(ratingKey: string, kind: 'posters' | 'arts'): Promise<PlexPhoto[]> {
  const res  = await fetch(`${PLEX_URL}/library/metadata/${ratingKey}/${kind}`, { headers, cache: 'no-store' })
  const data = await res.json()
  const raw  = data?.MediaContainer?.Metadata ?? data?.MediaContainer?.Photo ?? []
  return raw.map((p: Record<string, unknown>) => ({
    key:      String(p.key ?? ''),
    selected: Boolean(p.selected),
    thumb:    String(p.thumb ?? p.key ?? ''),
    provider: p.provider ? String(p.provider) : undefined,
  }))
}

export const getPosters = (ratingKey: string) => getPhotos(ratingKey, 'posters')
export const getArts    = (ratingKey: string) => getPhotos(ratingKey, 'arts')

export async function selectPhoto(ratingKey: string, kind: 'poster' | 'art', photoKey: string): Promise<void> {
  const url = `${PLEX_URL}/library/metadata/${ratingKey}/${kind}?url=${encodeURIComponent(photoKey)}`
  await fetch(url, { method: 'PUT', headers, cache: 'no-store' })
}

// ── metadata refresh ──────────────────────────────────────────────────────────

export async function refreshMetadata(ratingKey: string): Promise<void> {
  await fetch(`${PLEX_URL}/library/metadata/${ratingKey}/refresh`, {
    method: 'PUT', headers, cache: 'no-store',
  })
}

// ── fix match ─────────────────────────────────────────────────────────────────

export interface PlexMatch {
  guid:  string
  name:  string
  year?: string
  thumb?: string
}

export async function searchMatches(query: string, mediaType: string): Promise<PlexMatch[]> {
  // type=1 for movies, type=2 for shows
  const type  = mediaType === 'movie' ? 1 : 2
  const agent = mediaType === 'movie' ? 'tv.plex.agents.movie' : 'tv.plex.agents.series'
  const url   = `${PLEX_URL}/library/metadata/matches?q=${encodeURIComponent(query)}&type=${type}&agent=${agent}&language=en-US`
  const res   = await fetch(url, { headers, cache: 'no-store' })
  if (!res.ok) return []
  const data  = await res.json()
  const raw   = data?.MediaContainer?.SearchResult ?? []
  return raw.map((r: Record<string, unknown>) => ({
    guid:  String(r.guid ?? ''),
    name:  String(r.name ?? ''),
    year:  r.year ? String(r.year) : undefined,
    thumb: r.thumb ? String(r.thumb) : undefined,
  }))
}

export async function applyMatch(ratingKey: string, guid: string, name: string, mediaType: string): Promise<void> {
  const agent = mediaType === 'movie' ? 'tv.plex.agents.movie' : 'tv.plex.agents.series'
  const url   = `${PLEX_URL}/library/metadata/${ratingKey}/match?agent=${agent}&guid=${encodeURIComponent(guid)}&name=${encodeURIComponent(name)}&language=en-US`
  await fetch(url, { method: 'PUT', headers, cache: 'no-store' })
}

// ── file info by title ────────────────────────────────────────────────────────

export interface PlexFileInfo {
  file: string
  size: number
  videoResolution?: string
  videoCodec?: string
  audioCodec?: string
  bitrate?: number
  container?: string
}

export async function getFileInfoByTitle(title: string, year?: number): Promise<PlexFileInfo | null> {
  try {
    const url  = `${PLEX_URL}/hubs/search?query=${encodeURIComponent(title)}&limit=10&includeExtras=0`
    const res  = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const hubs = data?.MediaContainer?.Hub ?? []
    for (const hub of hubs) {
      if (!['movie', 'show'].includes(hub.type)) continue
      for (const item of (hub.Metadata ?? [])) {
        if (year && item.year && Math.abs(item.year - year) > 1) continue
        const ratingKey = item.ratingKey
        if (!ratingKey) continue
        const detail = await getMediaDetail(ratingKey)
        const media  = detail?.Media?.[0]
        if (!media) continue
        const part = media.Part?.[0]
        return {
          file:            part?.file ?? '',
          size:            part?.size ?? 0,
          videoResolution: media.videoResolution,
          videoCodec:      media.videoCodec,
          audioCodec:      media.audioCodec,
          bitrate:         media.bitrate,
          container:       media.container,
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// ── children (seasons / episodes) ────────────────────────────────────────────

export interface PlexChild {
  ratingKey: string
  title: string
  index: number
  leafCount?: number   // seasons: episode count
  duration?: number    // episodes: duration in ms
  thumb?: string
}

export async function getChildren(ratingKey: string): Promise<PlexChild[]> {
  try {
    const res  = await fetch(`${PLEX_URL}/library/metadata/${ratingKey}/children`, { headers, cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.MediaContainer?.Metadata ?? []).map((m: Record<string, unknown>) => ({
      ratingKey: String(m.ratingKey ?? ''),
      title:     String(m.title ?? ''),
      index:     Number(m.index ?? 0),
      leafCount: m.leafCount !== undefined ? Number(m.leafCount) : undefined,
      duration:  m.duration  !== undefined ? Number(m.duration)  : undefined,
      thumb:     m.thumb ? String(m.thumb) : undefined,
    }))
  } catch {
    return []
  }
}

// ── library search ────────────────────────────────────────────────────────────

export async function searchLibrary(query: string): Promise<PlexMedia[]> {
  const url = `${PLEX_URL}/hubs/search?query=${encodeURIComponent(query)}&limit=30&includeExtras=0`
  try {
    const res  = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const hubs = data?.MediaContainer?.Hub ?? []
    const results: PlexMedia[] = []
    for (const hub of hubs) {
      if (!['movie', 'show'].includes(hub.type)) continue
      for (const item of (hub.Metadata ?? [])) {
        results.push(item as PlexMedia)
      }
    }
    return results
  } catch {
    return []
  }
}
