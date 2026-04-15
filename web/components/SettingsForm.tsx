'use client'

import { useState } from 'react'

const FIELDS = [
  { section: 'qBittorrent', keys: ['QBIT_URL', 'QBIT_USERNAME'] },
  { section: 'Radarr', keys: ['RADARR_URL', 'RADARR_API_KEY'] },
  { section: 'Sonarr', keys: ['SONARR_URL', 'SONARR_API_KEY'] },
  { section: 'Seer', keys: ['SEER_URL', 'SEER_API_KEY'] },
  { section: 'Plex', keys: ['PLEX_URL', 'PLEX_TOKEN'] },
  { section: 'Tautulli', keys: ['TAUTULLI_URL', 'TAUTULLI_API_KEY'] },
  { section: 'Trakt', keys: ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'] },
]

const SECRET_KEYS = new Set(['RADARR_API_KEY', 'SONARR_API_KEY', 'SEER_API_KEY', 'PLEX_TOKEN', 'TAUTULLI_API_KEY', 'TRAKT_CLIENT_SECRET'])

type TraktState = 'idle' | 'waiting' | 'done' | 'error'

export default function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [traktState, setTraktState] = useState<TraktState>('idle')
  const [traktCode, setTraktCode] = useState<string | null>(null)
  const [traktError, setTraktError] = useState<string | null>(null)

  async function save() {
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSaved(true)
    } catch (e) {
      setError(String(e))
    }
  }

  async function restart() {
    setRestarting(true)
    try { await fetch('/api/restart', { method: 'POST' }) } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, 4000))
    window.location.reload()
  }

  async function connectTrakt() {
    setTraktError(null)
    setTraktState('idle')

    // First save current values so client_id and client_secret are on disk
    await save()

    const res = await fetch('/api/trakt/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'code' }),
    })
    const data = await res.json()
    if (!data.device_code) { setTraktError('Failed to get device code — save Client ID and Secret first.'); return }

    setTraktCode(data.user_code)
    setTraktState('waiting')
    window.open('https://trakt.tv/activate', '_blank')

    // Poll every 5 seconds
    const interval = data.interval ?? 5
    const expires = Date.now() + (data.expires_in ?? 600) * 1000
    const poll = async () => {
      if (Date.now() > expires) { setTraktState('error'); setTraktError('Code expired. Try again.'); return }
      const r = await fetch('/api/trakt/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll', device_code: data.device_code }),
      })
      const d = await r.json()
      if (d.ok) {
        setTraktState('done')
        setTraktCode(null)
      } else {
        setTimeout(poll, interval * 1000)
      }
    }
    setTimeout(poll, interval * 1000)
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-red-400 font-mono text-sm border border-red-400 px-4 py-3">{error}</p>}
      {saved && <p className="text-green-400 font-mono text-sm">Saved.</p>}

      {FIELDS.map(({ section, keys }) => (
        <div key={section}>
          <h2 className="text-[#999] font-mono text-xs uppercase tracking-wider mb-3">{section}</h2>
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key} className="flex gap-3 items-center">
                <label className="font-mono text-xs text-[#999] w-48 flex-shrink-0">{key}</label>
                <input
                  type={SECRET_KEYS.has(key) ? 'password' : 'text'}
                  value={values[key] ?? ''}
                  onChange={(e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setSaved(false) }}
                  className="flex-1 bg-[#0f0f1a] border border-[#1a1a2e] text-white font-mono text-sm px-3 py-1.5 focus:outline-none focus:border-[#888]"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          {section === 'Trakt' && (
            <div className="mt-3 border border-[#1a1a2e] px-4 py-3 font-mono text-sm">
              {traktState === 'idle' && (
                <div className="flex items-center gap-4">
                  {initial.TRAKT_ACCESS_TOKEN ? (
                    <span className="text-green-400">Connected</span>
                  ) : null}
                  <button onClick={connectTrakt} className="text-blue-400 hover:text-blue-300">
                    {initial.TRAKT_ACCESS_TOKEN ? 'Reconnect →' : 'Connect Trakt Account →'}
                  </button>
                </div>
              )}
              {traktState === 'waiting' && traktCode && (
                <div>
                  <p className="text-white mb-1">Go to <span className="text-blue-400">trakt.tv/activate</span> and enter:</p>
                  <p className="text-yellow-400 text-2xl tracking-widest my-2">{traktCode}</p>
                  <p className="text-[#999] text-xs">Waiting for authorisation...</p>
                </div>
              )}
              {traktState === 'done' && (
                <p className="text-green-400">Connected. Hit Restart Service to apply.</p>
              )}
              {traktState === 'error' && (
                <div>
                  <p className="text-red-400 mb-2">{traktError}</p>
                  <button onClick={connectTrakt} className="text-blue-400 hover:text-blue-300">Try again →</button>
                </div>
              )}
              {traktError && traktState !== 'error' && <p className="text-red-400 mt-2">{traktError}</p>}
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-3">
        <button onClick={save} className="bg-[#1a1a2e] text-white font-mono text-sm px-6 py-2 hover:bg-[#252540]">
          Save
        </button>
        <button
          onClick={restart}
          disabled={restarting}
          className="bg-yellow-400 text-black font-mono text-sm px-6 py-2 hover:bg-yellow-300 disabled:opacity-50"
        >
          {restarting ? 'Restarting...' : 'Restart Service'}
        </button>
      </div>
    </div>
  )
}
