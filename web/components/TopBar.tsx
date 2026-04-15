'use client'

import { useState, useEffect } from 'react'
import { THEMES, DEFAULT_THEME } from '@/lib/themes'

const BAR_H = 22
const PAGE_BG = '#0A0A0F'
const CHEV_W = 11

const LABELS = ['๛', 'gh05t@moriarty', 'qB', 'arr', 'trakt', 'seer', 'plex', 'tautulli']
const MOB_LABELS = ['๛', 'gh05t', 'qB', 'arr', 'trkt', 'seer', 'plex', 'tautulli']
// Mobile chevron widths — larger values = more prominent triangle
const MOB_CHEV_WIDTHS = [8, 8, 6, 6, 7, 7, 7, 7]
const HREFS: (string | null)[] = [null, null, '#qbittorrent', '#arr', '#trakt', '#seer', '#plex', '#tautulli']

function ChevSvg({ color, w, className }: { color: string; w: number; className: string }) {
  return (
    <svg
      viewBox={`0 0 ${CHEV_W} ${BAR_H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ flexShrink: 0, marginLeft: -1, width: w, height: '100%' }}
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
    <>
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-stretch font-mono overflow-hidden h-4 md:h-[22px]"
      style={{ background: PAGE_BG }}
    >
      {LABELS.map((label, i) => {
        const seg = theme.segments[i]
        const nextBg = theme.segments[i + 1]?.bg ?? PAGE_BG
        const href = HREFS[i]
        const mobChevW = MOB_CHEV_WIDTHS[i]

        const textContent = label === '๛' ? (
          <span className="text-xs font-bold" style={{ fontFamily: 'sans-serif' }}>
            <span className="text-white">CTRL</span><span style={{ color: '#4ade80' }}>r</span>
          </span>
        ) : (
          <>
            <span className="md:hidden">{MOB_LABELS[i]}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        )

        const innerCls = 'flex-1 flex items-center whitespace-nowrap px-1 md:px-2 text-xs font-medium'

        const content = label === '๛' ? (
          <a href="/settings" style={{ background: seg.bg }} className={`${innerCls} hover:brightness-110 transition-[filter]`}>
            {textContent}
          </a>
        ) : href ? (
          <a href={href} style={{ background: seg.bg, color: seg.fg }} className={`${innerCls} hover:brightness-110 transition-[filter]`}>
            {textContent}
          </a>
        ) : (
          <div style={{ background: seg.bg, color: seg.fg }} className={innerCls}>
            {textContent}
          </div>
        )

        return (
          <div key={label} className="flex-none flex items-stretch">
            {content}
            {mobChevW > 0 && (
              <div style={{ background: nextBg, flexShrink: 0 }} className="flex items-center">
                {/* mobile: per-segment width */}
                <ChevSvg color={seg.bg} w={mobChevW} className="md:hidden" />
                {/* desktop: uniform */}
                <ChevSvg color={seg.bg} w={CHEV_W} className="hidden md:block" />
              </div>
            )}
          </div>
        )
      })}

      {/* mobile clock — inside bar, pushed to right edge */}
      <div className="md:hidden ml-auto flex items-center pr-2 flex-none">
        {time && <span className="font-mono text-[10px] tabular-nums text-white">{time}</span>}
      </div>
    </div>

    {/* desktop clock — fixed, independent of bar */}
    <div className="hidden md:flex fixed top-0 right-4 z-50 items-center h-[22px]">
      {time && <span className="font-mono text-sm tabular-nums text-white">{time}</span>}
    </div>
    </>
  )
}
