'use client'

import { useState, useEffect } from 'react'
import { SeerSearchResult } from '@/types'
import Spinner from '@/components/Spinner'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500'

const mediaStatusLabel: Record<number, string> = {
  1: 'unknown', 2: 'pending', 3: 'processing', 4: 'partial', 5: 'available',
}
const mediaStatusColor: Record<number, string> = {
  1: 'text-[#888]', 2: 'text-yellow-400', 3: 'text-blue-400', 4: 'text-blue-400', 5: 'text-green-400',
}

interface Detail {
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
  mediaInfo?: { status?: number; requests?: { id: number }[] }
}

interface Props {
  item: SeerSearchResult | null
  onClose: () => void
  onRequested: () => void
}

export default function DiscoverDetailDrawer({ item, onClose, onRequested }: Props) {
  const [detail, setDetail]   = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding]   = useState(false)
  const [added, setAdded]     = useState(false)

  useEffect(() => {
    if (!item) { setDetail(null); setAdded(false); return }
    setLoading(true)
    setAdded(false)
    fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
      .then(r => r.json())
      .then(d => setDetail(d.detail ?? null))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [item])

  async function addRequest() {
    if (!item) return
    setAdding(true)
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', mediaType: item.mediaType, mediaId: item.id }),
    })
    setAdding(false)
    setAdded(true)
    onRequested()
  }

  if (!item) return null

  const title    = detail?.title ?? detail?.name ?? item.title ?? item.name ?? '—'
  const year     = (detail?.releaseDate ?? detail?.firstAirDate ?? item.releaseDate ?? item.firstAirDate)?.slice(0, 4)
  const poster   = (detail?.posterPath ?? item.posterPath)
  const overview = detail?.overview ?? item.overview
  const status   = detail?.mediaInfo?.status
  const isAvail  = status === 5
  const isReq    = status != null && status >= 2 && status < 5
  const genres   = detail?.genres?.map(g => g.name).join(', ')
  const runtime  = item.mediaType === 'movie' ? detail?.runtime : undefined
  const seasons  = item.mediaType === 'tv' ? detail?.numberOfSeasons : undefined
  const rating   = detail?.voteAverage

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg bg-[#0A0A0F] border border-[#1a1a2e] font-mono text-xs z-10 max-h-[90vh] overflow-y-auto">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a2e]">
          <span className="text-[#6a9a7a]">
            /* <span className="text-white">{item.mediaType === 'tv' ? 'tv' : 'movie'}</span> :: detail */
          </span>
          <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
        </div>

        {loading && <div className="px-4 py-6"><Spinner /></div>}

        {!loading && (
          <div className="flex gap-4 p-4">
            {/* poster */}
            {poster ? (
              <img
                src={`${TMDB_IMG}${poster}`}
                alt={title}
                className="w-24 shrink-0 object-cover border border-[#1a1a2e]"
                style={{ aspectRatio: '2/3' }}
              />
            ) : (
              <div className="w-24 shrink-0 border border-[#1a1a2e] bg-[#0f0f1a] flex items-center justify-center text-[#333]"
                style={{ aspectRatio: '2/3' }}>
                {item.mediaType === 'tv' ? 'tv' : '▣'}
              </div>
            )}

            {/* info */}
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <p className="text-white text-sm font-medium leading-tight">{title}</p>
                <div className="flex flex-wrap gap-x-3 mt-1 text-[#888]">
                  {year && <span>{year}</span>}
                  {runtime && <span>{runtime}m</span>}
                  {seasons && <span>{seasons}s</span>}
                  {rating != null && rating > 0 && <span>★ {rating.toFixed(1)}</span>}
                </div>
              </div>

              {genres && <p className="text-[#555]">{genres}</p>}

              {/* status */}
              {status != null && (
                <p className={mediaStatusColor[status]}>
                  // {mediaStatusLabel[status] ?? 'unknown'}
                </p>
              )}

              {/* actions */}
              <div className="flex gap-2 pt-1">
                {isAvail && (
                  <span className="text-green-400">// available in plex</span>
                )}
                {isReq && !isAvail && (
                  <span className="text-yellow-400">// already requested</span>
                )}
                {!isAvail && !isReq && (
                  <button
                    onClick={addRequest}
                    disabled={adding || added}
                    className="btn-xs text-blue-400 disabled:opacity-50"
                  >
                    {added ? '// queued' : adding ? '...' : '--add'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* overview */}
        {!loading && overview && (
          <div className="px-4 pb-4 border-t border-[#0f0f1a]">
            <p className="text-[#888] mt-3 leading-relaxed">{overview}</p>
          </div>
        )}
      </div>
    </div>
  )
}
