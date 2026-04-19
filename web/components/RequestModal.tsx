'use client'

import { useState, useEffect } from 'react'
import { SeerSearchResult, DiscoverDetail } from '@/types'

interface Profile    { id: number; name: string }
interface RootFolder { path: string; freeSpace: number }

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

  const [detail,     setDetail]     = useState<DiscoverDetail | null>(null)
  const [profiles,   setProfiles]   = useState<Profile[]>([])
  const [folders,    setFolders]    = useState<RootFolder[]>([])
  const [profileId,  setProfileId]  = useState<number | null>(null)
  const [rootFolder, setRootFolder] = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!item) return
    setLoading(true)
    setDetail(null)
    setProfiles([])
    setFolders([])
    setProfileId(null)
    setRootFolder(null)
    fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
      .then(r => r.json())
      .then(({ detail: d, profiles: p, rootFolders: f }: { detail: DiscoverDetail; profiles: Profile[]; rootFolders: RootFolder[] }) => {
        const sortedFolders = [...(f ?? [])].sort((a, b) => b.freeSpace - a.freeSpace)
        setDetail(d ?? null)
        setProfiles(p ?? [])
        setFolders(sortedFolders)
        const defaultProfile = (p ?? []).find(pr => isUltraHD(pr.name)) ?? p?.[0]
        setProfileId(defaultProfile?.id ?? null)
        setRootFolder(sortedFolders[0]?.path ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [item?.id, item?.mediaType])

  async function submit() {
    if (!item) return
    setSubmitting(true)
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        mediaType: item.mediaType,
        mediaId: item.id,
        profileId,
        rootFolder,
      }),
    })
    setSubmitting(false)
    onDone()
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
            {/* backdrop area — same as Discover preview pane */}
            <div className="relative shrink-0 w-full" style={{ aspectRatio: '16/9' }}>
              {backdrop
                ? <img src={TMDB_W(780, backdrop)} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(2px) brightness(0.8)' }} />
                : <div className="w-full h-full bg-[#080810]" />
              }
              <div className="absolute inset-0 bg-[#0A0A0F]/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/20 to-transparent" />

              {/* inset poster */}
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

              {/* title + meta to the right of poster */}
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
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={submit}
                      disabled={submitting}
                      className="btn-xs text-blue-400 disabled:opacity-40"
                    >
                      {submitting ? '...' : '--request'}
                    </button>
                    <button onClick={onClose} className="btn-xs text-[#555]">--cancel</button>
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
