import { NextRequest, NextResponse } from 'next/server'
import { search, getRequests, submitRequest, approveRequest, deleteRequest, getMediaDetail, getSeerProfiles, updateSeerRequest, getRootFolders, getTrending, resolveDefaults, runSyncJobs } from '@/lib/seer'
import { getFileInfoByTitle } from '@/lib/plex'
import { getSeriesDetail, updateSeries } from '@/lib/sonarr'
import { getMovieDetail, updateMovie } from '@/lib/radarr'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('query')
    const mediaId = searchParams.get('mediaId')
    const mediaType = searchParams.get('mediaType')
    const action = searchParams.get('action')
    if (action === 'discover') {
      const mt   = (searchParams.get('mediaType') ?? 'movie') as 'movie' | 'tv'
      const page = parseInt(searchParams.get('page') ?? '1')
      const results = await getTrending(mt, page)
      return NextResponse.json(results)
    }
    if (action === 'providers') {
      const mt     = (mediaType ?? 'movie')
      const idsRaw = searchParams.get('ids') ?? ''
      const ids    = idsRaw.split(',').map(Number).filter(Boolean)
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const detail = await getMediaDetail(mt, id) as Record<string, unknown>
          let provider: string | null = null
          // TV shows: prefer the network name (e.g. "Prime Video", "Netflix")
          const networks = detail?.networks as { name: string }[] | undefined
          if (mt === 'tv' && networks && networks.length > 0) {
            provider = networks[0].name ?? null
          }
          // Fallback: flatrate watch provider for GB, then US
          if (!provider) {
            const wps = (detail?.watchProviders ?? []) as { iso_3166_1: string; flatrate?: { name: string }[] }[]
            const region = wps.find(p => p.iso_3166_1 === 'GB') ?? wps.find(p => p.iso_3166_1 === 'US')
            provider = region?.flatrate?.[0]?.name ?? null
          }
          return { id, provider }
        } catch { return { id, provider: null } }
      }))
      return NextResponse.json(results)
    }
    if (query) {
      const results = await search(query)
      return NextResponse.json(results)
    }
    if (mediaId && mediaType) {
      const [detail, profiles, rootFolders] = await Promise.all([
        getMediaDetail(mediaType, parseInt(mediaId)),
        getSeerProfiles(mediaType),
        getRootFolders(mediaType),
      ])
      const rawServiceId = (detail as any)?.mediaInfo?.externalServiceId
      const serviceId = (rawServiceId != null && rawServiceId > 0) ? rawServiceId : null
      const inPlex = (detail as any)?.mediaInfo?.status === 5
      let plexFileInfo = null
      if (inPlex) {
        const title = (detail as any)?.title ?? (detail as any)?.name
        const year  = (detail as any)?.releaseDate?.slice(0, 4) ?? (detail as any)?.firstAirDate?.slice(0, 4)
        plexFileInfo = await getFileInfoByTitle(title, year ? parseInt(year) : undefined)
      }
      // Fetch current quality profile directly from the arr service — source of truth
      let currentQualityProfileId: number | null = null
      if (serviceId != null) {
        try {
          const arrDetail = mediaType === 'tv'
            ? await getSeriesDetail(serviceId)
            : await getMovieDetail(serviceId)
          currentQualityProfileId = arrDetail?.qualityProfileId ?? null
        } catch { /* non-fatal */ }
      }
      return NextResponse.json({ detail, profiles, rootFolders, serviceId, plexFileInfo, currentQualityProfileId })
    }
    if (searchParams.get('action') === 'defaults' && mediaType) {
      const defaults = await resolveDefaults(mediaType)
      return NextResponse.json(defaults)
    }
    const requests = await getRequests()
    return NextResponse.json(requests)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, id, mediaType, mediaId, seasons, profileId, rootFolder, serviceId } = await req.json()
    if (action === 'submit') await submitRequest(mediaType, mediaId, seasons, profileId, rootFolder)
    else if (action === 'approve') await approveRequest(id)
    else if (action === 'delete') await deleteRequest(id)
    else if (action === 'update') {
      // Push to Seer and directly to the arr service — most recent write wins
      await updateSeerRequest(id, profileId, rootFolder)
      if (serviceId != null && profileId) {
        if (mediaType === 'tv') {
          await updateSeries(serviceId, { qualityProfileId: profileId })
        } else {
          await updateMovie(serviceId, { qualityProfileId: profileId })
        }
      }
    }
    else if (action === 'sync') await runSyncJobs()
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
