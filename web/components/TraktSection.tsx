'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { TraktMovie, TraktEpisode } from '@/types'
import Spinner from '@/components/Spinner'
import { TraktSelectedItem } from '@/components/TraktDetailDrawer'
import UnifiedDrawer, { DrawerEntry } from '@/components/UnifiedDrawer'

// ── constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'jan','feb','mar','apr','may','jun',
  'jul','aug','sep','oct','nov','dec',
]

const TMDB_LOGO = 'https://image.tmdb.org/t/p/w185'

// ── client-side metadata cache ────────────────────────────────────────────────

interface ItemMeta {
  providers: { name: string; logoPath: string }[]
  runtime?: number
  rating?: number
  certification?: string
}

const metaCache = new Map<string, ItemMeta>()

function fetchMeta(cacheKey: string, url: string, setter: (m: ItemMeta) => void) {
  if (metaCache.has(cacheKey)) { setter(metaCache.get(cacheKey)!); return }
  fetch(url)
    .then(r => r.json())
    .then(d => {
      const m: ItemMeta = {
        providers:     (d.watchProviders ?? []).filter((p: any) => p.logoPath).map((p: any) => ({ name: p.name, logoPath: p.logoPath })),
        runtime:       d.detail?.runtime  || undefined,
        rating:        d.detail?.rating   || undefined,
        certification: d.detail?.certification || undefined,
      }
      metaCache.set(cacheKey, m)
      setter(m)
    })
    .catch(() => {})
}

// ── helpers ───────────────────────────────────────────────────────────────────

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function fmtDateHeader(key: string): string {
  const d  = new Date(key + 'T12:00:00')
  const dn = d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  return `${dn}  ${d.getDate()}  ${MONTH_NAMES[d.getMonth()]}`
}

// ── data types ────────────────────────────────────────────────────────────────

interface CalItem {
  line:       string
  type:       'episode' | 'movie'
  selected:   TraktSelectedItem
  downloaded: boolean
  isPast:     boolean
  inArr:      boolean
}

// ── data builder ──────────────────────────────────────────────────────────────

function buildItemMap(
  episodes: TraktEpisode[],
  movies: TraktMovie[],
  downloadedMovies: Set<number>,
  downloadedEpisodes: Set<string>,
  inArrMovies: Set<number>,
  inArrShows: Set<number>,
): Map<string, CalItem[]> {
  const today = new Date().toISOString().split('T')[0]
  const map   = new Map<string, CalItem[]>()

  function add(dateStr: string, item: CalItem) {
    const key = dateStr.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }

  for (const ep of episodes) {
    if (!ep.first_aired) continue
    const code  = `S${String(ep.episode.season).padStart(2,'0')}E${String(ep.episode.number).padStart(2,'0')}`
    const dKey  = ep.first_aired.slice(0, 10)
    const dlKey = `${ep.show.ids.tvdb}:${ep.episode.season}:${ep.episode.number}`
    add(ep.first_aired, {
      line:       `${ep.show.title} ${code}`,
      type:       'episode',
      selected:   { type: 'episode', data: ep, downloaded: downloadedEpisodes.has(dlKey) },
      downloaded: downloadedEpisodes.has(dlKey),
      isPast:     dKey < today,
      inArr:      inArrShows.has(ep.show.ids.tvdb),
    })
  }

  for (const mv of movies) {
    if (!mv.released) continue
    const dl = downloadedMovies.has(mv.movie.ids.tmdb)
    add(mv.released, {
      line:       mv.movie.title,
      type:       'movie',
      selected:   { type: 'movie', data: mv, downloaded: dl },
      downloaded: dl,
      isPast:     mv.released < today,
      inArr:      inArrMovies.has(mv.movie.ids.tmdb),
    })
  }

  return map
}

// ── ItemTags ──────────────────────────────────────────────────────────────────

function ItemTags({ item }: { item: CalItem }) {
  const [meta, setMeta] = useState<ItemMeta | null>(null)
  const needsFetch = !item.downloaded

  useEffect(() => {
    if (!needsFetch) return
    let url: string
    let cacheKey: string
    if (item.type === 'movie') {
      const mv = (item.selected as Extract<TraktSelectedItem, { type: 'movie' }>).data
      cacheKey = `movie-${mv.movie.ids.tmdb}`
      url = `/api/trakt?slug=${mv.movie.ids.slug}&type=movie&tmdbId=${mv.movie.ids.tmdb}`
    } else {
      const ep = (item.selected as Extract<TraktSelectedItem, { type: 'episode' }>).data
      cacheKey = `tv-${ep.show.ids.tmdb}`
      url = `/api/trakt?slug=${ep.show.ids.slug}&type=episode&season=${ep.episode.season}&episode=${ep.episode.number}&tmdbId=${ep.show.ids.tmdb}`
    }
    fetchMeta(cacheKey, url, setMeta)
  }, [needsFetch, item.type, item.selected])

  const movieExtra = item.type === 'movie' && meta ? (
    <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--dim)' }}>
      {meta.runtime ? `${meta.runtime}m` : ''}
      {meta.runtime && meta.rating ? ' ' : ''}
      {meta.rating ? `★${meta.rating.toFixed(1)}` : ''}
      {meta.certification ? ` ${meta.certification}` : ''}
    </span>
  ) : null

  const badge = item.downloaded ? (
    <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--s-play)' }}>plex</span>
  ) : !item.inArr && meta && meta.providers.length > 0 ? (
    <span className="flex items-center gap-1 shrink-0">
      {meta.providers.slice(0, 3).map((p, i) => (
        <img
          key={i}
          src={`${TMDB_LOGO}${p.logoPath}`}
          alt={p.name}
          title={p.name}
          className="rounded-sm"
          style={{ width: 32, height: 32, objectFit: 'cover' }}
        />
      ))}
    </span>
  ) : null

  if (!movieExtra && !badge) return null

  return (
    <span className="flex items-center gap-2 shrink-0">
      {movieExtra}
      {badge}
    </span>
  )
}

// ── AgendaView ────────────────────────────────────────────────────────────────

function AgendaView({ itemMap, onSelect }: {
  itemMap: Map<string, CalItem[]>
  onSelect: (item: TraktSelectedItem) => void
}) {
  const [offset, setOffset] = useState(0)
  const today = new Date()

  const days = useMemo(() => {
    const result: Array<{ key: string; isToday: boolean; isPast: boolean; items: CalItem[] }> = []
    const start = offset < 0 ? offset - 90 : offset
    const end   = offset < 0 ? offset       : offset + 90

    for (let d = start; d <= end; d++) {
      const date  = addDays(today, d)
      const key   = dateKey(date)
      const items = itemMap.get(key)
      if (items && items.length > 0) {
        result.push({ key, isToday: d === 0, isPast: d < 0, items })
        if (result.length >= 12) break
      }
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemMap, offset])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 font-mono text-[10px]">
        <button onClick={() => setOffset(o => o - 7)} className="btn-xs">← prev</button>
        {offset !== 0 && (
          <button onClick={() => setOffset(0)} className="btn-xs" style={{ color: 'var(--s-today)' }}>today</button>
        )}
        <button onClick={() => setOffset(o => o + 7)} className="btn-xs">next →</button>
      </div>

      {days.length === 0 ? (
        <p className="font-mono text-[11px]" style={{ color: 'var(--dim)' }}>nothing scheduled</p>
      ) : (
        <div className="space-y-5">
          {days.map(({ key, isToday, isPast, items }) => (
            <div key={key}>
              <div
                className="font-mono text-[10px] uppercase tracking-wider mb-2 pb-1"
                style={{
                  color: isToday ? 'var(--s-today)' : isPast ? 'var(--dimmer)' : 'var(--dim)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {fmtDateHeader(key)}
                {isToday && <span className="ml-3" style={{ color: 'var(--s-today)' }}>today</span>}
              </div>
              <div className="space-y-1.5 pl-3" style={{ borderLeft: '2px solid var(--border)' }}>
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => onSelect(item.selected)}
                  >
                    <span
                      className={`font-mono text-xs flex-1 min-w-0 truncate transition-colors ${item.downloaded ? 'line-through' : 'group-hover:underline'}`}
                      style={{
                        color: item.downloaded
                          ? 'var(--dim)'
                          : isPast
                          ? 'var(--text-dim)'
                          : 'var(--text)',
                      }}
                    >
                      {item.line}
                    </span>
                    <ItemTags item={item} />
                    {!item.downloaded && (
                      <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--dimmer)' }}>›</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function TraktSection() {
  const [movies,             setMovies]             = useState<TraktMovie[]>([])
  const [episodes,           setEpisodes]           = useState<TraktEpisode[]>([])
  const [downloadedMovies,   setDownloadedMovies]   = useState<Set<number>>(new Set())
  const [downloadedEpisodes, setDownloadedEpisodes] = useState<Set<string>>(new Set())
  const [inArrMovies,        setInArrMovies]        = useState<Set<number>>(new Set())
  const [inArrShows,         setInArrShows]         = useState<Set<number>>(new Set())
  const [error,              setError]              = useState<string | null>(null)
  const [loading,            setLoading]            = useState(true)
  const [selected,           setSelected]           = useState<DrawerEntry | null>(null)
  const [refreshing,         setRefreshing]         = useState(false)

  function selectTrakt(item: TraktSelectedItem) {
    if (item.type === 'movie') {
      setSelected({ via: 'trakt', tmdbId: item.data.movie.ids.tmdb, mediaType: 'movie', title: item.data.movie.title })
    } else {
      setSelected({ via: 'trakt', tmdbId: item.data.show.ids.tmdb, mediaType: 'tv', title: item.data.show.title })
    }
  }

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/trakt')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setMovies(data.movies ?? [])
      setEpisodes(data.episodes ?? [])
      setDownloadedMovies(new Set<number>(data.downloadedMovies ?? []))
      setDownloadedEpisodes(new Set<string>(data.downloadedEpisodes ?? []))
      setInArrMovies(new Set<number>(data.inArrMovies ?? []))
      setInArrShows(new Set<number>(data.inArrShows ?? []))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  const itemMap = useMemo(
    () => buildItemMap(episodes, movies, downloadedMovies, downloadedEpisodes, inArrMovies, inArrShows),
    [episodes, movies, downloadedMovies, downloadedEpisodes, inArrMovies, inArrShows],
  )

  return (
    <>
      <section id="trakt">
        <div className="module-panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-label">Trakt</h2>
            <button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }} disabled={refreshing} className="btn-xs">
              {refreshing ? '...' : '↺'}
            </button>
          </div>

          {error   && <p className="font-mono text-xs mb-3" style={{ color: 'var(--s-danger)' }}>{error}</p>}
          {loading && <Spinner />}

          {!loading && !error && (
            <div className="inset-panel px-4 py-4">
              <AgendaView itemMap={itemMap} onSelect={selectTrakt} />
            </div>
          )}
        </div>
      </section>

      <UnifiedDrawer entry={selected} onClose={() => setSelected(null)} onRefresh={() => {}} />
    </>
  )
}
