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
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm px-8">
        <p className="section-label mb-10">ctrlr</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-dim)' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              className="w-full bg-transparent text-sm px-3 py-2.5 focus:outline-none transition-colors"
              style={{ border: '1px solid var(--border-hi)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--text-dim)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-dim)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-transparent text-sm px-3 py-2.5 focus:outline-none transition-colors"
              style={{ border: '1px solid var(--border-hi)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--text-dim)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--s-danger)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password || !username}
            className="w-full text-sm uppercase tracking-widest py-3 mt-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ border: '1px solid var(--border-hi)', color: 'var(--text)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--text-dim)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-hi)')}
          >
            {loading ? '· · ·' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
