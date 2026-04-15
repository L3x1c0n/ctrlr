'use client'

import { useState, useEffect } from 'react'

export const SECTION_ORDER_KEY = 'ctrlr-section-order'
export const DEFAULT_ORDER = ['arr', 'trakt', 'plex', 'seer', 'tautulli'] as const
export type SectionKey = typeof DEFAULT_ORDER[number]

const LABELS: Record<SectionKey, string> = {
  arr:      '>_ 4rr  //  s0n4rr + r4d4rr',
  trakt:    '>_ tr4kt',
  plex:     '>_ pl3x',
  seer:     '>_ s33r',
  tautulli: '>_ t4utull1',
}

export function loadSectionOrder(): SectionKey[] {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_KEY)
    if (!raw) return [...DEFAULT_ORDER]
    const parsed = JSON.parse(raw) as string[]
    // Preserve the user's saved order; drop unknown keys, append any new ones at the end
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
    // Notify other tabs / page.tsx listener
    window.dispatchEvent(new StorageEvent('storage', {
      key: SECTION_ORDER_KEY,
      newValue: JSON.stringify(next),
    }))
  }

  if (!mounted) return null

  return (
    <div className="space-y-1">
      {/* Pinned */}
      <div className="flex items-center gap-3 px-3 py-2 rounded bg-[#1a1a2e] border border-[#2a2a4a]">
        <div className="flex gap-1">
          <button disabled className="btn-xs opacity-20 cursor-not-allowed">▲</button>
          <button disabled className="btn-xs opacity-20 cursor-not-allowed">▼</button>
        </div>
        <span className="font-mono text-xs text-[#666]">&gt;_ qB1tt0rr3nt</span>
        <span className="ml-auto font-mono text-[10px] text-[#444] uppercase tracking-wider">pinned</span>
      </div>

      {order.map((key, i) => (
        <div
          key={key}
          className="flex items-center gap-3 px-3 py-2 rounded bg-[#12121e] border border-[#222240] hover:border-[#3a3a6a] transition-colors"
        >
          <div className="flex gap-1">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="btn-xs disabled:opacity-20 disabled:cursor-not-allowed"
            >▲</button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              className="btn-xs disabled:opacity-20 disabled:cursor-not-allowed"
            >▼</button>
          </div>
          <span className="font-mono text-xs text-[#aaa]">{LABELS[key]}</span>
        </div>
      ))}
    </div>
  )
}
