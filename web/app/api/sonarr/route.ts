import { NextRequest, NextResponse } from 'next/server'
import { getQueue, deleteQueueItem, triggerSearch, getSeriesDetail, getQualityProfiles, updateSeries, getHealth, getMonitored, getCalendarToday, searchReleases, grabRelease, findByTvdb, findEpisodeId, searchEpisode, getNextEpisodeId, getEpisodes, getEpisodeById, getRecentlyAdded, lookupSeries, updateEpisodeMonitoring, ensureHoldTag, ensureHoldDelayProfile, applyHoldTag, releaseHoldTag } from '@/lib/sonarr'

export async function GET(req: NextRequest) {
  try {
    const p        = req.nextUrl.searchParams
    const seriesId = p.get('mediaId')
    const panel    = p.get('panel')

    if (seriesId) {
      const [detail, profiles] = await Promise.all([getSeriesDetail(Number(seriesId)), getQualityProfiles()])
      return NextResponse.json({ detail, profiles })
    }
    const releasesFor = p.get('releasesFor')
    if (releasesFor) {
      return NextResponse.json(await searchReleases(Number(releasesFor)))
    }
    const episodeId = p.get('episodeId')
    if (episodeId) {
      return NextResponse.json(await getEpisodeById(Number(episodeId)))
    }
    const episodesFor = p.get('episodes')
    if (episodesFor) {
      return NextResponse.json(await getEpisodes(Number(episodesFor)))
    }
    const nextEp = p.get('nextEpisode')
    if (nextEp) {
      return NextResponse.json({ episodeId: await getNextEpisodeId(Number(nextEp)) })
    }
    const lookup = p.get('lookup')
    if (lookup) {
      return NextResponse.json(await lookupSeries(Number(lookup)))
    }
    if (p.get('holdSetup') === '1') {
      const tagId = await ensureHoldTag()
      await ensureHoldDelayProfile(tagId)
      return NextResponse.json({ tagId })
    }
    const tvdb = p.get('tvdb')
    if (tvdb) {
      const season  = Number(p.get('season'))
      const episode = Number(p.get('episode'))
      const seriesId = await findByTvdb(Number(tvdb))
      if (!seriesId) return NextResponse.json({ seriesId: null, episodeId: null })
      const episodeId = season && episode ? await findEpisodeId(seriesId, season, episode) : null
      return NextResponse.json({ seriesId, episodeId })
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
    const { action, id, blacklist, seriesId, qualityProfileId, monitored, guid, indexerId } = body
    if      (action === 'delete')        await deleteQueueItem(id, blacklist)
    else if (action === 'search')        await triggerSearch(id)
    else if (action === 'updateQuality') await updateSeries(seriesId, { qualityProfileId })
    else if (action === 'toggleMonitor') await updateSeries(seriesId, { monitored })
    else if (action === 'grab')          await grabRelease(guid, indexerId)
    else if (action === 'searchEpisode') await searchEpisode(body.episodeId)
    else if (action === 'updateEpisodeMonitor') await updateEpisodeMonitoring(body.episodeIds, body.monitored)
    else if (action === 'applyHold')   await applyHoldTag(body.seriesId, body.tagId)
    else if (action === 'releaseHold') await releaseHoldTag(body.seriesId, body.tagId)
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
