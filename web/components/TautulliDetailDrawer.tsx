'use client'

import { TautulliSession } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Image from 'next/image'

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtOffset(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  session: TautulliSession | null
  onClose: () => void
}

export default function TautulliDetailDrawer({ session, onClose }: Props) {
  const isOpen = !!session
  const pct = session ? parseInt(session.progress_percent, 10) || 0 : 0
  const isTV = session?.media_type === 'episode'

  const transcodeColor =
    session?.transcode_decision === 'direct play'
      ? 'text-green-400'
      : session?.transcode_decision === 'copy'
      ? 'text-blue-400'
      : 'text-yellow-400'

  const stateColor =
    session?.state === 'playing' ? 'text-green-400'
      : session?.state === 'paused' ? 'text-yellow-400'
      : 'text-[#888]'

  const thumb = session?.grandparent_thumb || session?.thumb

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] overflow-y-auto transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* tautulli -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {session && (
            <>
              {/* header: poster + title */}
              <div className="flex gap-4 mb-6 items-start">
                {thumb && (
                  <div className="relative w-36 flex-shrink-0 bg-[#0f0f1a] border border-[#2a2a4a]" style={{ aspectRatio: '2/3' }}>
                    <Image
                      src={`/api/tautulli?thumb=${encodeURIComponent(thumb)}`}
                      alt={session.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1 text-xs">
                  {isTV ? (
                    <>
                      <p className="text-white text-sm font-medium leading-snug">{session.grandparent_title}</p>
                      <p className="text-[#999]">
                        {session.parent_title} — {session.title}
                      </p>
                    </>
                  ) : (
                    <p className="text-white text-sm font-medium leading-snug">{session.title}</p>
                  )}
                  <p className={`${stateColor}`}>{session.state}</p>
                </div>
              </div>

              {/* stream info */}
              <div className="mb-6">
                <p className="text-[#7070a8] text-xs mb-2">{`/* stream */`}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[#bbb] w-24">progress:</span>
                    <ProgressBar pct={pct} width={20} />
                  </div>
                  {session.duration > 0 && (
                    <div className="flex gap-2">
                      <span className="text-[#bbb] w-24">position:</span>
                      <span className="text-[#ccc]">{fmtOffset(session.view_offset)}</span>
                      <span className="text-[#aaa]">/</span>
                      <span className="text-[#ccc]">{fmtDuration(session.duration)}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">transcode:</span>
                    <span className={transcodeColor}>{session.transcode_decision}</span>
                  </div>
                  {session.stream_bitrate && (
                    <div className="flex gap-2">
                      <span className="text-[#bbb] w-24">bitrate:</span>
                      <span className="text-[#ccc]">{session.stream_bitrate} kbps</span>
                    </div>
                  )}
                </div>
              </div>

              {/* client info */}
              <div>
                <p className="text-[#7070a8] text-xs mb-2">{`/* client */`}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">user:</span>
                    <span className="text-[#ccc]">{session.friendly_name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">player:</span>
                    <span className="text-[#ccc]">{session.player}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">platform:</span>
                    <span className="text-[#ccc]">{session.platform}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
