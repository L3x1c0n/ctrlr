'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SeerSearchResult, DiscoverDetail } from '@/types'
import Spinner from '@/components/Spinner'
import DiscoverDetailDrawer from '@/components/DiscoverDetailDrawer'
import MarqueeText from '@/components/MarqueeText'

const TMDB_W = (w: number, path: string) => `https://image.tmdb.org/t/p/w${w}${path}`
const PLEX_ORANGE = '#E5A00D'

interface Profile    { id: number; name: string }
interface RootFolder { path: string; freeSpace: number }

function fmtFree(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(0)}GB`
  return `${(bytes / 1024 ** 2).toFixed(0)}MB`
}

function isUltraHD(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('ultra') || n.includes('2160') || n.includes('4k') || n.includes('uhd')
}

// ── list row (desktop) ─────────────────────────────────────────────────────────

function ListRow({ item, index, isActive, onHover, onClick }: {
  item: SeerSearchResult
  index: number
  isActive: boolean
  onHover: () => void
  onClick: () => void
}) {
  const title = item.title ?? item.name ?? '—'
  const year  = (item.releaseDate ?? item.firstAirDate)?.slice(0, 4)

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
      <span className="text-[#666] w-4 tabular-nums text-right shrink-0">{index + 1}</span>
      <span className="flex-1 truncate">{title}</span>
      {year && <span className="text-[#888] shrink-0">{year}</span>}
    </div>
  )
}

// ── list panel (desktop) ───────────────────────────────────────────────────────

function ListPanel({ label, items, loading, activeId, onActivate, onLoadMore, loadingMore }: {
  label: string
  items: SeerSearchResult[]
  loading: boolean
  activeId: string | null
  onActivate: (item: SeerSearchResult) => void
  onLoadMore: () => void
  loadingMore: boolean
}) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="font-mono text-xs text-[#6a9a7a] px-3 py-1.5 border-b border-[#1a1a2e] shrink-0">
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
            />
          ))
        }
        {!loading && items.length > 0 && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full text-center font-mono text-xs text-[#555] hover:text-[#888] py-2 border-t border-[#0f0f1a] disabled:opacity-40"
          >
            {loadingMore ? '...' : '--more'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── meta row ───────────────────────────────────────────────────────────────────

function MetaRow({ label, value, lines = 1 }: { label: string; value: string; lines?: 1 | 2 }) {
  return (
    <p className="flex gap-2 overflow-hidden">
      <span className="text-[#6a9a7a] shrink-0 whitespace-nowrap w-[72px]">// {label}</span>
      <span className={`text-[#ccc] min-w-0 ${lines === 2 ? 'line-clamp-2' : 'truncate'}`}>{value}</span>
    </p>
  )
}

// ── preview pane ───────────────────────────────────────────────────────────────

type ReqState = 'idle' | 'form' | 'submitting' | 'done'

function PreviewPane({ item, detail, detailLoading, profiles, folders }: {
  item: SeerSearchResult | null
  detail: DiscoverDetail | null
  detailLoading: boolean
  profiles: Profile[]
  folders: RootFolder[]
}) {
  const [reqState,   setReqState]   = useState<ReqState>('idle')
  const [profileId,  setProfileId]  = useState<number | null>(null)
  const [rootFolder, setRootFolder] = useState<string | null>(null)

  // Reset request state when item changes
  useEffect(() => { setReqState('idle') }, [item?.id, item?.mediaType])

  // Set defaults when profiles/folders arrive
  useEffect(() => {
    const def = profiles.find(p => isUltraHD(p.name)) ?? profiles[0]
    setProfileId(def?.id ?? null)
    setRootFolder(folders[0]?.path ?? null)
  }, [profiles, folders])

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

  const inPlex      = status === 5
  const isRequested = status != null && status >= 2 && status <= 4
  const canRequest  = !inPlex && !isRequested && reqState !== 'done'

  async function submit() {
    if (!item) return
    setReqState('submitting')
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', mediaType: item.mediaType, mediaId: item.id, profileId, rootFolder }),
    })
    setReqState('done')
  }

  return (
    <div className="flex flex-col h-full border border-[#1a1a2e] overflow-hidden">

      {/* backdrop */}
      <div className="relative shrink-0 w-full" style={{ aspectRatio: '16/9' }}>
        {backdrop
          ? <img src={TMDB_W(780, backdrop)} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(2px) brightness(0.8)' }} />
          : <div className="w-full h-full bg-[#080810]" />
        }
        <div className="absolute inset-0 bg-[#0A0A0F]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/20 to-transparent" />

        {poster && (
          <img
            src={TMDB_W(185, poster)}
            alt=""
            className="absolute bottom-0 left-0"
            style={{
              width: 125, height: 188, objectFit: 'cover',
              boxShadow: '4px 0 24px rgba(0,0,0,0.85), 0 -4px 24px rgba(0,0,0,0.6)',
              outline: '1px solid rgba(255,255,255,0.12)',
              outlineOffset: '-1px',
            }}
          />
        )}

        <div
          className="absolute flex flex-col overflow-hidden"
          style={{ bottom: 0, left: poster ? 137 : 12, right: 8, height: 188, paddingTop: 4 }}
        >
          <p className="text-white text-sm font-mono font-medium leading-tight line-clamp-2 shrink-0">{title}</p>
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5 mb-1.5 font-mono text-xs text-[#888] shrink-0">
            {year    && <span>{year}</span>}
            {runtime && <span>{runtime}m</span>}
            {seasons && <span>{seasons} seasons</span>}
            {rating != null && rating > 0 && <span>★ {rating.toFixed(1)}</span>}
          </div>
          {detailLoading && !detail ? (
            <span className="text-[#555] font-mono text-xs">// loading...</span>
          ) : (
            <div className="space-y-0.5 font-mono text-xs overflow-hidden">
              {genres   && <MetaRow label="genre"  value={genres}   />}
              {director && <MetaRow label="dir"    value={director} />}
              {cast     && <MetaRow label="cast"   value={cast}   lines={2} />}
              {studio   && <MetaRow label="studio" value={studio} lines={2} />}
            </div>
          )}
        </div>
      </div>

      {/* overview */}
      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
        {overview ? (
          <>
            <p className="text-[#6a9a7a] mb-1">{'/*'}</p>
            <p className="text-[#999] leading-relaxed pl-2">{overview}</p>
            <p className="text-[#6a9a7a] mt-1">{'*/'}</p>
          </>
        ) : (
          <span className="text-[#444]">// no synopsis</span>
        )}
      </div>

      {/* status / request area */}
      <div className="shrink-0 border-t border-[#1a1a2e] px-3 py-2.5 font-mono text-xs">
        {inPlex && (
          <span
            className="inline-block px-2.5 py-1 text-xs font-mono"
            style={{ color: PLEX_ORANGE, background: 'rgba(229,160,13,0.12)', border: `1px solid rgba(229,160,13,0.35)` }}
          >
            ✦ in plex
          </span>
        )}
        {(isRequested || reqState === 'done') && (
          <span
            className="inline-block px-2.5 py-1 text-xs font-mono text-blue-400"
            style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)' }}
          >
            ✦ requested
          </span>
        )}
        {canRequest && reqState === 'idle' && (
          <button onClick={() => setReqState('form')} className="btn-xs text-blue-400">
            --request
          </button>
        )}
        {canRequest && reqState === 'form' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={profileId ?? ''}
                onChange={e => setProfileId(Number(e.target.value))}
                className="flex-1 bg-[#0d0d1a] border border-[#2a2a4a] text-white px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#4a4a7a] min-w-0"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{isUltraHD(p.name) ? ' ✦' : ''}</option>
                ))}
              </select>
              <select
                value={rootFolder ?? ''}
                onChange={e => setRootFolder(e.target.value)}
                className="flex-1 bg-[#0d0d1a] border border-[#2a2a4a] text-white px-2 py-1 text-xs font-mono focus:outline-none focus:border-[#4a4a7a] min-w-0"
              >
                {folders.map(f => (
                  <option key={f.path} value={f.path}>{f.path} ({fmtFree(f.freeSpace)} free)</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={submit} className="btn-xs text-blue-400">--confirm</button>
              <button onClick={() => setReqState('idle')} className="btn-xs text-[#555]">--cancel</button>
            </div>
          </div>
        )}
        {canRequest && reqState === 'submitting' && (
          <span className="text-[#555] text-xs">// submitting...</span>
        )}
      </div>
    </div>
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

  const [tab,           setTab]           = useState<'movie' | 'tv'>('movie')
  const [activeItem,    setActiveItem]    = useState<SeerSearchResult | null>(null)
  const [detail,        setDetail]        = useState<DiscoverDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [profiles,      setProfiles]      = useState<Profile[]>([])
  const [folders,       setFolders]       = useState<RootFolder[]>([])
  const [drawerItem,    setDrawerItem]    = useState<SeerSearchResult | null>(null)

  // Mobile: quick-request state
  const [mobileReqItem,    setMobileReqItem]    = useState<SeerSearchResult | null>(null)
  const [mobileSubmitting, setMobileSubmitting] = useState(false)
  const [mobileDone,       setMobileDone]       = useState<Set<string>>(new Set())

  const activeId    = activeItem ? `${activeItem.mediaType}-${activeItem.id}` : null
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabItemsRef = useRef<SeerSearchResult[]>([])

  useEffect(() => {
    tabItemsRef.current = tab === 'movie' ? movies : tvShows
  }, [tab, movies, tvShows])

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

  useEffect(() => {
    if (!activeItem && movies.length > 0) setActiveItem(movies[0])
  }, [movies, activeItem])

  // ── detail fetch (debounced) — also captures profiles + folders ──────────────

  const fetchDetail = useCallback((item: SeerSearchResult) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDetailLoading(true)
      fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
        .then(r => r.json())
        .then(d => {
          setDetail((d.detail as DiscoverDetail) ?? null)
          const sortedFolders = [...(d.rootFolders ?? [])].sort((a: RootFolder, b: RootFolder) => b.freeSpace - a.freeSpace)
          setProfiles(d.profiles ?? [])
          setFolders(sortedFolders)
        })
        .catch(() => setDetail(null))
        .finally(() => setDetailLoading(false))
    }, 150)
  }, [])

  function activate(item: SeerSearchResult) {
    setActiveItem(item)
    if (!detail || activeItem?.id !== item.id || activeItem?.mediaType !== item.mediaType) {
      setDetail(null)
      setProfiles([])
      setFolders([])
      fetchDetail(item)
    }
  }

  useEffect(() => {
    if (activeItem) fetchDetail(activeItem)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── tab switch ───────────────────────────────────────────────────────────────

  function switchTab(t: 'movie' | 'tv') {
    setTab(t)
    const firstItem = t === 'movie' ? movies[0] : tvShows[0]
    if (firstItem) activate(firstItem)
  }

  // ── keyboard navigation ──────────────────────────────────────────────────────

  const activateRef = useRef(activate)
  useEffect(() => { activateRef.current = activate })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const items = tabItemsRef.current
      if (items.length === 0) return
      e.preventDefault()
      const currentId = activeItem ? `${activeItem.mediaType}-${activeItem.id}` : null
      const idx  = items.findIndex(i => `${i.mediaType}-${i.id}` === currentId)
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

  // ── mobile quick-request ─────────────────────────────────────────────────────

  async function mobileRequest(item: SeerSearchResult) {
    setMobileReqItem(item)
    setMobileSubmitting(true)
    try {
      const res = await fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
      const d   = await res.json()
      const sortedFolders: RootFolder[] = [...(d.rootFolders ?? [])].sort((a, b) => b.freeSpace - a.freeSpace)
      const profs: Profile[] = d.profiles ?? []
      const defaultProfile = profs.find(p => isUltraHD(p.name)) ?? profs[0]
      await fetch('/api/seer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          mediaType: item.mediaType,
          mediaId: item.id,
          profileId: defaultProfile?.id ?? null,
          rootFolder: sortedFolders[0]?.path ?? null,
        }),
      })
      setMobileDone(prev => new Set([...prev, `${item.mediaType}-${item.id}`]))
    } finally {
      setMobileSubmitting(false)
      setMobileReqItem(null)
    }
  }

  return (
    <>
      <div className="mt-6 pt-4 border-t border-[#1a1a2e]">
        <div className="font-mono text-xs text-[#6a9a7a] mb-3">
          const <span className="text-white text-sm font-medium uppercase tracking-widest">D1sc0ver</span> = {'{'}
        </div>

        {/* desktop split pane */}
        <div className="hidden md:grid grid-cols-[1fr_500px] gap-4" style={{ height: 580 }}>

          {/* left: tabbed list */}
          <div className="flex flex-col border border-[#1a1a2e] overflow-hidden">
            <div className="flex shrink-0 border-b border-[#1a1a2e]">
              {(['movie', 'tv'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`px-4 py-1.5 font-mono text-xs border-r border-[#1a1a2e] transition-colors ${
                    tab === t ? 'text-white bg-[#0d0d1a]' : 'text-[#555] hover:text-[#888]'
                  }`}
                >
                  // {t === 'movie' ? 'movies' : 'tv'}
                </button>
              ))}
            </div>
            {tab === 'movie' ? (
              <ListPanel
                label="trending :: movies"
                items={movies}
                loading={moviesLoading}
                activeId={activeId}
                onActivate={activate}
                onLoadMore={() => loadMore('movie')}
                loadingMore={moviesMore}
              />
            ) : (
              <ListPanel
                label="trending :: tv"
                items={tvShows}
                loading={tvLoading}
                activeId={activeId}
                onActivate={activate}
                onLoadMore={() => loadMore('tv')}
                loadingMore={tvMore}
              />
            )}
          </div>

          {/* right: preview pane */}
          <PreviewPane
            item={activeItem}
            detail={detail}
            detailLoading={detailLoading}
            profiles={profiles}
            folders={folders}
          />
        </div>

        {/* mobile layout */}
        <div className="md:hidden grid gap-2" style={{ gridTemplateColumns: '1fr 140px', height: 540 }}>

          {/* left: tabbed list */}
          <div className="flex flex-col border border-[#1a1a2e] overflow-hidden">
            <div className="flex shrink-0 border-b border-[#1a1a2e]">
              {(['movie', 'tv'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`px-3 py-1.5 font-mono text-xs border-r border-[#1a1a2e] transition-colors ${
                    tab === t ? 'text-white bg-[#0d0d1a]' : 'text-[#555] hover:text-[#888]'
                  }`}
                >
                  // {t === 'movie' ? 'movies' : 'tv'}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto flex-1">
              {(tab === 'movie' ? moviesLoading : tvLoading) ? (
                <div className="p-3"><Spinner /></div>
              ) : (tab === 'movie' ? movies : tvShows).map((item) => (
                <div
                  key={`${item.mediaType}-${item.id}`}
                  onClick={() => activate(item)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 cursor-default select-none border-l-2 font-mono text-xs transition-colors ${
                    activeId === `${item.mediaType}-${item.id}`
                      ? 'border-[#4a4a7a] bg-[#0d0d1a] text-white'
                      : 'border-transparent text-[#bbb]'
                  }`}
                >
                  <MarqueeText className="flex-1 min-w-0">{item.title ?? item.name}</MarqueeText>
                  {(item.releaseDate ?? item.firstAirDate) && (
                    <span className="text-[#888] shrink-0 text-xs">
                      {(item.releaseDate ?? item.firstAirDate)!.slice(0, 4)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* right: poster + meta + request */}
          <div className="flex flex-col border border-[#1a1a2e] overflow-hidden">
            <div className="relative w-full shrink-0 overflow-hidden bg-[#080810]" style={{ aspectRatio: '2/3' }}>
              {activeItem?.posterPath && (
                <img
                  src={TMDB_W(185, activeItem.posterPath)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ filter: 'blur(10px) brightness(0.35)', transform: 'scale(1.15)' }}
                />
              )}
              {activeItem?.posterPath ? (
                <img
                  src={TMDB_W(185, activeItem.posterPath)}
                  alt=""
                  className="absolute top-0 left-1/2 -translate-x-1/2"
                  style={{ width: 90, height: 135, objectFit: 'cover', outline: '1px solid rgba(255,255,255,0.1)', outlineOffset: '-1px' }}
                />
              ) : (
                <div className="absolute inset-0" />
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-1 pt-1 pb-1 font-mono text-xs space-y-1.5">
              {detail?.credits?.crew?.find(c => c.job === 'Director') && (
                <p>
                  <span className="text-[#6a9a7a]">// dir</span>
                  <br />
                  <span className="text-[#ccc]">{detail.credits!.crew!.find(c => c.job === 'Director')!.name}</span>
                </p>
              )}
              {(detail?.overview ?? activeItem?.overview) && (
                <p className="text-[#999] leading-relaxed">{detail?.overview ?? activeItem?.overview}</p>
              )}
            </div>
            {/* mobile request button */}
            {activeItem && (() => {
              const st  = detail?.mediaInfo?.status ?? activeItem.mediaInfo?.status
              const key = `${activeItem.mediaType}-${activeItem.id}`
              if (st === 5)                          return <div className="px-2 py-2 border-t border-[#1a1a2e]"><span className="font-mono text-xs" style={{ color: PLEX_ORANGE }}>✦ plex</span></div>
              if ((st != null && st >= 2) || mobileDone.has(key)) return <div className="px-2 py-2 border-t border-[#1a1a2e]"><span className="font-mono text-xs text-blue-400">✦ req&apos;d</span></div>
              const isThisReq = mobileReqItem?.id === activeItem.id && mobileReqItem?.mediaType === activeItem.mediaType
              return (
                <div className="px-2 py-2 border-t border-[#1a1a2e]">
                  <button
                    onClick={() => mobileRequest(activeItem)}
                    disabled={mobileSubmitting}
                    className="btn-xs text-blue-400 disabled:opacity-40"
                  >
                    {isThisReq && mobileSubmitting ? '...' : '--req'}
                  </button>
                </div>
              )
            })()}
          </div>
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
