'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SeerSearchResult, DiscoverDetail } from '@/types'
import Spinner from '@/components/Spinner'
import DiscoverDetailDrawer from '@/components/DiscoverDetailDrawer'

const TMDB_W = (w: number, path: string) => `https://image.tmdb.org/t/p/w${w}${path}`

const PROVIDER_MAP: Record<string, { abbr: string; color: string }> = {
  'netflix':             { abbr: 'NF', color: '#E50914' },
  'prime video':         { abbr: 'PV', color: '#00A8E0' },
  'amazon prime video':  { abbr: 'PV', color: '#00A8E0' },
  'disney plus':         { abbr: 'D+', color: '#113CCF' },
  'disney+':             { abbr: 'D+', color: '#113CCF' },
  'hulu':                { abbr: 'HU', color: '#1CE783' },
  'max':                 { abbr: 'MX', color: '#002BE7' },
  'hbo max':             { abbr: 'MX', color: '#002BE7' },
  'apple tv+':           { abbr: 'AT', color: '#555555' },
  'apple tv plus':       { abbr: 'AT', color: '#555555' },
  'peacock':             { abbr: 'PC', color: '#0066FF' },
  'paramount+':          { abbr: 'P+', color: '#0064FF' },
  'paramount plus':      { abbr: 'P+', color: '#0064FF' },
  'crunchyroll':         { abbr: 'CR', color: '#F47521' },
  'funimation':          { abbr: 'FN', color: '#410099' },
}

function providerInfo(name: string): { abbr: string; color: string } {
  return PROVIDER_MAP[name.toLowerCase()] ?? { abbr: name.slice(0, 2).toUpperCase(), color: '#96969a' }
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
  if (gb < 50)  return '#CC1A1A'
  if (gb < 200) return '#D4A800'
  return '#1A9A3C'
}

function isUltraHD(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('ultra') || n.includes('2160') || n.includes('4k') || n.includes('uhd')
}

// ── list row ───────────────────────────────────────────────────────────────────

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
      className="flex items-center gap-2 px-3 py-1.5 cursor-default select-none border-l-2 text-xs transition-colors"
      style={{
        borderLeftColor: isActive ? 'var(--s-seer)' : 'transparent',
        background:      isActive ? 'var(--bg-inset)' : 'transparent',
        color:           isActive ? 'var(--text)' : 'var(--text-dim)',
      }}
    >
      <span className="w-4 tabular-nums text-right shrink-0" style={{ color: 'var(--dimmer)' }}>{index + 1}</span>
      <span className="flex-1 truncate">{title}</span>
      {pInfo && <span className="shrink-0 text-[10px]" style={{ color: pInfo.color }}>[{pInfo.abbr}]</span>}
      {year  && <span className="shrink-0" style={{ color: 'var(--dim)' }}>{year}</span>}
    </div>
  )
}

// ── list panel ─────────────────────────────────────────────────────────────────

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
      <div className="text-[10px] uppercase tracking-widest px-3 py-1.5 shrink-0" style={{ color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
        {label}
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
            className="w-full text-center text-xs py-2 disabled:opacity-40 transition-colors"
            style={{ color: 'var(--dim)', borderTop: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-dim)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}
          >
            {loadingMore ? '...' : 'more'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── meta row ───────────────────────────────────────────────────────────────────

function SpecRow({ label, value, lines = 1 }: { label: string; value: string; lines?: 1 | 2 }) {
  return (
    <div className="flex gap-3 px-4 py-[5px] text-xs" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="shrink-0 w-10 uppercase tracking-wider font-medium" style={{ fontSize: 9, color: 'var(--dimmer)' }}>{label}</span>
      <span className={`min-w-0 ${lines === 2 ? 'line-clamp-2' : 'truncate'}`} style={{ color: 'var(--text-dim)' }}>{value}</span>
    </div>
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
  const [reqState,        setReqState]        = useState<ReqState>('idle')
  const [profileId,       setProfileId]       = useState<number | null>(null)
  const [rootFolder,      setRootFolder]      = useState<string | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(new Set())

  useEffect(() => {
    setReqState('idle')
    setSelectedSeasons(new Set())
  }, [item?.id, item?.mediaType])

  useEffect(() => {
    const def = profiles.find(p => isUltraHD(p.name)) ?? profiles[0]
    setProfileId(def?.id ?? null)
    setRootFolder(folders[0]?.path ?? null)
  }, [profiles, folders])

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ border: '1px solid var(--border)', color: 'var(--dimmer)' }}>
        Select a title
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

  const pInfo = provider ? providerInfo(provider.name) : null

  return (
    <div className="flex flex-col overflow-hidden md:h-full md:overflow-hidden overflow-y-auto" style={{ border: '1px solid var(--border)' }}>

      {/* poster + info split */}
      <div className="flex shrink-0">
        {/* poster */}
        <div className="shrink-0" style={{ width: 185, height: 278, borderRight: '1px solid var(--border)', background: 'var(--bg-inset)', overflow: 'hidden' }}>
          {poster && <img src={TMDB_W(185, poster)} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>

        {/* right panel */}
        <div className="flex flex-col min-w-0 flex-1" style={{ height: 278 }}>
          {/* title */}
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>{title}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
              {[year, runtime ? `${runtime}m` : null, seasons ? `${seasons} seasons` : null, rating && rating > 0 ? `★ ${rating.toFixed(1)}` : null].filter(Boolean).join(' · ')}
            </p>
          </div>

          {/* body: specs or request form */}
          <div className="flex-1 overflow-hidden flex flex-col justify-center">
            {reqState === 'idle' || reqState === 'done' ? (
              <>
                {detailLoading && !detail
                  ? <p className="px-4 text-xs" style={{ color: 'var(--dimmer)' }}>loading...</p>
                  : <>
                      {genres   && <SpecRow label="Genre"  value={genres} />}
                      {director && <SpecRow label="Dir"    value={director} />}
                      {cast     && <SpecRow label="Cast"   value={cast} lines={2} />}
                      {studio   && <SpecRow label="Studio" value={studio} />}
                    </>
                }
              </>
            ) : reqState === 'picking' ? (
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Select seasons</span>
                  <button onClick={toggleAll} className="btn-xs">{selectedSeasons.size === totalSeasons ? 'none' : 'all'}</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: totalSeasons }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => toggleSeason(n)} className="text-xs px-2 py-0.5 border transition-colors"
                      style={{ borderColor: selectedSeasons.has(n) ? 'var(--border-hi)' : 'var(--border)', color: selectedSeasons.has(n) ? 'var(--text)' : 'var(--dim)', background: selectedSeasons.has(n) ? 'var(--bg-inset)' : 'transparent' }}>
                      S{String(n).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* submitting/request form */
              <div className="px-4 py-3 space-y-2.5">
                {profiles.length > 0 && folders.length > 0 ? (
                  <>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--dim)' }}>Quality</p>
                      <select value={profileId ?? ''} onChange={e => setProfileId(Number(e.target.value))}
                        className="w-full px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hi)', color: 'var(--text)' }}>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}{isUltraHD(p.name) ? ' ✦' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--dim)' }}>Location</p>
                      <select value={rootFolder ?? ''} onChange={e => setRootFolder(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-hi)', color: 'var(--text)' }}>
                        {folders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
                      </select>
                    </div>
                    {(() => {
                      const sel = folders.find(f => f.path === rootFolder)
                      if (!sel) return null
                      const color  = diskColor(sel.freeSpace)
                      const barPct = Math.min((sel.freeSpace / (4 * 1024 ** 3)) * 100, 100)
                      return (
                        <div>
                          <div className="flex justify-between text-[9px] mb-1" style={{ color: 'var(--dim)' }}>
                            <span className="truncate">{sel.path}</span>
                            <span className="shrink-0 ml-2" style={{ color }}>{fmtFree(sel.freeSpace)} free</span>
                          </div>
                          <div className="overflow-hidden" style={{ height: 3, background: 'var(--border-hi)' }}>
                            <div style={{ width: `${barPct}%`, height: '100%', background: color, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--dimmer)' }}>Loading options...</p>
                )}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
            {/* status badges */}
            {inPlex && (
              <span className="text-[10px] px-2 py-0.5" style={{ color: 'var(--s-dl)', background: 'rgba(232,104,10,0.10)', border: '1px solid rgba(232,104,10,0.25)' }}>
                In Plex
              </span>
            )}
            {(isRequested || reqState === 'done') && (
              <span className="text-[10px] px-2 py-0.5" style={{ color: 'var(--s-sonarr)', background: 'rgba(43,108,181,0.10)', border: '1px solid rgba(43,108,181,0.25)' }}>
                Requested
              </span>
            )}
            {/* provider */}
            {pInfo && (
              <span className="text-[10px] font-medium" style={{ color: pInfo.color }}>{pInfo.abbr}</span>
            )}
            <span className="flex-1" />
            {/* actions */}
            {reqState === 'picking' && (
              <>
                <button onClick={() => setReqState('idle')} className="btn-xs">cancel</button>
                <button onClick={() => submit()} disabled={selectedSeasons.size === 0} className="btn-xs disabled:opacity-40" style={{ color: 'var(--s-sonarr)' }}>
                  confirm ({selectedSeasons.size})
                </button>
              </>
            )}
            {reqState === 'idle' && canRequest && (
              <button onClick={handleRequestClick} disabled={profiles.length === 0} className="btn-xs disabled:opacity-40" style={{ color: 'var(--s-sonarr)' }}>
                request
              </button>
            )}
            {reqState === 'submitting' && (
              <>
                <button onClick={() => setReqState('idle')} className="btn-xs">cancel</button>
                <button disabled className="btn-xs opacity-40" style={{ color: 'var(--s-sonarr)' }}>...</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* plex file info */}
      {inPlex && plexFileInfo && (
        <div className="px-4 py-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5" style={{ borderTop: '1px solid var(--border)', color: 'var(--dim)' }}>
          {plexFileInfo.videoResolution && <span style={{ color: 'var(--s-dl)' }}>{plexFileInfo.videoResolution.toUpperCase()}</span>}
          {plexFileInfo.videoCodec  && <span>{plexFileInfo.videoCodec.toUpperCase()}</span>}
          {plexFileInfo.audioCodec  && <span>{plexFileInfo.audioCodec.toUpperCase()}</span>}
          {plexFileInfo.container   && <span style={{ color: 'var(--dimmer)' }}>.{plexFileInfo.container}</span>}
          {plexFileInfo.size > 0    && <span>{fmtSize(plexFileInfo.size)}</span>}
          {plexFileInfo.file && <p className="w-full truncate" style={{ color: 'var(--dimmer)' }} title={plexFileInfo.file}>{plexFileInfo.file}</p>}
        </div>
      )}

      {/* overview */}
      <div className="md:flex-1 md:overflow-y-auto px-4 py-3 text-xs leading-relaxed" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-dim)' }}>
        {overview ?? <span style={{ color: 'var(--dimmer)' }}>No synopsis available</span>}
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

  function switchTab(t: 'movie' | 'tv') {
    setTab(t)
    const firstItem = t === 'movie' ? movies[0] : tvShows[0]
    if (firstItem) activate(firstItem)
  }

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
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-label" style={{ color: 'var(--s-seer)' }}>Discover</h2>
        </div>

        {/* desktop split pane */}
        <div className="hidden md:grid grid-cols-[1fr_500px] gap-4" style={{ height: 580 }}>

          {/* left: tabbed list */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
            onMouseEnter={() => { listHoveredRef.current = true }}
            onMouseLeave={() => { listHoveredRef.current = false }}
          >
            <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              {(['movie', 'tv'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="px-4 py-1.5 text-xs transition-colors"
                  style={{
                    borderRight:  '1px solid var(--border)',
                    borderBottom: tab === t ? '2px solid var(--s-seer)' : '2px solid transparent',
                    color:        tab === t ? 'var(--text)' : 'var(--dim)',
                    marginBottom: '-1px',
                  }}
                >
                  {t === 'movie' ? 'Movies' : 'TV'}
                </button>
              ))}
            </div>
            {tab === 'movie' ? (
              <ListPanel
                label="Trending · Movies"
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
                label="Trending · TV"
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

        {/* mobile layout */}
        <div className="md:hidden flex flex-col gap-2">
          <PreviewPane
            item={activeItem}
            detail={detail}
            detailLoading={detailLoading}
            profiles={profiles}
            folders={folders}
            plexFileInfo={plexFileInfo}
            provider={activeItem ? providerMap[String(activeItem.id)] : undefined}
          />

          <div className="flex flex-col overflow-hidden" style={{ border: '1px solid var(--border)', height: 220 }}>
            <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              {(['movie', 'tv'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="px-3 py-1.5 text-xs transition-colors"
                  style={{
                    borderRight:  '1px solid var(--border)',
                    borderBottom: tab === t ? '2px solid var(--s-seer)' : '2px solid transparent',
                    color:        tab === t ? 'var(--text)' : 'var(--dim)',
                    marginBottom: '-1px',
                  }}
                >
                  {t === 'movie' ? 'Movies' : 'TV'}
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
                      className="flex items-center gap-1.5 px-2 py-1.5 cursor-default select-none border-l-2 text-xs transition-colors"
                      style={{
                        borderLeftColor: activeId === `${item.mediaType}-${item.id}` ? 'var(--s-seer)' : 'transparent',
                        background:      activeId === `${item.mediaType}-${item.id}` ? 'var(--bg-inset)' : 'transparent',
                        color:           activeId === `${item.mediaType}-${item.id}` ? 'var(--text)' : 'var(--text-dim)',
                      }}
                    >
                      <span className="flex-1 truncate">{item.title ?? item.name}</span>
                      {providerMap[String(item.id)] && (() => {
                        const p = providerInfo(providerMap[String(item.id)].name)
                        return <span className="shrink-0 text-[10px]" style={{ color: p.color }}>[{p.abbr}]</span>
                      })()}
                      {(item.releaseDate ?? item.firstAirDate) && (
                        <span className="shrink-0 text-xs" style={{ color: 'var(--dim)' }}>
                          {(item.releaseDate ?? item.firstAirDate)!.slice(0, 4)}
                        </span>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => loadMore(tab)}
                    disabled={tab === 'movie' ? moviesMore : tvMore}
                    className="w-full text-center text-xs py-2 disabled:opacity-40"
                    style={{ color: 'var(--dim)', borderTop: '1px solid var(--border)' }}
                  >
                    {(tab === 'movie' ? moviesMore : tvMore) ? '...' : 'more'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <DiscoverDetailDrawer
        item={drawerItem}
        onClose={() => setDrawerItem(null)}
        onRequested={() => setDrawerItem(null)}
      />
    </>
  )
}
