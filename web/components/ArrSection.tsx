'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ArrQueueItem, ArrCalendarItem } from '@/types'
import Spinner from '@/components/Spinner'
import ArrDetailDrawer from '@/components/ArrDetailDrawer'

function fmtRelDate(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days <= 0)  return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7)   return `${days}d`
  if (days < 31)  return `${Math.ceil(days / 7)}w`
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Health   { source: string; type: string; message: string }
interface MonMovie { id: number; title: string; year: number; hasFile: boolean; status: string; inCinemas?: string; physicalRelease?: string; digitalRelease?: string }
interface MonSerie { id: number; title: string; nextAiring?: string }
type Monitored = MonMovie | MonSerie

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
  pending:     'text-[#888]',
  delay:       'text-amber-400',
  queued:      'text-[#999]',
  downloading: 'text-green-400',
  paused:      'text-yellow-400',
  warning:     'text-yellow-400',
  completed:   'text-blue-400',
  failed:      'text-red-400',
  imported:    'text-[#6a9a7a]',
  missing:     'text-orange-400',
}

const healthColor: Record<string, string> = {
  error:   'text-red-400',
  warning: 'text-yellow-400',
  notice:  'text-[#888]',
  ok:      'text-green-400',
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
  const [queue,     setQueue]     = useState<ArrQueueItem[]>([])
  const [health,    setHealth]    = useState<Health[]>([])
  const [monitored, setMonitored] = useState<Monitored[]>([])
  const [calendar,  setCalendar]  = useState<ArrCalendarItem[]>([])
  const [retained,  setRetained]  = useState<RetainedRow[]>(() => [])
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<ArrQueueItem | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

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

  const failedCount = rows.filter(r => r.state === 'failed').length

  return (
    <>
      <section id={service}>
        {/* header */}
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between">
          <span>const <span className="text-white text-sm font-medium uppercase tracking-widest">{label}</span>: ArrQueueItem[] = [</span>
          {monitored.length > 0 && <span className="text-[#888]">// {monitored.length} monitored</span>}
        </div>

        {error   && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}
        {loading && <Spinner />}

        {/* health */}
        {health.filter(h => !dismissed.has(h.message)).length > 0 && (
          <div className="mb-4">
            <p className="text-[#7070a8] text-xs mb-1">{`/* health */`}</p>
            <div className="space-y-0.5">
              {health.filter(h => !dismissed.has(h.message)).map((h, i) => (
                <div key={i} className={`flex items-start gap-2 font-mono text-xs ${healthColor[h.type.toLowerCase()] ?? 'text-[#888]'}`}>
                  <span className="text-[#888] select-none shrink-0">⚠ </span>
                  <span className="flex-1">{h.message}</span>
                  <button onClick={() => dismissHealth(h.message)} className="text-[#999] hover:text-[#888] shrink-0 leading-none">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* queue */}
        {rows.length === 0 && !error && !loading && (
          <p className="text-[#999] text-sm font-mono mb-4">queue empty</p>
        )}
        {rows.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm font-mono table-fixed md:table-auto">
              <thead>
                <tr className="text-[#999] text-xs uppercase border-b border-[#1a1a2e]">
                  <th className="py-1 pr-3 w-6"></th>
                  <th className="text-left py-1 pr-4">Title</th>
                  <th className="text-right pr-4 w-24 md:w-auto">Status</th>
                  <th className="text-right w-20 md:w-auto">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const q = row.queueItem
                  return (
                    <tr key={row.key} className="border-b border-[#0f0f1a]">
                      <td className="py-1 pr-3 text-right text-[#7070a8] tabular-nums select-none text-xs w-6">{i + 1}</td>
                      <td className="py-1 pr-4 max-w-xs text-white">
                        <div className="flex items-center gap-2">
                          {q ? (
                            <button onClick={() => setSelected(q)} className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0">--info</button>
                          ) : row.calendarId ? (
                            <button
                              onClick={() => setSelected(
                                service === 'sonarr'
                                  ? { seriesId: row.seriesId, title: row.title } as ArrQueueItem
                                  : { movieId:  row.calendarId, title: row.title } as ArrQueueItem
                              )}
                              className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0"
                            >--info</button>
                          ) : null}
                          <span className="truncate">{row.title}</span>
                        </div>
                      </td>
                      <td className={`text-right pr-4 transition-colors duration-500 ${stateColor[row.state]}`}>
                        {row.state}
                      </td>
                      <td className="text-right">
                        <div className="flex gap-2 justify-end">
                          {(row.state === 'pending' || row.state === 'missing') && row.calendarId && (
                            <button onClick={() => searchCalendar(row.calendarId!)} className="btn-xs text-violet-400">grep</button>
                          )}
                          {row.state === 'failed' && q && (
                            <>
                              <button onClick={() => queueAction('search', q.id)} className="btn-xs text-blue-400">--retry</button>
                              <button onClick={() => { if (confirm(`Remove ${row.title}?`)) queueAction('delete', q.id, { blacklist: true }) }} className="btn-xs text-red-400">--rm</button>
                            </>
                          )}
                          {row.state === 'completed' && q && (
                            <button onClick={() => { if (confirm(`Remove ${row.title}?`)) queueAction('delete', q.id) }} className="btn-xs text-red-400">--rm</button>
                          )}
                          {(['delay', 'queued', 'downloading', 'paused', 'warning'] as RowState[]).includes(row.state) && q && (
                            <>
                              <button onClick={() => queueAction('search', q.id)} className="btn-xs text-violet-400">grep</button>
                              <button onClick={() => { if (confirm(`Remove ${row.title}?`)) queueAction('delete', q.id) }} className="btn-xs text-red-400">--rm</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* upcoming releases */}
        {monitored.length > 0 && (
          <div className="mb-2">
            <p className="text-[#7070a8] text-xs mb-1">{`/* upcoming */`}</p>
            <div className="space-y-px">
              {monitored.slice(0, 10).map((m, i) => {
                if (service === 'sonarr') {
                  const s = m as MonSerie
                  return (
                    <div key={m.id} className="flex items-center gap-2 font-mono text-sm py-0.5 border-b border-[#0a0a14]">
                      <span className="text-[#7070a8] tabular-nums select-none w-4 text-right shrink-0 text-xs">{i + 1}</span>
                      <button onClick={() => setSelected({ seriesId: m.id, title: m.title } as ArrQueueItem)} className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0">--info</button>
                      <span className="flex-1 text-white truncate">{m.title}</span>
                      <span className="text-green-400 shrink-0 tabular-nums text-xs">{s.nextAiring ? fmtRelDate(s.nextAiring) : '—'}</span>
                    </div>
                  )
                } else {
                  const mv = m as MonMovie
                  const releaseDate = upcomingMovieDate(mv)
                  return (
                    <div key={m.id} className="flex items-center gap-2 font-mono text-sm py-0.5 border-b border-[#0a0a14]">
                      <span className="text-[#7070a8] tabular-nums select-none w-4 text-right shrink-0 text-xs">{i + 1}</span>
                      <button onClick={() => setSelected({ movieId: m.id, title: m.title } as ArrQueueItem)} className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0">--info</button>
                      <span className="flex-1 text-white truncate">{m.title}</span>
                      <span className="text-[#888] shrink-0 text-xs">{releaseLabel(mv)}</span>
                      <span className={`shrink-0 tabular-nums text-xs ${releaseDate ? 'text-green-400' : 'text-[#888]'}`}>
                        {releaseDate ? fmtRelDate(releaseDate) : mv.status}
                      </span>
                    </div>
                  )
                }
              })}
            </div>
          </div>
        )}

        <div className="font-mono text-xs text-[#6a9a7a] mt-1">
          {(() => {
            const parts: string[] = []
            const activeCount   = rows.filter(r => !['pending','imported','missing','failed'].includes(r.state)).length
            const pendingCount  = rows.filter(r => r.state === 'pending').length
            const importedCount = rows.filter(r => r.state === 'imported').length
            const missingCount  = rows.filter(r => r.state === 'missing').length
            if (activeCount)   parts.push(`${activeCount} active`)
            if (failedCount)   parts.push(`${failedCount} failed`)
            if (pendingCount)  parts.push(`${pendingCount} pending`)
            if (importedCount) parts.push(`${importedCount} imported`)
            if (missingCount)  parts.push(`${missingCount} missing`)
            if (monitored.length > 10) parts.push(`upcoming.slice(0,10) // ${monitored.length} total`)
            else if (monitored.length) parts.push(`${monitored.length} upcoming`)
            return `] // ${parts.join(', ') || 'empty'}`
          })()}
        </div>
      </section>

      <ArrDetailDrawer service={service} item={selected} onClose={() => setSelected(null)} onRefresh={load} />
    </>
  )
}
