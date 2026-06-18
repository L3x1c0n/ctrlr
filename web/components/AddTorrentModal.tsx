'use client'

import { useState, useRef, useEffect } from 'react'

interface Category { name: string; savePath: string }

interface Props {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

export default function AddTorrentModal({ open, onClose, onAdded }: Props) {
  const [tab, setTab]             = useState<'file' | 'magnet'>('file')
  const [file, setFile]           = useState<File | null>(null)
  const [magnet, setMagnet]       = useState('')
  const [category, setCategory]   = useState('')
  const [paused, setPaused]       = useState(false)
  const [categories, setCategories] = useState<Record<string, Category>>({})
  const [adding, setAdding]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/qbittorrent?categories')
      .then(r => r.json())
      .then(d => setCategories(d ?? {}))
      .catch(() => {})
  }, [open])

  function reset() {
    setFile(null)
    setMagnet('')
    setCategory('')
    setPaused(false)
    setError(null)
    setAdding(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function submit() {
    setError(null)
    if (tab === 'file' && !file) { setError('select a .torrent file'); return }
    if (tab === 'magnet' && !magnet.trim()) { setError('enter a magnet link'); return }

    setAdding(true)
    try {
      if (tab === 'file') {
        const form = new FormData()
        form.append('torrent', file!)
        if (category) form.append('category', category)
        if (paused) form.append('paused', 'true')
        const res = await fetch('/api/qbittorrent', { method: 'POST', body: form })
        if (!res.ok) { setError('upload failed'); return }
      } else {
        const res = await fetch('/api/qbittorrent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addMagnet', url: magnet.trim(), category: category || undefined, paused }),
        })
        if (!res.ok) { setError('failed to add magnet'); return }
      }
      reset()
      onAdded()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setAdding(false)
    }
  }

  if (!open) return null

  const catList = Object.values(categories)
  const inputStyle = { background: 'var(--bg-inset)', borderColor: 'var(--border-inset)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div
        className="relative w-full max-w-md font-mono text-xs z-10"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hi)' }}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="section-label">add torrent</span>
          <button onClick={handleClose} className="btn-xs">×</button>
        </div>

        <div className="p-4 space-y-4">
          {/* tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab('file')}
              className="btn-xs"
              style={tab === 'file' ? { borderColor: 'var(--border-hi)', color: 'var(--text)' } : undefined}
            >file</button>
            <button
              onClick={() => setTab('magnet')}
              className="btn-xs"
              style={tab === 'magnet' ? { borderColor: 'var(--border-hi)', color: 'var(--text)' } : undefined}
            >magnet</button>
          </div>

          {/* file input */}
          {tab === 'file' && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".torrent"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              <div
                className="px-4 py-6 text-center cursor-pointer transition-colors"
                style={{
                  border: '1px dashed var(--border-hi)',
                  background: 'var(--bg-inset)',
                  color: file ? 'var(--text)' : 'var(--dim)',
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.torrent')) setFile(f) }}
              >
                {file ? file.name : 'click or drop .torrent file'}
              </div>
            </div>
          )}

          {/* magnet input */}
          {tab === 'magnet' && (
            <div>
              <label className="section-label block mb-1">magnet link</label>
              <textarea
                value={magnet}
                onChange={e => setMagnet(e.target.value)}
                placeholder="magnet:?xt=urn:btih:..."
                rows={3}
                className="w-full px-3 py-2 font-mono text-xs focus:outline-none border resize-none"
                style={inputStyle}
                spellCheck={false}
              />
            </div>
          )}

          {/* category */}
          {catList.length > 0 && (
            <div>
              <label className="section-label block mb-1">category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-2 py-1.5 font-mono text-xs focus:outline-none border"
                style={inputStyle}
              >
                <option value="">none</option>
                {catList.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* start paused */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={paused}
              onChange={e => setPaused(e.target.checked)}
              className="accent-current"
            />
            <span style={{ color: 'var(--dim)' }}>start paused</span>
          </label>

          {error && <p className="text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={adding} className="btn-xs disabled:opacity-40">
              {adding ? '...' : 'add'}
            </button>
            <button onClick={handleClose} className="btn-xs">cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
