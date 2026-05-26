'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Access denied')
      }
    } catch {
      setError('Connection failed')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center font-mono" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-xs px-6">
        <p className="section-label mb-8">ctrlr</p>

        <form onSubmit={submit} className="space-y-3">
          <div
            className="flex items-center transition-colors"
            style={{ border: '1px solid var(--border)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span className="text-[10px] uppercase tracking-widest px-3 select-none shrink-0" style={{ color: 'var(--dim)' }}>user</span>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-xs px-2 py-2.5 focus:outline-none"
              style={{ color: 'var(--text)' }}
            />
          </div>
          <div
            className="flex items-center transition-colors"
            style={{ border: '1px solid var(--border)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span className="text-[10px] uppercase tracking-widest px-3 select-none shrink-0" style={{ color: 'var(--dim)' }}>pass</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-xs px-2 py-2.5 focus:outline-none"
              style={{ color: 'var(--text)' }}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--s-danger)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password || !username}
            className="w-full text-xs uppercase tracking-widest py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ border: '1px solid var(--border)', color: 'var(--text-dim)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hi)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)' }}
          >
            {loading ? '·  ·  ·' : 'login'}
          </button>
        </form>
      </div>
    </div>
  )
}
