'use client'

import { useState, useEffect } from 'react'
import { QBTransferInfo } from '@/types'

function fmtSpeed(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB/s`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
}

interface Props {
  transfer?: QBTransferInfo | null
}

const SEG = 'flex items-center gap-2 px-4 text-xs font-mono whitespace-nowrap border-r'
const SEG_STYLE = { borderColor: 'rgba(255,255,255,0.06)', color: '#706050' }
const VAL = { color: '#a09070' }
const LBL = { color: '#504840' }
const BAR = { background: '#252018', borderBottom: '1px solid rgba(0,0,0,0.30)' }

export default function TopBar({ transfer }: Props) {
  const [time, setTime] = useState('')

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const dlSpeed = transfer?.dl_info_speed ?? 0
  const ulSpeed = transfer?.up_info_speed ?? 0
  const dlActive = dlSpeed > 50 * 1024
  const ulActive = ulSpeed > 50 * 1024

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-stretch overflow-hidden" style={{ height: 36, ...BAR }}>

      {/* Brand */}
      <a href="/settings" className={SEG} style={{ ...SEG_STYLE, color: '#c8b898', fontWeight: 600, letterSpacing: '0.08em', textDecoration: 'none' }}>
        CTRLr
      </a>

      {/* Download */}
      <div className={SEG} style={SEG_STYLE}>
        {dlActive && <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: '#E8680A' }} />}
        <span style={LBL}>↓</span>
        <span style={VAL}>{transfer ? fmtSpeed(dlSpeed) : '—'}</span>
      </div>

      {/* Upload */}
      <div className={SEG} style={SEG_STYLE}>
        {ulActive && <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: '#1A9A3C' }} />}
        <span style={LBL}>↑</span>
        <span style={VAL}>{transfer ? fmtSpeed(ulSpeed) : '—'}</span>
      </div>

      {/* Session totals */}
      <div className="hidden md:flex items-center gap-2 px-4 text-xs font-mono border-r" style={SEG_STYLE}>
        <span style={LBL}>session</span>
        <span style={VAL}>{transfer ? `↓${(transfer.dl_info_data / 1024 / 1024 / 1024).toFixed(1)}G` : '—'}</span>
        <span style={VAL}>{transfer ? `↑${(transfer.up_info_data / 1024 / 1024 / 1024).toFixed(1)}G` : '—'}</span>
      </div>

      {/* Clock */}
      <div className="ml-auto flex items-center px-4 text-xs font-mono border-l" style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#504840' }}>
        {time}
      </div>
    </div>
  )
}
