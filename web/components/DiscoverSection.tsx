'use client'

// TODO: mobile layout — on narrow screens the split pane collapses; needs a dedicated
// treatment (e.g. poster-card row or bottom-sheet detail). Deferred for a future session.

import { useState, useEffect, useRef, useCallback } from 'react'
import { SeerSearchResult, DiscoverDetail } from '@/types'
import Spinner from '@/components/Spinner'
import DiscoverDetailDrawer from '@/components/DiscoverDetailDrawer'

const TMDB_W = (w: number, path: string) => `https://image.tmdb.org/t/p/w${w}${path}`

// ── status helpers ─────────────────────────────────────────────────────────────

const PLEX_ORANGE = '#E5A00D'

function statusBadge(status: number | undefined): { label: string; color: string; style?: React.CSSProperties } | null {
  if (status === 5)                 return { label: '[plex]', color: '', style: { color: PLEX_ORANGE } }
  if (status === 2)                 return { label: '[wait]', color: 'text-yellow-400' }
  if (status === 3 || status === 4) return { label: '[dl]',   color: 'text-blue-400' }
  return null
}

function AddButton({ item, onAdded }: { item: SeerSearchResult; onAdded: () => void }) {
  const [adding, setAdding] = useState(false)
  const [done, setDone]     = useState(false)
  const status = item.mediaInfo?.status
  const isAvail = status === 5
  const isReq   = status != null && status >= 2 && status < 5

  if (isAvail) return <span className="font-mono text-[10px] shrink-0" style={{ color: PLEX_ORANGE }}>// plex</span>
  if (isReq)   return <span className="font-mono text-[10px] text-yellow-400 shrink-0">// rq'd</span>
  if (done)    return <span className="font-mono text-[10px] text-blue-400 shrink-0">// queued</span>

  return (
    <button
      disabled={adding}
      onClick={async (e) => {
        e.stopPropagation()
        setAdding(true)
        await fetch('/api/seer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit', mediaType: item.mediaType, mediaId: item.id }),
        })
        setAdding(false)
        setDone(true)
        onAdded()
      }}
      className="btn-xs text-blue-400 shrink-0 disabled:opacity-40"
    >
      {adding ? '...' : '--add'}
    </button>
  )
}

// ── left list row ──────────────────────────────────────────────────────────────

function ListRow({
  item, index, isActive, onHover, onClick, onInfo, onAdded,
}: {
  item: SeerSearchResult
  index: number
  isActive: boolean
  onHover: () => void
  onClick: () => void
  onInfo: () => void
  onAdded: () => void
}) {
  const title  = item.title ?? item.name ?? '—'
  const year   = (item.releaseDate ?? item.firstAirDate)?.slice(0, 4)
  const badge  = statusBadge(item.mediaInfo?.status)

  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-default select-none border-l-2 font-mono text-xs transition-colors ${
        isActive
          ? 'border-[#4a4a7a] bg-[#0d0d1a] text-white'
          : 'border-transparent text-[#bbb] hover:bg-[#0a0a14] hover:text-white'
      }`}
    >
      <span className="text-[#444] w-4 tabular-nums text-right shrink-0">{index + 1}</span>
      {badge
        ? <span className={`shrink-0 text-[10px] ${badge.color}`} style={badge.style}>{badge.label}</span>
        : <span className="shrink-0 w-[28px]" />
      }
      <span className="flex-1 truncate">{title}</span>
      {year && <span className="text-[#555] shrink-0">{year}</span>}
      <AddButton item={item} onAdded={onAdded} />
      <button
        onClick={(e) => { e.stopPropagation(); onInfo() }}
        className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0"
      >
        --info
      </button>
    </div>
  )
}

// ── left list panel ────────────────────────────────────────────────────────────

function ListPanel({
  label, mediaType, items, loading, activeId, onActivate, onInfo, onAdded, onLoadMore, loadingMore,
}: {
  label: string
  mediaType: 'movie' | 'tv'
  items: SeerSearchResult[]
  loading: boolean
  activeId: string | null
  onActivate: (item: SeerSearchResult) => void
  onInfo: (item: SeerSearchResult) => void
  onAdded: () => void
  onLoadMore: () => void
  loadingMore: boolean
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="font-mono text-[10px] text-[#6a9a7a] px-3 py-1.5 border-b border-[#1a1a2e] shrink-0">
        // {label}
      </div>
      <div className="overflow-y-auto flex-1">
        {loading
          ? <div className="px-3 py-4"><Spinner /></div>
          : items.map((item, i) => (
            <ListRow
              key={`${item.mediaType}-${item.id}`}
              item={item}
              index={i}
              isActive={activeId === `${item.mediaType}-${item.id}`}
              onHover={() => onActivate(item)}
              onClick={() => onActivate(item)}
              onInfo={() => onInfo(item)}
              onAdded={onAdded}
            />
          ))
        }
        {!loading && items.length > 0 && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full text-center font-mono text-[10px] text-[#555] hover:text-[#888] py-2 border-t border-[#0f0f1a] disabled:opacity-40"
          >
            {loadingMore ? '...' : '--more'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── preview pane ───────────────────────────────────────────────────────────────

function PreviewPane({
  item, detail, detailLoading, onInfo, onAdded,
}: {
  item: SeerSearchResult | null
  detail: DiscoverDetail | null
  detailLoading: boolean
  onInfo: () => void
  onAdded: () => void
}) {
  if (!item) {
    return (
      <div className="flex items-center justify-center h-full border border-[#1a1a2e] font-mono text-xs text-[#333]">
        // hover a title
      </div>
    )
  }

  const title    = detail?.title    ?? detail?.name    ?? item.title ?? item.name ?? '—'
  const year     = (detail?.releaseDate ?? detail?.firstAirDate ?? item.releaseDate ?? item.firstAirDate)?.slice(0, 4)
  const backdrop = detail?.backdropPath
  const poster   = detail?.posterPath ?? item.posterPath
  const overview = detail?.overview  ?? item.overview
  const rating   = detail?.voteAverage ?? item.voteAverage
  const genres   = detail?.genres?.map(g => g.name).join(', ')
  const runtime  = item.mediaType === 'movie' ? detail?.runtime : undefined
  const seasons  = item.mediaType === 'tv'    ? detail?.numberOfSeasons : undefined
  const cast     = detail?.credits?.cast?.slice(0, 5).map(c => c.name).join(', ')
  const director = detail?.credits?.crew?.find(c => c.job === 'Director')?.name
  const studio   = (detail?.productionCompanies ?? detail?.networks)?.map(c => c.name).slice(0, 2).join(', ')
  const status   = detail?.mediaInfo?.status ?? item.mediaInfo?.status

  return (
    <div className="flex flex-col h-full border border-[#1a1a2e] overflow-hidden">

      {/* backdrop */}
      <div className="relative shrink-0 w-full" style={{ aspectRatio: '16/9' }}>
        {backdrop
          ? <img src={TMDB_W(780, backdrop)} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[#080810]" />
        }
        {/* gradient fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/20 to-transparent" />

        {/* inset poster — full height of artwork area */}
        {poster && (
          <img
            src={TMDB_W(185, poster)}
            alt=""
            className="absolute bottom-0 left-0"
            style={{
              width: 130, height: 195, objectFit: 'cover',
              boxShadow: '4px 0 24px rgba(0,0,0,0.85), 0 -4px 24px rgba(0,0,0,0.6)',
              outline: '1px solid rgba(255,255,255,0.12)',
              outlineOffset: '-1px',
            }}
          />
        )}

        {/* title over backdrop */}
        <div className="absolute bottom-2 right-3" style={{ left: poster ? 142 : 12 }}>
          <p className="text-white text-sm font-mono font-medium leading-tight line-clamp-2">{title}</p>
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5 font-mono text-[10px] text-[#888]">
            {year && <span>{year}</span>}
            {runtime && <span>{runtime}m</span>}
            {seasons && <span>{seasons} seasons</span>}
            {rating != null && rating > 0 && <span>★ {rating.toFixed(1)}</span>}
            {statusBadge(status) && (() => { const b = statusBadge(status)!; return (
              <span className={b.color} style={b.style}>{b.label}</span>
            )})()}
          </div>
        </div>
      </div>

      {/* metadata */}
      <div className="px-3 py-2 border-b border-[#0f0f1a] font-mono text-[10px] shrink-0">
        {detailLoading && !detail ? (
          <span className="text-[#444]">// loading...</span>
        ) : (
          <div className="space-y-0.5">
            {genres  && <MetaRow label="genre"  value={genres}  />}
            {director && <MetaRow label="dir"    value={director} />}
            {cast    && <MetaRow label="cast"    value={cast}    />}
            {studio  && <MetaRow label="studio"  value={studio}  />}
          </div>
        )}
      </div>

      {/* overview */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {overview
          ? <p className="font-mono text-[10px] text-[#888] leading-relaxed">{overview}</p>
          : <span className="font-mono text-[10px] text-[#333]">// no synopsis</span>
        }
      </div>

      {/* actions */}
      <div className="px-3 py-2 border-t border-[#1a1a2e] flex items-center gap-3 shrink-0">
        <AddButton item={item} onAdded={onAdded} />
        <button onClick={onInfo} className="btn-xs text-cyan-600 hover:text-cyan-400">--info</button>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-2">
      <span className="text-[#444] w-12 shrink-0">{label}</span>
      <span className="text-[#aaa] truncate">{value}</span>
    </p>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function DiscoverSection() {
  const [movies,      setMovies]      = useState<SeerSearchResult[]>([])
  const [tvShows,     setTvShows]     = useState<SeerSearchResult[]>([])
  const [moviesPage,  setMoviesPage]  = useState(1)
  const [tvPage,      setTvPage]      = useState(1)
  const [moviesLoading, setMoviesLoading] = useState(true)
  const [tvLoading,     setTvLoading]     = useState(true)
  const [moviesMore,  setMoviesMore]  = useState(false)
  const [tvMore,      setTvMore]      = useState(false)

  const [activeItem,    setActiveItem]    = useState<SeerSearchResult | null>(null)
  const [detail,        setDetail]        = useState<DiscoverDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drawerItem,    setDrawerItem]    = useState<SeerSearchResult | null>(null)

  const activeId     = activeItem ? `${activeItem.mediaType}-${activeItem.id}` : null
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allItemsRef  = useRef<SeerSearchResult[]>([])

  // Keep a stable ref to the flat item list for use in the keydown handler
  useEffect(() => {
    allItemsRef.current = [...tvShows, ...movies]
  }, [tvShows, movies])

  // ── initial fetch ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/seer?action=discover&mediaType=movie&page=1')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMovies(d) })
      .finally(() => setMoviesLoading(false))
    fetch('/api/seer?action=discover&mediaType=tv&page=1')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTvShows(d) })
      .finally(() => setTvLoading(false))
  }, [])

  // Pre-select first item once data loads
  useEffect(() => {
    if (!activeItem && movies.length > 0) setActiveItem(movies[0])
  }, [movies, activeItem])

  useEffect(() => {
    if (!activeItem && tvShows.length > 0 && movies.length === 0) setActiveItem(tvShows[0])
  }, [tvShows, activeItem, movies.length])

  // ── detail fetch (debounced) ─────────────────────────────────────────────────

  const fetchDetail = useCallback((item: SeerSearchResult) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDetailLoading(true)
      fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
        .then(r => r.json())
        .then(d => setDetail((d.detail as DiscoverDetail) ?? null))
        .catch(() => setDetail(null))
        .finally(() => setDetailLoading(false))
    }, 150)
  }, [])

  function activate(item: SeerSearchResult) {
    setActiveItem(item)
    if (!detail || activeItem?.id !== item.id || activeItem?.mediaType !== item.mediaType) {
      setDetail(null)
      fetchDetail(item)
    }
  }

  useEffect(() => {
    if (activeItem) fetchDetail(activeItem)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── keyboard navigation ──────────────────────────────────────────────────────

  const activateRef = useRef(activate)
  useEffect(() => { activateRef.current = activate })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const items = allItemsRef.current
      if (items.length === 0) return
      e.preventDefault()
      const currentId = activeItem ? `${activeItem.mediaType}-${activeItem.id}` : null
      const idx = items.findIndex(i => `${i.mediaType}-${i.id}` === currentId)
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, items.length - 1)
        : Math.max(idx - 1, 0)
      if (next !== idx) activateRef.current(items[next])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeItem])

  // ── load more ────────────────────────────────────────────────────────────────

  async function loadMore(mediaType: 'movie' | 'tv') {
    const page    = mediaType === 'movie' ? moviesPage + 1 : tvPage + 1
    const setMore = mediaType === 'movie' ? setMoviesMore : setTvMore
    setMore(true)
    try {
      const res  = await fetch(`/api/seer?action=discover&mediaType=${mediaType}&page=${page}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        if (mediaType === 'movie') { setMovies(prev => [...prev, ...data]); setMoviesPage(page) }
        else                       { setTvShows(prev => [...prev, ...data]); setTvPage(page) }
      }
    } finally {
      setMore(false)
    }
  }

  return (
    <>
      <div className="mt-6 pt-4 border-t border-[#1a1a2e]">
        <div className="font-mono text-xs text-[#6a9a7a] mb-3">
          const <span className="text-white text-sm font-medium uppercase tracking-widest">D1sc0ver</span> = {'{'}</div>

        {/* split pane — hidden below md */}
        <div className="hidden md:grid grid-cols-[1fr_500px] gap-4" style={{ height: 580 }}>

          {/* left: two stacked lists */}
          <div className="grid grid-rows-2 gap-0 border border-[#1a1a2e] overflow-hidden">
            <ListPanel
              label="trending :: tv"
              mediaType="tv"
              items={tvShows}
              loading={tvLoading}
              activeId={activeId}
              onActivate={activate}
              onInfo={setDrawerItem}
              onAdded={() => {}}
              onLoadMore={() => loadMore('tv')}
              loadingMore={tvMore}
            />
            <div className="border-t border-[#1a1a2e]" />
            <ListPanel
              label="trending :: movies"
              mediaType="movie"
              items={movies}
              loading={moviesLoading}
              activeId={activeId}
              onActivate={activate}
              onInfo={setDrawerItem}
              onAdded={() => {}}
              onLoadMore={() => loadMore('movie')}
              loadingMore={moviesMore}
            />
          </div>

          {/* right: preview pane */}
          <PreviewPane
            item={activeItem}
            detail={detail}
            detailLoading={detailLoading}
            onInfo={() => activeItem && setDrawerItem(activeItem)}
            onAdded={() => {}}
          />
        </div>

        {/* mobile fallback — poster card rows (TODO: design dedicated mobile layout) */}
        <div className="md:hidden font-mono text-xs text-[#555] px-1 py-4">
          // discover — open on desktop for full view
        </div>

        <div className="font-mono text-xs text-[#6a9a7a] mt-3">{'}'}</div>
      </div>

      <DiscoverDetailDrawer
        item={drawerItem}
        onClose={() => setDrawerItem(null)}
        onRequested={() => setDrawerItem(null)}
      />
    </>
  )
}
