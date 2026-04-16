'use client'

import { useState, useMemo } from 'react'
import Spinner from '@/components/Spinner'

export interface Release {
  guid: string
  indexerId: number
  indexer: string
  title: string
  size: number
  age: number
  ageHours: number
  protocol: 'torrent' | 'usenet'
  quality: { quality: { name: string } }
  languages?: { name: string }[]
  customFormatScore?: number
  customFormats?: { name: string }[]
  seeders?: number
  leechers?: number
  rejected: boolean
  rejections: string[]
}

type SortKey = 'seeders' | 'age' | 'title' | 'size'
type QualityTier = 'all' | 'SD' | 'HD' | 'UHD'

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.round(days / 30)}mo`
}

function qualityTier(name: string): QualityTier {
  const n = name.toLowerCase()
  if (n.includes('2160') || n.includes('4k') || n.includes('uhd')) return 'UHD'
  if (n.includes('1080') || n.includes('720')) return 'HD'
  return 'SD'
}

interface Props {
  releases: Release[] | null
  loading: boolean
  error: string | null
  acting: string | null
  onGrab: (guid: string, indexerId: number, key: string) => Promise<void>
}

export default function ReleaseSearchResults({ releases, loading, error, acting, onGrab }: Props) {
  const [sort, setSort]               = useState<SortKey>('seeders')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [hideRejected, setHideRejected] = useState(false)
  const [quality, setQuality]         = useState<QualityTier>('all')

  const visible = useMemo(() => {
    if (!releases) return []
    return releases
      .filter(r => {
        if (hideRejected && r.rejected) return false
        if (quality !== 'all' && qualityTier(r.quality.quality.name) !== quality) return false
        return true
      })
      .sort((a, b) => {
        let cmp = 0
        switch (sort) {
          case 'seeders': cmp = (a.seeders ?? 0) - (b.seeders ?? 0); break
          case 'age':     cmp = a.ageHours - b.ageHours; break
          case 'title':   cmp = a.title.localeCompare(b.title); break
          case 'size':    cmp = a.size - b.size; break
        }
        return sortDir === 'desc' ? -cmp : cmp
      })
  }, [releases, sort, sortDir, hideRejected, quality])

  function toggleSort(key: SortKey) {
    if (sort === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSort(key); setSortDir('desc') }
  }

  function toggleBtn<T extends string>(current: T, val: T, set: (v: T) => void) {
    set(current === val ? 'all' as T : val)
  }

  if (loading) return <Spinner />
  if (error) return <p className="text-red-500 text-xs font-mono mt-2">// error: {error}</p>
  if (!releases) return null

  const btnCls = (active: boolean) =>
    `px-1.5 py-0.5 border text-xs font-mono ${active ? 'border-[#7070a8] text-[#aaa]' : 'border-[#1a1a2e] text-[#555] hover:text-[#888]'}`

  return (
    <div>
      <p className="text-[#7070a8] text-xs mb-2">{`/* releases (${visible.length}/${releases.length}) */`}</p>

      {/* quality + protocol + rejected */}
      <div className="flex flex-wrap gap-1 mb-1.5 text-xs font-mono">
        <span className="text-[#555] self-center">quality:</span>
        {(['SD', 'HD', 'UHD'] as QualityTier[]).map(q => (
          <button key={q} onClick={() => toggleBtn(quality, q, setQuality)} className={btnCls(quality === q)}>{q}</button>
        ))}
        <button
          onClick={() => setHideRejected(v => !v)}
          className={`px-1.5 py-0.5 border ml-auto ${hideRejected ? 'border-[#7070a8] text-yellow-400' : 'border-[#1a1a2e] text-[#555] hover:text-[#888]'}`}
        >
          --no-rej
        </button>
      </div>

      {/* sort */}
      <div className="flex flex-wrap gap-1 mb-2 text-xs font-mono">
        <span className="text-[#555] self-center">sort:</span>
        {(['seeders', 'age', 'title', 'size'] as SortKey[]).map(k => (
          <button key={k} onClick={() => toggleSort(k)} className={btnCls(sort === k)}>
            {k}{sort === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      {releases.length === 0
        ? <p className="text-[#888] text-xs">no results</p>
        : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {visible.map(r => {
              const grabKey = `grab-${r.guid}`
              const nonEng = r.languages?.filter(l => l.name && l.name.toLowerCase() !== 'english' && l.name.toLowerCase() !== 'unknown')
              return (
                <div key={r.guid} className="border border-[#1a1a2e] p-2 text-xs font-mono">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-white leading-snug flex-1 break-all">{r.title}</span>
                    <button
                      onClick={() => onGrab(r.guid, r.indexerId, grabKey)}
                      disabled={!!acting}
                      className="btn-xs text-green-400 shrink-0"
                    >
                      {acting === grabKey ? '...' : '--grab'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[#888] text-xs">
                    <span>{r.quality.quality.name}</span>
                    <span>{fmtSize(r.size)}</span>
                    {r.seeders !== undefined && <span className="text-green-600">{r.seeders}S</span>}
                    {r.leechers !== undefined && <span className="text-yellow-700">{r.leechers}L</span>}
                    <span>{fmtAge(r.ageHours)}</span>
                    <span className="truncate max-w-[100px]">{r.indexer}</span>
                    {nonEng && nonEng.length > 0 && (
                      <span className="text-purple-400">{nonEng.map(l => l.name).join(', ')}</span>
                    )}
                    {(r.customFormatScore ?? 0) !== 0 && (
                      <span className={r.customFormatScore! > 0 ? 'text-cyan-600' : 'text-red-700'}>
                        cf {r.customFormatScore! > 0 ? '+' : ''}{r.customFormatScore}
                      </span>
                    )}
                  </div>
                  {r.rejected && r.rejections.length > 0 && (
                    <p className="text-red-600 text-xs mt-0.5">{r.rejections[0]}</p>
                  )}
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
