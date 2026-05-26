'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrQueueItem, ArrCalendarItem } from '@/types'
import Spinner from '@/components/Spinner'
import UnifiedDrawer, { DrawerEntry } from '@/components/UnifiedDrawer'

function fmtRelDate(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days > 0) {
    if (days === 1) return 'tomorrow'
    if (days < 7)   return `${days}d`
    if (days < 31)  return `${Math.ceil(days / 7)}w`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const ago = Math.floor(-diff / 86400000)
  if (ago === 0) return 'today'
  if (ago < 7)  return `${ago}d ago`
  if (ago < 31) return `${Math.floor(ago / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Health     { source: string; type: string; message: string }
interface MonMovie   { id: number; title: string; year: number; hasFile: boolean; status: string; inCinemas?: string; physicalRelease?: string; digitalRelease?: string }
interface MonSerie   { id: number; title: string; nextAiring?: string }
type Monitored = MonMovie | MonSerie

interface RecentMovie   { id: number; title: string; year: number; dateAdded: string }
interface RecentEpisode { seriesId: number; seriesTitle: string; seasonNumber: number; episodeNumber: number; title: string; dateAdded: string }

function upcomingMovieDate(m: MonMovie): string | null {
  const now = Date.now()
  const candidates = [m.digitalRelease, m.physicalRelease, m.inCinemas]
    .filter(Boolean)
    .map(d => new Date(d!))
    .filter(d => d.getTime() > now)
  if (!candidates.length) return null
  return candidates.reduce((a, b) => a.getTime() < b.getTime() ? a : b).toISOString()
}

function releaseLabel(m: MonMovie): string {
  const now = Date.now()
  if (m.digitalRelease  && new Date(m.digitalRelease).getTime()  > now) return 'digital'
  if (m.physicalRelease && new Date(m.physicalRelease).getTime() > now) return 'physical'
  if (m.inCinemas       && new Date(m.inCinemas).getTime()       > now) return 'cinema'
  return m.status
}

type RowState = 'pending' | 'delay' | 'queued' | 'downloading' | 'paused' | 'warning' | 'completed' | 'failed' | 'imported' | 'missing'

interface MergedRow {
  key:         string
  title:       string
  state:       RowState
  queueItem?:  ArrQueueItem
  calendarId?: number   // episodeId (sonarr) or movieId (radarr)
  seriesId?:   number   // sonarr only, needed to open detail drawer for pending rows
}

function normalizeState(status: string): RowState {
  if (status === 'importPending') return 'completed'
  const known: RowState[] = ['delay', 'queued', 'downloading', 'paused', 'warning', 'completed', 'failed']
  return known.includes(status as RowState) ? (status as RowState) : 'queued'
}

const stateColor: Record<RowState, string> = {
  pending:     'var(--dim)',
  delay:       'var(--s-today)',
  queued:      'var(--dim)',
  downloading: 'var(--s-dl)',
  paused:      'var(--s-today)',
  warning:     'var(--s-today)',
  completed:   'var(--s-play)',
  failed:      'var(--s-danger)',
  imported:    'var(--s-play)',
  missing:     'var(--s-today)',
}

const healthColor: Record<string, string> = {
  error:   'var(--s-danger)',
  warning: 'var(--s-today)',
  notice:  'var(--dim)',
  ok:      'var(--s-play)',
}

const DISMISS_KEY = (service: string) => `ctrlr-health-dismissed-${service}`

function loadDismissed(service: string): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY(service))
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function saveDismissed(service: string, set: Set<string>) {
  localStorage.setItem(DISMISS_KEY(service), JSON.stringify([...set]))
}

// Rows that have left the live data — persisted for today only
interface RetainedRow {
  key:         string
  title:       string
  state:       'imported' | 'missing'
  calendarId?: number
  seriesId?:   number
  date:        string   // YYYY-MM-DD
}

function retainedKey(service: string) {
  return `ctrlr-retained-${service}`
}

function loadRetained(service: string): RetainedRow[] {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const raw   = localStorage.getItem(retainedKey(service))
    const rows: RetainedRow[] = raw ? JSON.parse(raw) : []
    return rows.filter(r => r.date === today)
  } catch { return [] }
}

function saveRetained(service: string, rows: RetainedRow[]) {
  try { localStorage.setItem(retainedKey(service), JSON.stringify(rows)) } catch {}
}

interface Props {
  service: 'radarr' | 'sonarr'
  label:   string
}

export default function ArrSection({ service, label }: Props) {
  const [queue,          setQueue]          = useState<ArrQueueItem[]>([])
  const [health,         setHealth]         = useState<Health[]>([])
  const [monitored,      setMonitored]      = useState<Monitored[]>([])
  const [calendar,       setCalendar]       = useState<ArrCalendarItem[]>([])
  const [recentlyAdded,  setRecentlyAdded]  = useState<(RecentMovie | RecentEpisode)[]>([])
  const [retained,       setRetained]       = useState<RetainedRow[]>(() => [])
  const [error,          setError]          = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [selected,       setSelected]       = useState<DrawerEntry | null>(null)

  function openArr(item: ArrQueueItem) {
    if (service === 'radarr' && item.movieId) {
      setSelected({ via: 'radarr', movieId: item.movieId, title: item.title })
    } else if (service === 'sonarr' && item.seriesId) {
      setSelected({ via: 'sonarr', seriesId: item.seriesId, episodeId: item.episodeId, title: item.title })
    }
  }
  const [dismissed,      setDismissed]      = useState<Set<string>>(() => new Set())
  const [refreshing,     setRefreshing]     = useState(false)

  // Track previous live row states to detect disappearances
  const prevRows = useRef<Map<string, { state: RowState; title: string; calendarId?: number; seriesId?: number }>>(new Map())

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/${service}?panel=overview`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setQueue(data.records ?? [])
      setHealth(data.health ?? [])
      setMonitored(data.monitored ?? [])
      setCalendar(data.calendar ?? [])
      setRecentlyAdded(data.recentlyAdded ?? [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [service])

  useEffect(() => { setDismissed(loadDismissed(service)) }, [service])
  useEffect(() => { setRetained(loadRetained(service)) }, [service])

  // Drop retained 'missing' rows that are unanchored (no calendarId) or resolved
  useEffect(() => {
    if (calendar.length === 0) return
    const calendarIds = new Set(calendar.map(c => c.id))
    setRetained(prev => {
      const next = prev.filter(r => {
        if (r.state !== 'missing') return true
        if (r.calendarId == null) return false                  // no calendar anchor — drop
        if (!calendarIds.has(r.calendarId)) return false        // file arrived — drop
        return true
      })
      if (next.length !== prev.length) saveRetained(service, next)
      return next
    })
  }, [calendar, service])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  function dismissHealth(message: string) {
    setDismissed(prev => {
      const next = new Set(prev).add(message)
      saveDismissed(service, next)
      return next
    })
  }

  async function queueAction(act: string, id: number, extra: object = {}) {
    await fetch(`/api/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, id, ...extra }),
    })
    await load()
  }

  async function searchCalendar(calendarId: number) {
    const body = service === 'sonarr'
      ? { action: 'searchEpisode', episodeId: calendarId }
      : { action: 'searchMovie',   movieId:   calendarId }
    await fetch(`/api/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
  }

  // Build unified rows keyed by stable episode/movie id
  const rows = useMemo<MergedRow[]>(() => {
    const queueByStableId = new Map<number, ArrQueueItem>()
    const matchedQueueIds = new Set<number>()

    for (const q of queue) {
      const sid = service === 'sonarr' ? q.episodeId : q.movieId
      if (sid) queueByStableId.set(sid, q)
    }

    const result: MergedRow[] = []

    // Calendar items — pending or overlaid with queue state
    for (const c of calendar) {
      const q = queueByStableId.get(c.id)
      if (q) {
        matchedQueueIds.add(q.id)
        result.push({
          key:        `ep-${c.id}`,
          title:      q.title,
          state:      normalizeState(q.status),
          queueItem:  q,
          calendarId: c.id,
        })
      } else {
        result.push({ key: `ep-${c.id}`, title: c.title, state: 'pending', calendarId: c.id, seriesId: c.seriesId })
      }
    }

    // Queue items not matched to today's calendar
    for (const q of queue) {
      if (matchedQueueIds.has(q.id)) continue
      const sid = service === 'sonarr' ? q.episodeId : q.movieId
      result.push({
        key:       sid ? `ep-${sid}` : `q-${q.id}`,
        title:     q.title,
        state:     normalizeState(q.status),
        queueItem: q,
      })
    }

    // Retained rows (imported/missing) that aren't back in live data
    const liveKeys = new Set(result.map(r => r.key))
    for (const r of retained) {
      if (!liveKeys.has(r.key)) {
        result.push({ key: r.key, title: r.title, state: r.state, calendarId: r.calendarId, seriesId: r.seriesId })
      }
    }

    return result
  }, [queue, calendar, retained, service])

  // Detect rows that left the live data and retain them as imported/missing
  useEffect(() => {
    const today   = new Date().toISOString().slice(0, 10)
    const liveMap = new Map(rows.map(r => [r.key, r]))

    const newRetained: RetainedRow[] = []
    for (const [key, prev] of prevRows.current) {
      if (prev.state === 'imported' || prev.state === 'missing') continue
      if (!liveMap.has(key) && prev.calendarId != null) {
        newRetained.push({
          key,
          title:      prev.title,
          state:      prev.state === 'completed' ? 'imported' : 'missing',
          calendarId: prev.calendarId,
          seriesId:   prev.seriesId,
          date:       today,
        })
      }
    }

    if (newRetained.length > 0) {
      setRetained(prev => {
        const retainedKeys = new Set(prev.map(r => r.key))
        const merged = [...prev, ...newRetained.filter(r => !retainedKeys.has(r.key))]
        saveRetained(service, merged)
        return merged
      })
    }

    prevRows.current = new Map(
      rows.map(r => [r.key, { state: r.state, title: r.title, calendarId: r.calendarId, seriesId: r.seriesId }])
    )
  }, [rows, service])

  const failedCount  = rows.filter(r => r.state === 'failed').length
  const QUEUE_CAP    = 10
  const UPCOMING_CAP = 10

  return (
    <>
      <section id={service}>
        <div className="module-panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-label">{label}</h2>
            <div className="flex items-center gap-3">
              {monitored.length > 0 && (
                <span className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>{monitored.length} monitored</span>
              )}
              <button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }} disabled={refreshing} className="btn-xs">
                {refreshing ? '...' : '↺'}
              </button>
            </div>
          </div>

          {error   && <p className="text-danger font-mono text-xs mb-3">{error}</p>}
          {loading && <Spinner />}

          {health.filter(h => !dismissed.has(h.message)).length > 0 && (
            <div className="mb-4 space-y-1">
              {health.filter(h => !dismissed.has(h.message)).map((h, i) => (
                <div key={i} className="flex items-start gap-2 font-mono text-xs" style={{ color: healthColor[h.type.toLowerCase()] ?? 'var(--dim)' }}>
                  <span className="select-none shrink-0">⚠</span>
                  <span className="flex-1">{h.message}</span>
                  <button onClick={() => dismissHealth(h.message)} className="shrink-0 leading-none btn-xs">×</button>
                </div>
              ))}
            </div>
          )}

          {/* queue + recently added — inset display window */}
          {(() => {
            const queueRows  = rows.slice(0, QUEUE_CAP)
            const recentSlot = Math.max(0, QUEUE_CAP - rows.length)
            const recentRows = recentlyAdded.slice(0, recentSlot)
            const isEmpty    = rows.length === 0 && recentlyAdded.length === 0
            return (
              <div className="mb-4">
                <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--dimmer)' }}>queue</p>
                <div className="inset-panel">
                  {isEmpty && !error && !loading && (
                    <p className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--dim)' }}>empty</p>
                  )}
                  {queueRows.map((row, i) => {
                    const q = row.queueItem
                    const isLast = i === queueRows.length - 1 && recentRows.length === 0
                    const openRow = q
                      ? () => openArr(q)
                      : row.calendarId
                      ? () => setSelected(service === 'sonarr' ? { via: 'sonarr', seriesId: row.seriesId!, episodeId: row.calendarId, title: row.title } : { via: 'radarr', movieId: row.calendarId!, title: row.title })
                      : null
                    return (
                      <div
                        key={row.key}
                        className={`flex items-center gap-2 font-mono text-xs px-4 py-2.5 ${openRow ? 'cursor-pointer group' : ''}`}
                        style={{ borderBottom: isLast ? undefined : '1px solid var(--border)' }}
                        onClick={openRow ?? undefined}
                      >
                        <span className="tabular-nums select-none w-4 text-right shrink-0" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                        <span className={`flex-1 truncate ${openRow ? 'group-hover:underline' : ''}`} style={{ color: 'var(--text)' }}>{row.title}</span>
                        <span className="shrink-0 tabular-nums text-[10px] transition-colors duration-500" style={{ color: stateColor[row.state] }}>{row.state}</span>
                        <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                          {(row.state === 'pending' || row.state === 'missing') && row.calendarId && (
                            <button onClick={() => searchCalendar(row.calendarId!)} className="btn-xs">search</button>
                          )}
                          {row.state === 'failed' && q && (
                            <>
                              <button onClick={() => queueAction('search', q.id)} className="btn-xs">retry</button>
                              <button onClick={() => { if (confirm(`Remove ${row.title}?`)) queueAction('delete', q.id, { blacklist: true }) }} className="btn-xs danger">remove</button>
                            </>
                          )}
                          {row.state === 'completed' && q && (
                            <button onClick={() => { if (confirm(`Remove ${row.title}?`)) queueAction('delete', q.id) }} className="btn-xs danger">remove</button>
                          )}
                          {(['delay', 'queued', 'downloading', 'paused', 'warning'] as RowState[]).includes(row.state) && q && (
                            <>
                              <button onClick={() => queueAction('search', q.id)} className="btn-xs">search</button>
                              <button onClick={() => { if (confirm(`Remove ${row.title}?`)) queueAction('delete', q.id) }} className="btn-xs danger">remove</button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {recentRows.length > 0 && recentRows.map((r, i) => {
                    const isEp = 'seriesTitle' in r
                    const ep   = isEp ? r as RecentEpisode : null
                    const mv   = isEp ? null : r as RecentMovie
                    const ago  = fmtRelDate(isEp ? ep!.dateAdded : mv!.dateAdded)
                    const isLast = i === recentRows.length - 1
                    const onOpen = isEp
                      ? () => setSelected({ via: 'sonarr', seriesId: ep!.seriesId, title: ep!.seriesTitle })
                      : () => setSelected({ via: 'radarr', movieId: mv!.id, title: mv!.title })
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 font-mono text-xs px-4 py-2.5 cursor-pointer group"
                        style={{ borderBottom: isLast ? undefined : '1px solid var(--border)', borderTop: i === 0 && queueRows.length > 0 ? '1px solid var(--border)' : undefined }}
                        onClick={onOpen}
                      >
                        <span className="tabular-nums select-none w-4 text-right shrink-0" style={{ color: 'var(--dim)' }}>{rows.length + i + 1}</span>
                        <span className="flex-1 truncate group-hover:underline" style={{ color: 'var(--text)' }}>
                          {isEp ? ep!.seriesTitle : mv!.title}
                        </span>
                        {isEp && <span className="shrink-0 tabular-nums text-[10px]" style={{ color: 'var(--dim)' }}>S{String(ep!.seasonNumber).padStart(2,'0')}E{String(ep!.episodeNumber).padStart(2,'0')}</span>}
                        {!isEp && <span className="shrink-0 text-[10px]" style={{ color: 'var(--dim)' }}>{mv!.year}</span>}
                        <span className="shrink-0 tabular-nums text-[10px]" style={{ color: 'var(--s-play)' }}>{ago}</span>
                        <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--dimmer)' }}>›</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* upcoming — second inset display window within the same module */}
          {monitored.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--dimmer)' }}>upcoming</p>
              <div className="inset-panel">
                {monitored.slice(0, UPCOMING_CAP).map((m, i) => {
                  const isLast = i === Math.min(monitored.length, UPCOMING_CAP) - 1
                  if (service === 'sonarr') {
                    const s = m as MonSerie
                    const calEp = calendar.find(c => c.seriesId === m.id)
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 font-mono text-xs px-4 py-2.5 cursor-pointer group"
                        style={{ borderBottom: isLast ? undefined : '1px solid var(--border)' }}
                        onClick={() => setSelected({ via: 'sonarr', seriesId: m.id, episodeId: calEp?.id, title: m.title })}
                      >
                        <span className="tabular-nums select-none w-4 text-right shrink-0" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                        <span className="flex-1 truncate group-hover:underline" style={{ color: 'var(--text)' }}>{m.title}</span>
                        <span className="shrink-0 tabular-nums text-[10px]" style={{ color: s.nextAiring ? 'var(--s-today)' : 'var(--dim)' }}>
                          {s.nextAiring ? fmtRelDate(s.nextAiring) : '—'}
                        </span>
                        <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--dimmer)' }}>›</span>
                      </div>
                    )
                  } else {
                    const mv = m as MonMovie
                    const releaseDate = upcomingMovieDate(mv)
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 font-mono text-xs px-4 py-2.5 cursor-pointer group"
                        style={{ borderBottom: isLast ? undefined : '1px solid var(--border)' }}
                        onClick={() => setSelected({ via: 'radarr', movieId: m.id, title: m.title })}
                      >
                        <span className="tabular-nums select-none w-4 text-right shrink-0" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                        <span className="flex-1 truncate group-hover:underline" style={{ color: 'var(--text)' }}>{m.title}</span>
                        <span className="shrink-0 text-[10px]" style={{ color: 'var(--dim)' }}>{releaseLabel(mv)}</span>
                        <span className="shrink-0 tabular-nums text-[10px]" style={{ color: releaseDate ? 'var(--s-today)' : 'var(--dim)' }}>
                          {releaseDate ? fmtRelDate(releaseDate) : mv.status}
                        </span>
                        <span className="shrink-0 font-mono text-xs" style={{ color: 'var(--dimmer)' }}>›</span>
                      </div>
                    )
                  }
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <UnifiedDrawer entry={selected} onClose={() => setSelected(null)} onRefresh={load} />
    </>
  )
}
