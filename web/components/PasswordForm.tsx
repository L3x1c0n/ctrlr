'use client'

import { useState } from 'react'

export default function PasswordForm() {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [status,   setStatus]   = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [msg,      setMsg]      = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) { setStatus('err'); setMsg('passwords do not match'); return }
    setStatus('saving')
    setMsg('')
    try {
      const res  = await fetch('/api/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) { setStatus('err'); setMsg(data.error ?? 'failed'); return }
      setStatus('ok')
      setMsg('password updated — restart service to apply')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (e) {
      setStatus('err')
      setMsg(String(e))
    }
  }

  const field = 'bg-[#0f0f1a] border border-[#1a1a2e] text-white font-mono text-sm px-3 py-1.5 w-full focus:outline-none focus:border-[#888]'

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-[#888] font-mono text-xs uppercase tracking-wider block mb-1">Current password</label>
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className={field} required />
      </div>
      <div>
        <label className="text-[#888] font-mono text-xs uppercase tracking-wider block mb-1">New password</label>
        <input type="password" value={next} onChange={e => setNext(e.target.value)} className={field} required />
      </div>
      <div>
        <label className="text-[#888] font-mono text-xs uppercase tracking-wider block mb-1">Confirm new password</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={field} required />
      </div>
      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="btn-xs text-blue-400"
        >
          {status === 'saving' ? '...' : '--set-password'}
        </button>
        {msg && (
          <span className={`font-mono text-xs ${status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {msg}
          </span>
        )}
      </div>
    </form>
  )
}
