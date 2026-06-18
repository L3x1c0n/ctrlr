'use client'

import { useState, useEffect } from 'react'

export const SECTION_ORDER_KEY = 'ctrlr-section-order'
export const DEFAULT_ORDER = ['arr', 'trakt', 'plex', 'seer', 'tautulli'] as const
export type SectionKey = typeof DEFAULT_ORDER[number]

const LABELS: Record<SectionKey, string> = {
  arr:      'Arr  ·  Sonarr + Radarr',
  trakt:    'Trakt',
  plex:     'Plex',
  seer:     'Seer',
  tautulli: 'Tautulli',
}

export function loadSectionOrder(): SectionKey[] {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_KEY)
    if (!raw) return [...DEFAULT_ORDER]
    const parsed = JSON.parse(raw) as string[]
    const validKeys = new Set<string>(DEFAULT_ORDER)
    const filtered = parsed.filter(k => validKeys.has(k)) as SectionKey[]
    const missing = DEFAULT_ORDER.filter(k => !filtered.includes(k))
    return [...filtered, ...missing]
  } catch {
    return [...DEFAULT_ORDER]
  }
}

export default function SectionOrderPicker() {
  const [order, setOrder] = useState<SectionKey[]>([...DEFAULT_ORDER])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setOrder(loadSectionOrder())
    setMounted(true)
  }, [])

  function move(index: number, dir: -1 | 1) {
    const next = [...order]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(next))
    window.dispatchEvent(new StorageEvent('storage', {
      key: SECTION_ORDER_KEY,
      newValue: JSON.stringify(next),
    }))
  }

  if (!mounted) return null

  return (
    <div className="space-y-1">
      {/* Pinned */}
      <div
        className="flex items-center gap-3 px-3 py-2 rounded"
        style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)' }}
      >
        <div className="flex gap-1">
          <button disabled className="btn-xs opacity-30 cursor-not-allowed">▲</button>
          <button disabled className="btn-xs opacity-30 cursor-not-allowed">▼</button>
        </div>
        <span className="font-mono text-xs" style={{ color: 'var(--dim)' }}>qBittorrent</span>
        <span className="ml-auto font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--dimmer)' }}>pinned</span>
      </div>

      {order.map((key, i) => (
        <div
          key={key}
          className="flex items-center gap-3 px-3 py-2 rounded"
          style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)' }}
        >
          <div className="flex gap-1">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="btn-xs disabled:opacity-30 disabled:cursor-not-allowed"
            >▲</button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className="btn-xs disabled:opacity-30 disabled:cursor-not-allowed"
            >▼</button>
          </div>
          <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{LABELS[key]}</span>
        </div>
      ))}
    </div>
  )
}
