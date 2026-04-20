'use client'

import { useState, useEffect } from 'react'
import type { ServiceStatus, SystemInfo } from '@/app/api/system/route'

interface ArrAlert {
  service: 'sonarr' | 'radarr'
  failed:   number
  warnings: number
}

interface Alert {
  id:       string
  level:    'critical' | 'warning' | 'info'
  label:    string
  href:     string
}

function pill(level: Alert['level']) {
  if (level === 'critical') return { color: '#f43f5e', bg: 'rgba(244,63,94,0.1)'  }
  if (level === 'warning')  return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' }
  return                           { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' }
}

export default function AlertStrip() {
  const [alerts, setAlerts] = useState<Alert[]>([])

  async function load() {
    const next: Alert[] = []

    // system: services + disk + ram
    try {
      const res  = await fetch('/api/system', { cache: 'no-store' })
      const data: { services: ServiceStatus[]; system: SystemInfo } = await res.json()

      for (const s of data.services) {
        if (s.status === 'down') {
          next.push({ id: `svc-${s.key}`, level: 'critical', label: `${s.name} down`, href: '#tautulli' })
        }
      }

      const diskPct = data.system.diskTotal > 0
        ? (data.system.diskUsed / data.system.diskTotal) * 100 : 0
      if (diskPct >= 90) next.push({ id: 'disk-crit', level: 'critical', label: `disk ${diskPct.toFixed(0)}% full`, href: '#tautulli' })
      else if (diskPct >= 80) next.push({ id: 'disk-warn', level: 'warning', label: `disk ${diskPct.toFixed(0)}% full`, href: '#tautulli' })

      const ramPct = data.system.memTotal > 0
        ? ((data.system.memTotal - data.system.memAvailable) / data.system.memTotal) * 100 : 0
      if (ramPct >= 90) next.push({ id: 'ram-crit', level: 'critical', label: `ram ${ramPct.toFixed(0)}%`, href: '#tautulli' })
      else if (ramPct >= 85) next.push({ id: 'ram-warn', level: 'warning',  label: `ram ${ramPct.toFixed(0)}%`, href: '#tautulli' })
    } catch {}

    // arr: failed + warnings
    for (const service of ['sonarr', 'radarr'] as const) {
      try {
        const res  = await fetch(`/api/${service}`, { cache: 'no-store' })
        const data = await res.json()
        const queue: { status: string }[] = data.records ?? []
        const failed   = queue.filter(i => i.status === 'failed').length
        const warnings = queue.filter(i => i.status === 'warning').length
        if (failed > 0)   next.push({ id: `${service}-fail`, level: 'critical', label: `${failed} failed in ${service}`,   href: '#arr' })
        if (warnings > 0) next.push({ id: `${service}-warn`, level: 'warning',  label: `${warnings} warnings in ${service}`, href: '#arr' })
      } catch {}
    }

    setAlerts(next)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  if (alerts.length === 0) return null

  return (
    <div className="sticky top-4 md:top-[22px] z-40 mx-3 md:mx-6 mb-[-24px] md:mb-[-28px]">
      <div
        className="flex items-center gap-1.5 flex-wrap px-3 py-1.5 font-mono text-xs border"
        style={{ background: '#08080f', borderColor: '#1a1a2e' }}
      >
        <span className="text-[#444] shrink-0">{'!!'}</span>
        {alerts.map((a, i) => {
          const { color, bg } = pill(a.level)
          return (
            <>
              {i > 0 && <span key={`sep-${a.id}`} className="text-[#2a2a4a]">·</span>}
              <a
                key={a.id}
                href={a.href}
                className="px-1.5 py-0.5 transition-opacity hover:opacity-80 whitespace-nowrap"
                style={{ color, background: bg, border: `1px solid ${color}33` }}
              >
                {a.label}
              </a>
            </>
          )
        })}
      </div>
    </div>
  )
}
