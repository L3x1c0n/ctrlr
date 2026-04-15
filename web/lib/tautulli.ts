import { TautulliActivity } from '@/types'

const BASE = process.env.TAUTULLI_URL!
const KEY = process.env.TAUTULLI_API_KEY!

export async function getActivity(): Promise<TautulliActivity> {
  const res = await fetch(`${BASE}/api/v2?apikey=${KEY}&cmd=get_activity`, {
    cache: 'no-store',
  })
  const data = await res.json()
  return data?.response?.data ?? { stream_count: 0, sessions: [] }
}

export function posterUrl(thumb: string): string {
  return `${BASE}/api/v2?apikey=${KEY}&cmd=pms_image_proxy&img=${encodeURIComponent(thumb)}&width=80&height=120`
}
