// qBittorrent
export interface QBTorrent {
  hash: string
  name: string
  progress: number
  size: number
  dlspeed: number
  upspeed: number
  eta: number
  state: string
  num_seeds: number
  num_leechs: number
  downloaded: number
  uploaded: number
  category: string
  added_on: number  // Unix timestamp
}

export interface QBTransferInfo {
  dl_info_speed: number
  up_info_speed: number
  dl_info_data: number
  up_info_data: number
}

export interface QBState {
  torrents: QBTorrent[]
  transfer: QBTransferInfo
  posters?: Record<string, string>
}

// Radarr / Sonarr
export interface ArrQueueItem {
  id: number
  title: string
  status: string
  trackedDownloadStatus: string
  trackedDownloadState: string
  statusMessages: { title: string; messages: string[] }[]
  size: number
  sizeleft: number
  downloadId: string
  protocol: string
  movieId?: number
  seriesId?: number
  episodeId?: number
  quality?: { quality: { name: string; resolution?: number } }
}

export interface QualityProfile {
  id: number
  name: string
}

export interface ArrMediaDetail {
  id: number
  title: string
  year: number
  overview: string
  genres: string[]
  images: { coverType: string; remoteUrl?: string }[]
  qualityProfileId: number
  monitored: boolean
  status: string
  ratings?: Record<string, { value: number; votes?: number }>
  movieFile?: { quality: { quality: { name: string; resolution?: number } }; size?: number }
}

export interface ArrQueue {
  records: ArrQueueItem[]
  totalRecords: number
}

export interface ArrCalendarItem {
  id: number       // episodeId (sonarr) or movieId (radarr)
  title: string    // formatted: "Series - S01E01 - Title" or movie title
  seriesId?: number
}

// Seer
export interface SeerRequest {
  id: number
  status: number
  type: string
  createdAt: string
  serverId?: number
  profileId?: number
  rootFolder?: string
  media: {
    id: number
    tmdbId: number
    title?: string
    name?: string
    mediaType: string
    status: number
    posterPath?: string
  }
  requestedBy: {
    id: number
    displayName: string
    avatar?: string
  }
}

export interface SeerSearchResult {
  id: number
  mediaType: string
  title?: string
  name?: string
  overview: string
  posterPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage?: number
  mediaInfo?: {
    id: number
    status: number
    requests?: SeerRequest[]
  }
}

export interface DiscoverDetail {
  title?: string
  name?: string
  overview?: string
  posterPath?: string
  backdropPath?: string
  releaseDate?: string
  firstAirDate?: string
  voteAverage?: number
  runtime?: number
  numberOfSeasons?: number
  genres?: { id: number; name: string }[]
  productionCompanies?: { id: number; name: string }[]
  networks?: { id: number; name: string }[]
  credits?: {
    cast?: { name: string; character?: string }[]
    crew?: { name: string; job: string; department: string }[]
  }
  mediaInfo?: { status?: number }
}

export interface SeerSearchResponse {
  results: SeerSearchResult[]
  totalResults: number
  totalPages: number
}

// Plex
export interface PlexMedia {
  ratingKey: string
  title: string
  type: string
  thumb?: string
  art?: string
  addedAt: number
  viewCount?: number
  grandparentTitle?: string
  grandparentRatingKey?: string
  grandparentThumb?: string
  parentIndex?: number
  index?: number
  year?: number
  summary?: string
}

// Tautulli
export interface TautulliSession {
  session_key: string
  user: string
  friendly_name: string
  title: string
  grandparent_title: string
  parent_title: string
  state: string
  progress_percent: string
  duration: number
  view_offset: number
  transcode_decision: string
  stream_bitrate: string
  thumb: string
  grandparent_thumb: string
  media_type: string
  platform: string
  player: string
  summary?: string
}

export interface TautulliActivity {
  stream_count: number
  sessions: TautulliSession[]
}

// Trakt
export interface TraktMovie {
  released: string
  movie: {
    title: string
    year: number
    ids: {
      trakt: number
      slug: string
      imdb: string
      tmdb: number
    }
  }
}

export interface TraktEpisode {
  first_aired: string
  episode: {
    season: number
    number: number
    title: string
    ids: {
      trakt: number
      tvdb: number
      imdb: string
      tmdb: number
    }
  }
  show: {
    title: string
    year: number
    ids: {
      trakt: number
      slug: string
      tvdb: number
      imdb: string
      tmdb: number
    }
  }
}
