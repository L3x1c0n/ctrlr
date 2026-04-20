import { NextRequest, NextResponse } from 'next/server'
import { search, getRequests, submitRequest, approveRequest, deleteRequest, getMediaDetail, getSeerProfiles, updateSeerRequest, getRootFolders, getTrending, resolveDefaults, runSyncJobs } from '@/lib/seer'
import { getFileInfoByTitle } from '@/lib/plex'

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
      return NextResponse.json({ detail, profiles, rootFolders, serviceId, plexFileInfo })
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
    const { action, id, mediaType, mediaId, seasons, profileId, rootFolder } = await req.json()
    if (action === 'submit') await submitRequest(mediaType, mediaId, seasons, profileId, rootFolder)
    else if (action === 'approve') await approveRequest(id)
    else if (action === 'delete') await deleteRequest(id)
    else if (action === 'update') await updateSeerRequest(id, profileId, rootFolder)
    else if (action === 'sync') await runSyncJobs()
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
