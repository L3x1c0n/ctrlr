import { NextRequest, NextResponse } from 'next/server'
import { getActivity, posterUrl } from '@/lib/tautulli'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const thumb = searchParams.get('thumb')
    if (thumb) {
      const imgRes = await fetch(posterUrl(thumb), { cache: 'no-store' })
      const buf = await imgRes.arrayBuffer()
      return new NextResponse(buf, {
        headers: { 'Content-Type': imgRes.headers.get('Content-Type') ?? 'image/jpeg' },
      })
    }
    const activity = await getActivity()
    return NextResponse.json(activity)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
