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

const ARR_TABS = [
  { key: 'sonarr', label: 'S0n4rr', active: 'border-blue-400 text-blue-400',   inactive: 'border-transparent text-[#555] hover:text-blue-400/60'   },
  { key: 'radarr', label: 'R4d4rr', active: 'border-yellow-400 text-yellow-400', inactive: 'border-transparent text-[#555] hover:text-yellow-400/60' },
] as const

function ArrTabs() {
  const [tab, setTab] = useState<'sonarr' | 'radarr'>('sonarr')
  return (
    <div id="arr">
      {/* Mobile: tab switcher */}
      <div className="md:hidden">
        <div className="flex mb-4 border-b border-[#1a1a2e]">
          {ARR_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 font-mono text-xs uppercase tracking-widest transition-colors border-b-2 -mb-px ${tab === t.key ? t.active : t.inactive}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {ARR_TABS.map(t => (
          <div key={t.key} className={tab === t.key ? '' : 'hidden'}>
            <ArrSection service={t.key} label={t.label} />
          </div>
        ))}
      </div>
      {/* Desktop: side by side */}
      <div className="hidden md:grid md:grid-cols-2 gap-6">
        <ArrSection service="sonarr" label="S0n4rr" />
        <ArrSection service="radarr" label="R4d4rr" />
      </div>
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="text-[#7070a8] font-mono text-xs">
      {'/* ── '}{label}{' ── */'}
    </div>
  )
}

const TITLES = [
  'CTRLr',
  'gh05t@moriarty:~$',
  'CTRLr // m3d14 st4ck',
  '[0] all systems nominal',
]

function renderSection(key: SectionKey) {
  switch (key) {
    case 'arr':
      return (
        <>
          <Divider label="arr" />
          <ArrTabs />
        </>
      )
    case 'trakt':
      return (
        <>
          <Divider label="trakt" />
          <TraktSection />
        </>
      )
    case 'plex':
      return (
        <>
          <Divider label="plex" />
          <PlexSection />
        </>
      )
    case 'seer':
      return (
        <>
          <Divider label="seer" />
          <SeerSection />
        </>
      )
    case 'tautulli':
      return (
        <>
          <Divider label="tautulli" />
          <TautulliSection />
        </>
      )
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
      <TopBar />
      <main className="pt-4 md:pt-8 px-3 md:px-6 pb-12 max-w-7xl mx-auto space-y-10">
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
