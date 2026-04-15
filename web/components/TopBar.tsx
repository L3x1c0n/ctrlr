'use client'

import { useState, useEffect } from 'react'
import { THEMES, DEFAULT_THEME } from '@/lib/themes'

const BAR_H = 22
const PAGE_BG = '#0A0A0F'
const CHEV_W = 11

const LABELS = ['๛', 'gh05t@moriarty', 'qB', 'arr', 'trakt', 'seer', 'plex', 'tautulli']
const HREFS: (string | null)[] = [null, null, '#qbittorrent', '#arr', '#trakt', '#seer', '#plex', '#tautulli']

function Chevron({ color }: { color: string }) {
  return (
    <svg
      width={CHEV_W}
      height={BAR_H}
      viewBox={`0 0 ${CHEV_W} ${BAR_H}`}
      preserveAspectRatio="none"
      className="w-[4px] md:w-[11px]"
      style={{ display: 'block', flexShrink: 0, marginLeft: -1 }}
    >
      <polygon points={`0,0 ${CHEV_W},${BAR_H / 2} 0,${BAR_H}`} fill={color} />
    </svg>
  )
}

export default function TopBar() {
  const [time, setTime] = useState('')
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME)

  useEffect(() => {
    const saved = localStorage.getItem('ctrlr-theme')
    if (saved && THEMES[saved]) setThemeKey(saved)
    function onStorage(e: StorageEvent) {
      if (e.key === 'ctrlr-theme' && e.newValue && THEMES[e.newValue]) setThemeKey(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    function tick() { setTime(new Date().toLocaleTimeString('en-GB', { hour12: false })) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const theme = THEMES[themeKey]

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-stretch font-mono overflow-hidden"
      style={{ background: PAGE_BG, height: BAR_H }}
    >
      {LABELS.map((label, i) => {
        const seg = theme.segments[i]
        const nextBg = theme.segments[i + 1]?.bg ?? PAGE_BG
        const href = HREFS[i]

        const content = label === '๛' ? (
          <a
            href="/settings"
            style={{ background: seg.bg }}
            className="flex-1 flex items-center justify-center min-w-0 hover:brightness-110 transition-[filter]"
          >
            <span className="text-xs font-bold" style={{ fontFamily: 'sans-serif' }}>
              <span className="text-white">CTRL</span><span style={{ color: '#4ade80' }}>r</span>
            </span>
          </a>
        ) : href ? (
          <a
            href={href}
            style={{ background: seg.bg, color: seg.fg }}
            className="flex-1 flex items-center justify-center min-w-0 text-xs font-medium hover:brightness-110 transition-[filter] overflow-hidden"
          >
            {label}
          </a>
        ) : (
          <div
            style={{ background: seg.bg, color: seg.fg }}
            className="flex-1 flex items-center justify-center min-w-0 text-xs font-medium overflow-hidden"
          >
            {label === 'gh05t@moriarty' ? (
              <>
                <span className="md:hidden">gh05t</span>
                <span className="hidden md:inline">gh05t@moriarty</span>
              </>
            ) : label}
          </div>
        )

        return (
          <div key={label} className="flex-1 flex items-stretch min-w-0">
            {content}
            <div style={{ background: nextBg, flexShrink: 0 }} className="flex items-center">
              <Chevron color={seg.bg} />
            </div>
          </div>
        )
      })}

      <div className="hidden md:flex items-center px-4 flex-none">
        {time && <span className="font-mono text-sm tabular-nums text-white">{time}</span>}
      </div>
    </div>
  )
}
