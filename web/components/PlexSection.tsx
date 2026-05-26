'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlexMedia } from '@/types'
import Spinner from '@/components/Spinner'
import UnifiedDrawer, { DrawerEntry } from '@/components/UnifiedDrawer'

export default function PlexSection() {
  const [movies, setMovies]   = useState<PlexMedia[]>([])
  const [shows, setShows]     = useState<PlexMedia[]>([])
  const [days, setDays]       = useState<number>(30)
  const [max, setMax]         = useState<number>(15)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DrawerEntry | null>(null)
  function openPlex(item: PlexMedia) {
    const mt: 'movie' | 'tv' = (item.type === 'show' || item.grandparentRatingKey) ? 'tv' : 'movie'
    setSelected({ via: 'plex', ratingKey: item.ratingKey, mediaType: mt, title: item.grandparentTitle ?? item.title, thumb: item.thumb })
  }
  const [plexTab, setPlexTab]   = useState<'shows' | 'movies'>('shows')

  // search
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState<PlexMedia[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/plex')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setMovies(data.movies ?? [])
      setShows(data.shows ?? [])
      if (data.days) setDays(data.days)
      if (data.max)  setMax(data.max)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  async function doSearch() {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSearchResults(null)
    try {
      const res  = await fetch(`/api/plex?search=${encodeURIComponent(searchQuery.trim())}`)
      const data = await res.json()
      setSearchResults(data.results ?? [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  function MediaRow({ item, index }: { item: PlexMedia; index: number }) {
    return (
      <div className="flex items-center gap-2 font-mono text-xs px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="w-5 shrink-0 text-right tabular-nums select-none" style={{ color: 'var(--dim)' }}>{index + 1}</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button onClick={() => openPlex(item)} className="btn-xs shrink-0">↗</button>
          <span className="truncate" style={{ color: 'var(--text)' }}>
            {item.grandparentTitle ?? item.title}
            {item.grandparentTitle && (
              <span className="ml-2" style={{ color: 'var(--dim)' }}>
                S{String(item.parentIndex ?? 0).padStart(2, '0')}E{String(item.index ?? 0).padStart(2, '0')}
              </span>
            )}
          </span>
        </div>
        <span className="shrink-0 tabular-nums w-[36px] text-right" style={{ color: 'var(--dim)' }}>{item.year ?? ''}</span>
        <span className="shrink-0 w-[16px] text-center">
          {item.viewCount && item.viewCount > 0
            ? <span style={{ color: 'var(--dim)' }}>✓</span>
            : <span style={{ color: 'var(--s-today)' }}>○</span>}
        </span>
        <button
          onClick={() => {
            if (confirm(`Delete ${item.title} from Plex library?`)) {
              fetch('/api/plex', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', ratingKey: item.ratingKey }),
              }).then(load)
            }
          }}
          className="btn-xs danger shrink-0"
        >
          remove
        </button>
      </div>
    )
  }

  return (
    <>
      <section id="plex">
        <div className="module-panel">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-label">Plex</h2>
            <span className="font-mono text-[10px]" style={{ color: 'var(--dimmer)' }}>top {max}, past {days}d</span>
          </div>
          <button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }} disabled={refreshing} className="btn-xs">{refreshing ? '...' : '↺'}</button>
        </div>

        {error && <p className="text-danger text-sm font-mono mb-2">{error}</p>}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search Plex library..."
            className="font-mono text-sm px-3 py-1.5 flex-1 focus:outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hi)', color: 'var(--text)' }}
          />
          <button onClick={doSearch} disabled={searchLoading} className="btn-xs px-4">
            {searchLoading ? '...' : 'search'}
          </button>
        </div>

        {searchResults !== null && (
          <div className="mb-4">
            <div className="font-mono text-[10px] mb-2" style={{ color: 'var(--dim)' }}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
            </div>
            {searchResults.length === 0 && (
              <p className="font-mono text-xs pl-4" style={{ color: 'var(--dim)' }}>no results</p>
            )}
            {searchResults.length > 0 && (
              <div className="font-mono text-xs md:text-sm">
                <div className="flex items-center gap-3 text-xs uppercase py-1 select-none" style={{ color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
                  <span className="w-5 shrink-0" />
                  <span className="flex-1">Title</span>
                  <span className="hidden md:block shrink-0 w-[48px]">Type</span>
                  <span className="shrink-0 w-[36px]">Year</span>
                  <span className="shrink-0 w-[16px]">W</span>
                  <span className="shrink-0">Actions</span>
                </div>
                {searchResults.map((item, i) => (
                  <div key={item.ratingKey} className="flex items-center gap-3 py-0.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="w-5 shrink-0 text-right tabular-nums text-xs" style={{ color: 'var(--dim)' }}>{i + 1}</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <button onClick={() => openPlex(item)} className="btn-xs shrink-0">↗</button>
                      <span className="truncate" style={{ color: 'var(--text)' }}>
                        {item.grandparentTitle ?? item.title}
                        {item.grandparentTitle && (
                          <span className="ml-2" style={{ color: 'var(--dim)' }}>
                            S{String(item.parentIndex ?? 0).padStart(2, '0')}E{String(item.index ?? 0).padStart(2, '0')}
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="hidden md:block shrink-0 w-[48px] text-xs uppercase whitespace-nowrap" style={{ color: 'var(--dim)' }}>
                      {item.type === 'show' ? 'tv' : item.type ?? ''}
                    </span>
                    <span className="shrink-0 w-[36px] text-right text-xs" style={{ color: 'var(--dim)' }}>{item.year ?? ''}</span>
                    <span className="shrink-0 w-[16px] text-center text-xs">
                      {item.viewCount && item.viewCount > 0
                        ? <span style={{ color: 'var(--dim)' }}>✓</span>
                        : <span style={{ color: 'var(--s-today)' }}>○</span>}
                    </span>
                    <div className="shrink-0 flex gap-1">
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${item.title} from Plex library?`)) {
                            fetch('/api/plex', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'delete', ratingKey: item.ratingKey }),
                            }).then(() => {
                              setSearchResults(prev => prev ? prev.filter(r => r.ratingKey !== item.ratingKey) : prev)
                              load()
                            })
                          }
                        }}
                        className="btn-xs danger whitespace-nowrap"
                      >
                        remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mobile: tab switcher */}
        <div className="md:hidden">
          <div className="flex mb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            {(['shows', 'movies'] as const).map(key => {
              const active = plexTab === key
              return (
                <button key={key} onClick={() => setPlexTab(key)} className="flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-colors duration-150 border-b-2 -mb-px" style={{ borderColor: active ? 'var(--text)' : 'transparent', color: active ? 'var(--text)' : 'var(--dim)' }}>
                  {key}
                </button>
              )
            })}
          </div>
          <div className="inset-panel">
            <div className={plexTab === 'shows' ? '' : 'hidden'}>
              {shows.length === 0 && (loading ? <div className="px-4 py-3"><Spinner /></div> : <p className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--dim)' }}>none</p>)}
              {shows.map((s, i) => <MediaRow key={s.ratingKey} item={s} index={i} />)}
            </div>
            <div className={plexTab === 'movies' ? '' : 'hidden'}>
              {movies.length === 0 && (loading ? <div className="px-4 py-3"><Spinner /></div> : <p className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--dim)' }}>none</p>)}
              {movies.map((m, i) => <MediaRow key={m.ratingKey} item={m} index={i} />)}
            </div>
          </div>
        </div>

        {/* Desktop: two inset panels side by side */}
        <div className="hidden md:grid md:grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--dimmer)' }}>Shows</p>
            <div className="inset-panel">
              {shows.length === 0 && (loading ? <div className="px-4 py-3"><Spinner /></div> : <p className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--dim)' }}>none</p>)}
              {shows.map((s, i) => <MediaRow key={s.ratingKey} item={s} index={i} />)}
            </div>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--dimmer)' }}>Movies</p>
            <div className="inset-panel">
              {movies.length === 0 && (loading ? <div className="px-4 py-3"><Spinner /></div> : <p className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--dim)' }}>none</p>)}
              {movies.map((m, i) => <MediaRow key={m.ratingKey} item={m} index={i} />)}
            </div>
          </div>
        </div>

        </div>{/* module-panel */}
      </section>

      <UnifiedDrawer entry={selected} onClose={() => setSelected(null)} onRefresh={load} />
    </>
  )
}
