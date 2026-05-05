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

  // actions
  const [acting,     setActing]     = useState<string | null>(null)
  const [qualActing, setQualActing] = useState(false)

  // release search
  const [releases,   setReleases]   = useState<Release[] | null>(null)
  const [relLoading, setRelLoading] = useState(false)
  const [relError,   setRelError]   = useState<string | null>(null)
  const [episodes,   setEpisodes]   = useState<SonarrEpisode[] | null>(null)
  const [selEpId,    setSelEpId]    = useState<number | null>(null)

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

          // fetch episodes for sonarr
          fetch(`/api/sonarr?episodes=${entry.seriesId}`)
            .then(r => r.json())
            .then((eps: SonarrEpisode[]) => {
              setEpisodes(eps)
              if (entry.episodeId) {
                setSelEpId(entry.episodeId)
              } else {
                const now = Date.now()
                const next = eps.filter(e => e.monitored && !e.hasFile && e.airDateUtc && new Date(e.airDateUtc).getTime() > now)
                  .sort((a, b) => new Date(a.airDateUtc!).getTime() - new Date(b.airDateUtc!).getTime())
                if (next[0]) setSelEpId(next[0].id)
              }
            })
            .catch(() => setEpisodes([]))

        } else if (entry.via === 'plex') {
          const res  = await fetch(`/api/plex?ratingKey=${entry.ratingKey}`)
          const data = await res.json()
          const detail = data.detail ?? null
          setMediaType(entry.mediaType)
          const guids: { id: string }[] = detail?.Guid ?? []
          const tmdb = guids.find(g => g.id.startsWith('tmdb://'))
          if (tmdb) setTmdbId(parseInt(tmdb.id.replace('tmdb://', '')))
        }
      } catch { /* ignore */ }
      finally { setResolving(false) }
    }

    resolve()
  }, [entry])

  // ── step 2: fetch pipeline once tmdbId is known ─────────────────────────────

  const fetchPipeline = useCallback(async (id: number, mt: 'movie' | 'tv') => {
    setPipelineLoading(true)
    try {
      const res  = await fetch(`/api/pipeline?tmdbId=${id}&mediaType=${mt}`)
      const data = await res.json()
      setPipeline(data)
      // pipeline may return fresher arr detail + profiles
      if (data.arr && !arrDetail) setArrDetail(data.arr)
      if (data.profiles?.length && !profiles.length) setProfiles(data.profiles)
    } catch { /* ignore */ }
    finally { setPipelineLoading(false) }
  }, [arrDetail, profiles.length])

  useEffect(() => {
    if (tmdbId) fetchPipeline(tmdbId, mediaType)
  }, [tmdbId, mediaType]) // eslint-disable-line

  // ── helpers ──────────────────────────────────────────────────────────────────

  const arr    = pipeline?.arr    ?? arrDetail
  const qbit   = pipeline?.qbit   ?? null
  const seer   = pipeline?.seer   ?? null
  const plex   = pipeline?.plex   ?? null
  const profs  = pipeline?.profiles?.length ? pipeline.profiles : profiles

  const stage  = detectStage(arr, qbit, seer, plex)
  const qitem  = arr?.queueItem ?? null
  const pct    = qbit ? qbit.progress * 100 : (qitem && qitem.size > 0 ? ((qitem.size - qitem.sizeleft) / qitem.size) * 100 : 0)

  const poster   = arr?.images?.find((i: any) => i.coverType === 'poster')?.remoteUrl
                ?? (entry?.via === 'plex' ? (entry.thumb ? `/api/plex?thumb=${encodeURIComponent(entry.thumb)}` : null) : null)
  const backdrop = arr?.images?.find((i: any) => i.coverType === 'fanart')?.remoteUrl
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
    if (!qbit) return
    setActing(`qbit-${action}`)
    try {
      await fetch('/api/qbittorrent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, hash: qbit.hash, ...extra }),
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
    } finally { setActing(null) }
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

  const loading = resolving || (!!entry && !arr && !pipeline && pipelineLoading)
  const isPaused = qbit?.state?.toLowerCase().includes('paused')

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
          <div className="absolute top-0 inset-x-0 h-72 pointer-events-none overflow-hidden">
            <div className="absolute inset-0 scale-110 bg-cover bg-center" style={{ backgroundImage: `url(${backdrop})`, filter: 'blur(20px)', opacity: 0.18, maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }} />
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
                  <img src={poster} alt={title} className="w-36 aspect-[2/3] flex-shrink-0 object-cover border border-[#1a1a2e]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-snug">
                    {title}
                    {year && <span className="text-[#ccc] ml-2 font-normal">({year})</span>}
                  </p>
                  {arr?.genres?.length > 0 && (
                    <p className="text-[#bbb] text-xs mt-0.5">{arr.genres.slice(0, 3).join(', ')}</p>
                  )}
                  {imdbRating && (
                    <p className="text-[#999] text-xs mt-0.5">imdb {imdbRating.toFixed(1)}</p>
                  )}
                  {/* stage pill */}
                  <p className={`text-xs mt-2 font-mono ${stageColor[stage]}`}>
                    ● {stage}
                    {pipelineLoading && <span className="text-[#555] ml-2">...</span>}
                  </p>
                </div>
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
                  {qbit && (
                    <div className="space-y-1.5 text-xs border-l-2 border-[#2a2a4a] pl-3">
                      <p className="text-[#7070a8] text-[10px] uppercase tracking-wider">qbittorrent</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[#bbb] w-20">progress:</span>
                        <ProgressBar pct={qbit.progress * 100} width={16} />
                        <span className="text-[#999]">{(qbit.progress * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-[#bbb] w-20">downloaded:</span>
                        <span className="text-[#ccc]">{fmtSize(qbit.downloaded)}</span>
                        <span className="text-[#555]">of</span>
                        <span className="text-[#ccc]">{fmtSize(qbit.size)}</span>
                      </div>
                      {(qbit.dlspeed > 0 || qbit.upspeed > 0) && (
                        <div className="flex gap-3">
                          <span className="text-green-400">↓ {fmtSpeed(qbit.dlspeed)}</span>
                          <span className="text-blue-400">↑ {fmtSpeed(qbit.upspeed)}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <span className="text-[#bbb] w-20">state:</span>
                        <span className="text-white">{qbit.state}</span>
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
                    </div>
                  )}

                  {/* plex row */}
                  <div className="space-y-1.5 text-xs border-l-2 border-[#2a2a4a] pl-3">
                    <p className="text-[#7070a8] text-[10px] uppercase tracking-wider">plex</p>
                    {plex ? (
                      <>
                        {(() => {
                          const m = plex.Media?.[0]
                          const res = fmtRes(m?.videoResolution)
                          const codecs = [m?.videoCodec, m?.audioCodec].filter(Boolean).join(' / ')
                          const br = fmtBitrate(m?.bitrate)
                          const size = fmtSize(m?.Part?.[0]?.size ?? 0)
                          return (
                            <div className="space-y-1">
                              {res && <div className="flex gap-2"><span className="text-[#bbb] w-20">resolution:</span><span className="text-green-300">{res}</span></div>}
                              {codecs && <div className="flex gap-2"><span className="text-[#bbb] w-20">codec:</span><span className="text-[#ccc]">{codecs}</span></div>}
                              {m?.container && <div className="flex gap-2"><span className="text-[#bbb] w-20">container:</span><span className="text-[#ccc]">{m.container}</span></div>}
                              {br && <div className="flex gap-2"><span className="text-[#bbb] w-20">bitrate:</span><span className="text-[#ccc]">{br}</span></div>}
                              {m?.Part?.[0]?.size && <div className="flex gap-2"><span className="text-[#bbb] w-20">size:</span><span className="text-[#ccc]">{size}</span></div>}
                            </div>
                          )
                        })()}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <button onClick={() => plexAction('refresh')} disabled={!!acting} className="btn-xs text-blue-400">
                            {acting === 'plex-refresh' ? '...' : '--refresh'}
                          </button>
                          <button onClick={() => { if (confirm(`Delete from Plex?`)) plexAction('delete') }}
                            disabled={!!acting} className="btn-xs text-red-400">
                            {acting === 'plex-delete' ? '...' : '--rm'}
                          </button>
                        </div>
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
                        {tmdbId && (
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

              {/* overview */}
              {arr?.overview && (
                <div className="mb-6">
                  <SectionHeader label="overview" />
                  <p className="text-[#bbb] text-xs leading-relaxed">{arr.overview}</p>
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
