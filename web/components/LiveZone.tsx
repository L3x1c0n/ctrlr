'use client'

import { useState, useEffect, useCallback } from 'react'
import { QBTorrent, TautulliSession } from '@/types'
import ProgressBar from '@/components/ProgressBar'

function fmtSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024)         return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps} B/s`
}

export default function LiveZone() {
  const [download, setDownload] = useState<QBTorrent | null>(null)
  const [session,  setSession]  = useState<TautulliSession | null>(null)

  const load = useCallback(async () => {
    const [qbRes, ttRes] = await Promise.allSettled([
      fetch('/api/qbittorrent'),
      fetch('/api/tautulli'),
    ])

    if (qbRes.status === 'fulfilled' && qbRes.value.ok) {
      try {
        const data = await qbRes.value.json()
        const torrents: QBTorrent[] = data.torrents ?? []
        const active = torrents
          .filter(t => t.dlspeed > 0)
          .sort((a, b) => b.dlspeed - a.dlspeed)[0] ?? null
        setDownload(active)
      } catch {}
    }

    if (ttRes.status === 'fulfilled' && ttRes.value.ok) {
      try {
        const data = await ttRes.value.json()
        const sessions: TautulliSession[] = data.sessions ?? []
        const active = sessions.find(s => s.state === 'playing') ?? sessions[0] ?? null
        setSession(active)
      } catch {}
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  if (!download && !session) return null

  return (
    <div className={`grid gap-4 mb-5 ${download && session ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
      {download && (() => {
        const pct = Math.round((download.progress ?? 0) * 100)
        return (
          <div className="live-card downloading">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--s-dl)' }}>downloading</p>
            <p className="font-mono text-sm truncate mb-3" style={{ color: 'var(--text)' }}>{download.name}</p>
            <div className="flex items-center gap-3">
              <ProgressBar pct={pct} width={20} />
              <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--s-dl)' }}>{fmtSpeed(download.dlspeed)}</span>
              <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--dim)' }}>{pct}%</span>
            </div>
          </div>
        )
      })()}
      {session && (() => {
        const isTV   = session.media_type === 'episode'
        const title  = isTV
          ? `${session.grandparent_title} — S${String(session.parent_title?.match(/\d+/)?.[0] ?? '0').padStart(2, '0')} — ${session.title}`
          : session.title
        const pct    = parseInt(session.progress_percent, 10) || 0
        const stateColor = session.state === 'playing' ? 'var(--s-play)' : 'var(--s-today)'
        return (
          <div className="live-card playing">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: 'var(--s-play)' }}>now playing</p>
            <p className="font-mono text-sm truncate mb-3" style={{ color: 'var(--text)' }}>{title}</p>
            <div className="flex items-center gap-3">
              <ProgressBar pct={pct} width={20} />
              <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--dim)' }}>{pct}%</span>
              <span className="font-mono text-xs" style={{ color: stateColor }}>{session.state}</span>
              <span className="font-mono text-xs" style={{ color: 'var(--dim)' }}>{session.friendly_name}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
