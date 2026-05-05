'use client'

import { useState, useEffect } from 'react'
import { ArrQueueItem, ArrMediaDetail, QualityProfile } from '@/types'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'
import { SonarrEpisode } from '@/lib/sonarr'
import ReleaseSearchResults, { Release } from '@/components/ReleaseSearchResults'

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

interface Props {
  service: 'radarr' | 'sonarr'
  item: ArrQueueItem | null
  onClose: () => void
  onRefresh: () => void
}

export default function ArrDetailDrawer({ service, item, onClose, onRefresh }: Props) {
  const [detail, setDetail] = useState<ArrMediaDetail | null>(null)
  const [profiles, setProfiles] = useState<QualityProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relError, setRelError] = useState<string | null>(null)
  const [episodes, setEpisodes] = useState<SonarrEpisode[] | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number | null>(null)

  const mediaId = item?.movieId ?? item?.seriesId
  const searchId = service === 'radarr' ? item?.movieId : (selectedEpisodeId ?? undefined)

  useEffect(() => {
    setReleases(null)
    setRelError(null)
    setEpisodes(null)
    setSelectedEpisodeId(null)
    if (!item || !mediaId) { setDetail(null); setProfiles([]); return }
    // Always fetch episodes for Sonarr so the picker is always visible
    if (service === 'sonarr' && item.seriesId) {
      fetch(`/api/sonarr?episodes=${item.seriesId}`)
        .then(r => r.json())
        .then((eps: SonarrEpisode[]) => {
          setEpisodes(eps)
          // If a specific episodeId was passed in, use it; otherwise auto-select
          if (item.episodeId) {
            setSelectedEpisodeId(item.episodeId)
          } else {
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
          }
        })
        .catch(() => setEpisodes([]))
    }
    setLoading(true)
    fetch(`/api/${service}?mediaId=${mediaId}`)
      .then(r => r.json())
      .then(data => {
        setDetail(data.detail ?? null)
        setProfiles(data.profiles ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item, mediaId, service])

  async function act(action: string, extra: object = {}) {
    setActing(action)
    try {
      await fetch(`/api/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: item?.id,
          movieId: item?.movieId,
          seriesId: item?.seriesId,
          ...extra,
        }),
      })
      onRefresh()
      if (action === 'delete') onClose()
    } finally {
      setActing(null)
    }
  }

  async function changeQuality(qualityProfileId: number) {
    setActing('quality')
    try {
      await fetch(`/api/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateQuality',
          movieId: item?.movieId,
          seriesId: item?.seriesId,
          qualityProfileId,
        }),
      })
      if (mediaId) {
        const data = await fetch(`/api/${service}?mediaId=${mediaId}`).then(r => r.json())
        setDetail(data.detail ?? null)
      }
    } finally {
      setActing(null)
    }
  }

  const poster   = detail?.images?.find(i => i.coverType === 'poster')?.remoteUrl
  const backdrop = detail?.images?.find(i => i.coverType === 'fanart')?.remoteUrl
  const pct = item && item.size > 0 ? ((item.size - item.sizeleft) / item.size) * 100 : 0
  const imdbRating = detail?.ratings?.imdb?.value ?? detail?.ratings?.movieDb?.value ?? null

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${item ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] transition-[transform,visibility] duration-200 font-mono ${item ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        {backdrop && (
          <div className="absolute top-0 inset-x-0 h-72 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 scale-110 bg-cover bg-center" style={{ backgroundImage: `url(${backdrop})`, filter: 'blur(20px)', opacity: 0.18, maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }} />
          </div>
        )}
        <div className="relative z-10 overflow-y-auto h-full p-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* ${service} -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {loading && <Spinner />}

          {!loading && !detail && item && (
            <p className="text-[#bbb] text-xs font-mono">
              <span className="text-[#ccc]">2&gt;</span> no detail available
            </p>
          )}

          {!loading && detail && (
            <>
              {/* media info */}
              <div className="flex gap-4 mb-6">
                {poster && (
                  <img
                    src={poster}
                    alt={detail.title}
                    className="w-36 aspect-[2/3] flex-shrink-0 object-cover border border-[#1a1a2e]"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-snug">
                    {detail.title}
                    <span className="text-[#ccc] ml-2 font-normal">({detail.year})</span>
                  </p>
                  {detail.genres?.length > 0 && (
                    <p className="text-[#ccc] text-xs mt-0.5">{detail.genres.slice(0, 3).join(', ')}</p>
                  )}
                  {imdbRating && (
                    <p className="text-[#999] text-xs mt-0.5">imdb {imdbRating.toFixed(1)}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[#bbb] text-xs">monitored:</span>
                    <button
                      onClick={() => act('toggleMonitor', { monitored: !detail.monitored })}
                      disabled={!!acting}
                      className={`text-xs transition-colors ${detail.monitored ? 'text-yellow-400' : 'text-[#ccc]'}`}
                    >
                      {detail.monitored ? '●' : '○'}
                    </button>
                  </div>
                </div>
              </div>

              {/* overview */}
              {detail.overview && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* overview */`}</p>
                  <p className="text-[#bbb] text-xs leading-relaxed">{detail.overview}</p>
                </div>
              )}

              {/* config */}
              {profiles.length > 0 && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* config */`}</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[#bbb] text-xs w-20">profile:</span>
                      <select
                        value={detail.qualityProfileId}
                        onChange={e => changeQuality(Number(e.target.value))}
                        disabled={acting === 'quality'}
                        className="bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-1 focus:outline-none focus:border-[#888] disabled:opacity-50"
                      >
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {acting === 'quality' && <span className="text-[#bbb] text-xs">...</span>}
                    </div>
                    {detail.movieFile?.quality?.quality?.name && (
                      <div className="flex items-center gap-3">
                        <span className="text-[#bbb] text-xs w-20">file:</span>
                        <span className="text-green-300 text-xs">{detail.movieFile.quality.quality.name}</span>
                        {detail.movieFile.size && (
                          <span className="text-[#999] text-xs">{fmtSize(detail.movieFile.size)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* queue status */}
              {item && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* queue */`}</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex gap-2">
                      <span className="text-[#bbb] w-20">status:</span>
                      <span className="text-white">{item.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#bbb] w-20">progress:</span>
                      <ProgressBar pct={pct} width={20} />
                      <span className="text-[#999]">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[#bbb] w-20">size:</span>
                      <span className="text-[#ccc]">{fmtSize(item.size)}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[#bbb] w-20">protocol:</span>
                      <span className="text-[#ccc]">{item.protocol}</span>
                    </div>
                    {item.quality?.quality?.name && (
                      <div className="flex gap-2">
                        <span className="text-[#bbb] w-20">quality:</span>
                        <span className="text-green-300">{item.quality.quality.name}</span>
                      </div>
                    )}
                    {item.statusMessages?.flatMap(m => m.messages).slice(0, 3).map((msg, i) => (
                      <p key={i} className="text-[#ccc] pl-0">→ {msg}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* episode picker — always shown for sonarr so user can see and confirm which episode */}
              {service === 'sonarr' && episodes !== null && (
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

              {/* actions */}
              <div className="mb-6">
                <p className="text-[#7070a8] text-xs mb-2">{`/* actions */`}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => act('search')}
                    disabled={!!acting}
                    className="btn-xs text-violet-400"
                  >
                    {acting === 'search' ? '...' : 'grep'}
                  </button>
                  {searchId && (
                    <button
                      onClick={async () => {
                        setRelLoading(true)
                        setReleases(null)
                        setRelError(null)
                        try {
                          const res = await fetch(`/api/${service}?releasesFor=${searchId}`)
                          const data = await res.json()
                          if (!res.ok || data?.error) {
                            setRelError(data?.error ?? `HTTP ${res.status}`)
                          } else {
                            setReleases(data)
                          }
                        } catch (e: any) {
                          setRelError(e.message ?? 'fetch failed')
                        } finally {
                          setRelLoading(false)
                        }
                      }}
                      disabled={relLoading}
                      className="btn-xs text-violet-400"
                    >
                      {relLoading ? '...' : 'grep -i'}
                    </button>
                  )}
                  {item?.id && (
                    <>
                      <button
                        onClick={() => { if (confirm(`Remove ${detail.title} from queue?`)) act('delete') }}
                        disabled={!!acting}
                        className="btn-xs text-red-400"
                      >
                        {acting === 'delete' ? '...' : '--rm'}
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove and blacklist ${detail.title}?`)) act('delete', { blacklist: true }) }}
                        disabled={!!acting}
                        className="btn-xs text-red-600"
                      >
                        --blacklist --rm
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* interactive search results */}
              <ReleaseSearchResults
                releases={releases}
                loading={relLoading}
                error={relError}
                acting={acting}
                onGrab={async (guid, indexerId, key) => {
                  setActing(key)
                  await fetch(`/api/${service}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'grab', guid, indexerId }),
                  })
                  setReleases(null)
                  onRefresh()
                  setActing(null)
                }}
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}
