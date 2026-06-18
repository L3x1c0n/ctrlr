'use client'

import { useState } from 'react'

const inputCls = 'font-mono text-sm px-3 py-1.5 w-full focus:outline-none border'
const inputStyle = { background: 'var(--bg-inset)', borderColor: 'var(--border-inset)', color: 'var(--text)' }

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

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="font-mono text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--dim)' }}>Current password</label>
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} style={inputStyle} required />
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--dim)' }}>New password</label>
        <input type="password" value={next} onChange={e => setNext(e.target.value)} className={inputCls} style={inputStyle} required />
      </div>
      <div>
        <label className="font-mono text-xs uppercase tracking-wider block mb-1" style={{ color: 'var(--dim)' }}>Confirm new password</label>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} style={inputStyle} required />
      </div>
      <div className="flex items-center gap-4 pt-1">
        <button type="submit" disabled={status === 'saving'} className="btn-xs">
          {status === 'saving' ? '...' : 'set password'}
        </button>
        {msg && (
          <span className={`font-mono text-xs ${status === 'ok' ? '' : 'text-danger'}`}
            style={status === 'ok' ? { color: 'var(--s-done)' } : undefined}>
            {msg}
          </span>
        )}
      </div>
    </form>
  )
}
