import { NextResponse } from 'next/server'
import { ensureFreshToken } from '@/lib/trakt'

export async function GET() {
  try {
    await ensureFreshToken()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
