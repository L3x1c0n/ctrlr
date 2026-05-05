import { NextRequest, NextResponse } from 'next/server'
import { getUpcomingMovies, getUpcomingEpisodes, getTraktMovieDetail, getTraktEpisodeDetail, getTraktSlugByTvdb } from '@/lib/trakt'
import { getMediaDetail } from '@/lib/seer'
import { getEpisodeFileStatus } from '@/lib/sonarr'
import { getMovieFileStatus } from '@/lib/radarr'
interface WatchProvider { id: number; name: string; logoPath: string }

function extractWatchProviders(media: object | null): WatchProvider[] {
  if (!media) return []
  const rawProviders: any[] = (media as any)?.watchProviders ?? []
  const countryData = rawProviders.find((p: any) => p.iso_3166_1 === 'US') ?? rawProviders[0] ?? null
  if (!countryData) return []
  return (countryData.flatrate ?? [])
    .filter((p: any) => p.logoPath)
    .map((p: any) => ({ id: p.id, name: p.name, logoPath: p.logoPath }))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')
    const type = searchParams.get('type')
    const tmdbId = searchParams.get('tmdbId')
    if (slug && type === 'movie') {
      const tmdbIdNum = tmdbId ? parseInt(tmdbId) : null
      const [detail, media] = await Promise.all([
        getTraktMovieDetail(slug),
        tmdbIdNum ? getMediaDetail('movie', tmdbIdNum) : Promise.resolve(null),
      ])
      const posterPath    = (media as any)?.posterPath ?? null
      const backdropPath  = (media as any)?.backdropPath ?? null
      const watchProviders = extractWatchProviders(media)
      return NextResponse.json({ detail, posterPath, backdropPath, watchProviders })
    }
    // Episode synopsis by tvdbId (no slug needed — resolves slug internally)
    const tvdbId = searchParams.get('tvdbId')
    if (tvdbId && searchParams.get('season')) {
      const season  = parseInt(searchParams.get('season') ?? '1')
      const episode = parseInt(searchParams.get('episode') ?? '1')
      const resolvedSlug = await getTraktSlugByTvdb(parseInt(tvdbId))
      if (!resolvedSlug) return NextResponse.json({ overview: null })
      const detail = await getTraktEpisodeDetail(resolvedSlug, season, episode)
      return NextResponse.json({ overview: (detail as any)?.overview ?? null })
    }

    if (slug && type === 'episode') {
      const season = parseInt(searchParams.get('season') ?? '1')
      const episode = parseInt(searchParams.get('episode') ?? '1')
      console.log(`[trakt detail] slug=${slug} season=${season} episode=${episode}`)
      const tmdbIdNum = tmdbId ? parseInt(tmdbId) : null
      const [detail, media] = await Promise.all([
        getTraktEpisodeDetail(slug, season, episode),
        tmdbIdNum ? getMediaDetail('tv', tmdbIdNum) : Promise.resolve(null),
      ])
      const posterPath   = (media as any)?.posterPath ?? null
      const backdropPath = (media as any)?.backdropPath ?? null
      const watchProviders = extractWatchProviders(media)
      return NextResponse.json({ detail, posterPath, backdropPath, watchProviders })
    }

    const [movies, episodes] = await Promise.all([getUpcomingMovies(), getUpcomingEpisodes()])

    // Gather unique IDs to check file status
    const tmdbIds   = [...new Set(movies.map(m => m.movie.ids.tmdb).filter(Boolean))]
    const tvdbIds   = [...new Set(episodes.map(e => e.show.ids.tvdb).filter(Boolean))]

    const [movieFiles, episodeFiles] = await Promise.all([
      getMovieFileStatus(tmdbIds),
      getEpisodeFileStatus(tvdbIds),
    ])

    return NextResponse.json({
      movies,
      episodes,
      downloadedMovies:   [...movieFiles.downloaded],
      downloadedEpisodes: [...episodeFiles.downloaded],
      inArrMovies:        [...movieFiles.inArr],
      inArrShows:         [...episodeFiles.inArr],
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
