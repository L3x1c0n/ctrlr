import { NextRequest, NextResponse } from 'next/server'
import { findByTmdb as radarrFindByTmdb, getMovieDetail, getQualityProfiles, getQueue as getRadarrQueue } from '@/lib/radarr'
import { getSeriesDetail, getQualityProfiles as getSonarrProfiles, getQueue as getSonarrQueue, getEpisodeById } from '@/lib/sonarr'
import { getMediaDetail as getSeerDetail } from '@/lib/seer'
import { findByTmdb as plexFindByTmdb, findByTitle as plexFindByTitle } from '@/lib/plex'
import { getTorrentsByHashes } from '@/lib/qbittorrent'
import { ArrQueue } from '@/types'

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
  return Promise.race([p.catch(() => fallback), timer])
}

const emptyQueue: ArrQueue = { records: [], totalRecords: 0 }

export async function GET(req: NextRequest) {
  const p         = req.nextUrl.searchParams
  const tmdbId    = Number(p.get('tmdbId'))
  const mediaType = p.get('mediaType') as 'movie' | 'tv'
  if (!tmdbId || !mediaType) return NextResponse.json({ error: 'missing params' }, { status: 400 })

  try {
    // Fire Seer + Plex + Arr ID lookup all in parallel — don't block on any one service
    const [seerDetail, plexByGuid, arrId] = await Promise.all([
      withTimeout(getSeerDetail(mediaType, tmdbId), 6000, null),
      withTimeout(plexFindByTmdb(tmdbId, mediaType), 6000, null),
      mediaType === 'movie'
        ? withTimeout(radarrFindByTmdb(tmdbId), 6000, null)
        : Promise.resolve((await withTimeout(getSeerDetail(mediaType, tmdbId), 6000, null) as any)?.mediaInfo?.externalServiceId ?? null),
    ])

    let arr: object | null = null
    let qbit: object | null = null
    let profiles: object[] = []

    if (arrId) {
      if (mediaType === 'movie') {
        const [detail, queue, profs] = await Promise.all([
          withTimeout(getMovieDetail(arrId as number), 6000, null),
          withTimeout(getRadarrQueue(), 6000, emptyQueue),
          withTimeout(getQualityProfiles(), 6000, [] as object[]),
        ])
        profiles = profs as object[]
        const queueItem = (queue as ArrQueue).records?.find(r => (r as any).movieId === arrId) ?? null
        arr = { ...(detail as object ?? {}), queueItem }
        if ((queueItem as any)?.downloadId) {
          const torrents = await withTimeout(getTorrentsByHashes([(queueItem as any).downloadId]), 4000, [] as object[])
          qbit = (torrents as object[])[0] ?? null
        }
      } else {
        const [detail, queue, profs] = await Promise.all([
          withTimeout(getSeriesDetail(arrId as number), 6000, null),
          withTimeout(getSonarrQueue(), 6000, emptyQueue),
          withTimeout(getSonarrProfiles(), 6000, [] as object[]),
        ])
        profiles = profs as object[]
        const queueItem = (queue as ArrQueue).records?.find(r => (r as any).seriesId === arrId) ?? null
        const episodeId = (queueItem as any)?.episodeId ?? null
        const [torrents, episodeDetail] = await Promise.all([
          (queueItem as any)?.downloadId
            ? withTimeout(getTorrentsByHashes([(queueItem as any).downloadId]), 4000, [] as object[])
            : Promise.resolve([] as object[]),
          episodeId ? withTimeout(getEpisodeById(episodeId), 4000, null) : Promise.resolve(null),
        ])
        arr = { ...(detail as object ?? {}), queueItem, episodeDetail }
        qbit = (torrents as object[])[0] ?? null
      }
    }

    // If GUID-based Plex lookup missed (e.g. TVDB-matched show), try by title
    const plexByTitle = plexByGuid ? null : (arr ? await withTimeout(plexFindByTitle((arr as any).title, mediaType), 4000, null) : null)
    const plexItem = plexByGuid ?? plexByTitle

    return NextResponse.json({ arr, qbit, seer: seerDetail, plex: plexItem, profiles })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
