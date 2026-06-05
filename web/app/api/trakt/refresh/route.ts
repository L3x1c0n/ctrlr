import { NextResponse } from 'next/server'
import { forceRefreshToken } from '@/lib/trakt'

export async function GET() {
  try {
    const { expiresAt } = await forceRefreshToken()
    return NextResponse.json({ ok: true, expiresAt, expiresAt_iso: new Date(expiresAt * 1000).toISOString() })
  } catch (e) {
    console.error('[trakt] cron refresh failed:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
