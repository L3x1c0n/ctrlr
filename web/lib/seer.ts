import { SeerSearchResponse, SeerRequest, SeerSearchResult } from '@/types'

const BASE = process.env.SEER_URL!
const KEY = process.env.SEER_API_KEY!

const headers = { 'X-Api-Key': KEY, 'Content-Type': 'application/json' }

export async function search(query: string): Promise<SeerSearchResponse> {
  const res = await fetch(`${BASE}/api/v1/search?query=${encodeURIComponent(query)}&page=1`, {
    headers,
    cache: 'no-store',
  })
  return res.json()
}

async function fetchTitle(mediaType: string, tmdbId: number): Promise<string> {
  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
    const res = await fetch(`${BASE}/api/v1/${endpoint}/${tmdbId}`, { headers, cache: 'no-store' })
    const d = await res.json()
    return d.title ?? d.name ?? ''
  } catch { return '' }
}

export async function getRequests(): Promise<{ results: SeerRequest[]; pageInfo: { results: number } }> {
  const res = await fetch(`${BASE}/api/v1/request?take=50&skip=0&sort=added&filter=all`, {
    headers,
    cache: 'no-store',
  })
  const data = await res.json()
  // Enrich with titles in parallel
  await Promise.all(data.results.map(async (r: SeerRequest) => {
    r.media.title = await fetchTitle(r.media.mediaType, r.media.tmdbId)
  }))
  return data
}

export async function submitRequest(mediaType: string, mediaId: number, seasons?: number[]): Promise<void> {
  const body: Record<string, unknown> = { mediaType, mediaId }
  if (seasons) body.seasons = seasons
  await fetch(`${BASE}/api/v1/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function approveRequest(id: number): Promise<void> {
  await fetch(`${BASE}/api/v1/request/${id}/approve`, {
    method: 'POST',
    headers,
    cache: 'no-store',
  })
}

export interface RootFolder {
  path: string
  freeSpace: number
  accessible: boolean
}

export async function getRootFolders(mediaType: string): Promise<RootFolder[]> {
  try {
    const isMovie = mediaType === 'movie'
    const base = isMovie ? process.env.RADARR_URL : process.env.SONARR_URL
    const key = isMovie ? process.env.RADARR_API_KEY : process.env.SONARR_API_KEY
    const res = await fetch(`${base}/api/v3/rootfolder`, {
      headers: { 'X-Api-Key': key!, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data: { path: string; freeSpace: number; accessible: boolean }[] = await res.json()
    return data.filter(f => f.accessible).map(f => ({ path: f.path, freeSpace: f.freeSpace, accessible: f.accessible }))
  } catch { return [] }
}

export async function getSeerProfiles(): Promise<{ id: number; name: string }[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/settings/radarr/0/profiles`, { headers, cache: 'no-store' })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

export async function updateSeerRequest(id: number, profileId: number, rootFolder: string): Promise<void> {
  const current = await fetch(`${BASE}/api/v1/request/${id}`, { headers, cache: 'no-store' }).then(r => r.json())
  const body: Record<string, unknown> = {
    mediaType: current.type,
    serverId: current.serverId ?? 0,
    profileId,
    rootFolder,
  }
  if (current.type === 'tv') {
    body.seasons = (current.seasons ?? []).map((s: { seasonNumber: number }) => s.seasonNumber)
    body.languageProfileId = current.languageProfileId ?? 1
  }
  await fetch(`${BASE}/api/v1/request/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  })
}

export async function getMediaDetail(mediaType: string, tmdbId: number): Promise<object | null> {
  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
    const res = await fetch(`${BASE}/api/v1/${endpoint}/${tmdbId}`, { headers, cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

export async function deleteRequest(id: number): Promise<void> {
  await fetch(`${BASE}/api/v1/request/${id}`, {
    method: 'DELETE',
    headers,
    cache: 'no-store',
  })
}

export async function getTrending(mediaType: 'movie' | 'tv', page = 1): Promise<SeerSearchResult[]> {
  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movies'
    const res = await fetch(`${BASE}/api/v1/discover/${endpoint}?page=${page}`, {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).slice(0, 20).map((r: Record<string, unknown>) => ({
      id:            r.id,
      mediaType,
      title:         (r.title ?? r.name) as string | undefined,
      overview:      (r.overview ?? '') as string,
      posterPath:    r.posterPath as string | undefined,
      releaseDate:   r.releaseDate as string | undefined,
      firstAirDate:  r.firstAirDate as string | undefined,
      mediaInfo:     r.mediaInfo ? {
        id:       (r.mediaInfo as Record<string, unknown>).id as number,
        status:   (r.mediaInfo as Record<string, unknown>).status as number,
      } : undefined,
    }))
  } catch { return [] }
}
