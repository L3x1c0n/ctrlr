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
  if (!seasons.length) return <p className="text-[#999] text-xs">// no seasons</p>
  return (
    <div className="space-y-0.5">
      {seasons.map(s => (
        <div key={s.ratingKey}>
          <button onClick={() => toggleSeason(s.ratingKey)}
            className="w-full flex items-center justify-between py-1.5 px-2 hover:bg-[#1a1a2e] text-left">
            <span className="text-[#ccc] text-xs">S{String(s.index).padStart(2,'0')} — {s.title}</span>
            <span className="text-[#888] text-xs flex gap-2">
              {s.leafCount != null && <span>{s.leafCount}ep</span>}
              <span>{openSeason === s.ratingKey ? '▲' : '▼'}</span>
            </span>
          </button>
          {openSeason === s.ratingKey && (
            <div className="ml-3 border-l border-[#2a2a4a] pl-2 pb-1">
              {loadingSeason === s.ratingKey ? <div className="py-2"><Spinner /></div> : (
                <div className="space-y-0.5 pt-0.5">
                  {(episodes[s.ratingKey] ?? []).map(ep => (
                    <div key={ep.ratingKey} className="py-1 px-1.5 flex items-center gap-2">
                      <span className="text-[#7070a8] text-xs w-7 shrink-0">E{String(ep.index).padStart(2,'0')}</span>
                      <span className="text-[#bbb] text-xs truncate flex-1">{ep.title}</span>
                      {ep.duration != null && <span className="text-[#666] text-xs shrink-0">{fmtDuration(ep.duration)}</span>}
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
  if (!photos.length) return <p className="text-[#999] text-xs">// none available</p>
  return (
    <>
      <p className="text-[#7070a8] text-xs mb-1.5">// {photos.length} available — click to select, then --save</p>
      <div className={`grid gap-2 ${isPortrait ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {photos.map((p, i) => {
          const isPending  = pendingKey === p.key
          const isSelected = p.selected && !pendingKey
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <button onClick={() => onPick(p.key)} disabled={saving}
                className={`relative overflow-hidden border ${isPending ? 'border-green-400' : isSelected ? 'border-white' : 'border-[#2a2a4a] hover:border-[#7070a8]'}`}
                style={{ aspectRatio: isPortrait ? '2/3' : '16/9' }}>
                <img src={`/api/plex?thumb=${encodeURIComponent(p.thumb)}`} alt="" className="w-full h-full object-cover" />
                {isPending && (
                  <div className="absolute inset-0 flex items-end justify-start p-0.5 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[7px] font-mono text-green-400 leading-none">● selected</span>
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
                <span className="text-[7px] font-mono text-[#7070a8]">[{i}]</span>
                <span className="text-[7px] font-mono text-[#888]">{srcLabel(p.key)}</span>
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
          className="bg-[#0f0f1a] border border-[#1a1a2e] text-white font-mono text-xs px-2 py-1 flex-1 focus:outline-none focus:border-[#888]" />
        <button onClick={search} disabled={loading} className="btn-xs text-violet-400">{loading ? '...' : '--grep'}</button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {results.map((m, i) => (
            <div key={i} className="flex items-center gap-2 py-1 border-b border-[#0f0f1a]">
              {m.thumb && <img src={m.thumb} alt="" className="w-8 aspect-[2/3] object-cover shrink-0 border border-[#2a2a4a]" />}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs truncate">{m.name}</p>
                {m.year && <p className="text-[#999] text-xs">{m.year}</p>}
              </div>
              <button onClick={() => apply(m)} disabled={!!acting} className="btn-xs text-blue-400 shrink-0">
                {acting === m.guid ? '...' : '--set'}
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
const statusColor: Record<number, string>  = { 1: 'text-yellow-400', 2: 'text-blue-400', 3: 'text-red-400', 4: 'text-green-400', 5: 'text-purple-400' }

// ── stage detection ───────────────────────────────────────────────────────────

type Stage = 'downloading' | 'available' | 'searching' | 'requested' | 'unknown'

function detectStage(arr: any, qbit: any, seer: any, plex: any): Stage {
  if (qbit && qbit.progress < 1) return 'downloading'
  if (plex) return 'available'
  if (arr?.hasFile) return 'available'
  if (arr?.queueItem) return 'downloading'
  if (arr && !arr.hasFile) return 'searching'
  const seerStatus = seer?.mediaInfo?.status
  if (seerStatus && seerStatus >= 1 && seerStatus <= 5) return 'requested'
  return 'unknown'
}

const stageColor: Record<Stage, string> = {
  downloading: 'text-blue-400',
  available:   'text-green-400',
  searching:   'text-yellow-400',
  requested:   'text-purple-400',
  unknown:     'text-[#666]',
}

// ── pipeline mini-map ─────────────────────────────────────────────────────────

type NodeState = 'done' | 'active' | 'warn' | 'error' | 'pending' | 'na'

function PipelineMiniMap({ arr, qbit, seer, plex, mediaType, loading }: {
  arr: any; qbit: any; seer: any; plex: any; mediaType: 'movie' | 'tv'; loading: boolean
}) {
  const qitem = arr?.queueItem ?? null
  const plexOnly = !arr && !qbit && !seer && !!plex

  const seerStatus = seer?.mediaInfo?.status ?? 0
  const arrTracked = qitem?.trackedDownloadStatus
  const qbitState  = qbit?.state ?? ''

  const seerNode: NodeState  = plexOnly ? 'na'
    : seer ? (seerStatus >= 2 ? 'done' : 'active') : (arr || plex ? 'done' : 'pending')

  const arrTrackedWarn  = arrTracked === 'warning'
  const arrTrackedError = arrTracked === 'error'
  const arrNode: NodeState = plexOnly ? 'na'
    : arr?.hasFile ? 'done'
    : arrTrackedError ? 'error'
    : arrTrackedWarn  ? 'warn'
    : arr ? 'active'
    : 'pending'

  const qbitWarn  = /^(stalledDL|stalledUP)$/.test(qbitState)
  const qbitError = /^(error|missingFiles)$/.test(qbitState)
  const qbitNode: NodeState = plexOnly ? 'na'
    : arr?.hasFile ? 'done'
    : qbitError ? 'error'
    : qbitWarn  ? 'warn'
    : qbit && qbit.progress < 1 ? 'active'
    : (arr?.hasFile || plex) ? 'done'
    : 'pending'

  const plexNode: NodeState = plex ? 'done' : 'pending'

  const arrLabel  = mediaType === 'movie' ? 'radarr' : 'sonarr'
  const nodes: { label: string; state: NodeState }[] = [
    { label: 'seer',    state: seerNode },
    { label: arrLabel,  state: arrNode  },
    { label: 'qbit',    state: qbitNode },
    { label: 'plex',    state: plexNode },
  ]

  function nodeColor(s: NodeState) {
    if (s === 'done')    return 'text-[#4a7a5a]'
    if (s === 'active')  return 'text-white'
    if (s === 'warn')    return 'text-yellow-400'
    if (s === 'error')   return 'text-red-400'
    if (s === 'na')      return 'text-[#444]'
    return 'text-[#555]'
  }
  function nodeSymbol(s: NodeState) {
    if (s === 'done')   return '✓'
    if (s === 'active') return '●'
    if (s === 'warn')   return '!'
    if (s === 'error')  return '✗'
    if (s === 'na')     return '–'
    return '·'
  }

  return (
    <div className="flex items-center justify-between w-full">
      {nodes.map((n, i) => (
        <span key={n.label} className="flex items-center">
          <span className={`${nodeColor(n.state)} ${n.state === 'active' ? 'font-bold' : ''}`}>
            [{n.label} {nodeSymbol(n.state)}]
          </span>
          {i < nodes.length - 1 && (
            <span className="text-[#333] mx-1">──►</span>
          )}
        </span>
      ))}
      {loading && <span className="text-[#444] text-[10px]">...</span>}
    </div>
  )
}

// ── section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <p className="text-[#7070a8] text-xs mb-2">{`/* ${label} */`}</p>
}

// ── props ─────────────────────────────────────────────────────────────────────

interface Props {
  entry: DrawerEntry | null
  onClose: () => void
  onRefresh: () => void
}

// ── main component ────────────────────────────────────────────────────────────

export default function UnifiedDrawer({ entry, onClose, onRefresh }: Props) {
  const isOpen = !!entry

  // resolution state
  const [tmdbId,     setTmdbId]     = useState<number | null>(null)
  const [mediaType,  setMediaType]  = useState<'movie' | 'tv'>('movie')
  const [resolving,  setResolving]  = useState(false)

  // arr detail (from entry-point fetch)
  const [arrDetail,  setArrDetail]  = useState<any>(null)
  const [profiles,   setProfiles]   = useState<{ id: number; name: string }[]>([])

  // pipeline state
  const [pipeline,   setPipeline]   = useState<{ arr: any; qbit: any; seer: any; plex: any; profiles: any[] } | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)

  // qbit direct — fetched by hash when entry is via qbit, regardless of pipeline
  const [qbitDirect, setQbitDirect] = useState<any>(null)

  // episode synopsis — fetched for Sonarr/Plex episode entries
  const [episodeSynopsis, setEpisodeSynopsis] = useState<string | null>(null)

  // actions
  const [acting,     setActing]     = useState<string | null>(null)
  const [qualActing, setQualActing] = useState(false)

  // release search
  const [releases,   setReleases]   = useState<Release[] | null>(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relError,   setRelError]   = useState<string | null>(null)
  const [episodes,   setEpisodes]   = useState<SonarrEpisode[] | null>(null)
  const [selEpId,    setSelEpId]    = useState<number | null>(null)

  // plex episode info (set when entry is via plex and type === 'episode')
  const [plexEpisode, setPlexEpisode] = useState<{ showTitle: string; season: number; episode: number; title: string } | null>(null)

  // plex panels
  const [showPosters,   setShowPosters]   = useState(false)
  const [showArt,       setShowArt]       = useState(false)
  const [pendingKey,    setPendingKey]    = useState<string | null>(null)
  const [artworkSaving, setArtworkSaving] = useState(false)
  const [artworkVersion, setArtworkVersion] = useState(0)
  const [imgBust,       setImgBust]       = useState(0)
  const [plexImgData,   setPlexImgData]   = useState<{thumb?: string; art?: string} | null>(null)
  const [showMatch,   setShowMatch]   = useState(false)
  const [showSeries,  setShowSeries]  = useState(false)

  // request modal
  const [requestItem, setRequestItem] = useState<SeerSearchResult | null>(null)

  // ── step 1: resolve tmdbId from entry point ─────────────────────────────────

  useEffect(() => {
    if (!entry) {
      setTmdbId(null); setArrDetail(null); setProfiles([]); setPipeline(null)
      setReleases(null); setRelError(null); setEpisodes(null); setSelEpId(null)
      return
    }

    setTmdbId(null); setArrDetail(null); setProfiles([]); setPipeline(null)
    setReleases(null); setRelError(null); setEpisodes(null); setSelEpId(null)
    setShowPosters(false); setShowArt(false); setShowMatch(false); setShowSeries(false); setPendingKey(null)
    setPlexEpisode(null); setQbitDirect(null); setEpisodeSynopsis(null); setPlexImgData(null)
    setResolving(true)

    async function resolve() {
      try {
        if (!entry) return
        if (entry.via === 'radarr') {
          const [detailRes, profRes] = await Promise.all([
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

          // If we have a specific episodeId, fetch that episode directly (fastest path)
          if (entry.episodeId) {
            fetch(`/api/sonarr?episodeId=${entry.episodeId}`)
              .then(r => r.json())
              .then((ep: SonarrEpisode | null) => {
                if (!ep) return
                setSelEpId(ep.id)
                if (ep.overview) {
                  setEpisodeSynopsis(ep.overview)
                } else {
                  // Try Trakt fallback
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

          // Also fetch full episodes list for the picker UI
          fetch(`/api/sonarr?episodes=${entry.seriesId}`)
            .then(r => r.json())
            .then((eps: SonarrEpisode[]) => {
              setEpisodes(eps)
              if (!entry.episodeId) {
                // Auto-select next upcoming episode
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

          // Episodes don't carry Guid — fetch from the show (grandparent) instead
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
          // Fetch torrent stats directly by hash (?info= returns QBTorrent fields)
          fetch(`/api/qbittorrent?info=${entry.hash}`)
            .then(r => r.json())
            .then(data => { if (data) setQbitDirect(data) })
            .catch(() => {})
        }
      } catch { /* ignore */ }
      finally {
        setResolving(false)
        // If resolve() finished without setting tmdbId, mark as -1 so the
        // loading condition clears and the drawer renders with partial data
        setTmdbId(prev => prev === null ? -1 : prev)
      }
    }

    resolve()
  }, [entry])

  // ── step 1b: for qbit TV entries, parse S/E from torrent name and fetch episode synopsis ──

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

  // ── step 2: fetch pipeline once tmdbId is known ─────────────────────────────

  const fetchPipeline = useCallback(async (id: number, mt: 'movie' | 'tv', attempt = 1) => {
    setPipelineLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const res  = await fetch(`/api/pipeline?tmdbId=${id}&mediaType=${mt}`, { signal: controller.signal })
      const data = await res.json()
      // Merge with existing pipeline: don't overwrite a service that previously loaded with a null
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
      // Use episode synopsis from queue item if available and not already set
      const epOverview = data.arr?.episodeDetail?.overview
      if (epOverview) setEpisodeSynopsis(prev => prev || epOverview)
      // If some services came back null and we have retries left, retry once after a delay
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

  // ── helpers ──────────────────────────────────────────────────────────────────

  const arr    = pipeline?.arr    ?? arrDetail
  const qbit   = pipeline?.qbit   ?? null
  const seer   = pipeline?.seer   ?? null
  const plex   = pipeline?.plex   ?? null
  const profs  = pipeline?.profiles?.length ? pipeline.profiles : profiles

  // qbitData: prefer pipeline result, fall back to direct fetch (has QBTorrent fields)
  const qbitData = qbit ?? qbitDirect ?? null

  const stage  = detectStage(arr, qbitData, seer, plex)
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
        // Give Plex a moment to process the refresh before re-fetching pipeline
        setTimeout(() => fetchPipeline(tmdbId, mediaType), 3000)
      }
    } finally { setActing(null) }
  }

  async function deleteChain() {
    if (!confirm(`Delete ${title}? Files will be permanently removed.`)) return
    setActing('plex-delete')
    try {
      // Step 1: Arr deletes entry + files
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
      // Step 2: Plex deletes — succeeds if file still there, fine if already gone
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

  // null = not yet resolved → spinner; -1 = resolved, no tmdb id → show without pipeline data
  const loading = resolving || tmdbId === null || (tmdbId > 0 && pipeline === null)
  // Suppress series overview when entry is inherently episode-level.
  // Don't use selEpId here — it's async and causes a race with the pipeline render.
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
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}
      >
        {backdrop && (
          <div className="absolute top-0 left-0 right-0 h-80 pointer-events-none" style={{ zIndex: 0 }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backdrop})`, filter: 'blur(2px)', opacity: 0.35, maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)' }} />
          </div>
        )}


        <div className="relative z-10 overflow-y-auto h-full p-6">
          {/* header */}
          <div className="flex justify-between items-center mb-6">
            <span className="text-[#7070a8] text-xs">{`/* unified -- detail */`}</span>
            <button onClick={onClose} className="btn-xs text-[#ccc] hover:text-white">--close</button>
          </div>

          {loading && <Spinner />}

          {!loading && entry && (
            <>
              {/* media header */}
              <div className="flex gap-4 mb-6">
                {poster && (
                  <div className="relative flex-shrink-0 z-30">
                    <img src={poster} alt={title} className="w-36 aspect-[2/3] object-cover border border-[#1a1a2e]" />
                    {plex?.ratingKey && (
                      <button
                        onClick={() => { setShowPosters(v => !v); setShowArt(false); setShowMatch(false) }}
                        className={`absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 border transition-colors ${showPosters ? 'border-white text-white bg-black/80' : 'border-[#444] text-[#777] bg-black/60 hover:border-[#aaa] hover:text-[#ccc]'}`}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {plexEpisode ? (
                    <>
                      <p className="text-white text-sm font-medium leading-snug">{plexEpisode.showTitle}</p>
                      <p className="text-[#999] text-xs mt-0.5">
                        S{String(plexEpisode.season).padStart(2,'0')}E{String(plexEpisode.episode).padStart(2,'0')}
                        {plexEpisode.title && <span className="text-[#bbb]"> — {plexEpisode.title}</span>}
                      </p>
                    </>
                  ) : (
                    <p className="text-white text-sm font-medium leading-snug">
                      {title}
                      {year && <span className="text-[#ccc] ml-2 font-normal">({year})</span>}
                    </p>
                  )}
                  {arr?.genres?.length > 0 && (
                    <p className="text-[#bbb] text-xs mt-0.5">{arr.genres.slice(0, 3).join(', ')}</p>
                  )}
                  {imdbRating && (
                    <p className="text-[#999] text-xs mt-0.5">imdb {imdbRating.toFixed(1)}</p>
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
                        className="text-[9px] font-mono px-1.5 py-0.5 border border-[#444] text-[#777] bg-black/40 hover:border-[#aaa] hover:text-[#ccc] transition-colors"
                      >
                        ↺
                      </button>
                      <button
                        onClick={() => { setShowArt(v => !v); setShowPosters(false); setShowMatch(false) }}
                        className={`text-[9px] font-mono px-1.5 py-0.5 border transition-colors ${showArt ? 'border-white text-white bg-black/70' : 'border-[#444] text-[#777] bg-black/40 hover:border-[#aaa] hover:text-[#ccc]'}`}
                      >
                        ✎ art
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── pipeline mini-map ── */}
              <div className="flex items-center justify-between border-y border-[#2a2a4a] py-3 mb-6 font-mono text-xs">
                <PipelineMiniMap
                  arr={arr} qbit={qbitData} seer={seer} plex={plex}
                  mediaType={mediaType} loading={pipelineLoading} />
              </div>

              {/* ── pipeline ── */}
              <div className="mb-6">
                <SectionHeader label="pipeline" />
                <div className="space-y-4">

                  {/* radarr / sonarr row */}
                  {arr && (
                    <div className="space-y-1.5 text-xs border-l-2 border-[#2a2a4a] pl-3">
                      <p className="text-[#7070a8] text-[10px] uppercase tracking-wider">{mediaType === 'movie' ? 'radarr' : 'sonarr'}</p>

                      {/* monitored toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-[#bbb] w-20">monitored:</span>
                        <button
                          onClick={() => arrAction('toggleMonitor', { monitored: !arr.monitored })}
                          disabled={!!acting}
                          className={`text-xs ${arr.monitored ? 'text-yellow-400' : 'text-[#ccc]'}`}
                        >
                          {arr.monitored ? '●' : '○'}
                        </button>
                      </div>

                      {/* quality profile */}
                      {profs.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[#bbb] w-20">profile:</span>
                          <select
                            value={arr.qualityProfileId ?? ''}
                            onChange={e => changeQuality(Number(e.target.value))}
                            disabled={qualActing}
                            className="bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-0.5 focus:outline-none focus:border-[#888] disabled:opacity-50"
                          >
                            {profs.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {qualActing && <span className="text-[#bbb] text-xs">...</span>}
                        </div>
                      )}

                      {/* imported file quality */}
                      {arr.movieFile?.quality?.quality?.name && (
                        <div className="flex items-center gap-2">
                          <span className="text-[#bbb] w-20">file:</span>
                          <span className="text-green-300">{arr.movieFile.quality.quality.name}</span>
                          {arr.movieFile.size && <span className="text-[#999]">{fmtSize(arr.movieFile.size)}</span>}
                        </div>
                      )}

                      {/* active queue item */}
                      {qitem && (
                        <div className="space-y-1 mt-1">
                          <div className="flex gap-2">
                            <span className="text-[#bbb] w-20">status:</span>
                            <span className="text-white">{qitem.status}</span>
                          </div>
                          {qitem.quality?.quality?.name && (
                            <div className="flex gap-2">
                              <span className="text-[#bbb] w-20">grabbed:</span>
                              <span className="text-green-300">{qitem.quality.quality.name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[#bbb] w-20">progress:</span>
                            <ProgressBar pct={pct} width={16} />
                            <span className="text-[#999]">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-[#bbb] w-20">size:</span>
                            <span className="text-[#ccc]">{fmtSize(qitem.size)}</span>
                          </div>
                        </div>
                      )}

                      {/* arr actions */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {arr.id && (
                          <button onClick={() => arrAction('search')} disabled={!!acting} className="btn-xs text-violet-400">
                            {acting === 'search' ? '...' : 'grep'}
                          </button>
                        )}
                        {(mediaType === 'movie' ? arr.id : selEpId) && (
                          <button onClick={searchReleases} disabled={relLoading} className="btn-xs text-violet-400">
                            {relLoading ? '...' : 'grep -i'}
                          </button>
                        )}
                        {qitem?.id && (
                          <>
                            <button
                              onClick={() => { if (confirm(`Remove ${title} from queue?`)) arrAction('delete') }}
                              disabled={!!acting} className="btn-xs text-red-400"
                            >
                              {acting === 'delete' ? '...' : '--rm'}
                            </button>
                            <button
                              onClick={() => { if (confirm(`Blacklist and remove ${title}?`)) arrAction('delete', { blacklist: true }) }}
                              disabled={!!acting} className="btn-xs text-red-600"
                            >
                              --blacklist --rm
                            </button>
                          </>
                        )}
                      </div>

                      {/* sonarr episode picker */}
                      {mediaType === 'tv' && episodes !== null && episodes.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[#bbb] text-xs block mb-1">episode:</span>
                          <select
                            value={selEpId ?? ''}
                            onChange={e => setSelEpId(Number(e.target.value))}
                            className="bg-[#0f0f1a] border border-[#1a1a2e] text-white text-xs font-mono px-2 py-1 w-full focus:outline-none focus:border-[#888]"
                          >
                            {Array.from(new Set(episodes.filter(e => e.seasonNumber > 0 && e.monitored).map(e => e.seasonNumber)))
                              .sort((a, b) => a - b).map(season => (
                                <optgroup key={season} label={`Season ${season}`}>
                                  {episodes.filter(e => e.seasonNumber === season && e.monitored)
                                    .sort((a, b) => a.episodeNumber - b.episodeNumber)
                                    .map(e => (
                                      <option key={e.id} value={e.id}>
                                        {`S${String(e.seasonNumber).padStart(2,'0')}E${String(e.episodeNumber).padStart(2,'0')} — ${e.title}${e.hasFile ? ' [dl]' : ''}`}
                                      </option>
                                    ))}
                                </optgroup>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* qbittorrent row */}
                  {(qbitData || entry?.via === 'qbit') && (
                    <div className="space-y-1.5 text-xs border-l-2 border-[#2a2a4a] pl-3">
                      <p className="text-[#7070a8] text-[10px] uppercase tracking-wider">qbittorrent</p>
                      {qbitData ? (
                        <>
                          {qbitData.name && entry?.via === 'qbit' && (
                            <p className="text-[#ccc] text-xs break-all leading-relaxed">{qbitData.name}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[#bbb] w-20">progress:</span>
                            <ProgressBar pct={(qbitData.progress ?? 0) * 100} width={16} />
                            <span className="text-[#999]">{((qbitData.progress ?? 0) * 100).toFixed(0)}%</span>
                          </div>
                          {qbitData.size > 0 && (
                            <div className="flex gap-2">
                              <span className="text-[#bbb] w-20">downloaded:</span>
                              <span className="text-[#ccc]">{fmtSize(qbitData.downloaded ?? 0)}</span>
                              <span className="text-[#555]">of</span>
                              <span className="text-[#ccc]">{fmtSize(qbitData.size)}</span>
                            </div>
                          )}
                          {((qbitData.dlspeed ?? 0) > 0 || (qbitData.upspeed ?? 0) > 0) && (
                            <div className="flex gap-3">
                              <span className="text-green-400">↓ {fmtSpeed(qbitData.dlspeed ?? 0)}</span>
                              <span className="text-blue-400">↑ {fmtSpeed(qbitData.upspeed ?? 0)}</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <span className="text-[#bbb] w-20">state:</span>
                            <span className="text-white">{qbitData.state}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <button onClick={() => qbitAction(isPaused ? 'resume' : 'pause')} disabled={!!acting}
                              className={`btn-xs ${isPaused ? 'text-green-400' : 'text-yellow-400'}`}>
                              {acting === `qbit-${isPaused ? 'resume' : 'pause'}` ? '...' : isPaused ? '--resume' : '--pause'}
                            </button>
                            <button onClick={() => { if (confirm(`Delete torrent?`)) qbitAction('delete', { deleteFiles: false }) }}
                              disabled={!!acting} className="btn-xs text-red-400">--rm</button>
                            <button onClick={() => { if (confirm(`Delete torrent and files?`)) qbitAction('delete', { deleteFiles: true }) }}
                              disabled={!!acting} className="btn-xs text-red-600">--rm --files</button>
                          </div>
                        </>
                      ) : (
                        <p className="text-[#555] text-xs">loading...</p>
                      )}
                    </div>
                  )}

                  {/* plex row */}
                  <div className="space-y-1.5 text-xs border-l-2 border-[#2a2a4a] pl-3">
                    <p className="text-[#7070a8] text-[10px] uppercase tracking-wider">plex</p>
                    {plex ? (
                      <>
                        {(() => {
                          const m = plex.Media?.[0]
                          const res    = fmtRes(m?.videoResolution)
                          const codecs = [m?.videoCodec, m?.audioCodec].filter(Boolean).join(' / ')
                          const br     = fmtBitrate(m?.bitrate)
                          return (
                            <div className="space-y-1">
                              {res    && <div className="flex gap-2"><span className="text-[#bbb] w-20">resolution:</span><span className="text-green-300">{res}</span></div>}
                              {codecs && <div className="flex gap-2"><span className="text-[#bbb] w-20">codec:</span><span className="text-[#ccc]">{codecs}</span></div>}
                              {m?.container && <div className="flex gap-2"><span className="text-[#bbb] w-20">container:</span><span className="text-[#ccc]">{m.container}</span></div>}
                              {br    && <div className="flex gap-2"><span className="text-[#bbb] w-20">bitrate:</span><span className="text-[#ccc]">{br}</span></div>}
                              {m?.Part?.[0]?.size && <div className="flex gap-2"><span className="text-[#bbb] w-20">size:</span><span className="text-[#ccc]">{fmtSize(m.Part[0].size!)}</span></div>}
                            </div>
                          )
                        })()}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <button onClick={() => plexAction('refresh')} disabled={!!acting} className="btn-xs text-blue-400">
                            {acting === 'plex-refresh' ? '...' : '--refresh'}
                          </button>
                          <button onClick={() => { setShowMatch(v => !v); setShowPosters(false); setShowArt(false); setPendingKey(null) }}
                            className={`btn-xs ${showMatch ? 'text-white' : 'text-[#999]'}`}>--fix-match</button>
                          {mediaType === 'tv' && (
                            <button onClick={() => setShowSeries(v => !v)}
                              className={`btn-xs ${showSeries ? 'text-white' : 'text-[#999]'}`}>--series</button>
                          )}
                          <button onClick={deleteChain}
                            disabled={!!acting} className="btn-xs text-red-400">
                            {acting === 'plex-delete' ? '...' : '--rm'}
                          </button>
                        </div>

                        {pendingKey && (
                          <button onClick={saveArtwork} disabled={artworkSaving}
                            className="btn-xs text-green-400 hover:text-green-300 disabled:opacity-50">
                            {artworkSaving ? '...' : '--save'}
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
                      <p className="text-[#555] text-xs">not in library</p>
                    )}
                  </div>

                  {/* seer row */}
                  <div className="space-y-1.5 text-xs border-l-2 border-[#2a2a4a] pl-3">
                    <p className="text-[#7070a8] text-[10px] uppercase tracking-wider">seer</p>
                    {seer?.mediaInfo?.status != null ? (
                      <div className="flex items-center gap-3">
                        <span className={`text-xs ${statusColor[seer.mediaInfo.status] ?? 'text-[#888]'}`}>
                          {statusLabel[seer.mediaInfo.status] ?? String(seer.mediaInfo.status)}
                        </span>
                        {tmdbId && seer.mediaInfo.status < 4 && (
                          <button
                            className="btn-xs text-cyan-600 hover:text-cyan-400"
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
                        <span className="text-[#555] text-xs">not requested</span>
                        {tmdbId && (
                          <button
                            className="btn-xs text-cyan-600 hover:text-cyan-400"
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
                  </div>

                </div>
              </div>

              {/* overview — episode synopsis when available; series overview only for movie/seer/trakt entries */}
              {(episodeSynopsis || (!isEpisodeMode && arr?.overview)) && (
                <div className="mb-6">
                  <SectionHeader label="overview" />
                  <p className="text-[#bbb] text-xs leading-relaxed">{episodeSynopsis || arr?.overview}</p>
                </div>
              )}

              {/* release search results */}
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
