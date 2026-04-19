'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlexMedia } from '@/types'
import Spinner from '@/components/Spinner'
import PlexDetailDrawer from '@/components/PlexDetailDrawer'

export default function PlexSection() {
  const [movies, setMovies]   = useState<PlexMedia[]>([])
  const [shows, setShows]     = useState<PlexMedia[]>([])
  const [days, setDays]       = useState<number>(30)
  const [max, setMax]         = useState<number>(15)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PlexMedia | null>(null)
  const [plexTab, setPlexTab]   = useState<'shows' | 'movies'>('shows')

  // search
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState<PlexMedia[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

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
      <tr className="border-b border-[#0f0f1a]">
        <td className="py-1 pr-3 text-right text-[#7070a8] tabular-nums select-none text-xs w-6">{index + 1}</td>
        <td className="py-1 pr-4 text-white font-mono text-sm min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(item)}
              className="btn-xs text-cyan-600 hover:text-cyan-400 flex-shrink-0"
            >
              --info
            </button>
            <span className="truncate">
              {item.grandparentTitle ?? item.title}
              {item.grandparentTitle && (
                <span className="text-[#888] ml-2">
                  S{String(item.parentIndex ?? 0).padStart(2, '0')}E{String(item.index ?? 0).padStart(2, '0')}
                </span>
              )}
            </span>
          </div>
        </td>
        <td className="text-right pr-3 font-mono text-xs text-[#999] w-10">
          {item.year ?? ''}
        </td>
        <td className="text-right pr-2 font-mono text-xs w-5">
          {item.viewCount && item.viewCount > 0
            ? <span className="text-[#999]">1</span>
            : <span className="text-yellow-400">Ø</span>}
        </td>
        <td className="text-right w-9">
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
            className="btn-xs text-red-400 whitespace-nowrap"
          >
            --rm
          </button>
        </td>
      </tr>
    )
  }

  return (
    <>
      <section id="plex">
        {/* header */}
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between">
          <span>const <span className="text-white text-sm font-medium uppercase tracking-widest">Pl3x R3c3ntly 4dd3d</span> = {'{'}</span>
          <span className="text-[#888]">// top {max}, past {days}d first</span>
        </div>

        {error && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}

        {/* search input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search Plex library..."
            className="bg-[#0f0f1a] border border-[#1a1a2e] text-white font-mono text-sm px-3 py-1.5 flex-1 focus:outline-none focus:border-[#888]"
          />
          <button
            onClick={doSearch}
            disabled={searchLoading}
            className="bg-[#1a1a2e] text-violet-400 font-mono text-sm px-4 py-1.5 hover:bg-[#252540] disabled:opacity-50"
          >
            {searchLoading ? '...' : 'grep'}
          </button>
        </div>

        {/* search results — expands above recently added */}
        {searchResults !== null && (
          <div className="mb-4">
            <div className="font-mono text-xs text-[#7070a8] mb-2">
              {'/* ── '}
              {`${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`}
              {' ── */'}
            </div>
            {searchResults.length === 0 && (
              <p className="text-[#999] text-sm font-mono pl-4">no results</p>
            )}
            {searchResults.length > 0 && (
              <div className="font-mono text-xs md:text-sm">
                <div className="flex items-center gap-3 text-[#999] text-xs uppercase border-b border-[#1a1a2e] py-1 select-none">
                  <span className="w-5 shrink-0" />
                  <span className="flex-1">Title</span>
                  <span className="hidden md:block shrink-0 w-[48px]">Type</span>
                  <span className="shrink-0 w-[36px]">Year</span>
                  <span className="shrink-0 w-[16px]">W</span>
                  <span className="shrink-0">Actions</span>
                </div>
                {searchResults.map((item, i) => (
                  <div key={item.ratingKey} className="flex items-center gap-3 border-b border-[#0f0f1a] py-0.5">
                    <span className="w-5 shrink-0 text-right text-[#7070a8] tabular-nums text-xs">{i + 1}</span>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <button onClick={() => setSelected(item)} className="btn-xs text-cyan-600 hover:text-cyan-400 shrink-0">--info</button>
                      <span className="truncate text-white">
                        {item.grandparentTitle ?? item.title}
                        {item.grandparentTitle && (
                          <span className="text-[#888] ml-2">
                            S{String(item.parentIndex ?? 0).padStart(2, '0')}E{String(item.index ?? 0).padStart(2, '0')}
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="hidden md:block shrink-0 w-[48px] text-[#999] text-xs uppercase whitespace-nowrap">
                      {item.type === 'show' ? 'tv' : item.type ?? ''}
                    </span>
                    <span className="shrink-0 w-[36px] text-right text-[#999] text-xs">{item.year ?? ''}</span>
                    <span className="shrink-0 w-[16px] text-center text-xs">
                      {item.viewCount && item.viewCount > 0
                        ? <span className="text-[#999]">1</span>
                        : <span className="text-yellow-400">Ø</span>}
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
                        className="btn-xs text-red-400 whitespace-nowrap"
                      >
                        --rm
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* recently added — mobile: tabs, desktop: side by side */}
        <div className="md:hidden">
          {(() => {
            const PLEX_TABS = [
              { key: 'shows',  label: 'Shows',  color: '#a78bfa' },
              { key: 'movies', label: 'Movies', color: '#fb923c' },
            ] as const
            return (
              <div className="flex mb-4 border-b border-[#1a1a2e]">
                {PLEX_TABS.map(t => {
                  const active = plexTab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setPlexTab(t.key)}
                      className="flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-all duration-150 border-b-2 -mb-px"
                      style={{
                        borderColor: active ? t.color : 'transparent',
                        color: active ? t.color : '#444',
                        textShadow: active ? `0 0 12px ${t.color}88` : 'none',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            )
          })()}
          <div className={plexTab === 'shows' ? '' : 'hidden'}>
            <div className="font-mono text-xs text-[#6a9a7a] mb-2">  shows: [</div>
            {shows.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono pl-4">none</p>)}
            {shows.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-fixed">
                <tbody>{shows.map((s, i) => <MediaRow key={s.ratingKey} item={s} index={i} />)}</tbody>
              </table></div>
            )}
            <div className="font-mono text-xs text-[#6a9a7a] mt-1">  ], // {shows.length}</div>
          </div>
          <div className={plexTab === 'movies' ? '' : 'hidden'}>
            <div className="font-mono text-xs text-[#6a9a7a] mb-2">  movies: [</div>
            {movies.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono pl-4">none</p>)}
            {movies.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-fixed">
                <tbody>{movies.map((m, i) => <MediaRow key={m.ratingKey} item={m} index={i} />)}</tbody>
              </table></div>
            )}
            <div className="font-mono text-xs text-[#6a9a7a] mt-1">  ] // {movies.length}</div>
          </div>
        </div>
        <div className="hidden md:grid md:grid-cols-2 gap-6">
          <div>
            <div className="font-mono text-xs text-[#6a9a7a] mb-2">  shows: [</div>
            {shows.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono pl-4">none</p>)}
            {shows.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-auto">
                <tbody>{shows.map((s, i) => <MediaRow key={s.ratingKey} item={s} index={i} />)}</tbody>
              </table></div>
            )}
            <div className="font-mono text-xs text-[#6a9a7a] mt-1">  ], // {shows.length}</div>
          </div>
          <div>
            <div className="font-mono text-xs text-[#6a9a7a] mb-2">  movies: [</div>
            {movies.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono pl-4">none</p>)}
            {movies.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-auto">
                <tbody>{movies.map((m, i) => <MediaRow key={m.ratingKey} item={m} index={i} />)}</tbody>
              </table></div>
            )}
            <div className="font-mono text-xs text-[#6a9a7a] mt-1">  ] // {movies.length}</div>
          </div>
        </div>
        <div className="font-mono text-xs text-[#6a9a7a] mt-2">{'}'}</div>
      </section>

      <PlexDetailDrawer
        item={selected}
        onClose={() => setSelected(null)}
        onRefresh={load}
      />
    </>
  )
}
