'use client'

import { useState, useEffect, useCallback } from 'react'
import { SeerRequest, SeerSearchResult } from '@/types'
import Spinner from '@/components/Spinner'
import SeerDetailDrawer from '@/components/SeerDetailDrawer'
import DiscoverDetailDrawer from '@/components/DiscoverDetailDrawer'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w200'

const discoverStatusBadge = (status: number | undefined): { label: string; color: string } | null => {
  if (status === 5) return { label: '[ok]',   color: 'text-green-400' }
  if (status === 2) return { label: '[wait]', color: 'text-yellow-400' }
  if (status === 3 || status === 4) return { label: '[dl]', color: 'text-blue-400' }
  return null
}

function DiscoverRow({ mediaType, label }: { mediaType: 'movie' | 'tv'; label: string }) {
  const [items, setItems]     = useState<SeerSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<SeerSearchResult | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/seer?action=discover&mediaType=${mediaType}&page=1`)
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [mediaType])

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const res  = await fetch(`/api/seer?action=discover&mediaType=${mediaType}&page=${nextPage}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setItems(prev => [...prev, ...data])
        setPage(nextPage)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <>
      <div className="mb-1 font-mono text-xs text-[#6a9a7a]">
        {'  '}// {label}
      </div>
      <div className="overflow-x-auto pb-2">
        {loading ? (
          <div className="px-1 py-3"><Spinner /></div>
        ) : (
          <div className="flex gap-3 w-max">
            {items.map(item => {
              const badge = discoverStatusBadge(item.mediaInfo?.status)
              const year  = (item.releaseDate ?? item.firstAirDate)?.slice(0, 4)
              const title = item.title ?? item.name ?? '—'
              return (
                <div
                  key={`${item.mediaType}-${item.id}`}
                  onClick={() => setSelected(item)}
                  className="cursor-pointer group w-[100px] shrink-0"
                >
                  {/* poster */}
                  <div className="relative border border-[#1a1a2e] group-hover:border-[#3a3a5a] transition-colors"
                    style={{ width: 100, height: 150 }}>
                    {item.posterPath ? (
                      <img
                        src={`${TMDB_IMG}${item.posterPath}`}
                        alt={title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#0f0f1a] flex items-center justify-center text-[#333] font-mono text-xs">
                        {mediaType === 'tv' ? 'tv' : '▣'}
                      </div>
                    )}
                    {badge && (
                      <span className={`absolute top-1 right-1 font-mono text-[10px] ${badge.color} bg-black/70 px-0.5 leading-tight`}>
                        {badge.label}
                      </span>
                    )}
                    {/* hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="btn-xs text-cyan-400 border-cyan-700">--info</span>
                    </div>
                  </div>
                  {/* title + year */}
                  <div className="mt-1 font-mono">
                    <p className="text-white text-[10px] leading-tight line-clamp-2">{title}</p>
                    {year && <p className="text-[#555] text-[10px] mt-0.5">{year}</p>}
                  </div>
                </div>
              )
            })}
            {/* load more */}
            <div
              onClick={loadMore}
              className="cursor-pointer w-[100px] shrink-0 flex flex-col items-center justify-center border border-[#1a1a2e] hover:border-[#3a3a5a] transition-colors text-[#555] hover:text-[#888] font-mono text-[10px] gap-1"
              style={{ height: 150 }}
            >
              {loadingMore ? '...' : <><span className="text-lg leading-none">+</span><span>more</span></>}
            </div>
          </div>
        )}
      </div>

      <DiscoverDetailDrawer
        item={selected}
        onClose={() => setSelected(null)}
        onRequested={() => setSelected(null)}
      />
    </>
  )
}

const statusLabel: Record<number, string> = {
  1: 'Pending',
  2: 'Approved',
  3: 'Declined',
  4: 'Available',
  5: 'Processing',
}

const statusColor: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-blue-400',
  3: 'text-red-400',
  4: 'text-green-400',
  5: 'text-purple-400',
}

export default function SeerSection() {
  const [requests, setRequests] = useState<SeerRequest[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SeerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SeerRequest | null>(null)

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/seer')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      const seen = new Set<number>()
      const deduped = (data.results ?? []).filter((r: import('@/types').SeerRequest) => {
        if (seen.has(r.media.tmdbId)) return false
        seen.add(r.media.tmdbId)
        return true
      })
      setRequests(deduped)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRequests()
    const id = setInterval(loadRequests, 60000)
    return () => clearInterval(id)
  }, [loadRequests])

  async function doSearch() {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const res = await fetch(`/api/seer?query=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch (e) {
      setError(String(e))
    }
    setSearching(false)
  }

  async function requestItem(result: SeerSearchResult) {
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', mediaType: result.mediaType, mediaId: result.id }),
    })
    setResults([])
    setQuery('')
    await loadRequests()
  }

  async function approveRequest(id: number) {
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', id }),
    })
    await loadRequests()
  }

  async function deleteRequest(id: number) {
    await fetch('/api/seer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    await loadRequests()
  }

  return (
    <>
      <section id="seer">
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e]">
          const <span className="text-white text-sm font-medium uppercase tracking-widest">S33r</span>: SeerRequest[] = [
        </div>
        {error && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search movies & TV..."
            className="bg-[#0f0f1a] border border-[#1a1a2e] text-white font-mono text-sm px-3 py-1.5 flex-1 focus:outline-none focus:border-[#888]"
          />
          <button
            onClick={doSearch}
            disabled={searching}
            className="bg-[#1a1a2e] text-violet-400 font-mono text-sm px-4 py-1.5 hover:bg-[#252540] disabled:opacity-50"
          >
            {searching ? '...' : 'grep'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mb-4 border border-[#1a1a2e]">
            {results.slice(0, 8).map((r) => (
              <div
                key={`${r.mediaType}-${r.id}`}
                className="flex items-center justify-between px-3 py-2 border-b border-[#0f0f1a]"
              >
                <div className="font-mono text-sm">
                  <span className="text-white">{r.title ?? r.name}</span>
                  <span className="text-[#999] ml-2 text-xs uppercase">{r.mediaType}</span>
                  {(r.releaseDate || r.firstAirDate) && (
                    <span className="text-[#999] ml-2 text-xs">
                      {(r.releaseDate ?? r.firstAirDate)?.slice(0, 4)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => requestItem(r)}
                  className="btn-xs text-blue-400"
                >
                  --get
                </button>
              </div>
            ))}
          </div>
        )}

        {requests.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono">no requests</p>)}
        {requests.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-fixed md:table-auto">
            <thead>
              <tr className="text-[#999] text-xs uppercase border-b border-[#1a1a2e]">
                <th className="py-1 pr-3 w-6"></th>
                <th className="text-left py-1 pr-4">Title</th>
                <th className="text-right pr-4 hidden md:table-cell">Type</th>
                <th className="text-right pr-4 w-[76px]">Status</th>
                <th className="text-right pr-4 hidden md:table-cell">By</th>
                <th className="text-right w-[108px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.slice(0, 10).map((r, i) => (
                <tr key={r.id} className="border-b border-[#0f0f1a]">
                  <td className="py-1 pr-3 text-right text-[#7070a8] tabular-nums select-none text-xs w-6">{i + 1}</td>
                  <td className="py-1 pr-4 text-white min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelected(r)}
                        className="btn-xs text-cyan-600 hover:text-cyan-400 flex-shrink-0"
                      >
                        --info
                      </button>
                      <span className="truncate">{r.media.title ?? r.media.name}</span>
                    </div>
                  </td>
                  <td className="text-right pr-4 text-[#999] text-xs uppercase hidden md:table-cell">{r.type}</td>
                  <td className={`text-right pr-4 ${statusColor[r.status] ?? 'text-[#888]'}`}>
                    {statusLabel[r.status] ?? r.status}
                  </td>
                  <td className="text-right pr-4 text-[#999] hidden md:table-cell">{r.requestedBy.displayName}</td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      {r.status === 1 && (
                        <button onClick={() => approveRequest(r.id)} className="btn-xs text-green-400">
                          --approve
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('Delete request?')) deleteRequest(r.id) }}
                        className="btn-xs text-red-400"
                      >
                        --rm
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <div className="font-mono text-xs text-[#6a9a7a] mt-1">
          ] // {Math.min(requests.length, 10)} shown{requests.length > 10 ? `, ${requests.length} total` : ''}
        </div>

        {/* discover */}
        <div className="mt-6 pt-4 border-t border-[#1a1a2e]">
          <div className="font-mono text-xs text-[#6a9a7a] mb-3">
            const <span className="text-white text-sm font-medium uppercase tracking-widest">D1sc0ver</span> = {'{'}</div>
          <div className="space-y-5">
            <DiscoverRow mediaType="movie" label="trending :: movies" />
            <DiscoverRow mediaType="tv"    label="trending :: tv" />
          </div>
          <div className="font-mono text-xs text-[#6a9a7a] mt-3">{'}'}</div>
        </div>
      </section>

      <SeerDetailDrawer
        request={selected}
        onClose={() => setSelected(null)}
        onRefresh={loadRequests}
      />
    </>
  )
}
