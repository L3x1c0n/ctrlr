import { NextResponse } from 'next/server'

export async function POST() {
  // Respond first, then exit — systemd (Restart=always) brings it back
  setTimeout(() => process.exit(0), 300)
  return NextResponse.json({ ok: true })
}
