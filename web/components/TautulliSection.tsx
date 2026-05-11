'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TautulliActivity, TautulliSession } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'
import TautulliDetailDrawer from '@/components/TautulliDetailDrawer'
import SystemStatus from '@/components/SystemStatus'

function useWaveIndex(length: number, stepMs = 110) {
  const [index, setIndex] = useState(0)
  const dirRef = useRef(1)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(prev => {
        const next = prev + dirRef.current
        if (next >= length - 1) dirRef.current = -1
        if (next <= 0) dirRef.current = 1
        return next
      })
    }, stepMs)
    return () => clearInterval(timer)
  }, [length, stepMs])

  return index
}

function WaveTitle({ text }: { text: string }) {
  const waveIndex = useWaveIndex(text.length, 80)

  return (
    <>
      {text.split('').map((char, i) => {
        const dist = Math.abs(i - waveIndex)
        const style: React.CSSProperties =
          dist === 0 ? { color: '#ffffff', textShadow: '0 0 6px #4ade80, 0 0 14px #4ade80, 0 0 30px rgba(74,222,128,0.8)', display: 'inline-block', transform: 'scaleY(1.25) scaleX(1.1)' }
          : dist === 1 ? { color: '#4ade80', textShadow: '0 0 10px #4ade80, 0 0 20px rgba(74,222,128,0.5)', display: 'inline-block', transform: 'scaleY(1.1)' }
          : dist === 2 ? { color: '#86efac', textShadow: '0 0 6px rgba(74,222,128,0.3)', display: 'inline-block' }
          : dist === 3 ? { color: '#bbf7d0', textShadow: '0 0 4px rgba(74,222,128,0.15)', display: 'inline-block' }
          : dist === 4 ? { color: '#d1fae5', textShadow: '0 0 2px rgba(74,222,128,0.08)', display: 'inline-block' }
          : { display: 'inline-block' }
        return <span key={i} style={style}>{char}</span>
      })}
    </>
  )
}

function StreamRow({ s, onInfo }: { s: TautulliSession; onInfo: () => void }) {
  const pct = parseInt(s.progress_percent, 10) || 0
  const isTV = s.media_type === 'episode'
  const title = isTV
    ? `${s.grandparent_title} — S${String(s.parent_title?.match(/\d+/)?.[0] ?? '0').padStart(2, '0')} — ${s.title}`
    : s.title

  const transcodeColor =
    s.transcode_decision === 'direct play'
      ? 'text-green-400'
      : s.transcode_decision === 'copy'
      ? 'text-blue-400'
      : 'text-yellow-400'

  const stateColor =
    s.state === 'playing' ? 'text-green-400' : s.state === 'paused' ? 'text-yellow-400' : 'text-[#888]'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2 border-b border-[#0f0f1a]">
      {/* left: playback info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <button
            onClick={onInfo}
            className="btn-xs text-cyan-600 hover:text-cyan-400 flex-shrink-0"
          >
            --info
          </button>
          <span className="font-mono text-sm text-white truncate">
            <WaveTitle text={title} />
          </span>
        </div>
        <div className="font-mono text-xs text-[#999]">
          {s.friendly_name}
          <span className="mx-1">·</span>
          {s.player}
          <span className="mx-1">·</span>
          <span className={transcodeColor}>{s.transcode_decision}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar pct={pct} width={14} />
          <span className={`text-xs font-mono ${stateColor}`}>{s.state}</span>
        </div>
      </div>
      {/* right: synopsis */}
      {s.summary && (
        <div className="min-w-0">
          <p className="text-xs text-[#999] leading-relaxed line-clamp-4">{s.summary}</p>
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
      <div className="border border-[#1a1a2e] p-4">
        <section id="tautulli">
          <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between">
            <span>function* <span className="text-white text-sm font-medium uppercase tracking-widest">T4utull1</span>(): AsyncIterable&lt;TautulliSession&gt; {'{'}</span>
            <span className="flex items-center gap-3">
              {activity && activity.stream_count > 0 && (
                <span className="text-green-400">{activity.stream_count} stream{activity.stream_count !== 1 ? 's' : ''}</span>
              )}
              <button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }} disabled={refreshing} className="btn-xs text-[#7070a8] hover:text-[#aaa]">{refreshing ? '...' : <><span className="hidden sm:inline">--refresh</span><span className="sm:hidden">↺</span></>}</button>
            </span>
          </div>
          {error && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}
          {(!activity || activity.sessions.length === 0) && !error && (
            loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono">No active streams</p>
          )}
          {activity?.sessions.map((s) => (
            <StreamRow key={s.session_key} s={s} onInfo={() => setSelected(s)} />
          ))}
          <div className="font-mono text-xs text-[#6a9a7a] mt-2">{'}'} // {activity?.stream_count ?? 0} active</div>
        </section>

        <SystemStatus />
      </div>

      <TautulliDetailDrawer session={selected} onClose={() => setSelected(null)} />
    </>
  )
}
