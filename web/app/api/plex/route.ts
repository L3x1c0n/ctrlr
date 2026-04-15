import { NextRequest, NextResponse } from 'next/server'
import {
  getRecentlyAdded, deleteMedia, resolveThumb, getMediaDetail,
  getPosters, getArts, selectPhoto, refreshMetadata,
  searchMatches, applyMatch,
} from '@/lib/plex'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const thumb      = searchParams.get('thumb')
    const ratingKey  = searchParams.get('ratingKey')
    const posters    = searchParams.get('posters')
    const arts       = searchParams.get('arts')
    const matchQuery = searchParams.get('matchQuery')
    const matchType  = searchParams.get('matchType') ?? 'movie'

    if (thumb) {
      const imgRes = await fetch(resolveThumb(thumb), { cache: 'no-store' })
      const buf    = await imgRes.arrayBuffer()
      return new NextResponse(buf, {
        headers: { 'Content-Type': imgRes.headers.get('Content-Type') ?? 'image/jpeg' },
      })
    }
    if (posters)    return NextResponse.json({ photos: await getPosters(posters) })
    if (arts)       return NextResponse.json({ photos: await getArts(arts) })
    if (matchQuery) return NextResponse.json({ results: await searchMatches(matchQuery, matchType) })
    if (ratingKey)  return NextResponse.json({ detail: await getMediaDetail(ratingKey) })

    return NextResponse.json(await getRecentlyAdded())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, ratingKey } = body

    if (action === 'delete')    await deleteMedia(ratingKey)
    else if (action === 'setPoster') await selectPhoto(ratingKey, 'poster', body.photoKey)
    else if (action === 'setArt')    await selectPhoto(ratingKey, 'art',    body.photoKey)
    else if (action === 'refresh')   await refreshMetadata(ratingKey)
    else if (action === 'match')     await applyMatch(ratingKey, body.guid, body.name, body.mediaType)
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
