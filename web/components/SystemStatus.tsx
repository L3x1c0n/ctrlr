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

function Dot({ status }: { status: ServiceStatus['status'] }) {
  const color = status === 'up' ? 'var(--s-done)' : status === 'warn' ? 'var(--s-today)' : 'var(--s-danger)'
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: 6, height: 6, background: color }}
    />
  )
}

function Bar({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const color = pct >= 90 ? 'var(--s-danger)' : pct >= 70 ? 'var(--s-today)' : 'var(--dim)'
  return (
    <div>
      <div className="flex justify-between font-mono text-xs mb-1">
        <span style={{ color: 'var(--dim)' }}>{label}</span>
        <span style={{ color }}>{sub}</span>
      </div>
      <div style={{ height: 2, background: 'var(--bg-inset)', borderRadius: 1, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: '100%',
            background: color,
            borderRadius: 1,
            transition: 'width 0.7s',
          }}
        />
      </div>
    </div>
  )
}

export default function SystemStatus() {
  const [data, setData]             = useState<SystemData | null>(null)
  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(true)
  const [restarting, setRestarting] = useState<string | null>(null)

  async function restart(key: string) {
    setRestarting(key)
    try {
      await fetch('/api/system/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      setTimeout(load, 3000)
    } finally {
      setRestarting(null)
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/system', { cache: 'no-store' })
      setData(await res.json())
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

  const downCount = data?.services.filter(s => s.status === 'down').length ?? 0

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 16 }}>

      {/* always-visible strip */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 flex items-center gap-3 font-mono text-xs"
        style={{ background: 'transparent' }}
      >
        <span style={{ color: 'var(--dim)', flexShrink: 0 }}>// sys</span>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          {loading ? (
            <span style={{ color: 'var(--dimmer)' }}>checking...</span>
          ) : (
            data?.services.map(s => (
              <div key={s.key} className="flex items-center gap-1.5 min-w-0">
                <Dot status={s.status} />
                <span className="hidden sm:inline whitespace-nowrap" style={{ color: 'var(--dim)' }}>{s.name}</span>
              </div>
            ))
          )}
        </div>

        {data && !loading && (
          <span style={{ color: downCount > 0 ? 'var(--s-danger)' : 'var(--s-done)', flexShrink: 0 }}>
            {downCount > 0 ? `${downCount} down` : 'all up'}
          </span>
        )}
        <span style={{ color: 'var(--dimmer)', flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>

      {/* collapsible detail */}
      {open && data && (
        <div style={{ borderTop: '1px solid var(--border)' }} className="px-3 py-3 space-y-5">

          {/* services */}
          <div>
            <p className="section-label mb-2">{'/* services */'}</p>
            <div className="space-y-1.5">
              {data.services.map(s => (
                <div key={s.key} className="flex items-center gap-2 font-mono text-xs">
                  <Dot status={s.status} />
                  <span className="shrink-0" style={{ color: 'var(--text)', width: 72 }}>{s.name}</span>
                  <span className="shrink-0 tabular-nums text-right" style={{ color: 'var(--dimmer)', width: 52 }}>
                    {s.latency != null ? `${s.latency}ms` : '—'}
                  </span>
                  <span className="flex-1" style={{ color: 'var(--dim)' }}>{s.version ?? ''}</span>
                  <button
                    onClick={() => restart(s.key)}
                    disabled={restarting === s.key}
                    className="btn-xs danger shrink-0"
                  >
                    {restarting === s.key ? '...' : 'restart'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* system metrics */}
          {sys && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <p className="section-label">{'/* memory + cpu */'}</p>
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
                <Bar pct={cpuPct}    label="cpu"    sub={`load ${sys.cpuLoad1.toFixed(2)}`} />
                <Bar pct={diskPct}   label="disk /" sub={`${fmtBytes(sys.diskUsed)} / ${fmtBytes(sys.diskTotal)}`} />
                <Bar pct={iowaitPct} label="iowait" sub={`${iowaitPct}%`} />
              </div>

              <div className="space-y-3">
                <p className="section-label">{'/* process rss */'}</p>
                {sys.processes.map(p => {
                  const pct = sys.memTotal > 0 ? Math.round((p.rss / sys.memTotal) * 100) : 0
                  return (
                    <Bar key={p.name} pct={pct} label={p.name.toLowerCase()} sub={fmtBytes(p.rss * kb)} />
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
