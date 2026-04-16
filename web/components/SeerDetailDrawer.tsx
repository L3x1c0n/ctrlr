'use client'

import { useState, useEffect } from 'react'
import { SeerRequest } from '@/types'
import Spinner from '@/components/Spinner'

function fmtBytes(b: number): string {
  if (b >= 1024 ** 4) return `${(b / 1024 ** 4).toFixed(1)} TB`
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  return `${(b / 1024 ** 2).toFixed(0)} MB`
}

const statusLabel: Record<number, string> = {
  1: 'Pending',
  2: 'Approved',
  3: 'Declined',
  4: 'Available',
  5: 'Processing',
}

const statusColor: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-blue-400',
  3: 'text-red-400',
  4: 'text-green-400',
  5: 'text-purple-400',
}

interface SeerMediaDetail {
  title?: string
  name?: string
  overview?: string
  posterPath?: string
  backdropPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage?: number
  genres?: { id: number; name: string }[]
  runtime?: number
  numberOfSeasons?: number
}

interface SeerProfile {
  id: number
  name: string
}

interface Props {
  request: SeerRequest | null
  onClose: () => void
  onRefresh: () => void
}

interface Release {
  guid: string
  indexerId: number
  indexer: string
  title: string
  size: number
  quality: { quality: { name: string } }
  seeders?: number
  rejected: boolean
  rejections: string[]
}

export default function SeerDetailDrawer({ request, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<SeerMediaDetail | null>(null)
  const [profiles, setProfiles] = useState<SeerProfile[]>([])
  const [rootFolders, setRootFolders] = useState<{ path: string; freeSpace: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<number>(0)
  const [rootFolder, setRootFolder] = useState<string>('')
  const [serviceId, setServiceId] = useState<number | null>(null)
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [relLoading, setRelLoading] = useState(false)

  useEffect(() => {
    if (!request) { setDetail(null); setProfiles([]); setRootFolders([]); setServiceId(null); setReleases(null); return }
    setProfileId(request.profileId ?? 0)
    setRootFolder(request.rootFolder ?? '')
    setReleases(null)
    setLoading(true)
    fetch(`/api/seer?mediaId=${request.media.tmdbId}&mediaType=${request.media.mediaType}`)
      .then(r => r.json())
      .then(d => {
        setDetail(d.detail ?? null)
        setProfiles(d.profiles ?? [])
        setRootFolders(d.rootFolders ?? [])
        setServiceId(d.serviceId ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [request])

  async function act(action: string, extra: object = {}) {
    if (!request) return
    setActing(action)
    try {
      await fetch('/api/seer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: request.id, ...extra }),
      })
      onRefresh()
      if (action === 'delete') onClose()
    } finally {
      setActing(null)
    }
  }

  async function saveConfig() {
    if (!request) return
    setActing('update')
    try {
      await fetch('/api/seer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: request.id, profileId, rootFolder }),
      })
      onRefresh()
    } finally {
      setActing(null)
    }
  }

  const configChanged = request && (profileId !== (request.profileId ?? 0) || rootFolder !== (request.rootFolder ?? ''))

  const isOpen = !!request
  const poster = detail?.posterPath
    ? `https://image.tmdb.org/t/p/w342${detail.posterPath}`
    : request?.media.posterPath
    ? `https://image.tmdb.org/t/p/w342${request.media.posterPath}`
    : null

  const title = detail?.title ?? detail?.name ?? request?.media.title ?? request?.media.name ?? ''
  const releaseYear = (detail?.releaseDate ?? detail?.firstAirDate ?? '')?.slice(0, 4)

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        {detail?.backdropPath && (
          <div className="absolute top-0 inset-x-0 h-72 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 scale-110 bg-cover bg-center" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${detail.backdropPath})`, filter: 'blur(20px)', opacity: 0.18, maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }} />
          </div>
        )}
        <div className="relative z-10 overflow-y-auto h-full p-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* seer -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {loading && <Spinner />}

          {!loading && request && (
            <>
              {/* header: poster + metadata */}
              <div className="flex gap-4 mb-6 items-start">
                {poster && (
                  <img
                    src={poster}
                    alt={title}
                    className="w-36 aspect-[2/3] flex-shrink-0 object-cover border border-[#2a2a4a]"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1 text-xs">
                  <p className="text-white text-sm font-medium leading-snug">
                    {title}
                    {releaseYear && <span className="text-[#999] ml-2 font-normal">({releaseYear})</span>}
                  </p>
                  <p className="text-[#aaa] uppercase">{request.type}</p>
                  {detail?.genres && detail.genres.length > 0 && (
                    <p className="text-[#888]">{detail.genres.slice(0, 3).map(g => g.name).join(', ')}</p>
                  )}
                  {detail?.voteAverage && detail.voteAverage > 0 && (
                    <p className="text-[#999]">★ {detail.voteAverage.toFixed(1)}</p>
                  )}
                  {detail?.runtime && <p className="text-[#bbb]">{detail.runtime}m</p>}
                  {detail?.numberOfSeasons && (
                    <p className="text-[#bbb]">{detail.numberOfSeasons} season{detail.numberOfSeasons !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>

              {/* request status */}
              <div className="mb-6">
                <p className="text-[#7070a8] text-xs mb-2">{`/* request */`}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-20">status:</span>
                    <span className={statusColor[request.status] ?? 'text-[#888]'}>
                      {statusLabel[request.status] ?? request.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-20">by:</span>
                    <span className="text-[#ccc]">{request.requestedBy.displayName}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#bbb] w-20">added:</span>
                    <span className="text-[#ccc]">{new Date(request.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* config */}
              <div className="mb-6">
                <p className="text-[#7070a8] text-xs mb-2">{`/* config */`}</p>
                <div className="space-y-2">
                  {profiles.length > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#bbb] w-20">quality:</span>
                      <select
                        value={profileId}
                        onChange={e => setProfileId(Number(e.target.value))}
                        disabled={acting === 'update'}
                        className="bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-1 focus:outline-none focus:border-[#888] disabled:opacity-50"
                      >
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-start gap-3 text-xs">
                    <span className="text-[#bbb] w-20 pt-1">path:</span>
                    {rootFolders.length > 0 ? (
                      <div className="flex-1 space-y-1.5">
                        <select
                          value={rootFolder}
                          onChange={e => setRootFolder(e.target.value)}
                          disabled={acting === 'update'}
                          className="w-full bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-1 focus:outline-none focus:border-[#888] disabled:opacity-50"
                        >
                          {rootFolders.map(f => (
                            <option key={f.path} value={f.path}>
                              {f.path}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          const sel = rootFolders.find(f => f.path === rootFolder)
                          if (!sel) return null
                          const color = sel.freeSpace < 10 * 1024 ** 3 ? 'text-red-400' : sel.freeSpace < 50 * 1024 ** 3 ? 'text-yellow-400' : 'text-green-400'
                          return <p className={`text-xs ${color}`}>{fmtBytes(sel.freeSpace)} free</p>
                        })()}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={rootFolder}
                        onChange={e => setRootFolder(e.target.value)}
                        disabled={acting === 'update'}
                        className="bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-1 flex-1 focus:outline-none focus:border-[#888] disabled:opacity-50"
                      />
                    )}
                  </div>
                  {configChanged && (
                    <div className="pt-1">
                      <button
                        onClick={saveConfig}
                        disabled={!!acting}
                        className="btn-xs text-blue-400"
                      >
                        {acting === 'update' ? '...' : '--save'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* overview */}
              {detail?.overview && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* overview */`}</p>
                  <p className="text-[#bbb] text-xs leading-relaxed">{detail.overview}</p>
                </div>
              )}

              {/* search */}
              {serviceId && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* search */`}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={!!acting}
                      onClick={async () => {
                        const svc = request.media.mediaType === 'movie' ? 'radarr' : 'sonarr'
                        const action = request.media.mediaType === 'movie' ? 'searchMovie' : 'searchEpisode'
                        const idKey  = request.media.mediaType === 'movie' ? 'movieId' : 'episodeId'
                        setActing('auto')
                        // For sonarr, get next episode id first
                        let targetId: number = serviceId
                        if (request.media.mediaType !== 'movie') {
                          const ep = await fetch(`/api/sonarr?nextEpisode=${serviceId}`).then(r => r.json())
                          targetId = ep.episodeId ?? serviceId
                        }
                        await fetch(`/api/${svc}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, [idKey]: targetId }) })
                        setActing(null)
                      }}
                      className="btn-xs text-violet-400"
                    >
                      {acting === 'auto' ? '...' : 'grep'}
                    </button>
                    <button
                      disabled={relLoading}
                      onClick={async () => {
                        setRelLoading(true)
                        setReleases(null)
                        const svc = request.media.mediaType === 'movie' ? 'radarr' : 'sonarr'
                        let searchId: number = serviceId
                        if (request.media.mediaType !== 'movie') {
                          const ep = await fetch(`/api/sonarr?nextEpisode=${serviceId}`).then(r => r.json())
                          searchId = ep.episodeId ?? serviceId
                        }
                        const res = await fetch(`/api/${svc}?releasesFor=${searchId}`)
                        setReleases(await res.json())
                        setRelLoading(false)
                      }}
                      className="btn-xs text-violet-400"
                    >
                      {relLoading ? '...' : 'grep -i'}
                    </button>
                  </div>
                </div>
              )}

              {relLoading && <Spinner />}
              {releases !== null && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* releases (${releases.length}) */`}</p>
                  {releases.length === 0 && <p className="text-[#888] text-xs">no results</p>}
                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    {releases.map((r, i) => {
                      const svc = request.media.mediaType === 'movie' ? 'radarr' : 'sonarr'
                      return (
                        <div key={i} className={`border border-[#1a1a2e] p-2 text-xs font-mono ${r.rejected ? 'opacity-40' : ''}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-white leading-snug flex-1 break-all">{r.title}</span>
                            <button
                              onClick={async () => {
                                setActing(`grab-${i}`)
                                await fetch(`/api/${svc}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'grab', guid: r.guid, indexerId: r.indexerId }) })
                                setReleases(null)
                                setActing(null)
                              }}
                              disabled={!!acting || r.rejected}
                              className="btn-xs text-green-400 shrink-0"
                            >
                              {acting === `grab-${i}` ? '...' : '--grab'}
                            </button>
                          </div>
                          <div className="flex gap-3 text-[#888] text-xs">
                            <span>{r.quality.quality.name}</span>
                            <span>{fmtBytes(r.size)}</span>
                            {r.seeders !== undefined && <span className="text-green-600">{r.seeders}S</span>}
                            <span className="truncate">{r.indexer}</span>
                          </div>
                          {r.rejected && r.rejections.length > 0 && (
                            <p className="text-red-600 text-xs mt-0.5">{r.rejections[0]}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* actions */}
              <div>
                <p className="text-[#7070a8] text-xs mb-2">{`/* actions */`}</p>
                <div className="flex flex-wrap gap-2">
                  {request.status === 1 && (
                    <button
                      onClick={() => act('approve')}
                      disabled={!!acting}
                      className="btn-xs text-green-400"
                    >
                      {acting === 'approve' ? '...' : '--approve'}
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm(`Delete request for ${title}?`)) act('delete') }}
                    disabled={!!acting}
                    className="btn-xs text-red-400"
                  >
                    {acting === 'delete' ? '...' : '--rm'}
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
