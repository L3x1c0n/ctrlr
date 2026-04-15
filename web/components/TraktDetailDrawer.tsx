'use client'

import { useState, useEffect } from 'react'
import { TraktMovie, TraktEpisode } from '@/types'
import Spinner from '@/components/Spinner'
import ReleaseSearchResults, { Release } from '@/components/ReleaseSearchResults'

interface TraktMovieFull {
  title: string
  year: number
  overview: string
  released: string
  runtime: number
  rating: number
  votes: number
  genres: string[]
  certification: string
  status: string
}

interface TraktEpisodeFull {
  season: number
  number: number
  title: string
  overview: string
  first_aired: string
  runtime: number
  rating: number
  votes: number
}

type SelectedItem =
  | { type: 'movie'; data: TraktMovie; downloaded?: boolean }
  | { type: 'episode'; data: TraktEpisode; downloaded?: boolean }

interface Props {
  item: SelectedItem | null
  onClose: () => void
}

interface WatchProvider { id: number; name: string; logoPath: string }

export default function TraktDetailDrawer({ item, onClose }: Props) {
  const [detail, setDetail] = useState<TraktMovieFull | TraktEpisodeFull | null>(null)
  const [posterPath, setPosterPath] = useState<string | null>(null)
  const [backdropPath, setBackdropPath] = useState<string | null>(null)
  const [inPlex, setInPlex] = useState(false)
  const [watchProviders, setWatchProviders] = useState<WatchProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [arrIds, setArrIds] = useState<{ movieId?: number; seriesId?: number; episodeId?: number } | null>(null)
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relError, setRelError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    if (!item) { setDetail(null); setPosterPath(null); setBackdropPath(null); setWatchProviders([]); setArrIds(null); setReleases(null); setRelError(null); return }
    setInPlex(!!item.downloaded)
    setLoading(true)
    setArrIds(null)
    setReleases(null)
    let url: string
    if (item.type === 'movie') {
      url = `/api/trakt?slug=${item.data.movie.ids.slug}&type=movie&tmdbId=${item.data.movie.ids.tmdb}`
    } else {
      const e = item.data
      url = `/api/trakt?slug=${e.show.ids.slug}&type=episode&season=${e.episode.season}&episode=${e.episode.number}&tmdbId=${e.show.ids.tmdb}`
    }
    fetch(url)
      .then(r => r.json())
      .then(d => { setDetail(d.detail ?? null); setPosterPath(d.posterPath ?? null); setBackdropPath(d.backdropPath ?? null); setWatchProviders(d.watchProviders ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Look up internal IDs in radarr/sonarr
    if (item.type === 'movie') {
      fetch(`/api/radarr?tmdb=${item.data.movie.ids.tmdb}`)
        .then(r => r.json())
        .then(d => setArrIds(d.movieId ? { movieId: d.movieId } : null))
        .catch(() => {})
    } else {
      const e = item.data
      const tvdb = e.show.ids.tvdb
      if (tvdb) {
        fetch(`/api/sonarr?tvdb=${tvdb}&season=${e.episode.season}&episode=${e.episode.number}`)
          .then(r => r.json())
          .then(d => setArrIds(d.seriesId ? { seriesId: d.seriesId, episodeId: d.episodeId ?? undefined } : null))
          .catch(() => {})
      }
    }
  }, [item])

  const isOpen = !!item
  const label = item?.type === 'movie'
    ? item.data.movie.title
    : item?.data.show.title ?? ''

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        {backdropPath && (
          <div className="absolute top-0 inset-x-0 h-72 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 scale-110 bg-cover bg-center" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${backdropPath})`, filter: 'blur(20px)', opacity: 0.18, maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }} />
          </div>
        )}
        <div className="relative z-10 overflow-y-auto h-full p-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* trakt -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {loading && <Spinner />}

          {!loading && item && (
            <>
              {/* header: poster + metadata */}
              <div className="flex gap-4 mb-6 items-start">
                {posterPath && (
                  <img
                    src={`https://image.tmdb.org/t/p/w342${posterPath}`}
                    alt={label}
                    className="w-36 aspect-[2/3] flex-shrink-0 object-cover border border-[#2a2a4a]"
                  />
                )}
              <div className="flex-1 min-w-0 space-y-1 text-xs">
                {item.type === 'movie' ? (
                  <p className="text-white text-sm font-medium leading-snug">
                    {item.data.movie.title}
                    <span className="text-[#999] ml-2 font-normal">({item.data.movie.year})</span>
                  </p>
                ) : (
                  <>
                    <p className="text-white text-sm font-medium leading-snug">{item.data.show.title}</p>
                    <p className="text-[#999]">
                      S{String(item.data.episode.season).padStart(2, '0')}E{String(item.data.episode.number).padStart(2, '0')}
                      {item.data.episode.title ? ` — ${item.data.episode.title}` : ''}
                    </p>
                  </>
                )}

                {detail && (
                  <div className="flex flex-wrap gap-x-3 pt-0.5">
                    {'certification' in detail && detail.certification && (
                      <span className="text-[#bbb]">{detail.certification}</span>
                    )}
                    {detail.runtime > 0 && (
                      <span className="text-[#bbb]">{detail.runtime}m</span>
                    )}
                    {detail.rating > 0 && (
                      <span className="text-[#999]">★ {detail.rating.toFixed(1)}</span>
                    )}
                    {'genres' in detail && detail.genres?.length > 0 && (
                      <span className="text-[#888]">{detail.genres.slice(0, 3).join(', ')}</span>
                    )}
                  </div>
                )}

                <p className="text-[#aaa]">
                  {item.type === 'movie'
                    ? item.data.released
                    : new Date(item.data.first_aired).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>

                {(inPlex || watchProviders.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {inPlex && (
                      <img
                        src="https://cdn.simpleicons.org/plex/e5a00d"
                        alt="In Plex"
                        title="In Plex library"
                        className="w-5 h-5"
                      />
                    )}
                    {watchProviders.map(p => (
                      <img
                        key={p.id}
                        src={`https://image.tmdb.org/t/p/w45${p.logoPath}`}
                        alt={p.name}
                        title={p.name}
                        className="w-6 h-6 rounded-sm object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
              </div>

              {/* overview */}
              {detail?.overview ? (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* overview */`}</p>
                  <p className="text-[#bbb] text-xs leading-relaxed">{detail.overview}</p>
                </div>
              ) : !loading && (
                <p className="text-[#999] text-xs mb-6">No overview available.</p>
              )}

              {/* arr actions */}
              {arrIds && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* actions */`}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={!!acting}
                      onClick={async () => {
                        setActing('auto')
                        if (arrIds.movieId) {
                          await fetch('/api/radarr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'searchMovie', movieId: arrIds.movieId }) })
                        } else if (arrIds.episodeId) {
                          await fetch('/api/sonarr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'searchEpisode', episodeId: arrIds.episodeId }) })
                        }
                        setActing(null)
                      }}
                      className="btn-xs text-violet-400"
                    >
                      {acting === 'auto' ? '...' : 'grep'}
                    </button>
                    {(arrIds.movieId || arrIds.episodeId) && (
                      <button
                        disabled={relLoading}
                        onClick={async () => {
                          setRelLoading(true)
                          setReleases(null)
                          setRelError(null)
                          try {
                            const searchId = arrIds.movieId ?? arrIds.episodeId
                            const svc = arrIds.movieId ? 'radarr' : 'sonarr'
                            const res = await fetch(`/api/${svc}?releasesFor=${searchId}`)
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
                        className="btn-xs text-violet-400"
                      >
                        {relLoading ? '...' : 'grep -i'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* interactive results */}
              <ReleaseSearchResults
                releases={releases}
                loading={relLoading}
                error={relError}
                acting={acting}
                onGrab={async (guid, indexerId, key) => {
                  const svc = arrIds?.movieId ? 'radarr' : 'sonarr'
                  setActing(key)
                  await fetch(`/api/${svc}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'grab', guid, indexerId }),
                  })
                  setReleases(null)
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

export type { SelectedItem as TraktSelectedItem }
