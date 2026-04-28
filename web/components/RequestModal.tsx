'use client'

import { useState, useEffect } from 'react'
import { SeerSearchResult, DiscoverDetail } from '@/types'

interface Profile    { id: number; name: string }
interface RootFolder { path: string; freeSpace: number }
interface SonarrEp   { id: number; seasonNumber: number; episodeNumber: number; title: string; hasFile: boolean }

const TMDB_W = (w: number, path: string) => `https://image.tmdb.org/t/p/w${w}${path}`

function fmtFree(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(0)}GB free`
  return `${(bytes / 1024 ** 2).toFixed(0)}MB free`
}

function isUltraHD(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('ultra') || n.includes('2160') || n.includes('4k') || n.includes('uhd')
}

function MetaRow({ label, value, lines = 1 }: { label: string; value: string; lines?: 1 | 2 }) {
  return (
    <p className="flex gap-2 overflow-hidden">
      <span className="text-[#6a9a7a] shrink-0 whitespace-nowrap w-[72px]">// {label}</span>
      <span className={`text-[#ccc] min-w-0 ${lines === 2 ? 'line-clamp-2' : 'truncate'}`}>{value}</span>
    </p>
  )
}

interface Props {
  item: SeerSearchResult | null
  onClose: () => void
  onDone: () => void
}

export default function RequestModal({ item, onClose, onDone }: Props) {
  const isOpen = item !== null

  const [detail,          setDetail]          = useState<DiscoverDetail | null>(null)
  const [profiles,        setProfiles]        = useState<Profile[]>([])
  const [folders,         setFolders]         = useState<RootFolder[]>([])
  const [profileId,       setProfileId]       = useState<number | null>(null)
  const [rootFolder,      setRootFolder]      = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [submitting,      setSubmitting]      = useState(false)
  const [submitted,       setSubmitted]       = useState(false)
  const [submitError,     setSubmitError]     = useState<string | null>(null)
  const [submitStatus,    setSubmitStatus]    = useState('')
  const [monitoredCount,  setMonitoredCount]  = useState<number | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(new Set())
  const [availableSeasons,setAvailableSeasons]= useState<Set<number>>(new Set())
  const [sonarrSeriesId,  setSonarrSeriesId]  = useState<number | null>(null)
  const [tvdbId,          setTvdbId]          = useState<number | null>(null)
  const [sonarrEpisodes,  setSonarrEpisodes]  = useState<SonarrEp[]>([])
  const [lookupSeasons,   setLookupSeasons]   = useState<{ seasonNumber: number; totalEpisodes: number }[]>([])
  const [expandedSeason,  setExpandedSeason]  = useState<number | null>(null)
  const [deselectedEps,   setDeselectedEps]   = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!item) return
    setLoading(true)
    setDetail(null)
    setProfiles([])
    setFolders([])
    setProfileId(null)
    setRootFolder(null)
    setSubmitted(false)
    setSubmitError(null)
    setSubmitStatus('')
    setMonitoredCount(null)
    setSelectedSeasons(new Set())
    setAvailableSeasons(new Set())
    setSonarrSeriesId(null)
    setTvdbId(null)
    setSonarrEpisodes([])
    setLookupSeasons([])
    setExpandedSeason(null)
    setDeselectedEps(new Set())

    fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
      .then(r => r.json())
      .then(({ detail: d, profiles: p, rootFolders: f, serviceId: sid, tvdbId: tvdb }: {
        detail: DiscoverDetail; profiles: Profile[]; rootFolders: RootFolder[]
        serviceId: number | null; tvdbId: number | null
      }) => {
        const sortedFolders = [...(f ?? [])].sort((a, b) => b.freeSpace - a.freeSpace)
        setDetail(d ?? null)
        setProfiles(p ?? [])
        setFolders(sortedFolders)
        const defaultProfile = (p ?? []).find(pr => isUltraHD(pr.name)) ?? p?.[0]
        setProfileId(defaultProfile?.id ?? null)
        setRootFolder(sortedFolders[0]?.path ?? null)
        setSonarrSeriesId(sid ?? null)
        setTvdbId(tvdb ?? null)

        if (item?.mediaType === 'tv' && d?.numberOfSeasons) {
          const inLib = new Set<number>(
            ((d as any)?.mediaInfo?.seasons ?? [])
              .filter((s: any) => s.status === 5)
              .map((s: any) => s.seasonNumber)
          )
          setAvailableSeasons(inLib)
          setSelectedSeasons(new Set(
            Array.from({ length: d.numberOfSeasons }, (_, i) => i + 1)
              .filter(n => !inLib.has(n))
          ))

          if (sid) {
            fetch(`/api/sonarr?episodes=${sid}`)
              .then(r => r.json())
              .then(eps => setSonarrEpisodes(Array.isArray(eps) ? eps : []))
              .catch(() => {})
          } else {
            setLookupSeasons(
              ((d as any)?.seasons ?? [])
                .filter((s: any) => s.seasonNumber > 0)
                .map((s: any) => ({ seasonNumber: s.seasonNumber, totalEpisodes: s.episodeCount ?? 0 }))
            )
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item?.id, item?.mediaType])

  function getEpisodesForSeason(seasonNum: number): Array<{ key: string; episodeNumber: number; hasFile: boolean; title: string }> {
    if (sonarrEpisodes.length > 0) {
      return sonarrEpisodes
        .filter(e => e.seasonNumber === seasonNum)
        .sort((a, b) => a.episodeNumber - b.episodeNumber)
        .map(e => ({ key: `${e.seasonNumber}:${e.episodeNumber}`, episodeNumber: e.episodeNumber, hasFile: e.hasFile, title: e.title }))
    }
    const ls = lookupSeasons.find(s => s.seasonNumber === seasonNum)
    if (!ls) return []
    return Array.from({ length: ls.totalEpisodes }, (_, i) => ({
      key: `${seasonNum}:${i + 1}`,
      episodeNumber: i + 1,
      hasFile: false,
      title: `Episode ${i + 1}`,
    }))
  }

  async function submit() {
    if (!item) return
    setSubmitting(true)
    setSubmitError(null)
    setSubmitStatus('submitting...')
    try {
      const res = await fetch('/api/seer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          mediaType: item.mediaType,
          mediaId: item.id,
          profileId,
          rootFolder,
          ...(item.mediaType === 'tv' && selectedSeasons.size > 0 ? { seasons: Array.from(selectedSeasons).sort((a, b) => a - b) } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        setSubmitError(data?.error ?? `HTTP ${res.status}`)
        return
      }

      if (item.mediaType === 'tv') {
        let sid = sonarrSeriesId

        if (!sid && tvdbId) {
          setSubmitStatus('waiting for Sonarr...')
          for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 5000))
            const r = await fetch(`/api/sonarr?tvdb=${tvdbId}`)
            const d = await r.json()
            if (d.seriesId) { sid = d.seriesId; break }
          }
          if (!sid) {
            setSubmitError('Seerr request sent but Sonarr did not pick it up — check Sonarr health and try again')
            return
          }
        }

        if (sid) {
          setSubmitStatus('applying episode monitoring...')
          const epsRes = await fetch(`/api/sonarr?episodes=${sid}`)
          const eps: SonarrEp[] = await epsRes.json()
          const inSelectedSeasons = eps.filter(e => selectedSeasons.has(e.seasonNumber))
          const toUnmonitor = inSelectedSeasons
            .filter(e => deselectedEps.has(`${e.seasonNumber}:${e.episodeNumber}`))
            .map(e => e.id)
          if (toUnmonitor.length > 0) {
            await fetch('/api/sonarr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'updateEpisodeMonitor', episodeIds: toUnmonitor, monitored: false }),
            })
          }
          setMonitoredCount(inSelectedSeasons.length - toUnmonitor.length)
        }
      }

      setSubmitted(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'request failed')
    } finally {
      setSubmitting(false)
      setSubmitStatus('')
    }
  }

  const title    = detail?.title    ?? detail?.name    ?? item?.title ?? item?.name ?? '—'
  const year     = (detail?.releaseDate ?? detail?.firstAirDate ?? item?.releaseDate ?? item?.firstAirDate)?.slice(0, 4)
  const backdrop = detail?.backdropPath
  const poster   = detail?.posterPath ?? item?.posterPath
  const overview = detail?.overview  ?? item?.overview
  const rating   = detail?.voteAverage ?? item?.voteAverage
  const genres   = detail?.genres?.map(g => g.name).join(', ')
  const runtime  = item?.mediaType === 'movie' ? detail?.runtime : undefined
  const seasons  = item?.mediaType === 'tv'    ? detail?.numberOfSeasons : undefined
  const cast     = detail?.credits?.cast?.slice(0, 5).map(c => c.name).join(', ')
  const director = detail?.credits?.crew?.find(c => c.job === 'Director')?.name
  const studio   = (detail?.productionCompanies ?? detail?.networks)?.map(c => c.name).slice(0, 2).join(', ')

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* drawer */}
      <div className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[420px] bg-[#0A0A0F] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] overflow-y-auto transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}>

        {/* header */}
        <div className="sticky top-0 z-10 bg-[#0A0A0F] border-b border-[#2a2a4a] px-4 py-3 flex items-center justify-between">
          <span className="text-[#6a9a7a] text-xs">// request</span>
          <button onClick={onClose} className="text-[#555] hover:text-[#888] text-lg leading-none">×</button>
        </div>

        {item && (
          <div>
            {/* backdrop area */}
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
                {loading ? (
                  <span className="text-[#555] font-mono text-xs">// loading...</span>
                ) : (
                  <div className="space-y-0.5 font-mono text-xs overflow-hidden">
                    {genres   && <MetaRow label="genre"  value={genres} />}
                    {director && <MetaRow label="dir"    value={director} />}
                    {cast     && <MetaRow label="cast"   value={cast} lines={2} />}
                    {studio   && <MetaRow label="studio" value={studio} lines={2} />}
                  </div>
                )}
              </div>
            </div>

            {/* overview */}
            <div className="px-3 py-2 font-mono text-xs border-b border-[#1a1a2e]">
              {overview ? (
                <>
                  <p className="text-[#6a9a7a] mb-1">{'/*'}</p>
                  <p className="text-[#999] leading-relaxed pl-2 line-clamp-4">{overview}</p>
                  <p className="text-[#6a9a7a] mt-1">{'*/'}</p>
                </>
              ) : (
                <span className="text-[#444]">// no synopsis</span>
              )}
            </div>

            {/* request options */}
            <div className="px-4 py-4 space-y-3">
              {loading ? (
                <p className="text-[#555] text-xs">// loading options...</p>
              ) : (
                <>
                  <div>
                    <label className="text-[#6a9a7a] text-xs block mb-1">// quality</label>
                    <select
                      value={profileId ?? ''}
                      onChange={e => setProfileId(Number(e.target.value))}
                      className="w-full bg-[#0d0d1a] border border-[#2a2a4a] text-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#4a4a7a]"
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{isUltraHD(p.name) ? ' ✦' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[#6a9a7a] text-xs block mb-1">// disk</label>
                    <select
                      value={rootFolder ?? ''}
                      onChange={e => setRootFolder(e.target.value)}
                      className="w-full bg-[#0d0d1a] border border-[#2a2a4a] text-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#4a4a7a]"
                    >
                      {folders.map(f => (
                        <option key={f.path} value={f.path}>
                          {f.path} — {fmtFree(f.freeSpace)}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const sel = folders.find(f => f.path === rootFolder)
                      if (!sel) return null
                      const color = sel.freeSpace < 10 * 1024 ** 3 ? 'text-red-400' : sel.freeSpace < 50 * 1024 ** 3 ? 'text-yellow-400' : 'text-green-400'
                      return <p className={`text-xs mt-1 ${color}`}>{fmtFree(sel.freeSpace)}</p>
                    })()}
                  </div>

                  {item?.mediaType === 'tv' && seasons && seasons > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[#6a9a7a] text-xs">// seasons</label>
                        <button
                          onClick={() => {
                            if (selectedSeasons.size === seasons) {
                              setSelectedSeasons(new Set())
                            } else {
                              setSelectedSeasons(new Set(Array.from({ length: seasons }, (_, i) => i + 1)))
                            }
                            setExpandedSeason(null)
                          }}
                          className="btn-xs text-[#888]"
                        >
                          {selectedSeasons.size === seasons ? '--none' : '--all'}
                        </button>
                      </div>
                      <div className="space-y-0.5">
                        {Array.from({ length: seasons }, (_, i) => i + 1).map(n => {
                          const inLib   = availableSeasons.has(n)
                          const checked = selectedSeasons.has(n)
                          const isExpand = expandedSeason === n
                          const eps = getEpisodesForSeason(n)
                          return (
                            <div key={n}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (inLib) return
                                    const willSelect = !selectedSeasons.has(n)
                                    setSelectedSeasons(prev => {
                                      const next = new Set(prev)
                                      if (next.has(n)) next.delete(n); else next.add(n)
                                      return next
                                    })
                                    setDeselectedEps(prev => {
                                      const next = new Set(prev)
                                      const seasonEps = getEpisodesForSeason(n)
                                      if (willSelect) {
                                        seasonEps.forEach(e => next.delete(e.key))
                                      } else {
                                        seasonEps.filter(e => !e.hasFile).forEach(e => next.add(e.key))
                                      }
                                      return next
                                    })
                                  }}
                                  className="font-mono text-xs px-2 py-0.5 border transition-colors shrink-0"
                                  style={{
                                    borderColor: inLib ? '#E5A00D' : checked ? '#4a4a7a' : '#1a1a2e',
                                    color:       inLib ? '#E5A00D' : checked ? '#fff'    : '#555',
                                    background:  inLib ? 'rgba(229,160,13,0.1)' : checked ? '#0d0d1a' : 'transparent',
                                    cursor:      inLib ? 'default' : 'pointer',
                                  }}
                                >
                                  S{String(n).padStart(2, '0')}
                                </button>
                                {eps.length > 0 && (
                                  <button
                                    onClick={() => setExpandedSeason(isExpand ? null : n)}
                                    className="font-mono text-xs text-[#555] hover:text-[#888] transition-colors flex items-center gap-1"
                                  >
                                    <span>{isExpand ? '▾' : '▸'}</span>
                                    <span>{eps.length} ep</span>
                                  </button>
                                )}
                              </div>
                              {isExpand && eps.length > 0 && (
                                <div className="mt-1 ml-1 pl-3 border-l border-[#1a1a2e]">
                                  <div className="flex gap-2 mb-1">
                                    <button
                                      onClick={() => setDeselectedEps(prev => {
                                        const next = new Set(prev)
                                        eps.filter(e => !e.hasFile).forEach(e => next.delete(e.key))
                                        return next
                                      })}
                                      className="btn-xs text-[#5a8ab0]"
                                    >--all</button>
                                    <button
                                      onClick={() => setDeselectedEps(prev => {
                                        const next = new Set(prev)
                                        eps.filter(e => !e.hasFile).forEach(e => next.add(e.key))
                                        return next
                                      })}
                                      className="btn-xs text-[#555]"
                                    >--none</button>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                  {eps.map(ep => {
                                    const desel = deselectedEps.has(ep.key)
                                    return (
                                      <button
                                        key={ep.key}
                                        onClick={() => {
                                          if (ep.hasFile) return
                                          setDeselectedEps(prev => {
                                            const next = new Set(prev)
                                            if (next.has(ep.key)) next.delete(ep.key); else next.add(ep.key)
                                            return next
                                          })
                                        }}
                                        title={ep.title}
                                        className="font-mono text-xs px-1.5 py-0.5 border transition-colors"
                                        style={{
                                          borderColor: ep.hasFile ? '#E5A00D' : desel ? '#2a1a1a' : '#1a2a4a',
                                          color:       ep.hasFile ? '#E5A00D' : desel ? '#553333' : '#5a8ab0',
                                          background:  ep.hasFile ? 'rgba(229,160,13,0.08)' : desel ? 'transparent' : 'rgba(26,42,74,0.3)',
                                          cursor:      ep.hasFile ? 'default' : 'pointer',
                                          textDecoration: desel && !ep.hasFile ? 'line-through' : 'none',
                                        }}
                                      >
                                        E{String(ep.episodeNumber).padStart(2, '0')}
                                      </button>
                                    )
                                  })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {submitError && (
                    <div className="space-y-1.5">
                      <p className="text-red-400 text-xs">{`2> ${submitError}`}</p>
                      <button onClick={submit} disabled={submitting} className="btn-xs text-blue-400 disabled:opacity-40">
                        {submitting ? (submitStatus || '...') : '--retry'}
                      </button>
                    </div>
                  )}
                  {submitting && submitStatus === 'waiting for Sonarr...' && (
                    <div className="flex items-center gap-2 text-xs text-[#7070a8]">
                      <span className="animate-pulse">◆</span>
                      <span>{submitStatus}</span>
                    </div>
                  )}
                  <div className="flex gap-3 pt-1 items-center">
                    {submitted ? (
                      <>
                        <span className="text-green-400 text-xs">
                          // requested{monitoredCount !== null ? ` · ${monitoredCount} ep${monitoredCount !== 1 ? 's' : ''} monitored` : ''}
                        </span>
                        <button onClick={onDone} className="btn-xs text-[#555]">--done</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={submit}
                          disabled={submitting}
                          className="btn-xs text-blue-400 disabled:opacity-40"
                        >
                          {submitting && submitStatus !== 'waiting for Sonarr...' ? (submitStatus || '...') : '--request'}
                        </button>
                        {!submitting && <button onClick={onClose} className="btn-xs text-[#555]">--cancel</button>}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
