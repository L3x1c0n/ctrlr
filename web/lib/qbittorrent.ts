import { QBState } from '@/types'

// Strip punctuation that differs between torrent filenames and library titles
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['''\u2018\u2019`]/g, '') // apostrophes (King's → Kings)
    .replace(/[:\-–—]/g, ' ')           // colons and dashes to space
    .replace(/[^\w\s]/g, '')            // drop remaining punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// Normalize a torrent name into a searchable title
function extractTitle(name: string): string {
  // Replace dots/underscores with spaces
  let s = name.replace(/[._]/g, ' ')
  // Cut before SxxExx, season/episode markers, or common quality tokens
  s = s.replace(/\s+[Ss]\d{1,2}[Ee]\d{1,2}.*/i, '')
       .replace(/\s+(19|20)\d{2}\s.*/i, (m) => m.slice(0, 5)) // keep year but drop rest
       .replace(/\s+(1080p|720p|2160p|4k|HDTV|WEB|BluRay|BDRip|DVDRip|REMASTERED|COMPLETE).*/i, '')
  return normalizeForMatch(s)
}

interface ArrMediaItem {
  title: string
  images: { coverType: string; remoteUrl?: string }[]
  alternateTitles?: { title: string }[]    // Sonarr
  alternativeTitles?: { title: string }[]  // Radarr
}

async function buildPosterMap(category: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const isTV = /tv|sonarr/i.test(category)
  const isMovie = /movie|radarr/i.test(category)
  if (!isTV && !isMovie) return map

  try {
    const base = isTV ? process.env.SONARR_URL : process.env.RADARR_URL
    const key = isTV ? process.env.SONARR_API_KEY : process.env.RADARR_API_KEY
    const endpoint = isTV ? 'series' : 'movie'
    const res = await fetch(`${base}/api/v3/${endpoint}`, {
      headers: { 'X-Api-Key': key! },
      cache: 'no-store',
    })
    if (!res.ok) return map
    const items: ArrMediaItem[] = await res.json()
    for (const item of items) {
      const poster = item.images.find(i => i.coverType === 'poster')?.remoteUrl
      if (!poster) continue
      map.set(normalizeForMatch(item.title), poster)
      const alts = [...(item.alternateTitles ?? []), ...(item.alternativeTitles ?? [])]
      for (const alt of alts) {
        if (!alt.title) continue
        const norm = normalizeForMatch(alt.title)
        if (norm.length > 3) map.set(norm, poster)  // skip empty/trivially-short normalized strings
      }
    }
  } catch { /* ignore */ }
  return map
}

export async function getPosterForTorrent(name: string, category: string): Promise<string | null> {
  const posterMap = await buildPosterMap(category)
  if (posterMap.size === 0) return null
  const needle = extractTitle(name)
  // Exact match first
  if (posterMap.has(needle)) return posterMap.get(needle)!
  // Partial match: only use multi-word titles as prefix anchors to avoid single-word
  // false matches (e.g. "avatar" matching anything that starts with "avatar")
  for (const [title, url] of posterMap) {
    if (!title.includes(' ')) continue
    if (needle.startsWith(title) || title.startsWith(needle)) return url
  }
  // Substring match: handles cases where the torrent prepends extra words to the library
  // title (e.g. "Avatar The Legend of Aang The Last Airbender" → "The Last Airbender")
  for (const [title, url] of posterMap) {
    if (title.length < 12) continue
    if (needle.includes(title) || title.includes(needle)) return url
  }
  return null
}

const BASE = process.env.QBIT_URL!
const USERNAME = process.env.QBIT_USERNAME!
const PASSWORD = process.env.QBIT_PASSWORD!

let cookie: string | null = null

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`,
    cache: 'no-store',
  })
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('qBittorrent login failed')
  const sid = setCookie.split(';')[0]
  return sid
}

async function authedFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  if (!cookie) cookie = await login()
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), Cookie: cookie },
    cache: 'no-store',
  })
  if (res.status === 403) {
    cookie = await login()
    return fetch(`${BASE}${path}`, {
      ...opts,
      headers: { ...(opts.headers || {}), Cookie: cookie },
      cache: 'no-store',
    })
  }
  return res
}

export async function getState(): Promise<QBState & { posters: Record<string, string> }> {
  const [torrentsRes, transferRes] = await Promise.all([
    authedFetch('/api/v2/torrents/info'),
    authedFetch('/api/v2/transfer/info'),
  ])
  const [torrents, transfer] = await Promise.all([torrentsRes.json(), transferRes.json()])

  // Build poster map per category, then resolve each torrent
  const categoryGroups = new Map<string, typeof torrents>()
  for (const t of torrents) {
    const cat = t.category || 'unknown'
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, [])
    categoryGroups.get(cat)!.push(t)
  }

  const posters: Record<string, string> = {}
  await Promise.all(
    [...categoryGroups.entries()].map(async ([cat, group]) => {
      const posterMap = await buildPosterMap(cat)
      if (posterMap.size === 0) return
      for (const t of group) {
        const needle = extractTitle(t.name)
        let url = posterMap.get(needle)
        if (!url) {
          for (const [title, u] of posterMap) {
            if (!title.includes(' ')) continue
            if (needle.startsWith(title) || title.startsWith(needle)) { url = u; break }
          }
          if (!url) {
            for (const [title, u] of posterMap) {
              if (title.length < 12) continue
              if (needle.includes(title) || title.includes(needle)) { url = u; break }
            }
          }
        }
        if (url) posters[t.hash] = url
      }
    })
  )

  return { torrents, transfer, posters }
}

export async function pauseTorrent(hash: string): Promise<void> {
  await authedFetch('/api/v2/torrents/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}`,
  })
}

export async function resumeTorrent(hash: string): Promise<void> {
  await authedFetch('/api/v2/torrents/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}`,
  })
}

export async function deleteTorrent(hash: string, deleteFiles = false): Promise<void> {
  await authedFetch('/api/v2/torrents/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `hashes=${hash}&deleteFiles=${deleteFiles}`,
  })
}

export async function getTorrentDetail(hash: string) {
  const [propsRes, filesRes] = await Promise.all([
    authedFetch(`/api/v2/torrents/properties?hash=${hash}`),
    authedFetch(`/api/v2/torrents/files?hash=${hash}`),
  ])
  const [properties, files] = await Promise.all([propsRes.json(), filesRes.json()])
  return { properties, files }
}
