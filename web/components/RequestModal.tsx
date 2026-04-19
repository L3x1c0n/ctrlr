'use client'

import { useState, useEffect } from 'react'
import { SeerSearchResult } from '@/types'

interface Profile    { id: number; name: string }
interface RootFolder { path: string; freeSpace: number }

function fmtFree(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(0)}GB free`
  return `${(bytes / 1024 ** 2).toFixed(0)}MB free`
}

function isUltraHD(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('ultra') || n.includes('2160') || n.includes('4k') || n.includes('uhd')
}

interface Props {
  item: SeerSearchResult | null
  onClose: () => void
  onDone: () => void
}

export default function RequestModal({ item, onClose, onDone }: Props) {
  const isOpen = item !== null

  const [profiles,   setProfiles]   = useState<Profile[]>([])
  const [folders,    setFolders]    = useState<RootFolder[]>([])
  const [profileId,  setProfileId]  = useState<number | null>(null)
  const [rootFolder, setRootFolder] = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!item) return
    setLoading(true)
    setProfiles([])
    setFolders([])
    setProfileId(null)
    setRootFolder(null)
    fetch(`/api/seer?mediaId=${item.id}&mediaType=${item.mediaType}`)
      .then(r => r.json())
      .then(({ profiles: p, rootFolders: f }: { profiles: Profile[]; rootFolders: RootFolder[] }) => {
        const sortedFolders = [...(f ?? [])].sort((a, b) => b.freeSpace - a.freeSpace)
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

  const title = item?.title ?? item?.name ?? '—'
  const year  = (item?.releaseDate ?? item?.firstAirDate)?.slice(0, 4)
  const posterUrl = item?.posterPath
    ? `https://image.tmdb.org/t/p/w300${item.posterPath}`
    : null

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* drawer */}
      <div className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[420px] bg-[#16162a] border-l-2 border-[#2a2a4a] shadow-[-8px_0_32px_rgba(0,0,0,0.6)] overflow-y-auto transition-[transform,visibility] duration-200 font-mono ${isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`}>

        {/* header */}
        <div className="sticky top-0 z-10 bg-[#16162a] border-b border-[#2a2a4a] px-4 py-3 flex items-center justify-between">
          <span className="text-[#6a9a7a] text-xs">// request</span>
          <button onClick={onClose} className="text-[#555] hover:text-[#888] text-lg leading-none">×</button>
        </div>

        {item && (
          <div className="p-4 space-y-4">

            {/* poster + title block */}
            <div className="flex gap-4">
              {posterUrl && (
                <img
                  src={posterUrl}
                  alt={title}
                  className="w-20 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="text-white text-sm font-medium leading-snug">{title}</p>
                <p className="text-[#7070a8] text-xs mt-1">
                  {item.mediaType === 'movie' ? 'movie' : 'tv series'}
                  {year && <span className="ml-2">{year}</span>}
                  {item.voteAverage && item.voteAverage > 0 && (
                    <span className="ml-2 text-yellow-400">★ {item.voteAverage.toFixed(1)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* overview */}
            {item.overview && (
              <div>
                <div className="text-[#6a9a7a] text-xs mb-1">// overview</div>
                <p className="text-[#aaa] text-xs leading-relaxed line-clamp-4">{item.overview}</p>
              </div>
            )}

            <div className="border-t border-[#2a2a4a]" />

            {/* options */}
            {loading ? (
              <p className="text-[#555] text-xs">// loading options...</p>
            ) : (
              <div className="space-y-3">
                {/* quality profile */}
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

                {/* root folder */}
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

                {/* actions */}
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
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
