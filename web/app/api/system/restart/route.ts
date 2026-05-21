import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'

const SYSTEMD: Record<string, string> = {
  sonarr:      'sonarr.service',
  radarr:      'radarr.service',
  plex:        'plexmediaserver.service',
  tautulli:    'snap.tautulli.tautulli.service',
  qbittorrent: 'qbittorrent-nox.service',
}

const DOCKER: Record<string, string> = {
  prowlarr: 'prowlarr',
  autobrr:  'autobrr',
}

export async function POST(req: NextRequest) {
  const { key } = await req.json()
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 })

  try {
    if (SYSTEMD[key]) {
      execSync(`sudo systemctl restart ${SYSTEMD[key]}`, { timeout: 15000 })
    } else if (DOCKER[key]) {
      execSync(`docker restart ${DOCKER[key]}`, { timeout: 15000 })
    } else {
      return NextResponse.json({ error: 'unknown service' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'restart failed' }, { status: 500 })
  }
}
