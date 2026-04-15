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
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center font-mono">
      <div className="w-full max-w-sm px-6">
        <div className="mb-8">
          <p className="text-[#8a8aba] text-xs uppercase tracking-widest mb-1">/* ctrlr */</p>
          <p className="text-[#888] text-xs">gh05t@moriarty:~$ sudo ctrlr --login</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center border border-[#2a2a4a] focus-within:border-[#8a8aba] transition-colors">
            <span className="text-[#8a8aba] px-3 text-sm select-none">username:</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-white text-sm px-2 py-2.5 focus:outline-none placeholder:text-[#888]"
              placeholder=""
            />
          </div>
          <div className="flex items-center border border-[#2a2a4a] focus-within:border-[#8a8aba] transition-colors">
            <span className="text-[#8a8aba] px-3 text-sm select-none">password:</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-white text-sm px-2 py-2.5 focus:outline-none"
              placeholder=""
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs font-mono">
              <span className="text-[#999]">2&gt;</span> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password || !username}
            className="w-full border border-[#2a2a4a] hover:border-[#8a8aba] text-[#999] hover:text-white text-sm py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            {loading ? '...' : '--login'}
          </button>
        </form>
      </div>
    </div>
  )
}
