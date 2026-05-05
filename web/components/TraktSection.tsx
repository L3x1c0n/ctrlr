'use client'

import { Fragment, useState, useEffect, useRef, useMemo } from 'react'
import { TraktMovie, TraktEpisode } from '@/types'
import Spinner from '@/components/Spinner'
import { TraktSelectedItem } from '@/components/TraktDetailDrawer'
import UnifiedDrawer, { DrawerEntry } from '@/components/UnifiedDrawer'
import MarqueeText from '@/components/MarqueeText'

// ── constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
]
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAY_HUE   = [220, 229, 238, 247, 256, 265, 280]

const PROVIDER_MAP: Record<string, { abbr: string; color: string }> = {
  'netflix':             { abbr: 'NF', color: '#E50914' },
  'prime video':         { abbr: 'PV', color: '#00A8E0' },
  'amazon prime video':  { abbr: 'PV', color: '#00A8E0' },
  'disney plus':         { abbr: 'D+', color: '#113CCF' },
  'disney+':             { abbr: 'D+', color: '#113CCF' },
  'hulu':                { abbr: 'HU', color: '#1CE783' },
  'max':                 { abbr: 'MX', color: '#002BE7' },
  'hbo max':             { abbr: 'MX', color: '#002BE7' },
  'apple tv+':           { abbr: 'AT', color: '#888888' },
  'apple tv plus':       { abbr: 'AT', color: '#888888' },
  'peacock':             { abbr: 'PC', color: '#0066FF' },
  'paramount+':          { abbr: 'P+', color: '#0064FF' },
  'paramount plus':      { abbr: 'P+', color: '#0064FF' },
  'crunchyroll':         { abbr: 'CR', color: '#F47521' },
  'funimation':          { abbr: 'FN', color: '#410099' },
}

function providerInfo(name: string): { abbr: string; color: string } {
  return PROVIDER_MAP[name.toLowerCase()] ?? {
    abbr:  name.slice(0, 2).toUpperCase(),
    color: '#666688',
  }
}

// ── client-side metadata cache ────────────────────────────────────────────────

interface ItemMeta {
  providers: { abbr: string; color: string }[]
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
        providers:     (d.watchProviders ?? []).map((p: any) => providerInfo(p.name)),
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

function dowIndex(d: Date): number { return (d.getDay() + 6) % 7 }

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function fmtDateKey(key: string): string {
  const d  = new Date(key + 'T12:00:00')
  const dn = d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  return `/* ${dn} · ${d.getDate()} · ${MONTH_NAMES[d.getMonth()]} */`
}

function fmtDateHeader(key: string): string {
  const d = new Date(key + 'T12:00:00')
  return `${d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()} · ${d.getDate()} · ${MONTH_NAMES[d.getMonth()]}`
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

interface CalDay {
  n:        number | null
  dateKey:  string | null
  isToday:  boolean
  items:    CalItem[]
}

// ── data builders ─────────────────────────────────────────────────────────────

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

function buildCalendar(
  year: number,
  month: number,
  itemMap: Map<string, CalItem[]>,
): CalDay[][] {
  const today    = new Date()
  const lastDay  = new Date(year, month + 1, 0).getDate()
  const startDow = dowIndex(new Date(year, month, 1))
  const weeks: CalDay[][] = []
  let week: CalDay[] = []

  for (let i = 0; i < startDow; i++) week.push({ n: null, dateKey: null, isToday: false, items: [] })

  for (let d = 1; d <= lastDay; d++) {
    const k       = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
    week.push({ n: d, dateKey: k, isToday, items: itemMap.get(k) ?? [] })
    if (week.length === 7) { weeks.push(week); week = [] }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push({ n: null, dateKey: null, isToday: false, items: [] })
    weeks.push(week)
  }

  return weeks
}

// ── ItemTags — plex / streaming providers + movie meta ────────────────────────

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

  // Movie meta: runtime + rating (shown regardless of inArr)
  const movieExtra = item.type === 'movie' && meta ? (
    <span className="text-[#555] text-xs shrink-0 font-mono">
      {meta.runtime ? `${meta.runtime}m` : ''}
      {meta.runtime && meta.rating ? ' ' : ''}
      {meta.rating ? `★${meta.rating.toFixed(1)}` : ''}
      {meta.certification ? ` ${meta.certification}` : ''}
    </span>
  ) : null

  // Plex / provider badge
  const badge = item.downloaded ? (
    <span style={{ color: '#E5A00D' }} className="text-xs shrink-0">[plex]</span>
  ) : meta && meta.providers.length > 0 ? (
    <span className="flex items-center gap-0.5 shrink-0">
      {meta.providers.slice(0, 2).map((p, i) => (
        <span key={i} style={{ color: p.color }} className="text-xs">[{p.abbr}]</span>
      ))}
    </span>
  ) : null

  if (!movieExtra && !badge) return null

  return (
    <span className="flex items-center gap-1.5 shrink-0">
      {movieExtra}
      {badge}
    </span>
  )
}

// ── month view primitives ─────────────────────────────────────────────────────

function CalSep({ highlight = false }: { highlight?: boolean }) {
  return (
    <div className={`flex items-center font-mono text-xs select-none leading-none ${highlight ? 'text-[#3a3a5a]' : 'text-[#2a2a4a]'}`}>
      {Array.from({ length: 7 }).map((_, i) => (
        <Fragment key={i}>
          <span className="shrink-0">+</span>
          <span className="flex-1 overflow-hidden whitespace-nowrap">{'─'.repeat(80)}</span>
        </Fragment>
      ))}
      <span className="shrink-0">+</span>
    </div>
  )
}

function CalRow({ cells }: { cells: React.ReactNode[] }) {
  return (
    <div className="flex font-mono text-xs leading-none">
      {cells.map((cell, i) => (
        <Fragment key={i}>
          <span className="shrink-0 text-[#2a2a4a] select-none">|</span>
          <span className="flex-1 min-w-0 overflow-hidden">{cell}</span>
        </Fragment>
      ))}
      <span className="shrink-0 text-[#2a2a4a] select-none">|</span>
    </div>
  )
}

function ExpandedPanel({ dateKey: dk, items, onSelect, onClose }: {
  dateKey: string; items: CalItem[]
  onSelect: (item: TraktSelectedItem) => void; onClose: () => void
}) {
  return (
    <div className="border-x border-b border-[#2a2a4a] bg-[#0d0d18] font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a2e]">
        <span className="text-[#6a9a7a]">{fmtDateKey(dk)}</span>
        <button onClick={onClose} className="btn-xs text-[#888] hover:text-[#ccc]">--close</button>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {items.length === 0 && <span className="text-[#999]">no events</span>}
        {items.map((item, i) => {
          const textClass = item.downloaded ? 'line-through text-[#999]' : item.isPast ? 'text-yellow-500' : 'text-white'
          return (
            <div key={i} className="flex items-center gap-2">
              <button onClick={() => onSelect(item.selected)} className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0">--info</button>
              <span className={item.type === 'movie' ? 'text-amber-400' : 'text-blue-400'}>{item.type === 'movie' ? '‡' : '†'}</span>
              <span className={textClass}>{item.line}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekRow({ week, expandedDay, onToggleDay, onSelect }: {
  week: CalDay[]; expandedDay: string | null
  onToggleDay: (key: string) => void; onSelect: (item: TraktSelectedItem) => void
}) {
  const maxItems = Math.max(...week.map(d => d.items.length), 0)

  const dayNums = week.map(day => {
    if (day.n === null) return <span className="block text-right pr-1 py-0.5 text-[#1e1e32] select-none">{'─'}</span>
    const isExpanded = day.dateKey === expandedDay
    const hasItems   = day.items.length > 0
    if (day.isToday) return (
      <button onClick={() => day.dateKey && onToggleDay(day.dateKey)} className={`cal-today${isExpanded ? ' expanded' : ''}`}>
        [{day.n}]{isExpanded ? '▴' : '▾'}
      </button>
    )
    if (hasItems) return (
      <button onClick={() => day.dateKey && onToggleDay(day.dateKey)} className={`cal-day${isExpanded ? ' expanded' : ''}`}>
        {day.n}{isExpanded ? '▴' : '▾'}
      </button>
    )
    return <span className="block text-right pr-1 py-0.5 text-[#252540] select-none leading-none">{day.n}</span>
  })

  const itemLines = Array.from({ length: maxItems }).map((_, li) =>
    week.map(day => {
      const item = day.items[li]
      if (!item) return <span className="block py-0.5">&nbsp;</span>
      const textClass = item.downloaded ? 'line-through text-[#999]' : item.isPast ? 'text-yellow-500' : 'text-white'
      return (
        <div className="py-0.5 px-0.5 cursor-pointer" onClick={() => onSelect(item.selected)}>
          <MarqueeText>
            <span className={item.type === 'movie' ? 'text-amber-400' : 'text-blue-400'}>{item.type === 'movie' ? '‡ ' : '† '}</span>
            <span className={textClass}>{item.line}</span>
          </MarqueeText>
        </div>
      )
    })
  )

  return (
    <>
      <CalRow cells={dayNums} />
      {itemLines.map((cells, li) => <CalRow key={li} cells={cells} />)}
    </>
  )
}

// ── Forecast view ─────────────────────────────────────────────────────────────

function ForecastView({ itemMap, offset, onOffsetChange, onSelect }: {
  itemMap: Map<string, CalItem[]>
  offset: number
  onOffsetChange: (n: number) => void
  onSelect: (item: TraktSelectedItem) => void
}) {
  const today = new Date()
  const days  = [-1, 0, 1].map(d => {
    const date = addDays(today, d + offset)
    const key  = dateKey(date)
    return { key, isToday: d + offset === 0, items: itemMap.get(key) ?? [] }
  })

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2 font-mono text-xs">
        <button onClick={() => onOffsetChange(offset - 3)} className="btn-xs text-[#888] hover:text-white">← prev</button>
        {offset !== 0 && (
          <button onClick={() => onOffsetChange(0)} className="btn-xs text-[#6a9a7a]">today</button>
        )}
        <button onClick={() => onOffsetChange(offset + 3)} className="btn-xs text-[#888] hover:text-white">next →</button>
      </div>

      {days.map(({ key, isToday, items }) => (
        <div key={key} className={`rounded border font-mono text-xs ${isToday ? 'border-[#3a3a6a] bg-[#12122a]' : 'border-[#1a1a2e] bg-[#0d0d18]'}`}>
          <div className={`px-3 py-1.5 flex items-center justify-between border-b ${isToday ? 'border-[#3a3a6a]' : 'border-[#1a1a2e]'}`}>
            <span className={isToday ? 'text-[#4ade80] font-bold' : 'text-[#6a9a7a]'}>
              {isToday ? `[${fmtDateHeader(key)}]` : fmtDateHeader(key)}
            </span>
            {isToday && <span className="text-[#4ade80] text-xs">today</span>}
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {items.length === 0 ? (
              <span className="text-[#444]">—</span>
            ) : items.map((item, i) => {
              const textClass = item.downloaded ? 'line-through text-[#555]' : item.isPast ? 'text-yellow-500' : 'text-white'
              return (
                <div key={i} className="flex items-center gap-2 cursor-pointer" onClick={() => onSelect(item.selected)}>
                  <span className={`shrink-0 ${item.type === 'movie' ? 'text-amber-400' : 'text-blue-400'}`}>
                    {item.type === 'movie' ? '‡' : '†'}
                  </span>
                  <span className={`${textClass} flex-1 min-w-0 truncate`}>{item.line}</span>
                  <ItemTags item={item} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Agenda view ───────────────────────────────────────────────────────────────

function AgendaView({ itemMap, cap, agendaOffset, onOffsetChange, onSelect }: {
  itemMap: Map<string, CalItem[]>
  cap: number
  agendaOffset: number
  onOffsetChange: (n: number) => void
  onSelect: (item: TraktSelectedItem) => void
}) {
  const today = new Date()

  // Build days with entries anchored to today.
  // agendaOffset 0 = today → forward; negative = past via prev button.
  const startDay = agendaOffset
  const endDay   = agendaOffset + 90

  const daysWithItems: Array<{ key: string; isToday: boolean; isPast: boolean; items: CalItem[] }> = []
  for (let d = startDay; d <= endDay; d++) {
    const date  = addDays(today, d)
    const key   = dateKey(date)
    const items = itemMap.get(key)
    if (items && items.length > 0) {
      daysWithItems.push({ key, isToday: d === 0, isPast: d < 0, items })
    }
  }

  // Cap by total entries
  let remaining = cap
  const capped  = daysWithItems.map(day => {
    if (remaining <= 0) return null
    const sliced = day.items.slice(0, remaining)
    remaining -= sliced.length
    return { ...day, items: sliced }
  }).filter(Boolean) as typeof daysWithItems

  return (
    <div>
      {/* nav */}
      <div className="flex items-center justify-between mb-3 font-mono text-xs">
        <button onClick={() => onOffsetChange(agendaOffset - cap)} className="btn-xs text-[#888] hover:text-white">← prev</button>
        {agendaOffset !== 0 && (
          <button onClick={() => onOffsetChange(0)} className="btn-xs text-[#6a9a7a]">today</button>
        )}
        <button onClick={() => onOffsetChange(agendaOffset + cap)} className="btn-xs text-[#888] hover:text-white">next →</button>
      </div>

      {capped.length === 0 ? (
        <p className="text-[#444] text-xs font-mono">// no entries in this range</p>
      ) : (
        <div className="space-y-3 font-mono text-xs">
          {capped.map(({ key, isToday, isPast, items }) => (
            <div key={key}>
              <div className="mb-1 pb-0.5 border-b border-[#1a1a2e] flex items-center gap-2">
                <span className={isToday ? 'text-[#4ade80] font-bold' : isPast ? 'text-[#4a4a6a]' : 'text-[#6a9a7a]'}>
                  {fmtDateKey(key)}
                </span>
                {isToday && <span className="text-[#4ade80] text-xs">← today</span>}
              </div>
              <div className="space-y-1 pl-2">
                {items.map((item, i) => {
                  const textClass = item.downloaded ? 'line-through text-[#555]' : item.isPast ? 'text-yellow-500' : 'text-white'
                  return (
                    <div key={i} className="flex items-center gap-2 cursor-pointer group" onClick={() => onSelect(item.selected)}>
                      <span className={`shrink-0 ${item.type === 'movie' ? 'text-amber-400' : 'text-blue-400'}`}>
                        {item.type === 'movie' ? '‡' : '†'}
                      </span>
                      <span className={`${textClass} flex-1 min-w-0 truncate group-hover:text-[#ddd] transition-colors`}>
                        {item.line}
                      </span>
                      <ItemTags item={item} />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── view switcher ─────────────────────────────────────────────────────────────

type CalView = 'month' | 'forecast' | 'agenda'

function ViewSwitcher({ view, onChange }: { view: CalView; onChange: (v: CalView) => void }) {
  return (
    <div className="flex gap-1 font-mono text-xs">
      {(['month', 'forecast', 'agenda'] as CalView[]).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-1.5 py-0.5 border ${view === v ? 'border-[#7070a8] text-[#aaa]' : 'border-[#1a1a2e] text-[#555] hover:text-[#888]'}`}
        >
          {v}
        </button>
      ))}
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

  function selectTrakt(item: TraktSelectedItem) {
    if (item.type === 'movie') {
      setSelected({ via: 'trakt', tmdbId: item.data.movie.ids.tmdb, mediaType: 'movie', title: item.data.movie.title })
    } else {
      setSelected({ via: 'trakt', tmdbId: item.data.show.ids.tmdb, mediaType: 'tv', title: item.data.show.title })
    }
  }
  const [expandedDay,        setExpandedDay]        = useState<string | null>(null)
  const [view,               setView]               = useState<CalView>('month')
  const [forecastOffset,     setForecastOffset]     = useState(0)
  const [agendaOffset,       setAgendaOffset]       = useState(0)
  const [isMobile,           setIsMobile]           = useState(false)

  useEffect(() => {
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    setView(mobile ? 'forecast' : 'month')
    function onResize() { setIsMobile(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    async function load() {
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
    }
    load()
    const id = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const itemMap = useMemo(
    () => buildItemMap(episodes, movies, downloadedMovies, downloadedEpisodes, inArrMovies, inArrShows),
    [episodes, movies, downloadedMovies, downloadedEpisodes, inArrMovies, inArrShows],
  )

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()
  const weeks = useMemo(() => buildCalendar(year, month, itemMap), [year, month, itemMap])

  function toggleDay(key: string) { setExpandedDay(prev => prev === key ? null : key) }

  const headerCells = DAY_NAMES.map((d, i) => (
    <span key={d} className="block text-center py-0.5 font-bold select-none" style={{ color: `hsl(${DAY_HUE[i]}, 70%, 65%)` }}>
      {d}
    </span>
  ))

  const cap = isMobile ? 5 : 10

  return (
    <>
      <section id="trakt">
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between flex-wrap gap-2">
          <span>
            const{' '}
            <span className="text-white text-sm font-medium uppercase tracking-widest">Tr4kt Upc0m1ng</span>
            {' = { '}
            <span className="text-[#888]">// {MONTH_NAMES[month]} :: {year}</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[#888] text-xs hidden sm:inline">
              <span className="text-green-400">[n]</span> today&nbsp;&nbsp;
              <span className="text-blue-400">†</span> sonarr&nbsp;&nbsp;
              <span className="text-amber-400">‡</span> radarr
            </span>
            <ViewSwitcher view={view} onChange={setView} />
          </div>
        </div>

        {error   && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}
        {loading && <Spinner />}

        {!loading && !error && view === 'month' && (
          <div>
            <CalSep />
            <CalRow cells={headerCells} />
            <CalSep />
            {weeks.map((week, wi) => {
              const expandedInWeek = week.find(d => d.dateKey === expandedDay)
              return (
                <div key={wi}>
                  <WeekRow week={week} expandedDay={expandedDay} onToggleDay={toggleDay} onSelect={selectTrakt} />
                  <CalSep highlight={!!expandedInWeek} />
                  {expandedInWeek && expandedDay && (
                    <ExpandedPanel dateKey={expandedDay} items={expandedInWeek.items} onSelect={selectTrakt} onClose={() => setExpandedDay(null)} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!loading && !error && view === 'forecast' && (
          <ForecastView itemMap={itemMap} offset={forecastOffset} onOffsetChange={setForecastOffset} onSelect={selectTrakt} />
        )}

        {!loading && !error && view === 'agenda' && (
          <AgendaView itemMap={itemMap} cap={cap} agendaOffset={agendaOffset} onOffsetChange={setAgendaOffset} onSelect={selectTrakt} />
        )}

        <div className="font-mono text-xs text-[#6a9a7a] mt-2">{'}'}</div>
      </section>

      <UnifiedDrawer entry={selected} onClose={() => setSelected(null)} onRefresh={() => {}} />
    </>
  )
}
