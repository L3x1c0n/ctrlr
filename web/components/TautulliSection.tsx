'use client'

import { useState, useEffect, useCallback } from 'react'
import { TautulliActivity, TautulliSession } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'
import TautulliDetailDrawer from '@/components/TautulliDetailDrawer'
import SystemStatus from '@/components/SystemStatus'

function StreamRow({ s, onInfo }: { s: TautulliSession; onInfo: () => void }) {
  const pct = parseInt(s.progress_percent, 10) || 0
  const isTV = s.media_type === 'episode'
  const title = isTV
    ? `${s.grandparent_title} — S${String(s.parent_title?.match(/\d+/)?.[0] ?? '0').padStart(2, '0')} — ${s.title}`
    : s.title

  const transcodeColor =
    s.transcode_decision === 'direct play' ? 'var(--s-play)'
    : s.transcode_decision === 'copy'      ? 'var(--dim)'
    : 'var(--s-today)'

  const stateColor =
    s.state === 'playing' ? 'var(--s-play)' : s.state === 'paused' ? 'var(--s-today)' : 'var(--dim)'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={onInfo} className="btn-xs flex-shrink-0">↗</button>
          <span className="font-mono text-sm truncate" style={{ color: 'var(--text)' }}>{title}</span>
        </div>
        <div className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
          {s.friendly_name}
          <span className="mx-1">·</span>
          {s.player}
          <span className="mx-1">·</span>
          <span style={{ color: transcodeColor }}>{s.transcode_decision}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar pct={pct} width={14} />
          <span className="text-[10px] font-mono" style={{ color: stateColor }}>{s.state}</span>
        </div>
      </div>
      {s.summary && (
        <div className="min-w-0">
          <p className="text-[11px] leading-relaxed line-clamp-4" style={{ color: 'var(--text-dim)' }}>{s.summary}</p>
        </div>
      )}
    </div>
  )
}

export default function TautulliSection() {
  const [activity, setActivity] = useState<TautulliActivity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TautulliSession | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tautulli')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setActivity(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  return (
    <>
      <section id="tautulli">
        <div className="module-panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-label">Tautulli</h2>
            <div className="flex items-center gap-3">
              {activity && activity.stream_count > 0 && (
                <span className="font-mono text-[10px]" style={{ color: 'var(--s-play)' }}>{activity.stream_count} stream{activity.stream_count !== 1 ? 's' : ''}</span>
              )}
              <button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }} disabled={refreshing} className="btn-xs">{refreshing ? '...' : '↺'}</button>
            </div>
          </div>

          {error && <p className="text-danger text-sm font-mono mb-3">{error}</p>}

          <div className="inset-panel">
            {(!activity || activity.sessions.length === 0) && !error && (
              <div className="px-4 py-3">
                {loading ? <Spinner /> : <p className="font-mono text-xs" style={{ color: 'var(--dim)' }}>No active streams</p>}
              </div>
            )}
            {activity?.sessions.map((s) => (
              <StreamRow key={s.session_key} s={s} onInfo={() => setSelected(s)} />
            ))}
          </div>

          <div className="mt-4">
            <SystemStatus />
          </div>
        </div>
      </section>

      <TautulliDetailDrawer session={selected} onClose={() => setSelected(null)} />
    </>
  )
}
