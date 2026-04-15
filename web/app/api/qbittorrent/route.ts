import { NextRequest, NextResponse } from 'next/server'
import { getState, pauseTorrent, resumeTorrent, deleteTorrent, getTorrentDetail } from '@/lib/qbittorrent'

export async function GET(req: NextRequest) {
  try {
    const hash = req.nextUrl.searchParams.get('hash')
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
    const { action, hash, deleteFiles } = await req.json()
    if (action === 'pause') await pauseTorrent(hash)
    else if (action === 'resume') await resumeTorrent(hash)
    else if (action === 'delete') await deleteTorrent(hash, deleteFiles)
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
