import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const SONARR_URL  = process.env.SONARR_URL!
const SONARR_KEY  = process.env.SONARR_API_KEY!
const RADARR_URL  = process.env.RADARR_URL!
const RADARR_KEY  = process.env.RADARR_API_KEY!
const PLEX_URL    = process.env.PLEX_URL!
const PLEX_TOKEN  = process.env.PLEX_TOKEN!
const TAUTULLI_URL = process.env.TAUTULLI_URL!
const TAUTULLI_KEY = process.env.TAUTULLI_API_KEY!
const QBIT_URL    = process.env.QBIT_URL!

const PROWLARR_URL = process.env.PROWLARR_URL ?? 'http://localhost:9696'
const PROWLARR_KEY = process.env.PROWLARR_API_KEY ?? ''
const AUTOBRR_URL  = process.env.AUTOBRR_URL ?? 'http://localhost:7474'

export interface ServiceStatus {
  name:    string
  key:     string
  status:  'up' | 'down' | 'warn'
  latency: number | null
  version: string | null
}

export interface ProcessMem {
  name: string
  rss:  number  // kB
}

export interface SystemInfo {
  memTotal:     number
  memAvailable: number
  swapTotal:    number
  swapUsed:     number
  cpuLoad1:     number
  cpuCount:     number
  diskUsed:     number
  diskTotal:    number
  processes:    ProcessMem[]
}

async function ping(url: string, init?: RequestInit): Promise<{ ok: boolean; latency: number; text: string }> {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000), cache: 'no-store' })
    const text = await res.text()
    return { ok: res.ok, latency: Date.now() - t0, text }
  } catch {
    return { ok: false, latency: Date.now() - t0, text: '' }
  }
}

function parseVersion(v: string): string {
  // trim build metadata — keep major.minor.patch
  return v.split('.').slice(0, 3).join('.')
}

async function checkSonarr(): Promise<ServiceStatus> {
  const { ok, latency, text } = await ping(`${SONARR_URL}/api/v3/system/status?apikey=${SONARR_KEY}`)
  let version: string | null = null
  try { version = parseVersion(JSON.parse(text).version) } catch {}
  return { name: 'Sonarr', key: 'sonarr', status: ok ? 'up' : 'down', latency, version }
}

async function checkRadarr(): Promise<ServiceStatus> {
  const { ok, latency, text } = await ping(`${RADARR_URL}/api/v3/system/status?apikey=${RADARR_KEY}`)
  let version: string | null = null
  try { version = parseVersion(JSON.parse(text).version) } catch {}
  return { name: 'Radarr', key: 'radarr', status: ok ? 'up' : 'down', latency, version }
}

async function checkPlex(): Promise<ServiceStatus> {
  const { ok, latency, text } = await ping(`${PLEX_URL}/identity`, {
    headers: { 'X-Plex-Token': PLEX_TOKEN, Accept: 'application/json' },
  })
  let version: string | null = null
  try { version = parseVersion(JSON.parse(text).MediaContainer?.version ?? '') } catch {}
  return { name: 'Plex', key: 'plex', status: ok ? 'up' : 'down', latency, version }
}

async function checkTautulli(): Promise<ServiceStatus> {
  const { ok, latency, text } = await ping(`${TAUTULLI_URL}/api/v2?apikey=${TAUTULLI_KEY}&cmd=get_tautulli_info`)
  let version: string | null = null
  try { version = parseVersion((JSON.parse(text).response?.data?.tautulli_version ?? '').replace(/^v/, '')) } catch {}
  return { name: 'Tautulli', key: 'tautulli', status: ok ? 'up' : 'down', latency, version }
}

async function checkQBit(): Promise<ServiceStatus> {
  const { ok, latency, text } = await ping(`${QBIT_URL}/api/v2/app/version`)
  const version = ok && text ? parseVersion(text.trim().replace(/^v/, '')) : null
  return { name: 'qBit', key: 'qbittorrent', status: ok ? 'up' : 'down', latency, version }
}

async function checkProwlarr(): Promise<ServiceStatus> {
  const { ok, latency, text } = await ping(`${PROWLARR_URL}/api/v1/system/status?apikey=${PROWLARR_KEY}`)
  let version: string | null = null
  try { version = parseVersion(JSON.parse(text).version) } catch {}
  return { name: 'Prowlarr', key: 'prowlarr', status: ok ? 'up' : 'down', latency, version }
}

async function checkAutobrr(): Promise<ServiceStatus> {
  const { ok, latency } = await ping(`${AUTOBRR_URL}/api/healthz/liveness`)
  return { name: 'autobrr', key: 'autobrr', status: ok ? 'up' : 'down', latency, version: null }
}

function readSystem(): SystemInfo {
  // /proc/meminfo
  const memRaw = readFileSync('/proc/meminfo', 'utf8')
  function memVal(key: string): number {
    const m = memRaw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
    return m ? parseInt(m[1], 10) : 0
  }
  const memTotal     = memVal('MemTotal')
  const memAvailable = memVal('MemAvailable')
  const swapTotal    = memVal('SwapTotal')
  const swapFree     = memVal('SwapFree')

  // /proc/loadavg
  const loadRaw  = readFileSync('/proc/loadavg', 'utf8')
  const cpuLoad1 = parseFloat(loadRaw.split(' ')[0])

  // cpu count for load normalisation
  let cpuCount = 1
  try {
    const cpuInfo = readFileSync('/proc/cpuinfo', 'utf8')
    cpuCount = (cpuInfo.match(/^processor\s*:/gm) ?? []).length || 1
  } catch {}

  // df /
  let diskUsed = 0, diskTotal = 0
  try {
    const dfOut = execSync('df -k /', { encoding: 'utf8', timeout: 3000 }).trim().split('\n').pop()!
    const parts = dfOut.trim().split(/\s+/)
    diskTotal = parseInt(parts[1], 10) * 1024
    diskUsed  = parseInt(parts[2], 10) * 1024
  } catch {}

  // per-process RSS
  const PROCS = [
    { name: 'Sonarr',  pattern: 'Sonarr' },
    { name: 'Radarr',  pattern: 'Radarr' },
    { name: 'qBit',    pattern: 'qbittorrent-nox' },
  ]
  const processes: ProcessMem[] = []
  try {
    const psOut = execSync('ps -eo comm,rss', { encoding: 'utf8', timeout: 3000 })
    for (const { name, pattern } of PROCS) {
      let total = 0
      for (const line of psOut.split('\n')) {
        if (line.trim().startsWith(pattern)) {
          const parts = line.trim().split(/\s+/)
          total += parseInt(parts[1] ?? '0', 10)
        }
      }
      processes.push({ name, rss: total })
    }
  } catch {}

  return {
    memTotal,
    memAvailable,
    swapTotal,
    swapUsed: swapTotal - swapFree,
    cpuLoad1,
    cpuCount,
    diskUsed,
    diskTotal,
    processes,
  }
}

export async function GET() {
  const [services, system] = await Promise.all([
    Promise.all([
      checkSonarr(),
      checkRadarr(),
      checkPlex(),
      checkTautulli(),
      checkQBit(),
      checkProwlarr(),
      checkAutobrr(),
    ]),
    Promise.resolve().then(readSystem),
  ])

  return NextResponse.json({ services, system })
}
