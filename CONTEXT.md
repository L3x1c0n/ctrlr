# CTRLr — Project Context

This file is the shared brain between Claude instances. Keep it updated as the project evolves.
Last updated: 2026-04-15 (app section populated)

---

## What is CTRLr?

CTRLr is a personal media stack control panel built for **gh05t** (GitHub: L3x1c0n).
It has two components:

- **`web/`** — a Next.js dashboard running on a self-hosted server called MORIARTY
- **`CTRLr/`** — a native iPadOS/iOS companion app (SwiftUI, Xcode)

The two are developed in this monorepo so features, issues, and API contracts stay aligned.

---

## MORIARTY — the server

- Ubuntu 24.04, headless (no display manager running)
- User: `gh05t`
- LAN IP: `192.168.1.137`
- Dynamic DNS: `gh05t.duckdns.org` (DuckDNS + Caddy wildcard cert)
- Remote access: xrdp on port 3389, SSH on port 22
- Web dashboard lives at: `/home/gh05t/projects/ctrlr/web`
- Runs as systemd service `ctrlr-web` on port 3000
- Accessible externally at `ctrlr.gh05t.duckdns.org`

---

## Media stack services on MORIARTY

| Service | Port | Notes |
|---|---|---|
| qBittorrent WebUI | 22388 | Not exposed via Caddy — SSH tunnel only |
| Sonarr | 8989 | `sonarr.gh05t.duckdns.org` |
| Radarr | 7878 | `radarr.gh05t.duckdns.org` |
| Jackett | 9117 | `jackett.gh05t.duckdns.org` |
| Seer (Overseerr fork) | 5055 | `overseerr.gh05t.duckdns.org`, Docker container |
| Plex | 32400 | Direct, relay mode, not proxied |
| Tautulli | 8181 | Snap service, not exposed via Caddy |

---

## Web dashboard — `web/`

### Stack
- Next.js 16.2.3 (App Router) + TypeScript + Tailwind CSS 4
- Node 20.20.2 via nvm
- Standalone build output
- No WebSockets — polling only
- Build: `PATH="/home/gh05t/.nvm/versions/node/v20.20.2/bin:$PATH" npm run build`
- Deploy: `sudo systemctl restart ctrlr-web` (rebuild required for source changes; restart alone is not enough)

### Aesthetic — important, don't drift from this
- CLI/terminal/hacking culture throughout
- Powerline-style TopBar (styled after user's oh-my-posh theme)
- L33t speak section titles: `S0n4rr`, `R4d4rr`, `Pl3x`, `s33r`, `t4utull1` etc.
- `>_` prefix on section titles, `2>` for errors, ASCII `▰▱` progress bars
- Comment-style dividers: `/* ── label ── */`
- Page title cycles: `CTRLr` / `gh05t@moriarty:~$` / `CTRLr // m3d14 st4ck` / `[0] all systems nominal`
- Dark theme, monospace font throughout, Nerd Fonts via CDN
- Colour palette: purple/blue `#7070a8`, green `#6a9a7a`, dark bg `#0a0a12`

### Section order
Default (user-configurable via Settings → Section Order, persisted in localStorage):
1. qBittorrent — **pinned at top**, cannot be reordered (dl/ul speeds feed TopBar)
2. Arr (Sonarr + Radarr side by side)
3. Trakt
4. Plex
5. Seer
6. Tautulli

### Key architectural decisions
- **qB pinned at top**: its `onTransferUpdate` callback feeds dl/ul speeds into the TopBar. Moving it would break that wire-up, so it's hardcoded first in `page.tsx` outside the dynamic render loop.
- **Plex `fillToMax`**: fetches items added in last 7 days (configurable via `PLEX_RECENT_DAYS`), tops up with older items if fewer than `PLEX_MAX_ITEMS` (10) were added recently. Intentionally better than Plex's own "recently added" which is purely last-N with no date preference.
- **Section reorder**: stored in `localStorage` under `ctrlr-section-order`. `loadSectionOrder()` in `SectionOrderPicker.tsx` preserves the user's saved order (iterates `parsed`, not `DEFAULT_ORDER` — don't regress this).
- **Auth**: session cookie, no maxAge (clears on browser close). `AUTH_SECRET` is the cookie value. Middleware protects all routes except `/login`, `/api/auth`, `/_next`.
- **Settings API**: reads/writes `.env.local` at `CTRLR_ENV_PATH` (set by `start.sh`). Server component reads file directly; client posts changes via `/api/settings`.
- **Trakt**: reads credentials from `.env.local` at request time (not `process.env`) because the token can be updated at runtime via the settings UI without a restart.
- **Restart button**: calls `/api/restart` which does `process.exit(0)` — systemd `Restart=always` brings it back.

### `.env.local` (gitignored — never commit)
All service URLs and API keys live here. On MORIARTY they point to `localhost`. On a Mac dev setup, point them at `192.168.1.137` (LAN) or the DuckDNS subdomains (off-network). See `web/.env.local` on MORIARTY for the full list of keys.

---

## iPadOS app — `CTRLr/`

Native iPadOS/iOS companion app — a unified media control dashboard for the same MORIARTY stack. Built in SwiftUI, targeting iPadOS 16+.

### Stack & architecture
- SwiftUI, Swift 5.9+, Xcode project at `CTRLr.xcodeproj`
- Glass morphism UI on `#0A0A0F` background (`GlassCard.swift`)
- `DashboardViewModel.swift` — central state, owns all service clients
- Credential storage: Keychain via `CredentialStore.swift`
- `CTRLrWidgets/` — WidgetKit extension (lock screen, StandBy, queue progress)
- `Shared/` — `SharedDefaults` for app ↔ widget data sharing
- App Intents (`CTRLr/Intents/`) — Siri/Shortcuts integration, Focus Filter
- Background refresh: `BGTaskScheduler`, 15-min interval (`BackgroundTaskManager.swift`)
- Notifications: 4 categories (`NotificationManager.swift`)

### Service clients
| Client | File | Notes |
|---|---|---|
| qBittorrent | `QBittorrentClient.swift` | Polling, full torrent control |
| Radarr | `RadarrClient.swift` | One-shot fetch, ntfy-triggered |
| Sonarr | `SonarrClient.swift` | One-shot fetch, ntfy-triggered |
| Plex | `PlexClient.swift` | Auto-discovery via plex.tv, no server URL needed |
| Tautulli | `TautulliClient.swift` | Active sessions, poster proxy |
| Overseerr | `OverseerrClient.swift` | Request management |
| ntfy | `NtfyClient.swift` | WebSocket `wss://ntfy.sh/{topic}/ws`, triggers Radarr/Sonarr/Plex refresh |
| TMDB | `TMDBClient.swift` | Metadata |
| Trakt | `TraktClient.swift` | Watch history / discovery |

### Dashboard sections
1. **DownloadQueueSection** — qBittorrent torrent queue with speed graph
2. **HeroSection** — Plex recently added (Movies + TV, watched badge)
3. **NowPlayingSection** — Tautulli active streams with progress + transcode info
4. **UpcomingSection** — calendar / arr upcoming (scaffolded)
5. **RequestsSection** — Overseerr requests
6. **DiscoverSectionView** — TMDB/Trakt discovery (scaffolded)

Sections are togglable and reorderable via `@AppStorage` + `SectionArrangerView.swift`.

### Connecting to MORIARTY
The app talks directly to MORIARTY's services — same endpoints as the dashboard:
- qBittorrent: `192.168.1.137:22388` (LAN) or SSH tunnel
- Arr services: `sonarr.gh05t.duckdns.org`, `radarr.gh05t.duckdns.org`
- Plex: auto-discovered via plex.tv token (no URL needed)
- Tautulli: `192.168.1.137:8181`
- Overseerr: `overseerr.gh05t.duckdns.org`
- ntfy topics stored in Radarr/Sonarr `username` credential field

### Current state (as of 2026-04-15)
- Phases 1 (qBittorrent), 2 (Radarr/Sonarr/Plex/ntfy), 3 (Tautulli) complete
- Build is clean (verified via xcodebuild)
- WidgetKit, App Intents, Background Tasks, Notifications all wired up
- Phase 4 (Overseerr), Trakt/TMDB discovery, and calendar section in progress

### Known gotchas
- `GENERATE_INFOPLIST_FILE = YES` — do NOT create a manual `Info.plist`, breaks `fullScreenCover` on iOS 26
- `formatBytes` is defined globally — do not redeclare in individual view files
- SourceKit false positives for cross-target types (`UIImage`, `Color(hex:)`) — not real build errors
- Notification `requestAuthorization` must NOT be called in `onAppear` — blocks `fullScreenCover`; request from Settings UI instead

---

## Feature Parity Audit
*Goal: all service management contained within drawers/sections — no navigating to the actual apps.*
*Last audited: 2026-04-15. MORIARTY Claude wrote the initial draft; Mac Claude corrected app column after reading source.*

### qBittorrent
| Feature | Dashboard | App |
|---|---|---|
| Active torrent list | ✅ | ✅ |
| dl/ul speeds | ✅ TopBar | ✅ speed graph + history |
| Pause / Resume | ✅ | ✅ |
| Delete (keep files) | ✅ | ✅ |
| Delete + files | ✅ | ✅ |
| Torrent detail sheet (stats/progress) | ✅ | ✅ |
| File list + per-file progress | ✅ | ❌ |
| Seeds / peers / connections | ✅ | ❌ |
| Save path | ✅ | ❌ |
| Force recheck | ❌ | ❌ |
| Force reannounce | ❌ | ❌ |
| Set speed limits | ❌ | ❌ |
| Set category | ❌ | ❌ |
| Poster enrichment (name + queue hash) | ✅ | ✅ (superior — whole-word matching) |
| Live Activity | ❌ n/a | ✅ |

### Radarr / Sonarr
| Feature | Dashboard | App |
|---|---|---|
| Upcoming calendar | ✅ | ✅ |
| Active download queue | ✅ | ✅ enriched |
| Toggle monitor | ✅ | ✅ (UpcomingSection detail) |
| Change quality profile | ✅ | ✅ (UpcomingSection detail) |
| Auto search (force search) | ✅ | ✅ (UpcomingSection detail) |
| Interactive search + grab | ✅ | ✅ (UpcomingSection detail) |
| Remove from queue | ✅ | ❌ (client exists, no UI in queue) |
| Blacklist + remove | ✅ | ❌ |
| Episode picker (Sonarr) | ✅ | ❌ |
| Add new movie / show | ❌ | ❌ |
| Library search / browse | ❌ | ❌ |
| Health check warnings | ❌ | ❌ |
| ntfy real-time trigger | ❌ | ✅ |

### Plex
| Feature | Dashboard | App |
|---|---|---|
| Recently added (Movies + TV) | ✅ | ✅ (HeroSection) |
| Delete media | ✅ | ✅ (RecentlyAddedDetailSheet) |
| Fix metadata match | ✅ | ✅ (FixMatchSheet) |
| Poster / art selection | ✅ | ✅ (SelectPosterSheet) |
| Metadata refresh | ✅ | ✅ (RecentlyAddedDetailSheet) |
| Mark watched / unwatched | ❌ | ❌ |
| Library search | ❌ | ❌ |
| Play (deep link to Plex app) | ❌ | ❌ |

### Tautulli
| Feature | Dashboard | App |
|---|---|---|
| Active streams | ✅ | ✅ (NowPlayingSection) |
| Progress / position | ✅ | ✅ |
| Transcode decision | ✅ | ✅ |
| User / player / platform | ✅ | ✅ |
| Terminate stream | ❌ | ❌ |
| Play history | ❌ | ❌ |
| User stats | ❌ | ❌ |

### Seer / Overseerr
| Feature | Dashboard | App |
|---|---|---|
| Request list | ✅ | ✅ (RequestsSection — not phase 4, already done) |
| Submit new request | ✅ | ✅ (RequestSearchSheet) |
| Approve / decline request | ✅ | ✅ (MediaDetailSheet) |
| Delete request | ✅ | ✅ (OverseerrClient + MediaDetailSheet) |
| Quality profile + root folder | ✅ | ✅ (MediaDetailSheet) |
| Re-request | ✅ | ❌ |
| Discover / trending | ❌ | ✅ (DiscoverSectionView) |
| Pagination (long lists) | ❌ (backlog) | ✅ |

### Trakt
| Feature | Dashboard | App |
|---|---|---|
| Upcoming calendar | ✅ | ✅ |
| Detail drawer / sheet | ✅ | ❌ |
| Search releases from item | ✅ | ❌ |
| Add to watchlist | ❌ | ❌ (client method exists, no UI) |
| Watch history | ❌ | ❌ |
| Check in | ❌ | ❌ |
| Ratings | ❌ | ❌ |

---

### Priority order to close parity

**Neither platform can do these yet — highest impact:**
1. Radarr/Sonarr: add new movie/show to library
2. Plex: mark watched / unwatched
3. Tautulli: terminate stream
4. Trakt: watch history / check-in / ratings
5. Radarr/Sonarr: health check warnings surface in UI

**App catching up to dashboard:**
1. Radarr/Sonarr: remove from queue + blacklist UI (client exists)
2. Radarr/Sonarr: episode picker (Sonarr)
3. Trakt: detail sheet with release search
4. qBittorrent: file list in detail sheet

**Dashboard catching up to app:**
1. Seer discover/trending section
2. Seer list pagination (existing backlog)
3. Trakt detail drawer error handling (existing backlog — silent error bug)

---

## Backlog (web)

- **Seer list pagination** — request list gets very long, needs truncation or pagination
- **TraktDetailDrawer error handling** — `searchReleases` throws correctly but the drawer still shows silent "no results" on error; needs `relError` state added (same pattern as ArrDetailDrawer)

---

## Git workflow

- Monorepo: `github.com/L3x1c0n/ctrlr` (private)
- Default branch: `main`
- The MORIARTY Claude instance owns commits and pushes — it does this automatically after changes
- On Mac: `git pull` to get latest before starting a session
- Credentials configured via `gh` CLI on MORIARTY

---

## Dev on Mac

1. `git clone https://github.com/L3x1c0n/ctrlr.git`
2. `cd ctrlr/web && npm install`
3. Create `web/.env.local` with service URLs pointing at `192.168.1.137` (LAN) or DuckDNS subdomains
4. `npm run dev` — hot reload at `localhost:3000`
5. Commit and push; MORIARTY pulls, rebuilds, restarts
