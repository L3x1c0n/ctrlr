import { readFileSync } from 'fs'
import SettingsForm from '@/components/SettingsForm'
import ThemePicker from '@/components/ThemePicker'
import PasswordForm from '@/components/PasswordForm'
import SectionOrderPicker from '@/components/SectionOrderPicker'

export const dynamic = 'force-dynamic'

const KEYS = [
  'QBIT_URL', 'QBIT_USERNAME',
  'RADARR_URL', 'RADARR_API_KEY',
  'SONARR_URL', 'SONARR_API_KEY',
  'SEER_URL', 'SEER_API_KEY',
  'PLEX_URL', 'PLEX_TOKEN',
  'TAUTULLI_URL', 'TAUTULLI_API_KEY',
  'TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'TRAKT_ACCESS_TOKEN',
]

function readEnvFile(): Record<string, string> {
  const path = process.env.CTRLR_ENV_PATH ?? ''
  try {
    const lines = readFileSync(path, 'utf-8').split('\n')
    const result: Record<string, string> = {}
    for (const line of lines) {
      const eq = line.indexOf('=')
      if (eq === -1 || line.startsWith('#')) continue
      const key = line.slice(0, eq).trim()
      const val = line.slice(eq + 1).trim()
      result[key] = val
    }
    return result
  } catch {
    // fall back to process.env if file unreadable
    const result: Record<string, string> = {}
    for (const key of KEYS) result[key] = process.env[key] ?? ''
    return result
  }
}

export default function Settings() {
  const disk = readEnvFile()
  const initial: Record<string, string> = {}
  for (const key of KEYS) initial[key] = disk[key] ?? ''

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <a href="/" className="text-[#999] hover:text-white font-mono text-xs uppercase tracking-wider mb-8 inline-block">
        ← Back
      </a>
      <h1 className="text-white font-mono text-lg uppercase tracking-widest mb-8">Settings</h1>
      <div className="mb-10">
        <h2 className="text-[#999] font-mono text-xs uppercase tracking-wider mb-3">Topbar Theme</h2>
        <ThemePicker />
      </div>
      <div className="mb-10">
        <h2 className="text-[#999] font-mono text-xs uppercase tracking-wider mb-3">Section Order</h2>
        <SectionOrderPicker />
      </div>
      <div className="mb-10">
        <h2 className="text-[#999] font-mono text-xs uppercase tracking-wider mb-3">Change Password</h2>
        <PasswordForm />
      </div>
      <SettingsForm initial={initial} />
    </div>
  )
}
