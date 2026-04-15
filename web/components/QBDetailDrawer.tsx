'use client'

import { useState, useEffect } from 'react'
import { QBTorrent } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'

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

interface QBProperties {
  save_path: string
  comment: string
  total_size: number
  total_downloaded: number
  total_uploaded: number
  share_ratio: number
  seeds: number
  peers: number
  nb_connections: number
  dl_speed: number
  up_speed: number
  eta: number
  addition_date: number
  completion_date: number
}

interface QBFile {
  name: string
  size: number
  progress: number
}

interface Props {
  torrent: QBTorrent | null
  posterUrl?: string | null
  onClose: () => void
  onRefresh: () => void
}

export default function QBDetailDrawer({ torrent, posterUrl, onClose, onRefresh }: Props) {
  const [properties, setProperties] = useState<QBProperties | null>(null)
  const [files, setFiles] = useState<QBFile[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    if (!torrent) { setProperties(null); setFiles([]); return }
    setLoading(true)
    fetch(`/api/qbittorrent?hash=${torrent.hash}`)
      .then(r => r.json())
      .then(data => {
        setProperties(data.properties ?? null)
        setFiles(data.files ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [torrent])

  async function act(action: string, extra: object = {}) {
    if (!torrent) return
    setActing(action)
    try {
      await fetch('/api/qbittorrent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, hash: torrent.hash, ...extra }),
      })
      onRefresh()
      if (action === 'delete') onClose()
    } finally {
      setActing(null)
    }
  }

  const isPaused = torrent?.state.toLowerCase().includes('paused')

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${torrent ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] overflow-y-auto transition-[transform,visibility] duration-200 font-mono ${torrent ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* qbittorrent -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {torrent && (
            <div className="flex gap-4 mb-6 items-start">
              {posterUrl && (
                <img src={posterUrl} alt={torrent.name} className="w-36 aspect-[2/3] flex-shrink-0 object-cover border border-[#2a2a4a]" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium leading-snug mb-1">{torrent.name}</p>
                <p className="text-[#ccc] text-xs">{torrent.category || 'no category'}</p>
              </div>
            </div>
          )}

          {loading && <Spinner />}

          {!loading && torrent && (
            <>
              {/* transfer */}
              <div className="mb-6">
                <p className="text-[#7070a8] text-xs mb-2">{`/* transfer */`}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[#bbb] w-24">progress:</span>
                    <ProgressBar pct={torrent.progress * 100} width={20} />
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">downloaded:</span>
                    <span className="text-[#ccc]">{fmtSize(torrent.downloaded)}</span>
                    <span className="text-[#bbb]">of</span>
                    <span className="text-[#ccc]">{fmtSize(torrent.size)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">uploaded:</span>
                    <span className="text-[#ccc]">{fmtSize(torrent.uploaded)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">ratio:</span>
                    <span className="text-[#ccc]">{torrent.uploaded > 0 && torrent.downloaded > 0 ? (torrent.uploaded / torrent.downloaded).toFixed(2) : '0.00'}</span>
                  </div>
                  {properties && (
                    <>
                      <div className="flex gap-2">
                        <span className="text-[#bbb] w-24">↓ speed:</span>
                        <span className="text-green-400">{fmtSpeed(properties.dl_speed)}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[#bbb] w-24">↑ speed:</span>
                        <span className="text-blue-400">{fmtSpeed(properties.up_speed)}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[#bbb] w-24">seeds:</span>
                        <span className="text-[#ccc]">{properties.seeds}</span>
                        <span className="text-[#bbb] ml-2">peers:</span>
                        <span className="text-[#ccc]">{properties.peers}</span>
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-24">state:</span>
                    <span className="text-white">{torrent.state}</span>
                  </div>
                </div>
              </div>

              {/* location */}
              {properties?.save_path && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* location */`}</p>
                  <p className="text-[#999] text-xs break-all">{properties.save_path}</p>
                  {properties.comment && (
                    <p className="text-[#ccc] text-xs mt-1">{properties.comment}</p>
                  )}
                </div>
              )}

              {/* files */}
              {files.length > 0 && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* files [${files.length}] */`}</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {files.map((f, i) => (
                      <div key={i} className="text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-[#bbb] truncate flex-1">{f.name.split('/').pop()}</span>
                          <span className="text-[#ccc] flex-shrink-0">{fmtSize(f.size)}</span>
                        </div>
                        {files.length <= 10 && (
                          <ProgressBar pct={f.progress * 100} width={24} label={false} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* actions */}
              <div>
                <p className="text-[#7070a8] text-xs mb-2">{`/* actions */`}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => act(isPaused ? 'resume' : 'pause')}
                    disabled={!!acting}
                    className={`btn-xs ${isPaused ? 'text-green-400' : 'text-yellow-400'}`}
                  >
                    {acting === 'pause' || acting === 'resume' ? '...' : isPaused ? '--resume' : '--pause'}
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete ${torrent.name}?`)) act('delete', { deleteFiles: false }) }}
                    disabled={!!acting}
                    className="btn-xs text-red-400"
                  >
                    --rm
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete ${torrent.name} and all files?`)) act('delete', { deleteFiles: true }) }}
                    disabled={!!acting}
                    className="btn-xs text-red-600"
                  >
                    --rm --files
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
