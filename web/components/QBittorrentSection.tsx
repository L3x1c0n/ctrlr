'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { QBTorrent, QBTransferInfo } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'
import UnifiedDrawer, { DrawerEntry } from '@/components/UnifiedDrawer'

const SCRAMBLE_CHARS = '01ﾊﾐﾋｱｳｦ█▓▒░╪┼╬╫╩╦╠═'

function usePeekScramble(name: string, active: boolean) {
  const [text, setText] = useState(name)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) {
      setText(name)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (frameRef.current) clearTimeout(frameRef.current)
      return
    }

    let cancelled = false

    function scramble(duration: number, onDone: () => void) {
      const end = Date.now() + duration
      function tick() {
        if (cancelled) return
        if (Date.now() >= end) { onDone(); return }
        setText(name.split('').map(() =>
          SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        ).join(''))
        frameRef.current = setTimeout(tick, 80)
      }
      tick()
    }

    function decode(onDone: () => void) {
      let iteration = 0
      function step() {
        if (cancelled) return
        setText(
          name.split('').map((_, i) => {
            if (i < Math.floor(iteration)) return name[i]
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
          }).join('')
        )
        iteration += 0.35
        if (iteration < name.length + 1) {
          frameRef.current = setTimeout(step, 40)
        } else {
          setText(name)
          onDone()
        }
      }
      step()
    }

    function cycle() {
      if (cancelled) return
      scramble(4000, () => {
        if (cancelled) return
        decode(() => {
          if (cancelled) return
          timerRef.current = setTimeout(() => { if (!cancelled) cycle() }, 2000)
        })
      })
    }

    cycle()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      if (frameRef.current) clearTimeout(frameRef.current)
      setText(name)
    }
  }, [name, active])

  return text
}

function ScrambledName({ name, active }: { name: string; active: boolean }) {
  const text = usePeekScramble(name, active)
  return <span>{text}</span>
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtSpeed(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB/s`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
}

function fmtEta(seconds: number): string {
  if (seconds < 0 || seconds > 8640000) return '∞'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const stateColor: Record<string, string> = {
  downloading:  'var(--s-dl)',
  seeding:      'var(--s-play)',
  pausedDL:     'var(--s-today)',
  pausedUP:     'var(--s-today)',
  stalledDL:    'var(--s-today)',
  stalledUP:    'var(--s-today)',
  error:        'var(--s-danger)',
  missingFiles: 'var(--s-danger)',
  checkingDL:   'var(--dim)',
  checkingUP:   'var(--dim)',
}

const stateLabel: Record<string, string> = {
  downloading:  'downloading',
  seeding:      'seeding',
  pausedDL:     'paused',
  pausedUP:     'paused',
  stalledDL:    'stalled',
  stalledUP:    'stalled',
  error:        'error',
  missingFiles: 'missing',
  checkingDL:   'checking',
  checkingUP:   'checking',
  queuedDL:     'queued',
  queuedUP:     'queued',
  allocating:   'allocating',
  metaDL:       'metadata',
}

interface Props {
  onTransferUpdate: (t: QBTransferInfo) => void
}

export default function QBittorrentSection({ onTransferUpdate }: Props) {
  const [torrents, setTorrents] = useState<QBTorrent[]>([])
  const [transfer, setTransfer] = useState<QBTransferInfo | null>(null)
  const [posters,    setPosters]    = useState<Record<string, string>>({})
  const [tmdbIds,    setTmdbIds]    = useState<Record<string, number>>({})
  const [mediaTypes, setMediaTypes] = useState<Record<string, 'movie' | 'tv'>>({})
  const [error,      setError]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<DrawerEntry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [refreshing,    setRefreshing]    = useState(false)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/qbittorrent')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      const sorted = [...(data.torrents ?? [])].sort((a: QBTorrent, b: QBTorrent) => {
        const aDown = a.state === 'downloading' ? 0 : 1
        const bDown = b.state === 'downloading' ? 0 : 1
        if (aDown !== bDown) return aDown - bDown
        return (b.added_on ?? 0) - (a.added_on ?? 0)
      })
      setTorrents(sorted)
      setTransfer(data.transfer)
      setPosters(data.posters ?? {})
      setTmdbIds(data.tmdbIds ?? {})
      setMediaTypes(data.mediaTypes ?? {})
      onTransferUpdate(data.transfer)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [onTransferUpdate])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, 3000)
    return () => clearInterval(id)
  }, [fetch_])

  async function action(act: string, hash: string, extra?: object) {
    await fetch('/api/qbittorrent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, hash, ...extra }),
    })
    await fetch_()
  }

  return (
    <>
      <section id="qbittorrent">
        <div className="module-panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-label" style={{ color: 'var(--s-play)' }}>qBittorrent</h2>
            <div className="flex items-center gap-3">
              {transfer && (
                <span className="font-mono text-[10px]" style={{ color: 'var(--dim)' }}>
                  <span style={{ color: 'var(--s-dl)' }}>↓ {fmtSpeed(transfer.dl_info_speed)}</span>
                  <span className="mx-2">·</span>
                  <span style={{ color: 'var(--s-play)' }}>↑ {fmtSpeed(transfer.up_info_speed)}</span>
                </span>
              )}
              <button onClick={async () => { setRefreshing(true); await fetch_(); setRefreshing(false) }} disabled={refreshing} className="btn-xs">
                {refreshing ? '...' : '↺'}
              </button>
            </div>
          </div>

          {error && <p className="text-danger font-mono text-xs mb-3">{error}</p>}

          <div className="inset-panel">
            {torrents.length === 0 && !error && (
              <div className="px-4 py-3">
                {loading ? <Spinner /> : <p className="font-mono text-xs" style={{ color: 'var(--dim)' }}>no torrents</p>}
              </div>
            )}
            {torrents.map((t, i) => (
              <div
                key={t.hash}
                className="flex flex-col px-4 py-2.5 font-mono text-xs cursor-pointer group"
                style={{ borderBottom: i < torrents.length - 1 ? '1px solid var(--border)' : undefined }}
                onClick={() => setSelected({ via: 'qbit', hash: t.hash, tmdbId: tmdbIds[t.hash], mediaType: mediaTypes[t.hash], title: t.name, posterUrl: posters[t.hash] })}
              >
                {/* main row */}
                <div className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-right tabular-nums select-none" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                <div className="flex-1 min-w-0 truncate group-hover:underline">
                  <ScrambledName name={t.name} active={t.state === 'downloading'} />
                </div>
                <span className="hidden md:block shrink-0 w-[64px] text-right whitespace-nowrap tabular-nums" style={{ color: 'var(--dim)' }}>{fmtSize(t.size)}</span>
                <div className="hidden md:flex items-center gap-2 shrink-0 w-[110px]">
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <ProgressBar pct={t.progress * 100} color={stateColor[t.state] ?? 'var(--s-play)'} height={6} />
                  </div>
                  <span className="tabular-nums shrink-0 w-[28px] text-right" style={{ color: 'var(--dim)' }}>{Math.round(t.progress * 100)}%</span>
                </div>
                <span className="hidden md:block shrink-0 w-[72px] text-right whitespace-nowrap tabular-nums" style={{ color: 'var(--s-dl)' }}>{fmtSpeed(t.dlspeed)}</span>
                <span className="hidden md:block shrink-0 w-[52px] text-right whitespace-nowrap tabular-nums" style={{ color: 'var(--dim)' }}>{fmtEta(t.eta)}</span>
                <span className="shrink-0 whitespace-nowrap text-[10px]" style={{ color: stateColor[t.state] ?? 'var(--dim)' }}>{stateLabel[t.state] ?? t.state}</span>
                <div className="shrink-0 flex gap-1.5" onClick={e => e.stopPropagation()}>
                  {t.state.includes('paused') || t.state.includes('Paused') ? (
                    <button onClick={() => action('resume', t.hash)} className="btn-xs" title="resume">{'▶︎'}</button>
                  ) : (
                    <button onClick={() => action('pause', t.hash)} className="btn-xs" title="pause">{'⏸︎'}</button>
                  )}
                  {pendingDelete === t.hash ? (
                    <>
                      <button onClick={() => { setPendingDelete(null); action('delete', t.hash, { deleteFiles: false }) }} className="btn-xs danger">Del</button>
                      <button onClick={() => { if (confirm(`Delete ${t.name} AND files?`)) { setPendingDelete(null); action('delete', t.hash, { deleteFiles: true }) } }} className="btn-xs danger">Del +</button>
                      <button onClick={() => setPendingDelete(null)} className="btn-xs">×</button>
                    </>
                  ) : (
                    <button onClick={() => setPendingDelete(t.hash)} className="btn-xs danger">Del</button>
                  )}
                </div>
                </div>
                {/* mobile progress bar — second line */}
                <div className="md:hidden flex items-center gap-2 mt-1.5 pl-8">
                  <div className="flex-1">
                    <ProgressBar pct={t.progress * 100} color={stateColor[t.state] ?? 'var(--s-play)'} height={6} />
                  </div>
                  <span className="shrink-0 tabular-nums text-[10px] w-[28px] text-right" style={{ color: 'var(--dim)' }}>{Math.round(t.progress * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <UnifiedDrawer entry={selected} onClose={() => setSelected(null)} onRefresh={fetch_} />
    </>
  )
}
