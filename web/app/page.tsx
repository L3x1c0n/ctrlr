'use client'

import { useState, useEffect, useCallback } from 'react'
import { QBTransferInfo } from '@/types'
import TopBar from '@/components/TopBar'
import QBittorrentSection from '@/components/QBittorrentSection'
import ArrSection from '@/components/ArrSection'
import TraktSection from '@/components/TraktSection'
import SeerSection from '@/components/SeerSection'
import PlexSection from '@/components/PlexSection'
import TautulliSection from '@/components/TautulliSection'
import { SECTION_ORDER_KEY, DEFAULT_ORDER, loadSectionOrder, type SectionKey } from '@/components/SectionOrderPicker'
import AlertStrip from '@/components/AlertStrip'
import LiveZone from '@/components/LiveZone'

const ARR_TABS = [
  { key: 'sonarr', label: 'Sonarr', color: 'var(--s-sonarr)' },
  { key: 'radarr', label: 'Radarr', color: 'var(--s-today)' },
] as const

function ArrTabs() {
  const [tab, setTab] = useState<'sonarr' | 'radarr'>('sonarr')

  return (
    <div id="arr">
      {/* Mobile: tab switcher */}
      <div className="md:hidden">
        <div className="flex mb-4 border-b" style={{ borderColor: 'var(--border)' }}>
          {ARR_TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-all duration-150 border-b-2 -mb-px"
                style={{
                  borderColor: active ? t.color : 'transparent',
                  color: active ? t.color : 'var(--dim)',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        {ARR_TABS.map(t => (
          <div key={t.key} className={tab === t.key ? '' : 'hidden'}>
            <ArrSection service={t.key} label={t.label} labelColor={t.color} />
          </div>
        ))}
      </div>
      {/* Desktop: side by side */}
      <div className="hidden md:grid md:grid-cols-2 gap-6">
        <ArrSection service="sonarr" label="Sonarr" labelColor="var(--s-sonarr)" />
        <ArrSection service="radarr" label="Radarr" labelColor="var(--s-today)" />
      </div>
    </div>
  )
}

const TITLES = [
  'CTRLr',
  'CTRLr — media stack',
  'CTRLr — all systems nominal',
]

function renderSection(key: SectionKey) {
  switch (key) {
    case 'arr':    return <ArrTabs />
    case 'trakt':  return <TraktSection />
    case 'plex':   return <PlexSection />
    case 'seer':   return <SeerSection />
    case 'tautulli': return <TautulliSection />
  }
}

export default function Home() {
  const [transfer, setTransfer] = useState<QBTransferInfo | null>(null)
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>([...DEFAULT_ORDER])

  const handleTransferUpdate = useCallback((t: QBTransferInfo) => {
    setTransfer(t)
  }, [])

  useEffect(() => {
    setSectionOrder(loadSectionOrder())

    function onStorage(e: StorageEvent) {
      if (e.key === SECTION_ORDER_KEY && e.newValue) {
        try {
          setSectionOrder(JSON.parse(e.newValue))
        } catch {}
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % TITLES.length
      document.title = TITLES[i]
    }, 4000)
    return () => {
      clearInterval(id)
      document.title = 'CTRLr'
    }
  }, [])

  return (
    <>
      <TopBar transfer={transfer} />
      <AlertStrip />
      <main className="pt-[52px] px-4 md:px-6 pb-16 max-w-6xl mx-auto space-y-5">
        <LiveZone />
        <QBittorrentSection onTransferUpdate={handleTransferUpdate} />
        {sectionOrder.map(key => (
          <div key={key}>
            {renderSection(key)}
          </div>
        ))}
      </main>
    </>
  )
}
