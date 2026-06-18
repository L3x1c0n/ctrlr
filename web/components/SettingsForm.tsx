'use client'

import { useState } from 'react'

const FIELDS = [
  { section: 'qBittorrent', keys: ['QBIT_URL', 'QBIT_USERNAME'] },
  { section: 'Radarr', keys: ['RADARR_URL', 'RADARR_API_KEY'] },
  { section: 'Sonarr', keys: ['SONARR_URL', 'SONARR_API_KEY'] },
  { section: 'Seer', keys: ['SEER_URL', 'SEER_API_KEY'] },
  { section: 'Plex', keys: ['PLEX_URL', 'PLEX_TOKEN'] },
  { section: 'Tautulli',  keys: ['TAUTULLI_URL', 'TAUTULLI_API_KEY'] },
  { section: 'Prowlarr', keys: ['PROWLARR_URL', 'PROWLARR_API_KEY'] },
  { section: 'autobrr',  keys: ['AUTOBRR_URL'] },
  { section: 'Trakt',    keys: ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET'] },
]

const SECRET_KEYS = new Set(['RADARR_API_KEY', 'SONARR_API_KEY', 'SEER_API_KEY', 'PLEX_TOKEN', 'TAUTULLI_API_KEY', 'PROWLARR_API_KEY', 'TRAKT_CLIENT_SECRET'])

type TraktState = 'idle' | 'waiting' | 'done' | 'error'
type ScanState = 'idle' | 'scanning' | 'done' | 'error'

const inputStyle = {
  background: 'var(--bg-inset)',
  borderColor: 'var(--border-inset)',
  color: 'var(--text)',
}

export default function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [radarrScan, setRadarrScan] = useState<ScanState>('idle')
  const [sonarrScan, setSonarrScan] = useState<ScanState>('idle')

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

  async function rescan(service: 'radarr' | 'sonarr') {
    const set = service === 'radarr' ? setRadarrScan : setSonarrScan
    set('scanning')
    try {
      const res = await fetch(`/api/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescan' }),
      })
      const data = await res.json()
      set(data.error ? 'error' : 'done')
      setTimeout(() => set('idle'), 3000)
    } catch {
      set('error')
      setTimeout(() => set('idle'), 3000)
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
      if (d.ok) { setTraktState('done'); setTraktCode(null) }
      else setTimeout(poll, interval * 1000)
    }
    setTimeout(poll, interval * 1000)
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-danger font-mono text-sm border border-danger px-4 py-3">{error}</p>}
      {saved && <p className="font-mono text-sm" style={{ color: 'var(--s-done)' }}>Saved.</p>}

      {FIELDS.map(({ section, keys }) => (
        <div key={section}>
          <h2 className="section-label mb-3">{section}</h2>
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key} className="flex gap-3 items-center">
                <label className="font-mono text-xs w-48 flex-shrink-0" style={{ color: 'var(--dim)' }}>{key}</label>
                <input
                  type={SECRET_KEYS.has(key) ? 'password' : 'text'}
                  value={values[key] ?? ''}
                  onChange={(e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setSaved(false) }}
                  className="flex-1 font-mono text-sm px-3 py-1.5 focus:outline-none border"
                  style={inputStyle}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          {section === 'Trakt' && (
            <div className="mt-3 px-4 py-3 font-mono text-sm" style={{ border: '1px solid var(--border)' }}>
              {traktState === 'idle' && (
                <div className="flex items-center gap-4">
                  {initial.TRAKT_ACCESS_TOKEN ? (
                    <span style={{ color: 'var(--s-done)' }}>Connected</span>
                  ) : null}
                  <button onClick={connectTrakt} className="btn-xs">
                    {initial.TRAKT_ACCESS_TOKEN ? 'Reconnect →' : 'Connect Trakt Account →'}
                  </button>
                </div>
              )}
              {traktState === 'waiting' && traktCode && (
                <div>
                  <p className="mb-1" style={{ color: 'var(--text)' }}>
                    Go to <span style={{ color: 'var(--s-sonarr)' }}>trakt.tv/activate</span> and enter:
                  </p>
                  <p className="text-2xl tracking-widest my-2" style={{ color: 'var(--s-today)' }}>{traktCode}</p>
                  <p className="text-xs" style={{ color: 'var(--dim)' }}>Waiting for authorisation...</p>
                </div>
              )}
              {traktState === 'done' && (
                <p style={{ color: 'var(--s-done)' }}>Connected. Hit Restart Service to apply.</p>
              )}
              {traktState === 'error' && (
                <div>
                  <p className="text-danger mb-2">{traktError}</p>
                  <button onClick={connectTrakt} className="btn-xs">Try again →</button>
                </div>
              )}
              {traktError && traktState !== 'error' && <p className="text-danger mt-2">{traktError}</p>}
            </div>
          )}
        </div>
      ))}

      <div>
        <h2 className="section-label mb-3">Manual Scan</h2>
        <div className="flex gap-3">
          {(['radarr', 'sonarr'] as const).map((svc) => {
            const state = svc === 'radarr' ? radarrScan : sonarrScan
            return (
              <button
                key={svc}
                onClick={() => rescan(svc)}
                disabled={state === 'scanning'}
                className="btn-xs disabled:opacity-50"
              >
                {state === 'scanning' ? `${svc} scanning...` : state === 'done' ? `${svc} queued` : state === 'error' ? `${svc} error` : `rescan ${svc}`}
              </button>
            )
          })}
        </div>
        <p className="font-mono text-xs mt-2" style={{ color: 'var(--dim)' }}>
          Triggers a full filesystem rescan in each service. Use when files are missing or not importing.
        </p>
      </div>

      <div className="flex gap-3">
        <button onClick={save} className="btn-xs">Save</button>
        <button
          onClick={restart}
          disabled={restarting}
          className="btn-xs disabled:opacity-50"
          style={{ background: 'var(--s-today)', color: 'var(--bg)', borderColor: 'transparent' }}
        >
          {restarting ? 'Restarting...' : 'Restart Service'}
        </button>
      </div>
    </div>
  )
}
