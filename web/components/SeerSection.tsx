'use client'

import { useState, useEffect, useCallback } from 'react'
import { SeerRequest, SeerSearchResult } from '@/types'
import Spinner from '@/components/Spinner'
import UnifiedDrawer, { DrawerEntry } from '@/components/UnifiedDrawer'
import DiscoverSection from '@/components/DiscoverSection'
import MarqueeText from '@/components/MarqueeText'
import RequestModal from '@/components/RequestModal'

const statusLabel: Record<number, string> = {
  1: 'Pending',
  2: 'Approved',
  3: 'Declined',
  4: 'Available',
  5: 'Processing',
}

const statusColor: Record<number, string> = {
  1: 'var(--s-today)',
  2: 'var(--dim)',
  3: 'var(--s-danger)',
  4: 'var(--s-play)',
  5: 'var(--dim)',
}

export default function SeerSection() {
  const [requests, setRequests] = useState<SeerRequest[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SeerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DrawerEntry | null>(null)
  const [requestItem, setRequestItem] = useState<SeerSearchResult | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(0)

  const loadRequests = useCallback(async (): Promise<SeerRequest[] | null> => {
    try {
      const res = await fetch('/api/seer')
      const data = await res.json()
      if (data.error) { setError(data.error); return null }
      const seen = new Set<number>()
      const deduped = (data.results ?? []).filter((r: import('@/types').SeerRequest) => {
        if (seen.has(r.media.tmdbId)) return false
        seen.add(r.media.tmdbId)
        return true
      })
      setRequests(deduped)
      return deduped
    } catch (e) {
      setError(String(e))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrawerRefresh = useCallback(async () => {
    await loadRequests()
  }, [loadRequests])

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

  function openRequestModal(result: SeerSearchResult) {
    setRequestItem(result)
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
        <div className="module-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-label">Overseerr</h2>
          <div className="flex items-center gap-2">
            <button onClick={async () => { setRefreshing(true); await loadRequests(); setRefreshing(false) }} disabled={refreshing} className="btn-xs">{refreshing ? '...' : '↺'}</button>
            <button
              onClick={async () => {
                setSyncing(true)
                await fetch('/api/seer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
                await loadRequests()
                setSyncing(false)
              }}
              disabled={syncing}
              className="btn-xs"
            >
              {syncing ? '...' : 'sync'}
            </button>
          </div>
        </div>
        {error && <p className="text-danger text-sm font-mono mb-2">{error}</p>}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search movies & TV..."
            className="font-mono text-sm px-3 py-1.5 flex-1 focus:outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hi)', color: 'var(--text)' }}
          />
          <button
            onClick={doSearch}
            disabled={searching}
            className="btn-xs px-4"
          >
            {searching ? '...' : 'search'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mb-4">
            <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--dimmer)' }}>results</p>
            <div className="inset-panel">
              {results.slice(0, 8).map((r, i) => (
                <div
                  key={`${r.mediaType}-${r.id}`}
                  className="flex items-center justify-between px-4 py-2.5 font-mono text-xs cursor-pointer group"
                  style={{ borderBottom: i < Math.min(results.length, 8) - 1 ? '1px solid var(--border)' : undefined }}
                  onClick={() => openRequestModal(r)}
                >
                  <div className="flex-1 min-w-0 truncate">
                    <span className="group-hover:underline" style={{ color: 'var(--text)' }}>{r.title ?? r.name}</span>
                    <span className="ml-2 uppercase" style={{ color: 'var(--dim)' }}>{r.mediaType}</span>
                    {(r.releaseDate || r.firstAirDate) && (
                      <span className="ml-2" style={{ color: 'var(--dim)' }}>{(r.releaseDate ?? r.firstAirDate)?.slice(0, 4)}</span>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs ml-3" style={{ color: 'var(--dimmer)' }}>›</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--dimmer)' }}>requests</p>
          {requests.length === 0 && (loading ? <Spinner /> : (
            <div className="inset-panel px-4 py-3">
              <p className="font-mono text-xs" style={{ color: 'var(--dim)' }}>no requests</p>
            </div>
          ))}
          {requests.length > 0 && (() => {
            const PAGE_SIZE = 10
            const totalPages = Math.ceil(requests.length / PAGE_SIZE)
            const hasPrev = page > 0
            const hasNext = page < totalPages - 1

            return (
              <div>
                <div className="inset-panel overflow-hidden" onTouchStart={e => { (e.currentTarget as any)._tx = e.touches[0].clientX }} onTouchEnd={e => { const dx = e.changedTouches[0].clientX - ((e.currentTarget as any)._tx ?? 0); if (dx < -40 && hasNext) setPage(p => p + 1); if (dx > 40 && hasPrev) setPage(p => p - 1) }} onMouseDown={e => { (e.currentTarget as any)._mx = e.clientX }} onMouseUp={e => { const dx = e.clientX - ((e.currentTarget as any)._mx ?? 0); if (dx < -40 && hasNext) setPage(p => p + 1); if (dx > 40 && hasPrev) setPage(p => p - 1) }}>
                  <div className="flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${page * 100}%)` }}>
                    {Array.from({ length: totalPages }).map((_, pi) => {
                      const items = requests.slice(pi * PAGE_SIZE, (pi + 1) * PAGE_SIZE)
                      return (
                        <div key={pi} className="w-full shrink-0 font-mono text-xs">
                          <div className="flex items-center gap-3 px-4 py-1.5 select-none" style={{ color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
                            <span className="w-5 shrink-0"></span>
                            <span className="flex-1">Title</span>
                            <span className="hidden md:block shrink-0 w-[48px]">Type</span>
                            <span className="shrink-0 w-[88px]">Status</span>
                            <span className="hidden md:block shrink-0">By</span>
                            <span className="shrink-0">Actions</span>
                          </div>
                          {items.map((r, i) => (
                            <div
                              key={r.id}
                              className="flex items-center gap-3 px-4 py-2.5 cursor-pointer group"
                              style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : undefined }}
                              onClick={() => setSelected({ via: 'seer', tmdbId: r.media.tmdbId, mediaType: r.media.mediaType as 'movie' | 'tv', title: r.media.title ?? r.media.name })}
                            >
                              <span className="w-5 shrink-0 text-right tabular-nums" style={{ color: 'var(--dim)' }}>{pi * PAGE_SIZE + i + 1}</span>
                              <MarqueeText className="flex-1 min-w-0 group-hover:underline">{r.media.title ?? r.media.name}</MarqueeText>
                              <span className="hidden md:block shrink-0 uppercase whitespace-nowrap w-[48px]" style={{ color: 'var(--dim)' }}>{r.type}</span>
                              <span className="shrink-0 w-[88px] whitespace-nowrap" style={{ color: statusColor[r.status] ?? 'var(--dim)' }}>{statusLabel[r.status] ?? r.status}</span>
                              <span className="hidden md:block shrink-0 whitespace-nowrap" style={{ color: 'var(--dim)' }}>{r.requestedBy.displayName}</span>
                              <div className="shrink-0 flex gap-1" onClick={e => e.stopPropagation()}>
                                {r.status === 1 && <button onClick={() => approveRequest(r.id)} className="btn-xs whitespace-nowrap">approve</button>}
                                <button onClick={() => { if (confirm('Delete request?')) deleteRequest(r.id) }} className="btn-xs danger whitespace-nowrap">Del</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-end pt-2 gap-3 font-mono text-xs" style={{ color: 'var(--dim)' }}>
                    <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, requests.length)} of {requests.length}</span>
                    <div className="flex gap-2">
                      {hasPrev && <button onClick={() => setPage(p => p - 1)} className="btn-xs">‹ prev</button>}
                      {hasNext && <button onClick={() => setPage(p => p + 1)} className="btn-xs">next ›</button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        </div>{/* module-panel */}
        <DiscoverSection />
      </section>

      <UnifiedDrawer entry={selected} onClose={() => setSelected(null)} onRefresh={handleDrawerRefresh} />

      {requestItem && (
        <RequestModal
          item={requestItem}
          onClose={() => setRequestItem(null)}
          onDone={() => {
            setRequestItem(null)
            setResults([])
            setQuery('')
            loadRequests()
          }}
        />
      )}
    </>
  )
}
