import { NextRequest, NextResponse } from 'next/server'
import { getState, pauseTorrent, resumeTorrent, deleteTorrent, getTorrentDetail, getTorrentsByHashes, addTorrentFormData, addTorrentMagnet, setCategory, getCategories } from '@/lib/qbittorrent'

export async function GET(req: NextRequest) {
  try {
    const p    = req.nextUrl.searchParams
    const hash = p.get('hash')
    const info = p.get('info')
    if (p.has('categories')) {
      return NextResponse.json(await getCategories())
    }
    if (info) {
      const torrents = await getTorrentsByHashes([info])
      return NextResponse.json(torrents[0] ?? null)
    }
    if (hash) {
      const detail = await getTorrentDetail(hash)
      return NextResponse.json(detail)
    }
    const state = await getState()
    return NextResponse.json(state)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('torrent') as File | null
      if (!file) return NextResponse.json({ error: 'no torrent file' }, { status: 400 })
      const qbForm = new FormData()
      qbForm.append('torrents', file, file.name)
      const category = form.get('category') as string | null
      if (category) qbForm.append('category', category)
      if (form.get('paused') === 'true') qbForm.append('paused', 'true')
      await addTorrentFormData(qbForm)
      return NextResponse.json({ ok: true })
    }

    const { action, hash, deleteFiles, url, category, paused } = await req.json()
    if (action === 'pause')       await pauseTorrent(hash)
    else if (action === 'resume') await resumeTorrent(hash)
    else if (action === 'delete') await deleteTorrent(hash, deleteFiles)
    else if (action === 'setCategory') await setCategory(hash, category)
    else if (action === 'addMagnet')   await addTorrentMagnet(url, category, paused)
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
