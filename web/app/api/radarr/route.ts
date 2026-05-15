import { NextRequest, NextResponse } from 'next/server'
import { getQueue, deleteQueueItem, triggerSearch, getMovieDetail, getQualityProfiles, updateMovie, getHealth, getMonitored, getCalendarToday, searchReleases, grabRelease, findByTmdb, searchMovie, getRecentlyAdded, rescanLibrary, deleteMovie } from '@/lib/radarr'

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const movieId = p.get('mediaId')
    const panel   = p.get('panel')

    if (movieId) {
      const [detail, profiles] = await Promise.all([getMovieDetail(Number(movieId)), getQualityProfiles()])
      return NextResponse.json({ detail, profiles })
    }
    const releasesFor = p.get('releasesFor')
    if (releasesFor) {
      return NextResponse.json(await searchReleases(Number(releasesFor)))
    }
    const tmdb = p.get('tmdb')
    if (tmdb) {
      const movieId = await findByTmdb(Number(tmdb))
      if (!movieId) return NextResponse.json({ movieId: null })
      return NextResponse.json({ movieId, releases: null })
    }
    if (panel === 'overview') {
      const [queue, health, monitored, calendar, recentlyAdded] = await Promise.all([getQueue(), getHealth(), getMonitored(), getCalendarToday(), getRecentlyAdded()])
      return NextResponse.json({ records: queue.records, health, monitored, calendar, recentlyAdded })
    }
    return NextResponse.json(await getQueue())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, id, blacklist, movieId, qualityProfileId, monitored, guid, indexerId } = body
    if      (action === 'delete')        await deleteQueueItem(id, blacklist)
    else if (action === 'search')        await triggerSearch(id)
    else if (action === 'updateQuality') await updateMovie(movieId, { qualityProfileId })
    else if (action === 'toggleMonitor') await updateMovie(movieId, { monitored })
    else if (action === 'grab')          await grabRelease(guid, indexerId)
    else if (action === 'searchMovie')   await searchMovie(body.movieId)
    else if (action === 'rescan')        await rescanLibrary()
    else if (action === 'deleteMovie')   await deleteMovie(body.movieId)
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
