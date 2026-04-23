'use client'

import { useState, useEffect } from 'react'
import { SeerRequest } from '@/types'
import Spinner from '@/components/Spinner'
import ReleaseSearchResults, { Release } from '@/components/ReleaseSearchResults'
import { SonarrEpisode } from '@/lib/sonarr'

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

interface ReleaseDate {
  type: number        // 3=theatrical 4=digital 5=physical
  release_date: string
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
  releases?: {
    results: { iso_3166_1: string; release_dates: ReleaseDate[] }[]
  }
}

function findDigitalRelease(detail: SeerMediaDetail): string | null {
  const results = detail.releases?.results ?? []
  // Prefer GB, then US, then first available country with a digital release
  const order = ['GB', 'US']
  const byCountry = (iso: string) =>
    results.find(r => r.iso_3166_1 === iso)?.release_dates.find(d => d.type === 4)?.release_date ?? null
  for (const iso of order) {
    const d = byCountry(iso)
    if (d) return d
  }
  for (const r of results) {
    const d = r.release_dates.find(d => d.type === 4)?.release_date ?? null
    if (d) return d
  }
  return null
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


export default function SeerDetailDrawer({ request, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<SeerMediaDetail | null>(null)
  const [profiles, setProfiles] = useState<SeerProfile[]>([])
  const [rootFolders, setRootFolders] = useState<{ path: string; freeSpace: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<number>(0)
  const [rootFolder, setRootFolder] = useState<string>('')
  const [serviceId, setServiceId] = useState<number | null>(null)
  const [releases,          setReleases]          = useState<Release[] | null>(null)
  const [relLoading,        setRelLoading]        = useState(false)
  const [relError,          setRelError]          = useState<string | null>(null)
  const [episodes,          setEpisodes]          = useState<SonarrEpisode[] | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number | null>(null)

  useEffect(() => {
    if (!request) {
      setDetail(null); setProfiles([]); setRootFolders([]); setServiceId(null)
      setReleases(null); setRelError(null); setEpisodes(null); setSelectedEpisodeId(null)
      setProfileId(0)
      return
    }
    setRootFolder(request.rootFolder ?? '')
    setReleases(null); setRelError(null); setEpisodes(null); setSelectedEpisodeId(null)
    setLoading(true)
    fetch(`/api/seer?mediaId=${request.media.tmdbId}&mediaType=${request.media.mediaType}`)
      .then(r => r.json())
      .then(d => {
        setDetail(d.detail ?? null)
        setProfiles(d.profiles ?? [])
        setRootFolders(d.rootFolders ?? [])
        const sid = d.serviceId ?? null
        setServiceId(sid)
        // Source of truth: arr service profile > Seer request profile
        setProfileId(d.currentQualityProfileId ?? request.profileId ?? 0)
        // For TV, fetch episode list for the picker
        if (sid && request.media.mediaType === 'tv') {
          fetch(`/api/sonarr?episodes=${sid}`)
            .then(r => r.json())
            .then((eps: SonarrEpisode[]) => {
              setEpisodes(eps)
              const now = Date.now()
              const next = eps
                .filter(e => e.monitored && !e.hasFile && e.airDateUtc && new Date(e.airDateUtc).getTime() > now)
                .sort((a, b) => new Date(a.airDateUtc!).getTime() - new Date(b.airDateUtc!).getTime())
              if (next[0]) {
                setSelectedEpisodeId(next[0].id)
              } else {
                const aired = eps
                  .filter(e => e.seasonNumber > 0 && e.airDateUtc && new Date(e.airDateUtc).getTime() <= now)
                  .sort((a, b) => new Date(b.airDateUtc!).getTime() - new Date(a.airDateUtc!).getTime())
                setSelectedEpisodeId(aired[0]?.id ?? null)
              }
            })
            .catch(() => setEpisodes([]))
        }
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
        body: JSON.stringify({
          action: 'update',
          id: request.id,
          profileId,
          rootFolder,
          serviceId,
          mediaType: request.media.mediaType,
        }),
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
                  {detail?.voteAverage != null && detail.voteAverage > 0 && (
                    <p className="text-[#999]">★ {detail.voteAverage.toFixed(1)}</p>
                  )}
                  {request.media.mediaType === 'movie' && detail?.releaseDate && (
                    <p className="text-[#bbb]">
                      {new Date(detail.releaseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="text-[#888] ml-1">(theatrical)</span>
                    </p>
                  )}
                  {request.media.mediaType === 'movie' && detail && (() => {
                    const d = findDigitalRelease(detail)
                    if (!d) return null
                    return (
                      <p className="text-[#bbb]">
                        {new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        <span className="text-[#888] ml-1">(digital)</span>
                      </p>
                    )
                  })()}
                  {request.media.mediaType === 'tv' && episodes && (() => {
                    const next = episodes
                      .filter(e => e.monitored && !e.hasFile && e.airDateUtc && new Date(e.airDateUtc).getTime() > Date.now())
                      .sort((a, b) => new Date(a.airDateUtc!).getTime() - new Date(b.airDateUtc!).getTime())[0]
                    if (!next?.airDateUtc) return null
                    return (
                      <p className="text-[#bbb]">
                        {new Date(next.airDateUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        <span className="text-[#888] ml-1">(next ep)</span>
                      </p>
                    )
                  })()}
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

              {/* episode picker for TV */}
              {request.media.mediaType === 'tv' && serviceId != null && episodes !== null && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* episode */`}</p>
                  {episodes.length === 0
                    ? <p className="text-[#888] text-xs">no episodes found</p>
                    : <select
                        value={selectedEpisodeId ?? ''}
                        onChange={e => setSelectedEpisodeId(Number(e.target.value))}
                        className="bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-1 w-full focus:outline-none focus:border-[#888]"
                      >
                        {Array.from(new Set(
                          episodes.filter(e => e.seasonNumber > 0 && e.monitored).map(e => e.seasonNumber)
                        )).sort((a, b) => a - b).map(season => (
                          <optgroup key={season} label={`Season ${season}`}>
                            {episodes
                              .filter(e => e.seasonNumber === season && e.monitored)
                              .sort((a, b) => a.episodeNumber - b.episodeNumber)
                              .map(e => (
                                <option key={e.id} value={e.id}>
                                  {`S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} — ${e.title}${e.hasFile ? ' [dl]' : ''}`}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                  }
                </div>
              )}

              {/* search */}
              {serviceId != null && (() => {
                const svc     = request.media.mediaType === 'movie' ? 'radarr' : 'sonarr'
                const searchId = request.media.mediaType === 'movie' ? serviceId : (selectedEpisodeId ?? undefined)
                return (
                  <div className="mb-6">
                    <p className="text-[#7070a8] text-xs mb-2">{`/* search */`}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={!!acting}
                        onClick={async () => {
                          setActing('auto')
                          await fetch(`/api/${svc}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(
                              request.media.mediaType === 'movie'
                                ? { action: 'searchMovie', movieId: serviceId }
                                : { action: 'searchEpisode', episodeId: selectedEpisodeId ?? serviceId }
                            ),
                          })
                          setActing(null)
                        }}
                        className="btn-xs text-violet-400"
                      >
                        {acting === 'auto' ? '...' : 'grep'}
                      </button>
                      {searchId != null && (
                        <button
                          disabled={relLoading}
                          onClick={async () => {
                            setRelLoading(true)
                            setReleases(null)
                            setRelError(null)
                            try {
                              const res = await fetch(`/api/${svc}?releasesFor=${searchId}`)
                              const data = await res.json()
                              if (!res.ok || data?.error) {
                                setRelError(data?.error ?? `HTTP ${res.status}`)
                              } else {
                                setReleases(data)
                              }
                            } catch (e: unknown) {
                              setRelError(e instanceof Error ? e.message : 'fetch failed')
                            } finally {
                              setRelLoading(false)
                            }
                          }}
                          className="btn-xs text-violet-400"
                        >
                          {relLoading ? '...' : 'grep -i'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              <ReleaseSearchResults
                releases={releases}
                loading={relLoading}
                error={relError}
                acting={acting}
                onGrab={async (guid, indexerId, key) => {
                  const svc = request.media.mediaType === 'movie' ? 'radarr' : 'sonarr'
                  setActing(key)
                  await fetch(`/api/${svc}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'grab', guid, indexerId }),
                  })
                  setReleases(null)
                  onRefresh()
                  setActing(null)
                }}
              />

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
