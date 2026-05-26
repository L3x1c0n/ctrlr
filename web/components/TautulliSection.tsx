'use client'

import { useState, useEffect, useCallback } from 'react'
import { TautulliActivity } from '@/types'
import SystemStatus from '@/components/SystemStatus'

export default function TautulliSection() {
  const [activity,   setActivity]   = useState<TautulliActivity | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/tautulli')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setActivity(data)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  return (
    <section id="tautulli">
      <div className="module-panel">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-label" style={{ color: 'var(--s-dl)' }}>Tautulli</h2>
          <div className="flex items-center gap-3">
            {activity && activity.stream_count > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--s-play)' }}>
                {activity.stream_count} stream{activity.stream_count !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={async () => { setRefreshing(true); await load(); setRefreshing(false) }}
              disabled={refreshing}
              className="btn-xs"
            >
              {refreshing ? '...' : '↺'}
            </button>
          </div>
        </div>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--s-danger)' }}>{error}</p>}

        <SystemStatus />
      </div>
    </section>
  )
}
