'use client'

import { useState, useEffect } from 'react'
import { THEMES, DEFAULT_THEME } from '@/lib/themes'

const PAGE_BG = '#0A0A0F'
const BAR_H = 16


function MiniChevron({ color, nextBg }: { color: string; nextBg: string }) {
  return (
    <div style={{ background: nextBg }}>
      <svg width="8" height={BAR_H} viewBox={`0 0 8 ${BAR_H}`} style={{ display: 'block', marginLeft: -1 }}>
        <polygon points={`0,0 8,${BAR_H / 2} 0,${BAR_H}`} fill={color} />
      </svg>
    </div>
  )
}

function MiniBar2({ segments }: { segments: { bg: string; fg: string }[] }) {
  return (
    <div style={{ background: PAGE_BG, height: BAR_H, display: 'flex', alignItems: 'stretch' }}>
      {segments.map((seg, i) => {
        const nextBg = segments[i + 1]?.bg ?? PAGE_BG
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ background: seg.bg, width: i === 0 ? 14 : 38, height: BAR_H }} />
            <MiniChevron color={seg.bg} nextBg={nextBg} />
          </div>
        )
      })}
    </div>
  )
}

export default function ThemePicker() {
  const [current, setCurrent] = useState(DEFAULT_THEME)

  useEffect(() => {
    const saved = localStorage.getItem('ctrlr-theme')
    if (saved && THEMES[saved]) setCurrent(saved)
  }, [])

  function pick(key: string) {
    setCurrent(key)
    localStorage.setItem('ctrlr-theme', key)
    window.dispatchEvent(new StorageEvent('storage', { key: 'ctrlr-theme', newValue: key }))
  }

  return (
    <div className="space-y-2">
      {Object.entries(THEMES).map(([key, theme]) => (
        <button
          key={key}
          onClick={() => pick(key)}
          className={`w-full text-left border transition-colors ${current === key ? 'border-[#7070a8]' : 'border-[#1a1a2e] hover:border-[#2a2a4a]'}`}
        >
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className={`font-mono text-xs ${current === key ? 'text-white' : 'text-[#888]'}`}>{theme.name}</span>
            {current === key && <span className="text-[#7070a8] font-mono text-xs">[active]</span>}
          </div>
          <MiniBar2 segments={theme.segments} />
        </button>
      ))}
    </div>
  )
}
