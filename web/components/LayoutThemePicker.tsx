'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'ctrlr-layout-theme'

export default function LayoutThemePicker() {
  const [theme, setTheme] = useState<'braun' | 'classic'>('braun')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'classic') {
      setTheme('classic')
    }
  }, [])

  function apply(t: 'braun' | 'classic') {
    setTheme(t)
    localStorage.setItem(STORAGE_KEY, t)
    if (t === 'classic') {
      document.documentElement.dataset.theme = 'classic'
    } else {
      delete document.documentElement.dataset.theme
    }
  }

  const options = [
    { key: 'braun' as const, label: 'Braun', desc: 'Warm off-white, Braun signal colors' },
    { key: 'classic' as const, label: 'Classic', desc: 'Dark hacker palette' },
  ]

  return (
    <div className="flex gap-3">
      {options.map(o => {
        const active = theme === o.key
        return (
          <button
            key={o.key}
            onClick={() => apply(o.key)}
            className="flex flex-col gap-1 px-4 py-3 border text-left transition-all duration-150"
            style={{
              borderColor: active ? 'var(--text)' : 'var(--dimmer)',
              background: o.key === 'classic' ? '#0A0A0F' : '#edeae5',
              color: active ? 'var(--text)' : 'var(--dim)',
              minWidth: 120,
            }}
          >
            <span
              className="font-mono text-xs uppercase tracking-wider font-medium"
              style={{ color: o.key === 'classic' ? '#e2e2e2' : '#1a1614' }}
            >
              {o.label}
            </span>
            <span
              className="font-mono text-[10px]"
              style={{ color: o.key === 'classic' ? '#444466' : '#a09890' }}
            >
              {o.desc}
            </span>
          </button>
        )
      })}
    </div>
  )
}
