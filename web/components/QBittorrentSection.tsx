'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { QBTorrent, QBTransferInfo } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'
import QBDetailDrawer from '@/components/QBDetailDrawer'

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
  return <span className="truncate">{text}</span>
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
  downloading: 'text-green-400',
  seeding: 'text-blue-400',
  pausedDL: 'text-yellow-400',
  pausedUP: 'text-yellow-400',
  stalledDL: 'text-orange-400',
  stalledUP: 'text-orange-400',
  error: 'text-red-400',
  missingFiles: 'text-red-400',
  checkingDL: 'text-purple-400',
  checkingUP: 'text-purple-400',
}

interface Props {
  onTransferUpdate: (t: QBTransferInfo) => void
}

export default function QBittorrentSection({ onTransferUpdate }: Props) {
  const [torrents, setTorrents] = useState<QBTorrent[]>([])
  const [transfer, setTransfer] = useState<QBTransferInfo | null>(null)
  const [posters, setPosters] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected,      setSelected]      = useState<QBTorrent | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

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
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between">
          <span>const <span className="text-white text-sm font-medium uppercase tracking-widest">qB1tt0rr3nt</span>: QBTorrent[] = [</span>
          {transfer && (
            <span className="text-xs">
              <span className="text-green-400">↓ {fmtSpeed(transfer.dl_info_speed)}</span>
              <span className="mx-2 text-[#888]">·</span>
              <span className="text-blue-400">↑ {fmtSpeed(transfer.up_info_speed)}</span>
            </span>
          )}
        </div>
        {error && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}
        {torrents.length === 0 && !error && (
          loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono">No torrents</p>
        )}
        {torrents.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-fixed md:table-auto">
            <thead>
              <tr className="text-[#999] text-xs uppercase border-b border-[#1a1a2e]">
                <th className="py-1 pr-3 w-6"></th>
                <th className="text-left py-1 pr-4">Name</th>
                <th className="text-right pr-4 hidden md:table-cell">Size</th>
                <th className="text-left pr-4 hidden md:table-cell">Progress</th>
                <th className="text-right pr-4 hidden md:table-cell">Speed ↓</th>
                <th className="text-right pr-4 hidden md:table-cell">ETA</th>
                <th className="text-right pr-4 w-[76px]">State</th>
                <th className="text-right w-[68px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {torrents.map((t, i) => (
                <tr key={t.hash} className="border-b border-[#0f0f1a]">
                  <td className="py-1 pr-3 text-right text-[#7070a8] tabular-nums select-none text-xs w-6">{i + 1}</td>
                  <td className="py-1 pr-4 text-white min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelected(t)}
                        className="btn-xs text-cyan-600 hover:text-cyan-400 flex-shrink-0"
                      >
                        --info
                      </button>
                      <ScrambledName name={t.name} active={t.state === 'downloading'} />
                    </div>
                  </td>
                  <td className="text-right pr-4 text-[#888] hidden md:table-cell">{fmtSize(t.size)}</td>
                  <td className="pr-4 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <ProgressBar pct={t.progress * 100} width={16} label={false} size="text-base" />
                      <span className="text-[#999] text-xs tabular-nums w-9 text-right">{Math.round(t.progress * 100)}%</span>
                    </div>
                  </td>
                  <td className="text-right pr-4 text-green-400 hidden md:table-cell">{fmtSpeed(t.dlspeed)}</td>
                  <td className="text-right pr-4 text-[#888] hidden md:table-cell">{fmtEta(t.eta)}</td>
                  <td className={`text-right pr-4 ${stateColor[t.state] ?? 'text-[#888]'}`}>
                    {t.state}
                  </td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      {t.state.includes('paused') || t.state.includes('Paused') ? (
                        <button
                          onClick={() => action('resume', t.hash)}
                          className="btn-xs text-green-400"
                        >
                          --resume
                        </button>
                      ) : (
                        <button
                          onClick={() => action('pause', t.hash)}
                          className="btn-xs text-yellow-400"
                        >
                          --pause
                        </button>
                      )}
                      {pendingDelete === t.hash ? (
                        <>
                          <button
                            onClick={() => { setPendingDelete(null); action('delete', t.hash, { deleteFiles: false }) }}
                            className="btn-xs text-red-400"
                          >
                            --torrent
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete ${t.name} AND files?`)) { setPendingDelete(null); action('delete', t.hash, { deleteFiles: true }) } }}
                            className="btn-xs text-red-600"
                          >
                            --files
                          </button>
                          <button onClick={() => setPendingDelete(null)} className="btn-xs text-[#888]">×</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setPendingDelete(t.hash)}
                          className="btn-xs text-red-400"
                        >
                          --rm
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <div className="font-mono text-xs text-[#6a9a7a] mt-1">] // {torrents.length} active</div>
      </section>

      <QBDetailDrawer
        torrent={selected}
        posterUrl={selected ? (posters[selected.hash] ?? null) : null}
        onClose={() => setSelected(null)}
        onRefresh={fetch_}
      />
    </>
  )
}
