'use client'

import { Fragment, useState, useEffect } from 'react'
import { TraktMovie, TraktEpisode } from '@/types'
import Spinner from '@/components/Spinner'
import TraktDetailDrawer, { TraktSelectedItem } from '@/components/TraktDetailDrawer'

const MONTH_NAMES = [
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
]
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAY_HUE   = [220, 229, 238, 247, 256, 265, 280]

function dowIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

function formatDayKey(dateKey: string): string {
  const d       = new Date(dateKey + 'T12:00:00')
  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  return `/* ${dayName} · ${d.getDate()} · ${MONTH_NAMES[d.getMonth()]} */`
}

interface CalItem {
  line:       string
  type:       'episode' | 'movie'
  selected:   TraktSelectedItem
  downloaded: boolean
  isPast:     boolean
}

interface CalDay {
  n:        number | null
  dateKey:  string | null
  isToday:  boolean
  items:    CalItem[]
}

function buildCalendar(
  year: number,
  month: number,
  episodes: TraktEpisode[],
  movies: TraktMovie[],
  downloadedMovies: Set<number>,
  downloadedEpisodes: Set<string>,
): CalDay[][] {
  const today    = new Date()
  const todayKey = today.toISOString().split('T')[0]
  const lastDay  = new Date(year, month + 1, 0).getDate()
  const startDow = dowIndex(new Date(year, month, 1))

  const map = new Map<string, CalItem[]>()
  function add(dateStr: string, item: CalItem) {
    const key = dateStr.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }

  for (const ep of episodes) {
    if (!ep.first_aired) continue
    const code = `S${String(ep.episode.season).padStart(2,'0')}E${String(ep.episode.number).padStart(2,'0')}`
    const dateKey = ep.first_aired.slice(0, 10)
    const isPast = dateKey < todayKey
    const dlKey = `${ep.show.ids.tvdb}:${ep.episode.season}:${ep.episode.number}`
    add(ep.first_aired, {
      line: `${ep.show.title} ${code}`,
      type: 'episode',
      selected: { type: 'episode', data: ep, downloaded: downloadedEpisodes.has(dlKey) },
      downloaded: downloadedEpisodes.has(dlKey),
      isPast,
    })
  }
  for (const mv of movies) {
    if (!mv.released) continue
    const isPast = mv.released < todayKey
    const dlMovie = downloadedMovies.has(mv.movie.ids.tmdb)
    add(mv.released, {
      line: mv.movie.title,
      type: 'movie',
      selected: { type: 'movie', data: mv, downloaded: dlMovie },
      downloaded: dlMovie,
      isPast,
    })
  }

  const weeks: CalDay[][] = []
  let week: CalDay[] = []

  for (let i = 0; i < startDow; i++) week.push({ n: null, dateKey: null, isToday: false, items: [] })

  for (let d = 1; d <= lastDay; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear()
    week.push({ n: d, dateKey, isToday, items: map.get(dateKey) ?? [] })
    if (week.length === 7) { weeks.push(week); week = [] }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push({ n: null, dateKey: null, isToday: false, items: [] })
    weeks.push(week)
  }

  return weeks
}

// ── ASCII grid primitives ─────────────────────────────────────────────────────

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

// ── expanded day panel ────────────────────────────────────────────────────────

function ExpandedPanel({
  dateKey, items, onSelect, onClose,
}: {
  dateKey: string
  items:   CalItem[]
  onSelect: (item: TraktSelectedItem) => void
  onClose:  () => void
}) {
  return (
    <div className="border-x border-b border-[#2a2a4a] bg-[#0d0d18] font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a2e]">
        <span className="text-[#6a9a7a]">{formatDayKey(dateKey)}</span>
        <button onClick={onClose} className="btn-xs text-[#888] hover:text-[#ccc]">--close</button>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {items.length === 0 && <span className="text-[#999]">no events</span>}
        {items.map((item, i) => {
          const textClass = item.downloaded
            ? 'line-through text-[#999]'
            : item.isPast
              ? 'text-yellow-500'
              : 'text-white'
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => { onSelect(item.selected) }}
                className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0"
              >
                --info
              </button>
              <span className={item.type === 'movie' ? 'text-amber-400' : 'text-blue-400'}>
                {item.type === 'movie' ? '‡' : '†'}
              </span>
              <span className={textClass}>{item.line}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── week row ──────────────────────────────────────────────────────────────────

interface WeekRowProps {
  week:        CalDay[]
  expandedDay: string | null
  onToggleDay: (key: string) => void
  onSelect:    (item: TraktSelectedItem) => void
}

function WeekRow({ week, expandedDay, onToggleDay, onSelect }: WeekRowProps) {
  const maxItems = Math.max(...week.map(d => d.items.length), 0)

  const dayNums = week.map(day => {
    if (day.n === null) {
      return <span className="block text-right pr-1 py-0.5 text-[#1e1e32] select-none">{'─'}</span>
    }

    const isExpanded = day.dateKey === expandedDay
    const hasItems   = day.items.length > 0

    if (day.isToday) {
      return (
        <button
          onClick={() => day.dateKey && onToggleDay(day.dateKey)}
          className={`cal-today${isExpanded ? ' expanded' : ''}`}
          title="click to expand"
        >
          [{day.n}]{isExpanded ? '▴' : '▾'}
        </button>
      )
    }

    if (hasItems) {
      return (
        <button
          onClick={() => day.dateKey && onToggleDay(day.dateKey)}
          className={`cal-day${isExpanded ? ' expanded' : ''}`}
          title="click to expand"
        >
          {day.n}{isExpanded ? '▴' : '▾'}
        </button>
      )
    }

    return (
      <span className="block text-right pr-1 py-0.5 text-[#252540] select-none leading-none">
        {day.n}
      </span>
    )
  })

  const itemLines = Array.from({ length: maxItems }).map((_, li) =>
    week.map(day => {
      const item = day.items[li]
      if (!item) return <span className="block py-0.5">&nbsp;</span>
      const textClass = item.downloaded
        ? 'line-through text-[#999]'
        : item.isPast
          ? 'text-yellow-500'
          : 'text-white'
      return (
        <div
          className="scroll-hover py-0.5 px-0.5 cursor-pointer"
          onClick={() => onSelect(item.selected)}
          title={item.line}
        >
          <span className="scroll-inner inline-block whitespace-nowrap font-mono text-xs leading-none">
            <span className={item.type === 'movie' ? 'text-amber-400' : 'text-blue-400'}>
              {item.type === 'movie' ? '‡ ' : '† '}
            </span>
            <span className={textClass}>{item.line}</span>
          </span>
        </div>
      )
    })
  )

  return (
    <>
      <CalRow cells={dayNums} />
      {itemLines.map((cells, li) => (
        <CalRow key={li} cells={cells} />
      ))}
    </>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function TraktSection() {
  const [movies,             setMovies]             = useState<TraktMovie[]>([])
  const [episodes,           setEpisodes]           = useState<TraktEpisode[]>([])
  const [downloadedMovies,   setDownloadedMovies]   = useState<Set<number>>(new Set())
  const [downloadedEpisodes, setDownloadedEpisodes] = useState<Set<string>>(new Set())
  const [error,              setError]              = useState<string | null>(null)
  const [loading,            setLoading]            = useState(true)
  const [selected,           setSelected]           = useState<TraktSelectedItem | null>(null)
  const [expandedDay,        setExpandedDay]        = useState<string | null>(null)

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

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()
  const weeks = buildCalendar(year, month, episodes, movies, downloadedMovies, downloadedEpisodes)

  function toggleDay(key: string) {
    setExpandedDay(prev => prev === key ? null : key)
  }

  const headerCells = DAY_NAMES.map((d, i) => (
    <span
      key={d}
      className="block text-center py-0.5 font-bold select-none"
      style={{ color: `hsl(${DAY_HUE[i]}, 70%, 65%)` }}
    >
      {d}
    </span>
  ))

  return (
    <>
      <section id="trakt">
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between">
          <span>
            const{' '}
            <span className="text-white text-sm font-medium uppercase tracking-widest">Tr4kt Upc0m1ng</span>
            {' = { '}
            <span className="text-[#888]">// {MONTH_NAMES[month]} :: {year}</span>
          </span>
          <span className="text-[#888] text-xs">
            <span className="text-green-400">[n]</span> today&nbsp;&nbsp;
            <span className="text-blue-400">†</span> sonarr&nbsp;&nbsp;
            <span className="text-amber-400">‡</span> radarr
          </span>
        </div>

        {error   && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}
        {loading && <Spinner />}

        {!loading && !error && (
          <div>
            <CalSep />
            <CalRow cells={headerCells} />
            <CalSep />
            {weeks.map((week, wi) => {
              const expandedInWeek = week.find(d => d.dateKey === expandedDay)
              return (
                <div key={wi}>
                  <WeekRow
                    week={week}
                    expandedDay={expandedDay}
                    onToggleDay={toggleDay}
                    onSelect={setSelected}
                  />
                  <CalSep highlight={!!expandedInWeek} />
                  {expandedInWeek && expandedDay && (
                    <ExpandedPanel
                      dateKey={expandedDay}
                      items={expandedInWeek.items}
                      onSelect={setSelected}
                      onClose={() => setExpandedDay(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="font-mono text-xs text-[#6a9a7a] mt-2">{'}'}</div>
      </section>

      <TraktDetailDrawer item={selected} onClose={() => setSelected(null)} />
    </>
  )
}
