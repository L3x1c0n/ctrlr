'use client'

import { useState, useEffect, useCallback } from 'react'
import { SeerRequest, SeerSearchResult } from '@/types'
import Spinner from '@/components/Spinner'
import SeerDetailDrawer from '@/components/SeerDetailDrawer'
import DiscoverSection from '@/components/DiscoverSection'
import MarqueeText from '@/components/MarqueeText'

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
          <div className="font-mono text-xs md:text-sm">
            <div className="flex items-center gap-3 text-[#999] text-xs uppercase border-b border-[#1a1a2e] py-1 select-none">
              <span className="w-5 shrink-0"></span>
              <span className="flex-1">Title</span>
              <span className="hidden md:block shrink-0">Type</span>
              <span className="shrink-0 w-[88px] text-right">Status</span>
              <span className="hidden md:block shrink-0">By</span>
              <span className="shrink-0">Actions</span>
            </div>
            {requests.slice(0, 10).map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-[#0f0f1a] py-0.5">
                <span className="w-5 shrink-0 text-right text-[#7070a8] tabular-nums text-xs">{i + 1}</span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <button onClick={() => setSelected(r)} className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0">--info</button>
                  <MarqueeText className="min-w-0">{r.media.title ?? r.media.name}</MarqueeText>
                </div>
                <span className="hidden md:block shrink-0 text-[#999] text-xs uppercase whitespace-nowrap">{r.type}</span>
                <span className={`shrink-0 w-[88px] text-right whitespace-nowrap ${statusColor[r.status] ?? 'text-[#888]'}`}>{statusLabel[r.status] ?? r.status}</span>
                <span className="hidden md:block shrink-0 text-[#999] whitespace-nowrap">{r.requestedBy.displayName}</span>
                <div className="shrink-0 flex gap-1">
                  {r.status === 1 && <button onClick={() => approveRequest(r.id)} className="btn-xs text-green-400 whitespace-nowrap">--approve</button>}
                  <button onClick={() => { if (confirm('Delete request?')) deleteRequest(r.id) }} className="btn-xs text-red-400 whitespace-nowrap">--rm</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="font-mono text-xs text-[#6a9a7a] mt-1">
          ] // {Math.min(requests.length, 10)} shown{requests.length > 10 ? `, ${requests.length} total` : ''}
        </div>

        <DiscoverSection />
      </section>

      <SeerDetailDrawer
        request={selected}
        onClose={() => setSelected(null)}
        onRefresh={loadRequests}
      />
    </>
  )
}
