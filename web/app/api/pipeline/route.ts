import { NextRequest, NextResponse } from 'next/server'
import { findByTmdb as radarrFindByTmdb, getMovieDetail, getQualityProfiles, getQueue as getRadarrQueue } from '@/lib/radarr'
import { getSeriesDetail, getQualityProfiles as getSonarrProfiles, getQueue as getSonarrQueue } from '@/lib/sonarr'
import { getMediaDetail as getSeerDetail } from '@/lib/seer'
import { findByTmdb as plexFindByTmdb } from '@/lib/plex'
import { getTorrentsByHashes } from '@/lib/qbittorrent'

export async function GET(req: NextRequest) {
  const p         = req.nextUrl.searchParams
  const tmdbId    = Number(p.get('tmdbId'))
  const mediaType = p.get('mediaType') as 'movie' | 'tv'
  if (!tmdbId || !mediaType) return NextResponse.json({ error: 'missing params' }, { status: 400 })

  try {
    const [seerDetail, plexItem] = await Promise.all([
      getSeerDetail(mediaType, tmdbId).catch(() => null),
      plexFindByTmdb(tmdbId, mediaType).catch(() => null),
    ])

    let arr: object | null = null
    let qbit: object | null = null
    let profiles: object[] = []

    if (mediaType === 'movie') {
      const radarrId = await radarrFindByTmdb(tmdbId).catch(() => null)
      if (radarrId) {
        const [detail, queue, profs] = await Promise.all([
          getMovieDetail(radarrId).catch(() => null),
          getRadarrQueue().catch(() => ({ records: [] })),
          getQualityProfiles().catch(() => []),
        ])
        profiles = profs
        const queueItem = queue.records.find((r: any) => r.movieId === radarrId) ?? null
        arr = { ...detail, queueItem }
        if (queueItem?.downloadId) {
          const torrents = await getTorrentsByHashes([queueItem.downloadId]).catch(() => [])
          qbit = torrents[0] ?? null
        }
      }
    } else {
      const seerServiceId = (seerDetail as any)?.mediaInfo?.externalServiceId ?? null
      if (seerServiceId) {
        const [detail, queue, profs] = await Promise.all([
          getSeriesDetail(seerServiceId).catch(() => null),
          getSonarrQueue().catch(() => ({ records: [] })),
          getSonarrProfiles().catch(() => []),
        ])
        profiles = profs
        const queueItem = queue.records.find((r: any) => r.seriesId === seerServiceId) ?? null
        arr = { ...detail, queueItem }
        if (queueItem?.downloadId) {
          const torrents = await getTorrentsByHashes([queueItem.downloadId]).catch(() => [])
          qbit = torrents[0] ?? null
        }
      }
    }

    return NextResponse.json({ arr, qbit, seer: seerDetail, plex: plexItem, profiles })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
