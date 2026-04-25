'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SeerSearchResult, DiscoverDetail } from '@/types'
import Spinner from '@/components/Spinner'
import DiscoverDetailDrawer from '@/components/DiscoverDetailDrawer'
import MarqueeText from '@/components/MarqueeText'

const TMDB_W = (w: number, path: string) => `https://image.tmdb.org/t/p/w${w}${path}`
const PLEX_ORANGE = '#E5A00D'

const PROVIDER_MAP: Record<string, { abbr: string; color: string }> = {
  'netflix':             { abbr: 'NF', color: '#E50914' },
  'prime video':         { abbr: 'PV', color: '#00A8E0' },
  'amazon prime video':  { abbr: 'PV', color: '#00A8E0' },
  'disney plus':         { abbr: 'D+', color: '#113CCF' },
  'disney+':             { abbr: 'D+', color: '#113CCF' },
  'hulu':                { abbr: 'HU', color: '#1CE783' },
  'max':                 { abbr: 'MX', color: '#002BE7' },
  'hbo max':             { abbr: 'MX', color: '#002BE7' },
  'apple tv+':           { abbr: 'AT', color: '#888888' },
  'apple tv plus':       { abbr: 'AT', color: '#888888' },
  'peacock':             { abbr: 'PC', color: '#0066FF' },
  'paramount+':          { abbr: 'P+', color: '#0064FF' },
  'paramount plus':      { abbr: 'P+', color: '#0064FF' },
  'crunchyroll':         { abbr: 'CR', color: '#F47521' },
  'funimation':          { abbr: 'FN', color: '#410099' },
}

function providerInfo(name: string): { abbr: string; color: string } {
  return PROVIDER_MAP[name.toLowerCase()] ?? { abbr: name.slice(0, 2).toUpperCase(), color: '#666688' }
}

function tracked(item: SeerSearchResult): boolean {
  return item.mediaInfo != null && item.mediaInfo.status >= 2
}

interface Profile    { id: number; name: string }
interface RootFolder { path: string; freeSpace: number }
interface PlexFileInfo {
  file: string
  size: number
  videoResolution?: string
  videoCodec?: string
  audioCodec?: string
  bitrate?: number
  container?: string
}

function fmtFree(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function diskColor(bytes: number): string {
  const gb = bytes / 1024 ** 3
  if (gb < 50)  return '#f43f5e'
  if (gb < 200) return '#fbbf24'
  return '#4ade80'
}

function isUltraHD(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('ultra') || n.includes('2160') || n.includes('4k') || n.includes('uhd')
}

// ── list row (desktop) ─────────────────────────────────────────────────────────

function ListRow({ item, index, isActive, onHover, onClick, provider }: {
  item: SeerSearchResult
  index: number
  isActive: boolean
  onHover: () => void
  onClick: () => void
  provider?: { name: string; logo: string | null }
}) {
  const title = item.title ?? item.name ?? '—'
  const year  = (item.releaseDate ?? item.firstAirDate)?.slice(0, 4)
  const pInfo = provider ? providerInfo(provider.name) : null

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
      {pInfo && <span className="shrink-0 font-mono text-[10px]" style={{ color: pInfo.color }}>[{pInfo.abbr}]</span>}
      {year && <span className="text-[#888] shrink-0">{year}</span>}
    </div>
  )
}

// ── list panel (desktop) ───────────────────────────────────────────────────────

function ListPanel({ label, items, loading, activeId, onActivate, onHoverActivate, onLoadMore, loadingMore, providerMap }: {
  label: string
  items: SeerSearchResult[]
  loading: boolean
  activeId: string | null
  onActivate: (item: SeerSearchResult) => void
  onHoverActivate: (item: SeerSearchResult) => void
  onLoadMore: () => void
  loadingMore: boolean
  providerMap: Record<string, { name: string; logo: string | null }>
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
              onHover={() => onHoverActivate(item)}
              onClick={() => onActivate(item)}
              provider={providerMap[String(item.id)]}
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

type ReqState = 'idle' | 'picking' | 'submitting' | 'done'

function fmtSize(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(2)} TB`
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

function PreviewPane({ item, detail, detailLoading, profiles, folders, plexFileInfo, provider }: {
  item: SeerSearchResult | null
  detail: DiscoverDetail | null
  detailLoading: boolean
  profiles: Profile[]
  folders: RootFolder[]
  plexFileInfo: PlexFileInfo | null
  provider?: { name: string; logo: string | null }
}) {
  const [reqState,      setReqState]      = useState<ReqState>('idle')
  const [profileId,     setProfileId]     = useState<number | null>(null)
  const [rootFolder,    setRootFolder]    = useState<string | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(new Set())

  // Reset request state when item changes
  useEffect(() => {
    setReqState('idle')
    setSelectedSeasons(new Set())
  }, [item?.id, item?.mediaType])

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

  const totalSeasons = item?.mediaType === 'tv' ? (detail?.numberOfSeasons ?? 0) : 0

  function handleRequestClick() {
    if (!item) return
    if (item.mediaType === 'tv' && totalSeasons > 0) {
      // Pre-select all seasons
      setSelectedSeasons(new Set(Array.from({ length: totalSeasons }, (_, i) => i + 1)))
      setReqState('picking')
    } else {
      submit([])
    }
  }

  function toggleSeason(n: number) {
    setSelectedSeasons(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n); else next.add(n)
      return next
    })
  }

  function toggleAll() {
    if (selectedSeasons.size === totalSeasons) {
      setSelectedSeasons(new Set())
    } else {
      setSelectedSeasons(new Set(Array.from({ length: totalSeasons }, (_, i) => i + 1)))
    }
  }

  async function submit(seasonsArg?: number[]) {
    if (!item) return
    setReqState('submitting')
    const seasonsToSend = seasonsArg ?? Array.from(selectedSeasons).sort((a, b) => a - b)
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        mediaType: item.mediaType,
        mediaId: item.id,
        profileId,
        rootFolder,
        ...(item.mediaType === 'tv' && seasonsToSend.length > 0 ? { seasons: seasonsToSend } : {}),
      }),
    })
    setReqState('done')
  }

  return (
    <div className="flex flex-col border border-[#1a1a2e] overflow-hidden md:h-full md:overflow-hidden overflow-y-auto">

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
              {provider?.logo && (
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-[#6a9a7a] shrink-0 whitespace-nowrap w-[72px]">// stream</span>
                  <img
                    src={TMDB_W(45, provider.logo)}
                    alt={provider.name}
                    title={provider.name}
                    className="h-6 w-6 rounded-md object-cover shrink-0"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* overview */}
      <div className="md:flex-1 md:overflow-y-auto px-3 py-2 font-mono text-xs">
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
          <div className="space-y-1.5">
            <span
              className="inline-block px-2.5 py-1 text-xs font-mono"
              style={{ color: PLEX_ORANGE, background: 'rgba(229,160,13,0.12)', border: `1px solid rgba(229,160,13,0.35)` }}
            >
              ✦ in plex
            </span>
            {plexFileInfo && (
              <div className="space-y-0.5 font-mono text-xs">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {plexFileInfo.videoResolution && (
                    <span style={{ color: PLEX_ORANGE }}>{plexFileInfo.videoResolution.toUpperCase()}</span>
                  )}
                  {plexFileInfo.videoCodec && (
                    <span className="text-[#888]">{plexFileInfo.videoCodec.toUpperCase()}</span>
                  )}
                  {plexFileInfo.audioCodec && (
                    <span className="text-[#888]">{plexFileInfo.audioCodec.toUpperCase()}</span>
                  )}
                  {plexFileInfo.container && (
                    <span className="text-[#666]">.{plexFileInfo.container}</span>
                  )}
                  {plexFileInfo.size > 0 && (
                    <span className="text-[#888]">{fmtSize(plexFileInfo.size)}</span>
                  )}
                </div>
                {plexFileInfo.file && (
                  <p className="text-[#555] truncate" title={plexFileInfo.file}>{plexFileInfo.file}</p>
                )}
              </div>
            )}
          </div>
        )}
        {(isRequested || reqState === 'done') && (
          <span
            className="inline-block px-2.5 py-1 text-xs font-mono text-blue-400"
            style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)' }}
          >
            ✦ requested
          </span>
        )}
        {canRequest && (
          <div className="space-y-2">
            {/* season picker */}
            {reqState === 'picking' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#6a9a7a] text-xs font-mono">// select seasons</span>
                  <button onClick={toggleAll} className="btn-xs text-[#888]">
                    {selectedSeasons.size === totalSeasons ? '--none' : '--all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: totalSeasons }, (_, i) => i + 1).map(n => (
                    <button
                      key={n}
                      onClick={() => toggleSeason(n)}
                      className="font-mono text-xs px-2 py-0.5 border transition-colors"
                      style={{
                        borderColor: selectedSeasons.has(n) ? '#4a4a7a' : '#1a1a2e',
                        color:       selectedSeasons.has(n) ? '#fff'    : '#555',
                        background:  selectedSeasons.has(n) ? '#0d0d1a' : 'transparent',
                      }}
                    >
                      S{String(n).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* profile + folder dropdowns */}
            {reqState !== 'picking' && (
              <>
                {profiles.length > 0 && folders.length > 0 ? (
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
                        <option key={f.path} value={f.path}>{f.path}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[#555] text-xs">// loading options...</span>
                )}
                {(() => {
                  const sel = folders.find(f => f.path === rootFolder)
                  if (!sel) return null
                  const color = diskColor(sel.freeSpace)
                  const barPct = Math.min((sel.freeSpace / (4 * 1024 ** 3)) * 100, 100)
                  return (
                    <div>
                      <div className="flex justify-between font-mono text-xs mb-0.5">
                        <span className="text-[#555] truncate">{sel.path}</span>
                        <span style={{ color }}>{fmtFree(sel.freeSpace)} free</span>
                      </div>
                      <div className="h-1 bg-[#1a1a2e] overflow-hidden">
                        <div
                          className="h-full transition-all duration-500"
                          style={{ width: `${barPct}%`, background: color, boxShadow: `0 0 4px ${color}88` }}
                        />
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            <div className="flex gap-3">
              {reqState === 'picking' ? (
                <>
                  <button
                    onClick={() => submit()}
                    disabled={selectedSeasons.size === 0}
                    className="btn-xs text-blue-400 disabled:opacity-40"
                  >
                    {`--confirm (${selectedSeasons.size})`}
                  </button>
                  <button
                    onClick={() => setReqState('idle')}
                    className="btn-xs text-[#555]"
                  >
                    --cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleRequestClick}
                  disabled={reqState === 'submitting' || profiles.length === 0}
                  className="btn-xs text-blue-400 disabled:opacity-40"
                >
                  {reqState === 'submitting' ? '...' : '--request'}
                </button>
              )}
            </div>
          </div>
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
  const [providerMap, setProviderMap] = useState<Record<string, { name: string; logo: string | null }>>({})
  const fetchedProviderIds = useRef<Set<string>>(new Set())

  const [tab,           setTab]           = useState<'movie' | 'tv'>('movie')
  const [activeItem,    setActiveItem]    = useState<SeerSearchResult | null>(null)
  const [detail,        setDetail]        = useState<DiscoverDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [profiles,      setProfiles]      = useState<Profile[]>([])
  const [folders,       setFolders]       = useState<RootFolder[]>([])
  const [plexFileInfo,  setPlexFileInfo]  = useState<PlexFileInfo | null>(null)
  const [drawerItem,    setDrawerItem]    = useState<SeerSearchResult | null>(null)

  // Mobile: quick-request state
  const [mobileReqItem,    setMobileReqItem]    = useState<SeerSearchResult | null>(null)
  const [mobileSubmitting, setMobileSubmitting] = useState(false)
  const [mobileDone,       setMobileDone]       = useState<Set<string>>(new Set())

  const activeId       = activeItem ? `${activeItem.mediaType}-${activeItem.id}` : null
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabItemsRef    = useRef<SeerSearchResult[]>([])
  const listHoveredRef = useRef(false)

  useEffect(() => {
    tabItemsRef.current = tab === 'movie' ? movies : tvShows
  }, [tab, movies, tvShows])

  // ── initial fetch ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/seer?action=discover&mediaType=movie&page=1')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMovies(d.filter((i: SeerSearchResult) => !tracked(i))) })
      .finally(() => setMoviesLoading(false))
    fetch('/api/seer?action=discover&mediaType=tv&page=1')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTvShows(d.filter((i: SeerSearchResult) => !tracked(i))) })
      .finally(() => setTvLoading(false))
  }, [])

  // Batch-fetch providers for newly seen items (ref prevents re-fetching on page appends)
  useEffect(() => {
    const newItems = movies.filter(m => !fetchedProviderIds.current.has(`movie-${m.id}`))
    if (newItems.length === 0) return
    newItems.forEach(m => fetchedProviderIds.current.add(`movie-${m.id}`))
    const ids = newItems.map(m => m.id).join(',')
    fetch(`/api/seer?action=providers&ids=${ids}&mediaType=movie`)
      .then(r => r.json())
      .then((data: { id: number; provider: string | null; logoPath: string | null }[]) => {
        setProviderMap(prev => {
          const next = { ...prev }
          for (const { id, provider, logoPath } of data) {
            if (provider) next[String(id)] = { name: provider, logo: logoPath }
          }
          return next
        })
      })
      .catch(() => {})
  }, [movies])

  useEffect(() => {
    const newItems = tvShows.filter(t => !fetchedProviderIds.current.has(`tv-${t.id}`))
    if (newItems.length === 0) return
    newItems.forEach(t => fetchedProviderIds.current.add(`tv-${t.id}`))
    const ids = newItems.map(t => t.id).join(',')
    fetch(`/api/seer?action=providers&ids=${ids}&mediaType=tv`)
      .then(r => r.json())
      .then((data: { id: number; provider: string | null; logoPath: string | null }[]) => {
        setProviderMap(prev => {
          const next = { ...prev }
          for (const { id, provider, logoPath } of data) {
            if (provider) next[String(id)] = { name: provider, logo: logoPath }
          }
          return next
        })
      })
      .catch(() => {})
  }, [tvShows])

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
          setPlexFileInfo(d.plexFileInfo ?? null)
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
      setPlexFileInfo(null)
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
        const fresh = data.filter((i: SeerSearchResult) => !tracked(i))
        if (mediaType === 'movie') { setMovies(prev => [...prev, ...fresh]); setMoviesPage(page) }
        else                       { setTvShows(prev => [...prev, ...fresh]); setTvPage(page) }
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
          <div
            className="flex flex-col border border-[#1a1a2e] overflow-hidden"
            onMouseEnter={() => { listHoveredRef.current = true }}
            onMouseLeave={() => { listHoveredRef.current = false }}
          >
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
                onHoverActivate={(item) => { if (listHoveredRef.current) activate(item) }}
                onLoadMore={() => loadMore('movie')}
                loadingMore={moviesMore}
                providerMap={providerMap}
              />
            ) : (
              <ListPanel
                label="trending :: tv"
                items={tvShows}
                loading={tvLoading}
                activeId={activeId}
                onActivate={activate}
                onHoverActivate={(item) => { if (listHoveredRef.current) activate(item) }}
                onLoadMore={() => loadMore('tv')}
                loadingMore={tvMore}
                providerMap={providerMap}
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
            plexFileInfo={plexFileInfo}
            provider={activeItem ? providerMap[String(activeItem.id)] : undefined}
          />
        </div>

        {/* mobile layout: list on top, preview below */}
        <div className="md:hidden flex flex-col gap-2">

          {/* list */}
          <div className="flex flex-col border border-[#1a1a2e] overflow-hidden" style={{ height: 220 }}>
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
              ) : (
                <>
                  {(tab === 'movie' ? movies : tvShows).map((item) => (
                    <div
                      key={`${item.mediaType}-${item.id}`}
                      onClick={() => activate(item)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 cursor-default select-none border-l-2 font-mono text-xs transition-colors ${
                        activeId === `${item.mediaType}-${item.id}`
                          ? 'border-[#4a4a7a] bg-[#0d0d1a] text-white'
                          : 'border-transparent text-[#bbb]'
                      }`}
                    >
                      <span className="flex-1 truncate">{item.title ?? item.name}</span>
                      {providerMap[String(item.id)] && (() => {
                        const p = providerInfo(providerMap[String(item.id)].name)
                        return <span className="shrink-0 font-mono text-[10px]" style={{ color: p.color }}>[{p.abbr}]</span>
                      })()}
                      {(item.releaseDate ?? item.firstAirDate) && (
                        <span className="text-[#888] shrink-0 text-xs">
                          {(item.releaseDate ?? item.firstAirDate)!.slice(0, 4)}
                        </span>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => loadMore(tab)}
                    disabled={tab === 'movie' ? moviesMore : tvMore}
                    className="w-full text-center font-mono text-xs text-[#555] hover:text-[#888] py-2 border-t border-[#0f0f1a] disabled:opacity-40"
                  >
                    {(tab === 'movie' ? moviesMore : tvMore) ? '...' : '--more'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* preview pane — same component as desktop */}
          <PreviewPane
            item={activeItem}
            detail={detail}
            detailLoading={detailLoading}
            profiles={profiles}
            folders={folders}
            plexFileInfo={plexFileInfo}
            provider={activeItem ? providerMap[String(activeItem.id)] : undefined}
          />
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
