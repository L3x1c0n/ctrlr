'use client'

import { useState, useEffect } from 'react'
import type { ServiceStatus, SystemInfo } from '@/app/api/system/route'

interface SystemData {
  services: ServiceStatus[]
  system:   SystemInfo
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}G`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)}M`
  return `${(bytes / 1024).toFixed(0)}K`
}

function barColor(pct: number): string {
  if (pct >= 90) return '#f43f5e'
  if (pct >= 70) return '#fbbf24'
  return '#4ade80'
}

function Bar({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const color = barColor(pct)
  return (
    <div>
      <div className="flex justify-between font-mono text-xs mb-0.5">
        <span className="text-[#888]">{label}</span>
        <span style={{ color }}>{sub}</span>
      </div>
      <div className="h-1.5 bg-[#1a1a2e] rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: color, boxShadow: `0 0 6px ${color}88` }}
        />
      </div>
    </div>
  )
}

function Dot({ status }: { status: ServiceStatus['status'] }) {
  const color = status === 'up' ? '#4ade80' : status === 'warn' ? '#fbbf24' : '#f43f5e'
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: 7, height: 7, background: color, boxShadow: `0 0 5px ${color}` }}
    />
  )
}

export default function SystemStatus() {
  const [data, setData]       = useState<SystemData | null>(null)
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const res = await fetch('/api/system', { cache: 'no-store' })
      const d   = await res.json()
      setData(d)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  const sys = data?.system
  const kb  = 1024

  const memPct    = sys ? Math.round((1 - sys.memAvailable / sys.memTotal) * 100) : 0
  const swapPct   = sys && sys.swapTotal > 0 ? Math.round((sys.swapUsed / sys.swapTotal) * 100) : 0
  const diskPct   = sys && sys.diskTotal > 0 ? Math.round((sys.diskUsed / sys.diskTotal) * 100) : 0
  const cpuPct    = sys ? Math.min(Math.round((sys.cpuLoad1 / (sys.cpuCount || 1)) * 100), 100) : 0
  const iowaitPct = sys?.ioWaitPct ?? 0

  return (
    <div className="border border-[#1a1a2e] mt-4">
      {/* always-visible traffic lights strip */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[#0d0d1a] transition-colors"
      >
        <span className="font-mono text-xs text-[#6a9a7a] shrink-0">// sys</span>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {loading ? (
            <span className="text-[#444] font-mono text-xs">checking...</span>
          ) : (
            data?.services.map(s => (
              <div key={s.key} className="flex items-center gap-1 min-w-0">
                <Dot status={s.status} />
                <span className="font-mono text-xs text-[#666] whitespace-nowrap hidden sm:inline">{s.name}</span>
              </div>
            ))
          )}
        </div>
        {/* overall health summary */}
        {data && !loading && (() => {
          const down = data.services.filter(s => s.status === 'down').length
          return (
            <span className={`font-mono text-xs shrink-0 ${down > 0 ? 'text-[#f43f5e]' : 'text-[#4ade80]'}`}>
              {down > 0 ? `${down} down` : 'all up'}
            </span>
          )
        })()}
        <span className="font-mono text-xs text-[#444] shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {/* collapsible detail */}
      {open && data && (
        <div className="border-t border-[#1a1a2e] px-3 py-3 space-y-4">

          {/* service table */}
          <div>
            <p className="font-mono text-xs text-[#6a9a7a] mb-2">{'/* services */'}</p>
            <div className="space-y-1">
              {data.services.map(s => (
                <div key={s.key} className="flex items-center gap-2 font-mono text-xs">
                  <Dot status={s.status} />
                  <span className="text-white w-[72px] shrink-0">{s.name}</span>
                  <span className="text-[#555] w-[56px] shrink-0 text-right tabular-nums">
                    {s.latency != null ? `${s.latency}ms` : '—'}
                  </span>
                  <span className="text-[#666] shrink-0">{s.version ?? ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* system metrics */}
          {sys && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <p className="font-mono text-xs text-[#6a9a7a]">{'/* memory */'}</p>
                <Bar
                  pct={memPct}
                  label="ram"
                  sub={`${fmtBytes((sys.memTotal - sys.memAvailable) * kb)} / ${fmtBytes(sys.memTotal * kb)}`}
                />
                {sys.swapTotal > 0 && (
                  <Bar
                    pct={swapPct}
                    label="swap"
                    sub={`${fmtBytes(sys.swapUsed * kb)} / ${fmtBytes(sys.swapTotal * kb)}`}
                  />
                )}
                <Bar
                  pct={cpuPct}
                  label="cpu"
                  sub={`load ${sys.cpuLoad1.toFixed(2)}`}
                />
                <Bar
                  pct={diskPct}
                  label="disk /"
                  sub={`${fmtBytes(sys.diskUsed)} / ${fmtBytes(sys.diskTotal)}`}
                />
                <Bar
                  pct={iowaitPct}
                  label="iowait"
                  sub={`${iowaitPct}%`}
                />
              </div>

              <div className="space-y-2.5">
                <p className="font-mono text-xs text-[#6a9a7a]">{'/* process rss */'}</p>
                {sys.processes.map(p => {
                  const pct = sys.memTotal > 0 ? Math.round((p.rss / sys.memTotal) * 100) : 0
                  return (
                    <Bar
                      key={p.name}
                      pct={pct}
                      label={p.name.toLowerCase()}
                      sub={fmtBytes(p.rss * kb)}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
