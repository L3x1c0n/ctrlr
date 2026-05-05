'use client'

import { useState, useEffect } from 'react'
import { PlexMedia, SeerSearchResult } from '@/types'
import Spinner from '@/components/Spinner'
import RequestModal from '@/components/RequestModal'

const statusLabel: Record<number, string> = { 1: 'Pending', 2: 'Approved', 3: 'Declined', 4: 'Available', 5: 'Processing' }
const statusColor: Record<number, string>  = { 1: 'text-yellow-400', 2: 'text-blue-400', 3: 'text-red-400', 4: 'text-green-400', 5: 'text-purple-400' }

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface PlexDetail {
  title: string
  originalTitle?: string
  year?: number
  type?: string
  summary?: string
  rating?: number
  contentRating?: string
  duration?: number
  studio?: string
  originallyAvailableAt?: string
  thumb?: string
  art?: string
  viewCount?: number
  grandparentTitle?: string
  grandparentRatingKey?: string
  parentIndex?: number
  index?: number
  Genre?: { tag: string }[]
  Director?: { tag: string }[]
  Writer?: { tag: string }[]
  Role?: { tag: string; role?: string }[]
  Guid?: { id: string }[]
  Media?: {
    videoResolution?: string
    videoCodec?: string
    audioCodec?: string
    audioChannels?: number
    bitrate?: number
    container?: string
    Part?: { file?: string; size?: number }[]
  }[]
}

interface PlexChild {
  ratingKey: string
  title: string
  index: number
  leafCount?: number
  duration?: number
  thumb?: string
}

interface Photo { key: string; selected: boolean; thumb: string }
interface Match { guid: string; name: string; year?: string; thumb?: string }

interface Props {
  item: PlexMedia | null
  onClose: () => void
  onRefresh: () => void
}

// ── series browser ────────────────────────────────────────────────────────────

function SeriesBrowser({
  showKey, onSelectEpisode,
}: {
  showKey: string
  onSelectEpisode: (ratingKey: string) => void
}) {
  const [seasons,       setSeasons]       = useState<PlexChild[]>([])
  const [loading,       setLoading]       = useState(true)
  const [openSeason,    setOpenSeason]    = useState<string | null>(null)
  const [episodes,      setEpisodes]      = useState<Record<string, PlexChild[]>>({})
  const [loadingSeason, setLoadingSeason] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plex?children=${showKey}`)
      .then(r => r.json())
      .then(d => setSeasons(d.children ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [showKey])

  async function toggleSeason(seasonKey: string) {
    if (openSeason === seasonKey) { setOpenSeason(null); return }
    setOpenSeason(seasonKey)
    if (episodes[seasonKey]) return
    setLoadingSeason(seasonKey)
    try {
      const res  = await fetch(`/api/plex?children=${seasonKey}`)
      const data = await res.json()
      setEpisodes(prev => ({ ...prev, [seasonKey]: data.children ?? [] }))
    } finally {
      setLoadingSeason(null)
    }
  }

  if (loading) return <Spinner />
  if (seasons.length === 0) return <p className="text-[#999] text-xs font-mono">// no seasons found</p>

  return (
    <div className="space-y-0.5">
      {seasons.map(season => (
        <div key={season.ratingKey}>
          <button
            onClick={() => toggleSeason(season.ratingKey)}
            className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-[#1a1a2e] text-left rounded-sm"
          >
            <span className="text-[#ccc] text-xs font-mono">
              S{String(season.index).padStart(2, '0')} — {season.title}
            </span>
            <span className="text-[#888] text-xs font-mono flex items-center gap-2">
              {season.leafCount != null && <span>{season.leafCount}ep</span>}
              <span>{openSeason === season.ratingKey ? '▲' : '▼'}</span>
            </span>
          </button>

          {openSeason === season.ratingKey && (
            <div className="ml-3 border-l border-[#2a2a4a] pl-2 pb-1">
              {loadingSeason === season.ratingKey ? (
                <div className="py-2"><Spinner /></div>
              ) : (
                <div className="space-y-0.5 pt-0.5">
                  {(episodes[season.ratingKey] ?? []).map(ep => (
                    <button
                      key={ep.ratingKey}
                      onClick={() => onSelectEpisode(ep.ratingKey)}
                      className="w-full text-left py-1 px-1.5 hover:bg-[#1a1a2e] flex items-center gap-2 rounded-sm group"
                    >
                      <span className="text-[#7070a8] text-xs font-mono w-7 shrink-0 tabular-nums">
                        E{String(ep.index).padStart(2, '0')}
                      </span>
                      <span className="text-[#bbb] text-xs truncate flex-1 group-hover:text-white transition-colors">{ep.title}</span>
                      {ep.duration != null && (
                        <span className="text-[#666] text-xs font-mono shrink-0">
                          {fmtDuration(ep.duration)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── artwork grid ──────────────────────────────────────────────────────────────

function ArtGrid({
  ratingKey, kind, onSelect,
}: {
  ratingKey: string
  kind: 'posters' | 'arts'
  onSelect: (key: string) => Promise<void>
}) {
  const [photos, setPhotos]   = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plex?${kind}=${ratingKey}`)
      .then(r => r.json())
      .then(d => setPhotos(d.photos ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ratingKey, kind])

  async function pick(photo: Photo) {
    setActing(photo.key)
    await onSelect(photo.key)
    setPhotos(prev => prev.map(p => ({ ...p, selected: p.key === photo.key })))
    setActing(null)
  }

  const isPortrait = kind === 'posters'

  function srcLabel(key: string): string {
    if (key.startsWith('tmdb://'))   return 'tmdb'
    if (key.startsWith('fanart://')) return 'fanart'
    if (key.startsWith('local://'))  return 'local'
    if (key.startsWith('http'))      return 'remote'
    return 'plex'
  }

  if (loading) return <Spinner />
  if (photos.length === 0) return <p className="text-[#999] text-xs font-mono">// none available</p>

  return (
    <>
      <p className="text-[#7070a8] text-xs font-mono mb-1.5">// {photos.length} available — click to set</p>
      <div className={`grid gap-2 ${isPortrait ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {photos.map((p, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <button
              onClick={() => pick(p)}
              disabled={!!acting}
              className={`relative overflow-hidden border ${p.selected ? 'border-white' : 'border-[#2a2a4a] hover:border-[#7070a8]'} ${acting === p.key ? 'opacity-40' : ''}`}
              style={{ aspectRatio: isPortrait ? '2/3' : '16/9' }}
            >
              <img
                src={`/api/plex?thumb=${encodeURIComponent(p.thumb)}`}
                alt=""
                className="w-full h-full object-cover"
              />
              {p.selected && (
                <div className="absolute inset-0 flex items-end justify-start p-0.5 bg-gradient-to-t from-black/60 to-transparent">
                  <span className="text-[7px] font-mono text-green-400 leading-none">✓ set</span>
                </div>
              )}
              {acting === p.key && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-[8px] font-mono text-white">...</span>
                </div>
              )}
            </button>
            <div className="flex justify-between items-center px-0.5">
              <span className="text-[7px] font-mono text-[#7070a8] tabular-nums">[{i}]</span>
              <span className="text-[7px] font-mono text-[#888]">{srcLabel(p.key)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── fix match panel ───────────────────────────────────────────────────────────

function MatchPanel({
  ratingKey, mediaType, onDone,
}: {
  ratingKey: string
  mediaType: string
  onDone: () => void
}) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [acting,  setActing]  = useState<string | null>(null)

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    try {
      const res  = await fetch(`/api/plex?matchQuery=${encodeURIComponent(query)}&matchType=${mediaType}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function apply(m: Match) {
    setActing(m.guid)
    try {
      await fetch('/api/plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match', ratingKey, guid: m.guid, name: m.name, mediaType }),
      })
      onDone()
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="search title..."
          className="bg-[#0f0f1a] border border-[#1a1a2e] text-white font-mono text-xs px-2 py-1 flex-1 focus:outline-none focus:border-[#888]"
        />
        <button onClick={search} disabled={loading} className="btn-xs text-violet-400">
          {loading ? '...' : '--grep'}
        </button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {results.map((m, i) => (
            <div key={i} className="flex items-center gap-2 py-1 border-b border-[#0f0f1a]">
              {m.thumb && (
                <img src={m.thumb} alt="" className="w-8 aspect-[2/3] object-cover flex-shrink-0 border border-[#2a2a4a]" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs truncate">{m.name}</p>
                {m.year && <p className="text-[#999] text-xs">{m.year}</p>}
              </div>
              <button
                onClick={() => apply(m)}
                disabled={!!acting}
                className="btn-xs text-blue-400 shrink-0"
              >
                {acting === m.guid ? '...' : '--set'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── main drawer ───────────────────────────────────────────────────────────────

export default function PlexDetailDrawer({ item, onClose, onRefresh }: Props) {
  const [currentKey,   setCurrentKey]   = useState<string | null>(null)
  const [detail,       setDetail]       = useState<PlexDetail | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [acting,       setActing]       = useState<string | null>(null)
  const [showPosters,  setShowPosters]  = useState(false)
  const [showArt,      setShowArt]      = useState(false)
  const [showMatch,    setShowMatch]    = useState(false)
  const [showSeries,   setShowSeries]   = useState(false)
  const [seerLoading,  setSeerLoading]  = useState(false)
  const [seerStatus,   setSeerStatus]   = useState<number | null>(null)
  const [seerPoster,   setSeerPoster]   = useState<string | null>(null)
  const [tmdbId,       setTmdbId]       = useState<number | null>(null)
  const [seerType,     setSeerType]     = useState<'movie' | 'tv'>('movie')
  const [requestItem,  setRequestItem]  = useState<SeerSearchResult | null>(null)

  // Reset panel state when the source item changes
  useEffect(() => {
    setCurrentKey(item?.ratingKey ?? null)
    setShowPosters(false)
    setShowArt(false)
    setShowMatch(false)
    setShowSeries(false)
    setSeerStatus(null)
    setSeerPoster(null)
    setTmdbId(null)
  }, [item])

  // Fetch detail whenever the active key changes
  useEffect(() => {
    if (!currentKey) { setDetail(null); return }
    setLoading(true)
    setDetail(null)
    setSeerStatus(null)
    setSeerPoster(null)
    setTmdbId(null)
    fetch(`/api/plex?ratingKey=${currentKey}`)
      .then(r => r.json())
      .then(data => {
        const d = data.detail ?? null
        setDetail(d)
        if (!d) return
        const mt: 'movie' | 'tv' = d.type === 'movie' ? 'movie' : 'tv'
        setSeerType(mt)

        // For episodes, use the grandparent (show) ratingKey to get the show's TMDB ID
        const keyForLookup = (d.type === 'episode' && d.grandparentRatingKey)
          ? d.grandparentRatingKey
          : null

        const resolveGuids = keyForLookup
          ? fetch(`/api/plex?ratingKey=${keyForLookup}`).then(r => r.json()).then(s => (s.detail?.Guid ?? []) as { id: string }[])
          : Promise.resolve((d.Guid ?? []) as { id: string }[])

        resolveGuids.then(guids => {
          const tmdb = guids.find(g => g.id.startsWith('tmdb://'))
          if (!tmdb) return
          const id = parseInt(tmdb.id.replace('tmdb://', ''))
          setTmdbId(id)
          setSeerLoading(true)
          fetch(`/api/seer?mediaId=${id}&mediaType=${mt}`)
            .then(r => r.json())
            .then(s => {
              const status = (s.detail as any)?.mediaInfo?.status ?? null
              setSeerStatus(status)
              setSeerPoster((s.detail as any)?.posterPath ?? null)
            })
            .catch(() => {})
            .finally(() => setSeerLoading(false))
        }).catch(() => {})
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentKey])

  async function doAction(action: string, extra: object = {}) {
    if (!currentKey) return
    setActing(action)
    try {
      await fetch('/api/plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ratingKey: currentKey, ...extra }),
      })
      if (action === 'delete') { onRefresh(); onClose() }
      else onRefresh()
    } finally {
      setActing(null)
    }
  }

  async function selectPoster(photoKey: string) { await doAction('setPoster', { photoKey }) }
  async function selectArt(photoKey: string)    { await doAction('setArt',    { photoKey }) }

  const isEpisode  = detail?.type === 'episode'
  const mediaType  = isEpisode ? 'show' : 'movie'
  const posterThumb = detail?.thumb ?? item?.thumb
  const posterUrl   = posterThumb ? `/api/plex?thumb=${encodeURIComponent(posterThumb)}` : null
  const isOpen      = !!item

  // Show key: prefer from fetched detail (so it stays correct after episode navigation)
  const showKey = detail?.grandparentRatingKey ?? item?.grandparentRatingKey ?? null

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] overflow-y-auto transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        {detail?.art && (
          <div className="absolute inset-0 bg-cover bg-center scale-110 pointer-events-none" style={{ backgroundImage: `url(/api/plex?thumb=${encodeURIComponent(detail.art)})`, filter: 'blur(24px)', opacity: 0.1 }} />
        )}
        <div className="relative z-10 p-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* plex -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {loading && <Spinner />}

          {!loading && detail && currentKey && (
            <>
              {/* header */}
              <div className="flex gap-4 mb-6 items-start">
                {posterUrl && (
                  <img src={posterUrl} alt={detail.title} className="w-36 aspect-[2/3] flex-shrink-0 object-cover border border-[#2a2a4a]" />
                )}
                <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                  {isEpisode ? (
                    <>
                      {/* show title — clickable to toggle series browser */}
                      <button
                        onClick={() => setShowSeries(v => !v)}
                        className="text-white text-sm font-medium leading-snug text-left hover:text-white group transition-colors"
                      >
                        {detail.grandparentTitle}
                        <span className="ml-1 text-[#555] group-hover:text-[#aaa] transition-colors">›</span>
                      </button>
                      <p className="text-[#999]">S{String(detail.parentIndex ?? 0).padStart(2, '0')}E{String(detail.index ?? 0).padStart(2, '0')} — {detail.title}</p>
                    </>
                  ) : (
                    <p className="text-white text-sm font-medium leading-snug">
                      {detail.title}
                      {detail.year && <span className="text-[#999] ml-2 font-normal">({detail.year})</span>}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3">
                    {detail.contentRating && <span className="text-[#bbb]">{detail.contentRating}</span>}
                    {detail.duration      && <span className="text-[#bbb]">{fmtDuration(detail.duration)}</span>}
                    {detail.rating        && <span className="text-[#999]">★ {detail.rating.toFixed(1)}</span>}
                  </div>
                  {detail.studio && <p className="text-[#999]">{detail.studio}</p>}
                  {detail.Genre && detail.Genre.length > 0 && (
                    <p className="text-[#888]">{detail.Genre.map(g => g.tag).join(', ')}</p>
                  )}
                  {detail.Director && detail.Director.length > 0 && (
                    <div className="flex gap-2">
                      <span className="text-[#aaa] w-14 shrink-0">dir:</span>
                      <span className="text-[#ccc]">{detail.Director.map(d => d.tag).join(', ')}</span>
                    </div>
                  )}
                  {detail.Role && detail.Role.length > 0 && (
                    <div className="space-y-0.5 pt-0.5">
                      {detail.Role.slice(0, 4).map((r, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="text-[#bbb] truncate">{r.tag}</span>
                          {r.role && <span className="text-[#aaa] truncate">— {r.role}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* series browser — episodes only, below header */}
              {isEpisode && showKey && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-[#7070a8] text-xs">{`/* series */`}</p>
                    <button
                      onClick={() => setShowSeries(v => !v)}
                      className={`btn-xs ${showSeries ? 'text-white' : 'text-[#999]'}`}
                    >
                      {showSeries ? '--collapse' : '--browse'}
                    </button>
                  </div>
                  {showSeries && (
                    <SeriesBrowser
                      showKey={showKey}
                      onSelectEpisode={key => { setCurrentKey(key); setShowPosters(false); setShowArt(false); setShowMatch(false) }}
                    />
                  )}
                </div>
              )}

              {/* overview */}
              {detail.summary && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* overview */`}</p>
                  <p className="text-[#bbb] text-xs leading-relaxed">{detail.summary}</p>
                </div>
              )}

              {/* file info */}
              {detail.Media?.[0] && (() => {
                const m = detail.Media![0]
                const fmtRes = (r?: string) => r ? (r === '4k' ? '4K' : `${r}p`) : null
                const fmtBitrate = (b?: number) => b ? `${(b / 1000).toFixed(1)} Mbps` : null
                const fmtSize = (s?: number) => !s ? null : s < 1e9 ? `${(s / 1e6).toFixed(0)} MB` : `${(s / 1e9).toFixed(2)} GB`
                const res     = fmtRes(m.videoResolution)
                const bitrate = fmtBitrate(m.bitrate)
                const size    = fmtSize(m.Part?.[0]?.size)
                const codecs  = [m.videoCodec, m.audioCodec].filter(Boolean).join(' / ')
                if (!res && !codecs && !bitrate) return null
                return (
                  <div className="mb-6">
                    <p className="text-[#7070a8] text-xs mb-2">{`/* file */`}</p>
                    <div className="space-y-1 text-xs">
                      {res && (
                        <div className="flex gap-2">
                          <span className="text-[#bbb] w-20">resolution:</span>
                          <span className="text-green-300">{res}</span>
                        </div>
                      )}
                      {codecs && (
                        <div className="flex gap-2">
                          <span className="text-[#bbb] w-20">codec:</span>
                          <span className="text-[#ccc]">{codecs}</span>
                        </div>
                      )}
                      {m.container && (
                        <div className="flex gap-2">
                          <span className="text-[#bbb] w-20">container:</span>
                          <span className="text-[#ccc]">{m.container}</span>
                        </div>
                      )}
                      {bitrate && (
                        <div className="flex gap-2">
                          <span className="text-[#bbb] w-20">bitrate:</span>
                          <span className="text-[#ccc]">{bitrate}</span>
                        </div>
                      )}
                      {size && (
                        <div className="flex gap-2">
                          <span className="text-[#bbb] w-20">size:</span>
                          <span className="text-[#ccc]">{size}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* seer */}
              {tmdbId && (
                <div className="mb-6">
                  <p className="text-[#7070a8] text-xs mb-2">{`/* seer */`}</p>
                  {seerLoading ? (
                    <Spinner />
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      {seerStatus !== null && (
                        <span className={`text-xs ${statusColor[seerStatus] ?? 'text-[#888]'}`}>
                          {statusLabel[seerStatus] ?? String(seerStatus)}
                        </span>
                      )}
                      {tmdbId && (
                        <button
                          onClick={() => setRequestItem({
                            id: tmdbId,
                            mediaType: seerType,
                            title: isEpisode ? (detail?.grandparentTitle ?? detail?.title) : detail?.title,
                            overview: detail?.summary ?? '',
                            posterPath: seerPoster ?? undefined,
                          })}
                          className="btn-xs text-cyan-600 hover:text-cyan-400"
                        >--request</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* artwork */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-[#7070a8] text-xs">{`/* artwork */`}</p>
                  <button
                    onClick={() => { setShowPosters(v => !v); setShowArt(false) }}
                    className={`btn-xs ${showPosters ? 'text-white' : 'text-[#999]'}`}
                  >
                    --posters
                  </button>
                  <button
                    onClick={() => { setShowArt(v => !v); setShowPosters(false) }}
                    className={`btn-xs ${showArt ? 'text-white' : 'text-[#999]'}`}
                  >
                    --art
                  </button>
                </div>
                {showPosters && (
                  <ArtGrid ratingKey={currentKey} kind="posters" onSelect={selectPoster} />
                )}
                {showArt && (
                  <ArtGrid ratingKey={currentKey} kind="arts" onSelect={selectArt} />
                )}
              </div>

              {/* fix match */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-[#7070a8] text-xs">{`/* match */`}</p>
                  <button
                    onClick={() => setShowMatch(v => !v)}
                    className={`btn-xs ${showMatch ? 'text-white' : 'text-[#999]'}`}
                  >
                    --fix-match
                  </button>
                </div>
                {showMatch && (
                  <MatchPanel
                    ratingKey={currentKey}
                    mediaType={mediaType}
                    onDone={() => { setShowMatch(false); onRefresh() }}
                  />
                )}
              </div>

              {/* actions */}
              <div>
                <p className="text-[#7070a8] text-xs mb-2">{`/* actions */`}</p>
                <p className={`text-xs mb-3 ${detail.viewCount && detail.viewCount > 0 ? 'text-[#aaa]' : 'text-yellow-400'}`}>
                  {detail.viewCount && detail.viewCount > 0 ? '1 watched' : 'Ø unwatched'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => doAction('refresh')}
                    disabled={!!acting}
                    className="btn-xs text-blue-400"
                  >
                    {acting === 'refresh' ? '...' : '--refresh'}
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete ${detail.title}?`)) doAction('delete') }}
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

      <RequestModal
        item={requestItem}
        onClose={() => setRequestItem(null)}
        onDone={() => {
          setRequestItem(null)
          setSeerStatus(5)
        }}
      />
    </>
  )
}
