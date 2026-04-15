'use client'

import { useState, useEffect, useCallback } from 'react'
import { PlexMedia } from '@/types'
import Spinner from '@/components/Spinner'
import PlexDetailDrawer from '@/components/PlexDetailDrawer'

export default function PlexSection() {
  const [movies, setMovies] = useState<PlexMedia[]>([])
  const [shows, setShows] = useState<PlexMedia[]>([])
  const [days, setDays] = useState<number>(30)
  const [max, setMax]   = useState<number>(15)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PlexMedia | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/plex')
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

  function MediaRow({ item, index }: { item: PlexMedia; index: number }) {
    return (
      <tr className="border-b border-[#0f0f1a]">
        <td className="py-1 pr-3 text-right text-[#7070a8] tabular-nums select-none text-xs w-6">{index + 1}</td>
        <td className="py-1 pr-4 text-white font-mono text-sm w-[140px] md:w-auto">
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
        <td className="text-right pr-4 font-mono text-xs text-[#999]">
          {item.year ?? ''}
        </td>
        <td className="text-right pr-4 font-mono text-xs">
          {item.viewCount && item.viewCount > 0
            ? <span className="text-[#999]">1</span>
            : <span className="text-yellow-400">Ø</span>}
        </td>
        <td className="text-right">
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
            className="btn-xs text-red-400"
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
        <div className="font-mono text-xs text-[#6a9a7a] pb-2 mb-3 border-b border-[#1a1a2e] flex items-baseline justify-between">
          <span>const <span className="text-white text-sm font-medium uppercase tracking-widest">Pl3x R3c3ntly 4dd3d</span> = {'{'}</span>
          <span className="text-[#888]">// top {max}, past {days}d first</span>
        </div>
        {error && <p className="text-red-400 text-sm font-mono mb-2"><span className="text-[#888]">2&gt;</span> {error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="font-mono text-xs text-[#6a9a7a] mb-2">  shows: [</div>
            {shows.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono pl-4">none</p>)}
            {shows.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-fixed md:table-auto">
                <tbody>{shows.map((s, i) => <MediaRow key={s.ratingKey} item={s} index={i} />)}</tbody>
              </table></div>
            )}
            <div className="font-mono text-xs text-[#6a9a7a] mt-1">  ], // {shows.length}</div>
          </div>
          <div>
            <div className="font-mono text-xs text-[#6a9a7a] mb-2">  movies: [</div>
            {movies.length === 0 && (loading ? <Spinner /> : <p className="text-[#999] text-sm font-mono pl-4">none</p>)}
            {movies.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full text-sm font-mono table-fixed md:table-auto">
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
