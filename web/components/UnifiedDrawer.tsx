'use client'

import { useState, useEffect, useCallback } from 'react'
import ProgressBar from '@/components/ProgressBar'
import Spinner from '@/components/Spinner'
import ReleaseSearchResults, { Release } from '@/components/ReleaseSearchResults'
import { SonarrEpisode } from '@/lib/sonarr'
import RequestModal from '@/components/RequestModal'
import { SeerSearchResult } from '@/types'

// ── entry point union ─────────────────────────────────────────────────────────

export type DrawerEntry =
  | { via: 'radarr'; movieId: number; title?: string }
  | { via: 'sonarr'; seriesId: number; episodeId?: number; title?: string }
  | { via: 'plex'; ratingKey: string; mediaType: 'movie' | 'tv'; title?: string; thumb?: string }
  | { via: 'seer'; tmdbId: number; mediaType: 'movie' | 'tv'; title?: string }
  | { via: 'trakt'; tmdbId: number; mediaType: 'movie' | 'tv'; title?: string }
  | { via: 'qbit'; hash: string; tmdbId?: number; mediaType?: 'movie' | 'tv'; title?: string; posterUrl?: string }

// ── plex sub-types ────────────────────────────────────────────────────────────

interface PlexChild { ratingKey: string; title: string; index: number; leafCount?: number; duration?: number }
interface PlexPhoto { key: string; selected: boolean; thumb: string }
interface PlexMatch { guid: string; name: string; year?: string; thumb?: string }

// ── plex sub-components ───────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function PlexSeriesBrowser({ showKey }: { showKey: string }) {
  const [seasons,       setSeasons]       = useState<PlexChild[]>([])
  const [loading,       setLoading]       = useState(true)
  const [openSeason,    setOpenSeason]    = useState<string | null>(null)
  const [episodes,      setEpisodes]      = useState<Record<string, PlexChild[]>>({})
  const [loadingSeason, setLoadingSeason] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plex?children=${showKey}`)
      .then(r => r.json()).then(d => setSeasons(d.children ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [showKey])

  async function toggleSeason(key: string) {
    if (openSeason === key) { setOpenSeason(null); return }
    setOpenSeason(key)
    if (episodes[key]) return
    setLoadingSeason(key)
    try {
      const d = await fetch(`/api/plex?children=${key}`).then(r => r.json())
      setEpisodes(prev => ({ ...prev, [key]: d.children ?? [] }))
    } finally { setLoadingSeason(null) }
  }

  if (loading) return <Spinner />
  if (!seasons.length) return <p className="text-xs" style={{ color: 'var(--dim)' }}>no seasons</p>
  return (
    <div className="space-y-0.5">
      {seasons.map(s => (
        <div key={s.ratingKey}>
          <button onClick={() => toggleSeason(s.ratingKey)}
            className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-black/[0.04] text-left">
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>S{String(s.index).padStart(2,'0')} — {s.title}</span>
            <span className="text-xs flex gap-2" style={{ color: 'var(--dim)' }}>
              {s.leafCount != null && <span>{s.leafCount}ep</span>}
              <span>{openSeason === s.ratingKey ? '▲' : '▼'}</span>
            </span>
          </button>
          {openSeason === s.ratingKey && (
            <div className="ml-3 pl-2 pb-1" style={{ borderLeft: '1px solid var(--border)' }}>
              {loadingSeason === s.ratingKey ? <div className="py-2"><Spinner /></div> : (
                <div className="space-y-0.5 pt-0.5">
                  {(episodes[s.ratingKey] ?? []).map(ep => (
                    <div key={ep.ratingKey} className="py-1 px-1.5 flex items-center gap-2">
                      <span className="text-xs w-7 shrink-0" style={{ color: 'var(--dim)' }}>E{String(ep.index).padStart(2,'0')}</span>
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text-dim)' }}>{ep.title}</span>
                      {ep.duration != null && <span className="text-xs shrink-0" style={{ color: 'var(--dim)' }}>{fmtDuration(ep.duration)}</span>}
                    </div>
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

function PlexArtGrid({ ratingKey, kind, pendingKey, onPick, saving }: {
  ratingKey: string; kind: 'posters' | 'arts'
  pendingKey: string | null; onPick: (key: string) => void; saving: boolean
}) {
  const [photos,  setPhotos]  = useState<PlexPhoto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plex?${kind}=${ratingKey}`)
      .then(r => r.json()).then(d => setPhotos(d.photos ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [ratingKey, kind])

  function srcLabel(key: string) {
    if (key.startsWith('tmdb://'))   return 'tmdb'
    if (key.startsWith('fanart://')) return 'fanart'
    if (key.startsWith('local://'))  return 'local'
    if (key.startsWith('http'))      return 'remote'
    return 'plex'
  }

  const isPortrait = kind === 'posters'
  if (loading) return <Spinner />
  if (!photos.length) return <p className="text-xs" style={{ color: 'var(--dim)' }}>none available</p>
  return (
    <>
      <p className="text-xs mb-1.5" style={{ color: 'var(--dim)' }}>{photos.length} available — click to select, then save</p>
      <div className={`grid gap-2 ${isPortrait ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {photos.map((p, i) => {
          const isPending  = pendingKey === p.key
          const isSelected = p.selected && !pendingKey
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <button onClick={() => onPick(p.key)} disabled={saving}
                className="relative overflow-hidden border transition-colors"
                style={{
                  aspectRatio: isPortrait ? '2/3' : '16/9',
                  borderColor: isPending ? 'var(--s-done)' : isSelected ? 'var(--border-hi)' : 'var(--border)',
                }}>
                <img src={`/api/plex?thumb=${encodeURIComponent(p.thumb)}`} alt="" className="w-full h-full object-cover" />
                {isPending && (
                  <div className="absolute inset-0 flex items-end justify-start p-0.5 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[7px] font-mono leading-none" style={{ color: 'var(--s-done)' }}>● selected</span>
                  </div>
                )}
                {isSelected && (
                  <div className="absolute inset-0 flex items-end justify-start p-0.5 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[7px] font-mono text-white leading-none">✓ set</span>
                  </div>
                )}
                {saving && isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-[8px] font-mono text-white">...</span>
                  </div>
                )}
              </button>
              <div className="flex justify-between items-center px-0.5">
                <span className="text-[7px] font-mono" style={{ color: 'var(--dim)' }}>[{i}]</span>
                <span className="text-[7px] font-mono" style={{ color: 'var(--dim)' }}>{srcLabel(p.key)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function PlexMatchPanel({ ratingKey, mediaType, onDone }: { ratingKey: string; mediaType: string; onDone: () => void }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<PlexMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [acting,  setActing]  = useState<string | null>(null)

  async function search() {
    if (!query.trim()) return
    setLoading(true); setResults([])
    try {
      const d = await fetch(`/api/plex?matchQuery=${encodeURIComponent(query)}&matchType=${mediaType}`).then(r => r.json())
      setResults(d.results ?? [])
    } finally { setLoading(false) }
  }

  async function apply(m: PlexMatch) {
    setActing(m.guid)
    try {
      await fetch('/api/plex', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match', ratingKey, guid: m.guid, name: m.name, mediaType }),
      })
      onDone()
    } finally { setActing(null) }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()} placeholder="search title..."
          className="font-mono text-xs px-2 py-1 flex-1 focus:outline-none border"
          style={{ background: 'var(--bg-inset)', borderColor: 'var(--border)', color: 'var(--text)' }} />
        <button onClick={search} disabled={loading} className="btn-xs">{loading ? '...' : 'search'}</button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {results.map((m, i) => (
            <div key={i} className="flex items-center gap-2 py-1 border-b" style={{ borderColor: 'var(--border)' }}>
              {m.thumb && <img src={m.thumb} alt="" className="w-8 aspect-[2/3] object-cover shrink-0 border" style={{ borderColor: 'var(--border)' }} />}
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{m.name}</p>
                {m.year && <p className="text-xs" style={{ color: 'var(--dim)' }}>{m.year}</p>}
              </div>
              <button onClick={() => apply(m)} disabled={!!acting} className="btn-xs shrink-0">
                {acting === m.guid ? '...' : 'select'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtSize(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9)  return `${(b / 1e9).toFixed(2)} GB`
  if (b >= 1e6)  return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function fmtSpeed(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB/s`
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB/s`
  return `${b} B/s`
}

function fmtBitrate(kbps?: number): string | null {
  if (!kbps) return null
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`
}

function fmtRes(r?: string): string | null {
  if (!r) return null
  return r === '4k' ? '4K' : `${r}p`
}

const statusLabel: Record<number, string> = { 1: 'Pending', 2: 'Approved', 3: 'Declined', 4: 'Available', 5: 'Processing' }
const statusColor: Record<number, string>  = {
  1: 'var(--s-today)',
  2: 'var(--s-sonarr)',
  3: 'var(--s-danger)',
  4: 'var(--s-done)',
  5: 'var(--s-seer)',
}

// ── stage detection ───────────────────────────────────────────────────────────

type Stage = 'downloading' | 'available' | 'searching' | 'requested' | 'unknown'

function detectStage(arr: any, qbit: any, seer: any, plex: any): Stage {
  if (qbit && qbit.progress < 1) return 'downloading'
  if (arr?.queueItem) return 'downloading'
  if (plex) return 'available'
  if (arr?.hasFile) return 'available'
  if (arr && !arr.hasFile) return 'searching'
  const seerStatus = seer?.mediaInfo?.status
  if (seerStatus && seerStatus >= 1 && seerStatus <= 5) return 'requested'
  return 'unknown'
}

const stageColor: Record<Stage, string> = {
  downloading: 'var(--s-dl)',
  available:   'var(--s-done)',
  searching:   'var(--s-today)',
  requested:   'var(--s-seer)',
  unknown:     'var(--dim)',
}

// ── pipeline mini-map ─────────────────────────────────────────────────────────

type NodeState = 'done' | 'active' | 'warn' | 'error' | 'pending' | 'na'

function PipelineMiniMap({ arr, qbit, seer, plex, mediaType, loading }: {
  arr: any; qbit: any; seer: any; plex: any; mediaType: 'movie' | 'tv'; loading: boolean
}) {
  const plexOnly = !arr && !qbit && !seer && !!plex

  const seerStatus = seer?.mediaInfo?.status ?? 0
  const arrTracked = arr?.queueItem?.trackedDownloadStatus
  const qbitState  = qbit?.state ?? ''

  const effectiveSeerStatus = (seerStatus === 3 && arr) ? 2 : seerStatus
  const seerNode: NodeState = plexOnly ? 'na'
    : seer ? (effectiveSeerStatus >= 2 ? 'done' : 'active') : (arr || plex ? 'done' : 'pending')

  const arrNode: NodeState = plexOnly ? 'na'
    : (arr?.hasFile || (!!plex && !arr?.queueItem)) ? 'done'
    : arrTracked === 'error'   ? 'error'
    : arrTracked === 'warning' ? 'warn'
    : arr ? 'active'
    : 'pending'

  const qbitWarn  = /^(stalledDL|stalledUP)$/.test(qbitState)
  const qbitError = /^(error|missingFiles)$/.test(qbitState)
  const qbitNode: NodeState = plexOnly ? 'na'
    : (arr?.hasFile || (!!plex && !arr?.queueItem)) ? 'done'
    : qbitError ? 'error'
    : qbitWarn  ? 'warn'
    : qbit && qbit.progress < 1 ? 'active'
    : 'pending'

  const plexNode: NodeState = (plex && !arr?.queueItem) ? 'active' : 'pending'

  const arrLabel = mediaType === 'movie' ? 'radarr' : 'sonarr'
  const nodes: { label: string; state: NodeState; color: string }[] = [
    { label: 'seer',   state: seerNode,  color: 'var(--s-seer)'   },
    { label: arrLabel, state: arrNode,   color: 'var(--s-sonarr)' },
    { label: 'qbit',   state: qbitNode,  color: 'var(--s-dl)'     },
    { label: 'plex',   state: plexNode,  color: 'var(--s-plex)'   },
  ]

  function dotStyle(state: NodeState, color: string): React.CSSProperties {
    if (state === 'error') return { borderColor: 'var(--s-danger)', background: 'var(--s-danger)' }
    if (state === 'warn')  return { borderColor: 'var(--s-today)',  background: 'var(--s-today)'  }
    if (state === 'active') return {
      borderColor: color, background: color,
      boxShadow: `0 0 0 2px var(--bg-card), 0 0 0 4px ${color}`,
    }
    if (state === 'done') return { borderColor: color, background: color, opacity: 0.45 }
    return { borderColor: 'var(--dimmer)', background: 'var(--bg-card)' }
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-4 mb-1">
        {nodes.map(n => (
          <p key={n.label} className="text-center font-mono uppercase"
            style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--dim)' }}>
            {n.label}
          </p>
        ))}
      </div>
      <div className="relative grid grid-cols-4 items-center py-0.5">
        <div
          className="absolute h-px"
          style={{ left: '12.5%', right: '12.5%', background: 'var(--border-hi)' }}
        />
        {nodes.map(n => (
          <div key={n.label} className="flex justify-center">
            <div
              className="rounded-full border transition-all duration-300"
              style={{ width: 7, height: 7, ...dotStyle(n.state, n.color) }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <p className="section-label mb-3">{label}</p>
}

// ── props ─────────────────────────────────────────────────────────────────────

interface Props {
  entry: DrawerEntry | null
  onClose: () => void
  onRefresh: () => void
}

// ── inset service panel ───────────────────────────────────────────────────────

function ServicePanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inset-panel p-3 space-y-2 text-xs">
      <p className="section-label mb-1">{label}</p>
      {children}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function UnifiedDrawer({ entry, onClose, onRefresh }: Props) {
  const isOpen = !!entry

  const [tmdbId,     setTmdbId]     = useState<number | null>(null)
  const [mediaType,  setMediaType]  = useState<'movie' | 'tv'>('movie')
  const [resolving,  setResolving]  = useState(false)

  const [arrDetail,  setArrDetail]  = useState<any>(null)
  const [profiles,   setProfiles]   = useState<{ id: number; name: string }[]>([])

  const [pipeline,   setPipeline]   = useState<{ arr: any; qbit: any; seer: any; plex: any; profiles: any[] } | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)

  const [qbitDirect, setQbitDirect] = useState<any>(null)
  const [episodeSynopsis, setEpisodeSynopsis] = useState<string | null>(null)

  const [acting,     setActing]     = useState<string | null>(null)
  const [qualActing, setQualActing] = useState(false)

  const [releases,   setReleases]   = useState<Release[] | null>(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relError,   setRelError]   = useState<string | null>(null)
  const [episodes,   setEpisodes]   = useState<SonarrEpisode[] | null>(null)
  const [selEpId,    setSelEpId]    = useState<number | null>(null)
  const [selSeason,  setSelSeason]  = useState<number | null>(null)

  const [plexEpisode, setPlexEpisode] = useState<{ showTitle: string; season: number; episode: number; title: string } | null>(null)

  const [showPosters,   setShowPosters]   = useState(false)
  const [showArt,       setShowArt]       = useState(false)
  const [pendingKey,    setPendingKey]    = useState<string | null>(null)
  const [artworkSaving, setArtworkSaving] = useState(false)
  const [artworkVersion, setArtworkVersion] = useState(0)
  const [imgBust,       setImgBust]       = useState(0)
  const [plexImgData,   setPlexImgData]   = useState<{thumb?: string; art?: string} | null>(null)
  const [showMatch,   setShowMatch]   = useState(false)
  const [showSeries,  setShowSeries]  = useState(false)

  const [requestItem, setRequestItem] = useState<SeerSearchResult | null>(null)

  // ── step 1: resolve tmdbId from entry point ─────────────────────────────────

  useEffect(() => {
    if (!entry) {
      setTmdbId(null); setArrDetail(null); setProfiles([]); setPipeline(null)
      setReleases(null); setRelError(null); setEpisodes(null); setSelEpId(null)
      return
    }

    setTmdbId(null); setArrDetail(null); setProfiles([]); setPipeline(null)
    setReleases(null); setRelError(null); setEpisodes(null); setSelEpId(null); setSelSeason(null)
    setShowPosters(false); setShowArt(false); setShowMatch(false); setShowSeries(false); setPendingKey(null)
    setPlexEpisode(null); setQbitDirect(null); setEpisodeSynopsis(null); setPlexImgData(null)
    setResolving(true)

    async function resolve() {
      try {
        if (!entry) return
        if (entry.via === 'radarr') {
          const [detailRes] = await Promise.all([
            fetch(`/api/radarr?mediaId=${entry.movieId}`),
            Promise.resolve(null),
          ])
          const data = await detailRes.json()
          const detail = data.detail ?? null
          const profs  = data.profiles ?? []
          setArrDetail(detail)
          setProfiles(profs)
          setMediaType('movie')
          if (detail?.tmdbId) setTmdbId(detail.tmdbId)

        } else if (entry.via === 'sonarr') {
          const [detailRes] = await Promise.all([
            fetch(`/api/sonarr?mediaId=${entry.seriesId}`),
          ])
          const data = await detailRes.json()
          const detail = data.detail ?? null
          const profs  = data.profiles ?? []
          setArrDetail(detail)
          setProfiles(profs)
          setMediaType('tv')
          if (detail?.tmdbId) setTmdbId(detail.tmdbId)

          if (entry.episodeId) {
            fetch(`/api/sonarr?episodeId=${entry.episodeId}`)
              .then(r => r.json())
              .then((ep: SonarrEpisode | null) => {
                if (!ep) return
                setSelEpId(ep.id)
                if (ep.overview) {
                  setEpisodeSynopsis(ep.overview)
                } else {
                  fetch(`/api/sonarr?mediaId=${entry.seriesId}`)
                    .then(r => r.json())
                    .then(d => {
                      const tvdbId = d.detail?.tvdbId
                      if (!tvdbId) return
                      fetch(`/api/trakt?tvdbId=${tvdbId}&season=${ep.seasonNumber}&episode=${ep.episodeNumber}`)
                        .then(r => r.json())
                        .then(t => { if (t.overview) setEpisodeSynopsis(t.overview) })
                        .catch(() => {})
                    })
                    .catch(() => {})
                }
              })
              .catch(() => {})
          }

          fetch(`/api/sonarr?episodes=${entry.seriesId}`)
            .then(r => r.json())
            .then((eps: SonarrEpisode[]) => {
              setEpisodes(eps)
              if (!entry.episodeId) {
                const now = Date.now()
                const next = eps.filter(e => e.monitored && !e.hasFile && e.airDateUtc && new Date(e.airDateUtc).getTime() > now)
                  .sort((a, b) => new Date(a.airDateUtc!).getTime() - new Date(b.airDateUtc!).getTime())
                const targetId = next[0]?.id ?? null
                if (targetId) {
                  setSelEpId(targetId)
                  const ep = eps.find(e => e.id === targetId)
                  if (ep?.overview) setEpisodeSynopsis(ep.overview)
                }
              }
            })
            .catch(() => setEpisodes([]))

        } else if (entry.via === 'plex') {
          const res    = await fetch(`/api/plex?ratingKey=${entry.ratingKey}`)
          const data   = await res.json()
          const detail = data.detail ?? null
          setMediaType(entry.mediaType)

          const isEpisode = detail?.type === 'episode'
          if (isEpisode) {
            setPlexEpisode({
              showTitle: detail.grandparentTitle ?? entry.title ?? '',
              season:    detail.parentIndex ?? 0,
              episode:   detail.index ?? 0,
              title:     detail.title ?? '',
            })
            if (detail.summary) setEpisodeSynopsis(detail.summary)
          }

          const guidSource = isEpisode && detail?.grandparentRatingKey
            ? await fetch(`/api/plex?ratingKey=${detail.grandparentRatingKey}`)
                .then(r => r.json()).then(d => d.detail?.Guid ?? []).catch(() => [])
            : (detail?.Guid ?? [])

          const tmdb = (guidSource as { id: string }[]).find(g => g.id.startsWith('tmdb://'))
          if (tmdb) setTmdbId(parseInt(tmdb.id.replace('tmdb://', '')))

        } else if (entry.via === 'seer' || entry.via === 'trakt') {
          setMediaType(entry.mediaType)
          setTmdbId(entry.tmdbId)

        } else if (entry.via === 'qbit') {
          setMediaType(entry.mediaType ?? 'movie')
          setTmdbId(entry.tmdbId ?? -1)
          fetch(`/api/qbittorrent?info=${entry.hash}`)
            .then(r => r.json())
            .then(data => { if (data) setQbitDirect(data) })
            .catch(() => {})
        }
      } catch { /* ignore */ }
      finally {
        setResolving(false)
        setTmdbId(prev => prev === null ? -1 : prev)
      }
    }

    resolve()
  }, [entry])

  // ── step 1b: qbit TV episode synopsis ──────────────────────────────────────

  useEffect(() => {
    const seriesId = (pipeline?.arr ?? arrDetail)?.id
    if (entry?.via !== 'qbit' || mediaType !== 'tv' || !qbitDirect?.name || !seriesId || episodeSynopsis) return
    const match = (qbitDirect.name as string).match(/[Ss](\d{1,2})[Ee](\d{1,2})/)
    if (!match) return
    const season  = parseInt(match[1])
    const episode = parseInt(match[2])
    fetch(`/api/sonarr?episodes=${seriesId}`)
      .then(r => r.json())
      .then((eps: SonarrEpisode[]) => {
        const ep = eps.find(e => e.seasonNumber === season && e.episodeNumber === episode)
        if (ep?.id) {
          setSelEpId(ep.id)
          if (ep.overview) setEpisodeSynopsis(ep.overview)
        }
      })
      .catch(() => {})
  }, [entry?.via, mediaType, qbitDirect?.name, (pipeline?.arr ?? arrDetail)?.id, episodeSynopsis]) // eslint-disable-line

  // ── step 2: pipeline fetch ──────────────────────────────────────────────────

  const fetchPipeline = useCallback(async (id: number, mt: 'movie' | 'tv', attempt = 1) => {
    setPipelineLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const res  = await fetch(`/api/pipeline?tmdbId=${id}&mediaType=${mt}`, { signal: controller.signal })
      const data = await res.json()
      setPipeline(prev => {
        if (!prev) return data
        return {
          arr:      data.arr      ?? prev.arr,
          qbit:     data.qbit     ?? prev.qbit,
          seer:     data.seer     ?? prev.seer,
          plex:     data.plex     ?? prev.plex,
          profiles: data.profiles?.length ? data.profiles : prev.profiles,
        }
      })
      if (data.arr && !arrDetail) setArrDetail(data.arr)
      if (data.profiles?.length && !profiles.length) setProfiles(data.profiles)
      const epOverview = data.arr?.episodeDetail?.overview
      if (epOverview) setEpisodeSynopsis(prev => prev || epOverview)
      const hasGaps = !data.arr || !data.plex
      if (hasGaps && attempt < 3) {
        setTimeout(() => fetchPipeline(id, mt, attempt + 1), 4000 * attempt)
      }
    } catch {
      setPipeline(prev => prev ?? { arr: null, qbit: null, seer: null, plex: null, profiles: [] })
      if (attempt < 3) setTimeout(() => fetchPipeline(id, mt, attempt + 1), 4000 * attempt)
    } finally {
      clearTimeout(timeout)
      setPipelineLoading(false)
    }
  }, [arrDetail, profiles.length])

  useEffect(() => {
    if (tmdbId && tmdbId > 0) fetchPipeline(tmdbId, mediaType)
  }, [tmdbId, mediaType]) // eslint-disable-line

  // ── derived ──────────────────────────────────────────────────────────────────

  const arr    = pipeline?.arr    ?? arrDetail
  const qbit   = pipeline?.qbit   ?? null
  const seer   = pipeline?.seer   ?? null
  const plex   = pipeline?.plex   ?? null
  const profs  = pipeline?.profiles?.length ? pipeline.profiles : profiles

  const qbitData = qbit ?? qbitDirect ?? null

  const selEp = episodes?.find(e => e.id === selEpId) ?? null
  const plexForStage = (mediaType === 'tv' && selEp && !selEp.hasFile) ? null : plex

  const stage  = detectStage(arr, qbitData, seer, plexForStage)
  const qitem  = arr?.queueItem ?? null
  const pct    = qbitData ? (qbitData.progress ?? 0) * 100 : (qitem && qitem.size > 0 ? ((qitem.size - qitem.sizeleft) / qitem.size) * 100 : 0)

  const liveThumb = plexImgData?.thumb ?? plex?.thumb
  const liveArt   = plexImgData?.art   ?? plex?.art
  const plexThumb = liveThumb ? `/api/plex?thumb=${encodeURIComponent(liveThumb)}&v=${imgBust}` : null
  const poster   = plexThumb
                ?? arr?.images?.find((i: any) => i.coverType === 'poster')?.remoteUrl
                ?? (entry?.via === 'plex'  && entry.thumb     ? `/api/plex?thumb=${encodeURIComponent(entry.thumb)}` : null)
                ?? (entry?.via === 'qbit'  && entry.posterUrl ? entry.posterUrl : null)
  const arrFanart = arr?.images?.find((i: any) => i.coverType === 'fanart')?.remoteUrl ?? null
  const backdrop  = (liveArt ? `/api/plex?thumb=${encodeURIComponent(liveArt)}&v=${imgBust}` : null)
    ?? arrFanart
  const title    = arr?.title ?? entry?.title ?? '—'
  const year     = arr?.year
  const imdbRating = arr?.ratings?.imdb?.value ?? arr?.ratings?.movieDb?.value ?? null

  // ── actions ──────────────────────────────────────────────────────────────────

  async function arrAction(action: string, extra: object = {}) {
    const svc = mediaType === 'movie' ? 'radarr' : 'sonarr'
    const idField = mediaType === 'movie' ? { movieId: arr?.id } : { seriesId: arr?.id }
    setActing(action)
    try {
      await fetch(`/api/${svc}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: qitem?.id, ...idField, ...extra }),
      })
      onRefresh()
      if (action === 'delete') onClose()
      else if (tmdbId) fetchPipeline(tmdbId, mediaType)
    } finally { setActing(null) }
  }

  async function qbitAction(action: string, extra: object = {}) {
    const hash = qbitData?.hash ?? (entry?.via === 'qbit' ? entry.hash : null)
    if (!hash) return
    setActing(`qbit-${action}`)
    try {
      await fetch('/api/qbittorrent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, hash, ...extra }),
      })
      onRefresh()
      if (tmdbId) fetchPipeline(tmdbId, mediaType)
    } finally { setActing(null) }
  }

  async function plexAction(action: string, extra: object = {}) {
    if (!plex?.ratingKey) return
    setActing(`plex-${action}`)
    try {
      await fetch('/api/plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ratingKey: plex.ratingKey, ...extra }),
      })
      onRefresh()
      if (action === 'delete' && tmdbId) fetchPipeline(tmdbId, mediaType)
      else if (action === 'refresh' && tmdbId) {
        setTimeout(() => fetchPipeline(tmdbId!, mediaType), 3000)
      }
    } finally { setActing(null) }
  }

  async function deleteChain() {
    if (!confirm(`Delete ${title}? Files will be permanently deleted.`)) return
    setActing('plex-delete')
    try {
      if (arr?.id) {
        const svc    = mediaType === 'movie' ? 'radarr' : 'sonarr'
        const action = mediaType === 'movie' ? 'deleteMovie' : 'deleteSeries'
        const idField = mediaType === 'movie' ? { movieId: arr.id } : { seriesId: arr.id }
        await fetch(`/api/${svc}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...idField }),
        })
      }
      if (plex?.ratingKey) {
        await fetch('/api/plex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', ratingKey: plex.ratingKey }),
        }).catch(() => {})
      }
      onRefresh()
      onClose()
    } finally { setActing(null) }
  }

  async function saveArtwork() {
    if (!plex?.ratingKey || !pendingKey) return
    const action = showPosters ? 'setPoster' : 'setArt'
    setArtworkSaving(true)
    try {
      await fetch('/api/plex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ratingKey: plex.ratingKey, photoKey: pendingKey }),
      })
      setPendingKey(null)
      setArtworkVersion(v => v + 1)
      if (plex?.ratingKey) {
        const res  = await fetch(`/api/plex?ratingKey=${plex.ratingKey}`)
        const data = await res.json()
        if (data.detail) setPlexImgData({ thumb: data.detail.thumb, art: data.detail.art })
      }
      setImgBust(v => v + 1)
      onRefresh()
      if (tmdbId) fetchPipeline(tmdbId, mediaType)
    } finally { setArtworkSaving(false) }
  }

  async function changeQuality(qualityProfileId: number) {
    const svc = mediaType === 'movie' ? 'radarr' : 'sonarr'
    const idField = mediaType === 'movie' ? { movieId: arr?.id } : { seriesId: arr?.id }
    setQualActing(true)
    try {
      await fetch(`/api/${svc}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateQuality', ...idField, qualityProfileId }),
      })
      if (tmdbId) fetchPipeline(tmdbId, mediaType)
    } finally { setQualActing(false) }
  }

  async function searchReleases() {
    const svc = mediaType === 'movie' ? 'radarr' : 'sonarr'
    const searchId = mediaType === 'movie' ? arr?.id : (selEpId ?? undefined)
    if (!searchId) return
    setRelLoading(true); setReleases(null); setRelError(null)
    try {
      const res  = await fetch(`/api/${svc}?releasesFor=${searchId}`)
      const data = await res.json()
      if (!res.ok || data?.error) setRelError(data?.error ?? `HTTP ${res.status}`)
      else setReleases(data)
    } catch (e: any) {
      setRelError(e.message ?? 'fetch failed')
    } finally { setRelLoading(false) }
  }

  function selectSeason(seasonNum: number) {
    if (selSeason === seasonNum) { setSelSeason(null); return }
    setSelSeason(seasonNum)
    if (!episodes) return
    const seasonEps = episodes
      .filter(e => e.seasonNumber === seasonNum)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
    const target = seasonEps.find(e => !e.hasFile) ?? seasonEps[0]
    if (target) setSelEpId(target.id)
  }

  async function toggleSeasonMonitor(seasonNumber: number, monitored: boolean) {
    if (!arr?.id) return
    setActing('season-mon')
    try {
      await fetch('/api/sonarr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateSeasonMonitor', seriesId: arr.id, seasonNumber, monitored }),
      })
      if (tmdbId) fetchPipeline(tmdbId, mediaType)
    } finally { setActing(null) }
  }

  async function doSearch() {
    if (mediaType === 'tv' && selSeason != null && arr?.id) {
      setActing('search')
      try {
        await fetch('/api/sonarr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'seasonSearch', seriesId: arr.id, seasonNumber: selSeason }),
        })
        onRefresh()
        if (tmdbId) fetchPipeline(tmdbId, mediaType)
      } finally { setActing(null) }
    } else {
      arrAction('search')
    }
  }

  async function grabRelease(guid: string, indexerId: number, key: string) {
    const svc = mediaType === 'movie' ? 'radarr' : 'sonarr'
    setActing(key)
    await fetch(`/api/${svc}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'grab', guid, indexerId }),
    })
    setReleases(null)
    onRefresh()
    setActing(null)
  }

  useEffect(() => {
    if (!selEpId || !episodes) return
    const ep = episodes.find(e => e.id === selEpId)
    if (ep) setSelSeason(ep.seasonNumber)
  }, [selEpId, episodes])

  // fetch episodes for any TV drawer that has a sonarr series ID, regardless of entry via
  const sonarrSeriesId = mediaType === 'tv' ? ((pipeline?.arr ?? arrDetail)?.id ?? null) : null
  useEffect(() => {
    if (!sonarrSeriesId || episodes !== null) return
    fetch(`/api/sonarr?episodes=${sonarrSeriesId}`)
      .then(r => r.json())
      .then((eps: SonarrEpisode[]) => setEpisodes(eps))
      .catch(() => setEpisodes([]))
  }, [sonarrSeriesId, episodes])

  const loading = resolving || tmdbId === null || (tmdbId > 0 && pipeline === null)
  const isEpisodeMode = entry?.via === 'sonarr'
                     || (entry?.via === 'qbit' && mediaType === 'tv')
                     || !!plexEpisode
  const isPaused = qbitData?.state?.toLowerCase().includes('paused')

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] border-l shadow-[-8px_0_32px_rgba(0,0,0,0.15)] transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-hi)' }}
      >
        {backdrop && (
          <div className="absolute top-0 left-0 right-0 h-80 pointer-events-none" style={{ zIndex: 0 }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backdrop})`, filter: 'blur(2px)', opacity: 0.35, maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)' }} />
          </div>
        )}

        <div className="relative z-10 overflow-y-auto h-full p-6">
          {!loading && entry && (
            <div className="mb-4 overflow-hidden">
              <PipelineMiniMap
                arr={arr} qbit={qbitData} seer={seer} plex={plexForStage}
                mediaType={mediaType} loading={pipelineLoading} />
            </div>
          )}

          {/* header */}
          <div className="flex justify-between items-center mb-6">
            <span className="section-label">unified // detail</span>
            <button onClick={onClose} className="btn-xs">close</button>
          </div>

          {loading && <Spinner />}

          {!loading && entry && (
            <>
              {/* media header */}
              <div className="flex gap-4 mb-6">
                {poster && (
                  <div className="relative flex-shrink-0 z-30">
                    <img src={poster} alt={title} className="w-36 aspect-[2/3] object-cover" style={{ border: '1px solid var(--border)' }} />
                    {plex?.ratingKey && (
                      <button
                        onClick={() => { setShowPosters(v => !v); setShowArt(false); setShowMatch(false) }}
                        className={`absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 border transition-colors ${showPosters ? 'border-white text-white bg-black/80' : 'border-white/40 text-white/60 bg-black/60 hover:border-white/80 hover:text-white/90'}`}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {plexEpisode ? (
                    <>
                      <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>{plexEpisode.showTitle}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                        S{String(plexEpisode.season).padStart(2,'0')}E{String(plexEpisode.episode).padStart(2,'0')}
                        {plexEpisode.title && <span style={{ color: 'var(--text)' }}> — {plexEpisode.title}</span>}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>
                      {title}
                      {year && <span className="ml-2 font-normal" style={{ color: 'var(--text-dim)' }}>({year})</span>}
                    </p>
                  )}
                  {arr?.genres?.length > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{arr.genres.slice(0, 3).join(', ')}</p>
                  )}
                  {imdbRating && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--dim)' }}>imdb {imdbRating.toFixed(1)}</p>
                  )}
                  {(episodeSynopsis || (!isEpisodeMode && arr?.overview)) && (
                    <p className="text-[10px] leading-relaxed mt-2 line-clamp-5" style={{ color: 'var(--text-dim)' }}>
                      {episodeSynopsis || arr?.overview}
                    </p>
                  )}
                  {plex?.ratingKey && (
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={async () => {
                          if (!plex?.ratingKey) return
                          const res  = await fetch(`/api/plex?ratingKey=${plex.ratingKey}`)
                          const data = await res.json()
                          if (data.detail) setPlexImgData({ thumb: data.detail.thumb, art: data.detail.art })
                          setImgBust(v => v + 1)
                        }}
                        className="btn-xs"
                      >
                        ↺
                      </button>
                      <button
                        onClick={() => { setShowArt(v => !v); setShowPosters(false); setShowMatch(false) }}
                        className="btn-xs"
                        style={showArt ? { borderColor: 'var(--border-hi)', color: 'var(--text)' } : undefined}
                      >
                        ✎ art
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* pipeline service blocks */}
              <div className="mb-6">
                <SectionHeader label="pipeline" />
                <div className="space-y-3">

                  {/* arr */}
                  {arr && (
                    <ServicePanel label={mediaType === 'movie' ? 'radarr' : 'sonarr'}>
                      <div className="flex items-center gap-2">
                        <span className="w-20" style={{ color: 'var(--dim)' }}>monitored</span>
                        <button
                          onClick={() => arrAction('toggleMonitor', { monitored: !arr.monitored })}
                          disabled={!!acting}
                          title={arr.monitored ? 'monitored' : 'unmonitored'}
                          style={{ padding: '4px 6px', margin: '-4px -6px' }}
                        >
                          <svg width="11" height="13" viewBox="0 0 11 13" style={{ color: arr.monitored ? 'var(--s-today)' : 'var(--dimmer)', display: 'block' }}>
                            {arr.monitored
                              ? <path d="M1 1h9v11l-4.5-3L1 12V1z" fill="currentColor"/>
                              : <path d="M1 1h9v11l-4.5-3L1 12V1z" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                            }
                          </svg>
                        </button>
                      </div>

                      {profs.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="w-20" style={{ color: 'var(--dim)' }}>profile</span>
                          <select
                            value={arr.qualityProfileId ?? ''}
                            onChange={e => changeQuality(Number(e.target.value))}
                            disabled={qualActing}
                            className="text-xs font-mono px-2 py-0.5 focus:outline-none disabled:opacity-50 border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text)' }}
                          >
                            {profs.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {qualActing && <span style={{ color: 'var(--dim)' }}>...</span>}
                        </div>
                      )}

                      {arr.movieFile?.quality?.quality?.name && (
                        <div className="flex items-center gap-2">
                          <span className="w-20" style={{ color: 'var(--dim)' }}>file</span>
                          <span style={{ color: 'var(--s-done)' }}>{arr.movieFile.quality.quality.name}</span>
                          {arr.movieFile.size && <span style={{ color: 'var(--dim)' }}>{fmtSize(arr.movieFile.size)}</span>}
                        </div>
                      )}

                      {qitem && (
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <span className="w-20" style={{ color: 'var(--dim)' }}>status</span>
                            <span style={{ color: 'var(--text)' }}>{qitem.status}</span>
                          </div>
                          {qitem.quality?.quality?.name && (
                            <div className="flex gap-2">
                              <span className="w-20" style={{ color: 'var(--dim)' }}>grabbed</span>
                              <span style={{ color: 'var(--s-done)' }}>{qitem.quality.quality.name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="w-20" style={{ color: 'var(--dim)' }}>progress</span>
                            <ProgressBar pct={pct} />
                            <span style={{ color: 'var(--dim)' }}>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="w-20" style={{ color: 'var(--dim)' }}>size</span>
                            <span style={{ color: 'var(--text-dim)' }}>{fmtSize(qitem.size)}</span>
                          </div>
                        </div>
                      )}

                      {mediaType === 'tv' && (arr?.seasons as any[])?.filter((s: any) => s.seasonNumber > 0).length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                          {(arr.seasons as any[])
                            .filter((s: any) => s.seasonNumber > 0)
                            .sort((a: any, b: any) => a.seasonNumber - b.seasonNumber)
                            .map((s: any) => {
                              const fileCount  = s.statistics?.episodeFileCount ?? 0
                              const total      = s.statistics?.totalEpisodeCount ?? 0
                              const isExpanded = selSeason === s.seasonNumber
                              const seasonEps  = isExpanded && episodes
                                ? episodes.filter(e => e.seasonNumber === s.seasonNumber).sort((a, b) => a.episodeNumber - b.episodeNumber)
                                : []
                              return (
                                <div key={s.seasonNumber}>
                                  <div
                                    className="flex items-center gap-2 py-1.5 cursor-pointer"
                                    style={{ borderBottom: '1px solid var(--border)' }}
                                    onClick={() => selectSeason(s.seasonNumber)}
                                  >
                                    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, color: isExpanded ? 'var(--dim)' : 'var(--dimmer)', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                      <polyline points="3,2 7,5 3,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span className="w-6 shrink-0 tabular-nums" style={{ color: isExpanded ? 'var(--text)' : 'var(--dim)' }}>
                                      S{String(s.seasonNumber).padStart(2, '0')}
                                    </span>
                                    <span className="flex-1 tabular-nums" style={{ fontSize: 10, color: 'var(--dimmer)' }}>
                                      {fileCount}/{total}
                                    </span>
                                    <button
                                      onClick={e => { e.stopPropagation(); toggleSeasonMonitor(s.seasonNumber, !s.monitored) }}
                                      disabled={acting === 'season-mon'}
                                      title={s.monitored ? 'monitored' : 'unmonitored'}
                                      style={{ padding: '4px 6px', margin: '-4px -6px' }}
                                    >
                                      <svg width="11" height="13" viewBox="0 0 11 13" style={{ color: s.monitored ? 'var(--s-today)' : 'var(--dimmer)', display: 'block' }}>
                                        {s.monitored
                                          ? <path d="M1 1h9v11l-4.5-3L1 12V1z" fill="currentColor"/>
                                          : <path d="M1 1h9v11l-4.5-3L1 12V1z" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                                        }
                                      </svg>
                                    </button>
                                  </div>
                                  {isExpanded && episodes === null && (
                                    <div className="py-1 pl-5" style={{ color: 'var(--dim)', fontSize: 10, borderBottom: '1px solid var(--border)' }}>loading...</div>
                                  )}
                                  {isExpanded && seasonEps.map(ep => {
                                    const isSel = ep.id === selEpId
                                    return (
                                      <div
                                        key={ep.id}
                                        className="flex items-center gap-2 py-1 cursor-pointer"
                                        style={{
                                          borderBottom: '1px solid var(--border)',
                                          borderLeft: isSel ? '2px solid var(--s-today)' : '2px solid transparent',
                                          paddingLeft: 18,
                                        }}
                                        onClick={() => setSelEpId(ep.id)}
                                      >
                                        <span className="shrink-0 tabular-nums" style={{ color: 'var(--dim)', fontSize: 10, minWidth: 28 }}>
                                          E{String(ep.episodeNumber).padStart(2, '0')}
                                        </span>
                                        <span className="flex-1 truncate" style={{ color: 'var(--dimmer)', fontSize: 10 }}>
                                          {ep.title}
                                        </span>
                                        <svg width="9" height="11" viewBox="0 0 11 13" style={{ flexShrink: 0, color: ep.hasFile ? 'var(--s-done)' : !ep.monitored ? 'var(--dimmer)' : 'transparent' }}>
                                          {ep.hasFile
                                            ? <path d="M1 1h9v11l-4.5-3L1 12V1z" fill="currentColor"/>
                                            : <path d="M1 1h9v11l-4.5-3L1 12V1z" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                                          }
                                        </svg>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {arr.id && (
                          <button onClick={doSearch} disabled={!!acting} className="btn-xs">
                            {acting === 'search' ? '...' : 'search'}
                          </button>
                        )}
                        {(mediaType === 'movie' ? arr.id : selEpId) && (
                          <button onClick={searchReleases} disabled={relLoading} className="btn-xs">
                            {relLoading ? '...' : 'interactive search'}
                          </button>
                        )}
                        {qitem?.id && (
                          <>
                            <button
                              onClick={() => { if (confirm(`Remove ${title} from queue?`)) arrAction('delete') }}
                              disabled={!!acting} className="btn-xs danger"
                            >
                              {acting === 'delete' ? '...' : 'Del'}
                            </button>
                            <button
                              onClick={() => { if (confirm(`Blacklist and Del ${title}?`)) arrAction('delete', { blacklist: true }) }}
                              disabled={!!acting} className="btn-xs danger"
                            >
                              blacklist
                            </button>
                          </>
                        )}
                      </div>
                    </ServicePanel>
                  )}

                  {/* qbittorrent */}
                  {(qbitData || entry?.via === 'qbit') && (
                    <ServicePanel label="qbittorrent">
                      {qbitData ? (
                        <>
                          {qbitData.name && entry?.via === 'qbit' && (
                            <p className="text-xs break-all leading-relaxed" style={{ color: 'var(--text-dim)' }}>{qbitData.name}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="w-20" style={{ color: 'var(--dim)' }}>progress</span>
                            <ProgressBar pct={(qbitData.progress ?? 0) * 100} />
                            <span style={{ color: 'var(--dim)' }}>{((qbitData.progress ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                          {qbitData.size > 0 && (
                            <div className="flex gap-2">
                              <span className="w-20" style={{ color: 'var(--dim)' }}>downloaded</span>
                              <span style={{ color: 'var(--text-dim)' }}>{fmtSize(qbitData.downloaded ?? 0)}</span>
                              <span style={{ color: 'var(--dim)' }}>of</span>
                              <span style={{ color: 'var(--text-dim)' }}>{fmtSize(qbitData.size)}</span>
                            </div>
                          )}
                          {((qbitData.dlspeed ?? 0) > 0 || (qbitData.upspeed ?? 0) > 0) && (
                            <div className="flex gap-3">
                              <span style={{ color: 'var(--s-dl)' }}>↓ {fmtSpeed(qbitData.dlspeed ?? 0)}</span>
                              <span style={{ color: 'var(--s-sonarr)' }}>↑ {fmtSpeed(qbitData.upspeed ?? 0)}</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <span className="w-20" style={{ color: 'var(--dim)' }}>state</span>
                            <span style={{ color: 'var(--text)' }}>{qbitData.state}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <button onClick={() => qbitAction(isPaused ? 'resume' : 'pause')} disabled={!!acting} className="btn-xs">
                              {acting === `qbit-${isPaused ? 'resume' : 'pause'}` ? '...' : isPaused ? 'resume' : 'pause'}
                            </button>
                            <button onClick={() => { if (confirm(`Delete torrent?`)) qbitAction('delete', { deleteFiles: false }) }}
                              disabled={!!acting} className="btn-xs danger">Del</button>
                            <button onClick={() => { if (confirm(`Delete torrent and files?`)) qbitAction('delete', { deleteFiles: true }) }}
                              disabled={!!acting} className="btn-xs danger">+ files</button>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs" style={{ color: 'var(--dimmer)' }}>loading...</p>
                      )}
                    </ServicePanel>
                  )}

                  {/* plex */}
                  <ServicePanel label="plex">
                    {plex ? (
                      <>
                        {(() => {
                          const m = plex.Media?.[0]
                          const res    = fmtRes(m?.videoResolution)
                          const codecs = [m?.videoCodec, m?.audioCodec].filter(Boolean).join(' / ')
                          const br     = fmtBitrate(m?.bitrate)
                          return (
                            <div className="space-y-1">
                              {res    && <div className="flex gap-2"><span className="w-20" style={{ color: 'var(--dim)' }}>resolution</span><span style={{ color: 'var(--s-done)' }}>{res}</span></div>}
                              {codecs && <div className="flex gap-2"><span className="w-20" style={{ color: 'var(--dim)' }}>codec</span><span style={{ color: 'var(--text-dim)' }}>{codecs}</span></div>}
                              {m?.container && <div className="flex gap-2"><span className="w-20" style={{ color: 'var(--dim)' }}>container</span><span style={{ color: 'var(--text-dim)' }}>{m.container}</span></div>}
                              {br    && <div className="flex gap-2"><span className="w-20" style={{ color: 'var(--dim)' }}>bitrate</span><span style={{ color: 'var(--text-dim)' }}>{br}</span></div>}
                              {m?.Part?.[0]?.size && <div className="flex gap-2"><span className="w-20" style={{ color: 'var(--dim)' }}>size</span><span style={{ color: 'var(--text-dim)' }}>{fmtSize(m.Part[0].size!)}</span></div>}
                            </div>
                          )
                        })()}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <button onClick={() => plexAction('refresh')} disabled={!!acting} className="btn-xs">
                            {acting === 'plex-refresh' ? '...' : 'refresh'}
                          </button>
                          <button
                            onClick={() => { setShowMatch(v => !v); setShowPosters(false); setShowArt(false); setPendingKey(null) }}
                            className="btn-xs"
                            style={showMatch ? { borderColor: 'var(--border-hi)', color: 'var(--text)' } : undefined}
                          >
                            fix match
                          </button>
                          {mediaType === 'tv' && (
                            <button
                              onClick={() => setShowSeries(v => !v)}
                              className="btn-xs"
                              style={showSeries ? { borderColor: 'var(--border-hi)', color: 'var(--text)' } : undefined}
                            >
                              series
                            </button>
                          )}
                          <button onClick={deleteChain} disabled={!!acting} className="btn-xs danger">
                            {acting === 'plex-delete' ? '...' : 'Del'}
                          </button>
                        </div>

                        {pendingKey && (
                          <button onClick={saveArtwork} disabled={artworkSaving} className="btn-xs disabled:opacity-50">
                            {artworkSaving ? '...' : 'save'}
                          </button>
                        )}
                        {showPosters && (
                          <div className="mt-2">
                            <PlexArtGrid key={`posters-${artworkVersion}`} ratingKey={plex.ratingKey} kind="posters"
                              pendingKey={pendingKey} onPick={setPendingKey} saving={artworkSaving} />
                          </div>
                        )}
                        {showArt && (
                          <div className="mt-2">
                            <PlexArtGrid key={`arts-${artworkVersion}`} ratingKey={plex.ratingKey} kind="arts"
                              pendingKey={pendingKey} onPick={setPendingKey} saving={artworkSaving} />
                          </div>
                        )}
                        {showMatch && (
                          <div className="mt-2">
                            <PlexMatchPanel
                              ratingKey={plex.ratingKey}
                              mediaType={mediaType === 'tv' ? 'show' : 'movie'}
                              onDone={() => { setShowMatch(false); if (tmdbId) fetchPipeline(tmdbId, mediaType) }}
                            />
                          </div>
                        )}
                        {showSeries && mediaType === 'tv' && (
                          <div className="mt-2">
                            <PlexSeriesBrowser showKey={plex.ratingKey} />
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--dimmer)' }}>not in library</p>
                    )}
                  </ServicePanel>

                  {/* seer */}
                  <ServicePanel label="seer">
                    {seer?.mediaInfo?.status != null ? (
                      <div className="flex items-center gap-3">
                        {(() => {
                          const raw = seer.mediaInfo.status
                          const effective = (raw === 3 && arr) ? 2 : raw
                          return (
                            <span className="text-xs" style={{ color: statusColor[effective] ?? 'var(--dim)' }}>
                              {statusLabel[effective] ?? String(effective)}
                            </span>
                          )
                        })()}
                        {tmdbId && seer.mediaInfo.status < 4 && !(seer.mediaInfo.status === 3 && arr) && (
                          <button
                            className="btn-xs"
                            onClick={() => setRequestItem({
                              id: tmdbId,
                              mediaType: mediaType,
                              title: arr?.title ?? entry?.title ?? '',
                              overview: arr?.overview ?? '',
                              posterPath: seer?.posterPath ?? undefined,
                            })}
                          >
                            --request
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: 'var(--dimmer)' }}>not requested</span>
                        {tmdbId && (
                          <button
                            className="btn-xs"
                            onClick={() => setRequestItem({
                              id: tmdbId,
                              mediaType: mediaType,
                              title: arr?.title ?? entry?.title ?? '',
                              overview: arr?.overview ?? '',
                            })}
                          >
                            --request
                          </button>
                        )}
                      </div>
                    )}
                  </ServicePanel>

                </div>
              </div>

              <ReleaseSearchResults
                releases={releases}
                loading={relLoading}
                error={relError}
                acting={acting}
                onGrab={grabRelease}
              />
            </>
          )}
        </div>
      </div>

      <RequestModal
        item={requestItem}
        onClose={() => setRequestItem(null)}
        onDone={() => {
          setRequestItem(null)
          if (tmdbId) fetchPipeline(tmdbId, mediaType)
        }}
      />
    </>
  )
}
