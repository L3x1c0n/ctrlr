# CTRLr — Project Context

This file is the shared brain between Claude instances. Keep it updated as the project evolves.
Last updated: 2026-04-19 (Plex library search, autobrr IRC+filters, Prowlarr→Docker done)

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
| Prowlarr | 9696 | `prowlarr.gh05t.duckdns.org`, Docker |
| autobrr | 7474 | `autobrr.gh05t.duckdns.org`, Docker |
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
4. **UpcomingSection** — Radarr/Sonarr upcoming with day columns, detail sheet, provider logos, force/interactive search
5. **RequestsSection** — Overseerr requests, submit, approve, delete, quality profile, root folder
6. **DiscoverSectionView** — TMDB/Trakt discovery, paginated

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
All core sections implemented and functional. Build is clean.
- ✅ qBittorrent — queue, pause/resume, delete, detail sheet, poster enrichment, speed graph
- ✅ Radarr/Sonarr — upcoming calendar, force search, interactive search/grab, quality profile, monitor toggle
- ✅ Plex — recently added, delete, fix match, poster/art selection, metadata refresh
- ✅ Tautulli — active streams, progress, transcode info
- ✅ Overseerr — request list, submit, approve, delete, quality profile, root folder
- ✅ Trakt/TMDB — upcoming calendar, discover/trending (paginated)
- ✅ WidgetKit, App Intents, Background Tasks, Notifications, Live Activities, Focus Filter, ntfy WebSocket

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
| Add new movie / show | ➡️ via Seer | ➡️ via Seer |
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
| Library search | ✅ | ❌ |
| Play (deep link to Plex app) | ❌ | ❌ |

### Tautulli
| Feature | Dashboard | App |
|---|---|---|
| Active streams | ✅ | ✅ (NowPlayingSection) |
| Progress / position | ✅ | ✅ |
| Transcode decision | ✅ | ✅ |
| User / player / platform | ✅ | ✅ |
| Terminate stream | ➡️ not needed | ➡️ not needed |
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
1. Trakt: watch history / check-in / ratings
2. Plex: mark watched / unwatched, library search, deep link to play (deferred — post housekeeping)

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

## Next steps / backlog

### Infrastructure — this weekend

Full Docker migration plan agreed 2026-04-17. Detailed blueprint in MORIARTY memory: `project_docker_migration.md`.

**Phase 1 — Prowlarr (Docker)**
Replace Jackett (native systemd) with Prowlarr in Docker. 9 indexers to re-add: 8 public (thepiratebay, eztv, acgrip, kickasstorrents-to, 1337x, therarbg, showrss, kickasstorrents-ws) + 1 private (xspeeds, needs creds). Jackett API key: `q5sgecasbgrpm4dxsnluy2swb3n4knqo`, config at `/home/gh05t/.config/Jackett/`. Stop Jackett systemd after.

**Phase 2 — Full stack Dockerization**
Services → Docker: qBittorrent, Sonarr, Radarr, Seer, Tautulli, CTRLr Web, autobrr, profilarr.
**Plex stays native** — reads same filesystem paths, no GPU passthrough complexity.

Critical path structure for hardlinks (all containers share `/data` root):
```
/data/
  torrents/tv/
  torrents/movies/
  media/tv/
  media/movies/
```
Use linuxserver.io images. PUID/PGID = gh05t. Set `mem_limit` on Sonarr + Radarr (bloat history).

New tools: **autobrr** (IRC announce grabs — xspeeds IRC confirmed: `irc.xspeeds.eu` / `#announce`), **profilarr** (quality profile sync).

**Phase 3 — Hardware migration** — trivial once Docker: copy compose + volumes to new machine.

### Both platforms — not built anywhere yet
- Trakt: watch history, check-in, ratings
- Plex: mark watched / unwatched, library search, deep link to play (deferred)
- Tautulli: play history + user stats

### App — catching up to dashboard
- Radarr/Sonarr: remove from queue + blacklist UI (client method exists, no UI wired)
- Sonarr: episode picker in detail sheet
- Trakt: detail sheet with release search (same pattern as dashboard's TraktDetailDrawer)
- qBittorrent: file list in torrent detail sheet

### Dashboard — catching up to app
- ~~Seer discover/trending section~~ — implemented (DiscoverSection.tsx, trending movies + TV with movies/tv tabs + preview pane)
- ~~Plex library search~~ — implemented 2026-04-19 (full-width input + grep button, results expand above recently-added, flex row layout)
- Seer list pagination (request list gets very long, only 10 shown of up to 43+)
- Trakt detail drawer: fix silent error — `searchReleases` throws but drawer shows "no results"; needs `relError` state (same pattern as ArrDetailDrawer)

---

## Unified Drawer System — Design in Progress

*Discussion started: 2026-04-16. Not yet implemented on either platform.*

### Goal

Two related goals driving this:
1. **Feature parity** — both platforms should be able to perform all or most functions of each service without leaving CTRLr.
2. **Unified drawer logic** — a drawer opened from *any* section should know the item's full pipeline state and surface the right actions for it, not just the actions of the section it was opened from.

### The Lifecycle Model

Every piece of media moves through these stages. The stage determines which actions are primary and which are contextual:

```
Discover → Requested → Searching → Downloading → Available → Watched
 (Trakt)   (Overseerr)   (Arr)      (qBittorrent)  (Plex)    (Tautulli)
```

### The Linking Key

TMDB ID is the universal key across all services — Radarr, Sonarr, Plex, Overseerr, and Trakt all use it. qBittorrent doesn't natively, but name-based poster enrichment (already implemented) provides the bridge. This is what allows a drawer opened from qBittorrent to know "this is Radarr item #382, Plex ratingKey 4821, Overseerr request #17."

### Proposed Drawer Structure

Every drawer, regardless of entry point, follows the same layout logic:

```
┌─────────────────────────────────────────────────┐
│  [Poster]  Title (Year)                          │
│            ● Downloading  [stage pill]           │
│            Quality: 1080p Bluray · 4.2 GB        │
├─────────────────────────────────────────────────┤
│  PRIMARY ACTIONS  (for current stage)            │
│  [Pause]  [Delete + Files]  [Force Recheck]      │
├─────────────────────────────────────────────────┤
│  PIPELINE                                        │
│  Radarr ──── Grabbed · Futureman.2160p           │
│              [Force Search]  [Quality Profile]   │
│  Plex   ──── Not yet imported                    │
├─────────────────────────────────────────────────┤
│  METADATA                                        │
│  Overview, rating, genres, runtime               │
└─────────────────────────────────────────────────┘
```

Primary actions change by stage. The pipeline block is always present and shows adjacent services — you can act on them from there without leaving the drawer.

### Actions by Stage

| Stage | Primary Actions | Pipeline Context Shows |
|---|---|---|
| **Discover** | Request (Overseerr), Add to Watchlist (Trakt) | — |
| **Requested** | Approve, Decline, Change Quality, Delete Request | Arr: monitor status |
| **Searching** | Force Search, Interactive Search, Change Quality, Toggle Monitor | Overseerr: request status |
| **Downloading** | Pause, Resume, Delete (keep/remove), File list | Radarr/Sonarr: quality/queue, Plex: not yet |
| **Available** | Delete, Fix Match, Refresh Metadata, Poster/Art, Mark Watched | Tautulli: currently streaming? |
| **Watching** | Terminate Stream, Mark Watched | Plex: direct actions |
| **Watched** | Mark Unwatched, Re-request | — |

### MediaItem Aggregate (proposed)

A `MediaItem` struct/type that holds cross-service IDs for one piece of media. Populated lazily as the drawer opens — fetch what you don't already have from the entry-point service, then resolve the rest:

```
MediaItem {
  tmdbId: Int
  title: String
  type: .movie | .show

  // Populated by whichever service opened the drawer:
  radarrId?: Int
  sonarrId?: Int
  plexRatingKey?: String
  overseerrRequestId?: Int
  qbitHash?: String
  traktSlug?: String
}
```

Drawer renders progressively as cross-service lookups resolve. Entry point provides the first ID; everything else is fetched on open.

### Open Questions (to discuss next session)

1. **Cross-service linking aggressiveness** — show full pipeline block on every drawer including "not yet" states, or only show adjacent services that actually have data?

2. **Entry point UX** — every row taps into the unified drawer, or keep lightweight inline actions (pause/resume) and only go unified on a dedicated detail tap?

3. **Platform alignment** — web and app drawers structurally identical (same sections, same labels), or just functionally equivalent with platform-appropriate UI patterns?

4. **Implementation scope** — start by retrofitting existing drawers into this structure, or design new drawers first for the missing features (mark watched, terminate stream, add to library) which have no current drawer at all?

---

## Dashboard layout conventions

### List rows — use flex, not tables
For lists with a dominant title column + compact metadata (Seer requests, Tautulli sessions), use **flex rows**, not `<table>`. Tables with `w-full` always distribute extra horizontal space across ALL columns — every attempt to fight this with `table-fixed`, `visibility:hidden`, or `justify-*` makes it worse.

Correct pattern:
```tsx
// container
<div className="font-mono text-xs">
  // header row — identical structure to body rows
  <div className="flex items-center gap-3 text-[#999] text-xs uppercase border-b ...">
    <span className="w-5 shrink-0" />           {/* row number */}
    <span className="flex-1">Title</span>         {/* takes all remaining space */}
    <span className="shrink-0 w-[Npx]">Status</span>  {/* fixed width = longest value */}
    <span className="shrink-0">Actions</span>
  </div>
  // body rows
  {items.map(item => (
    <div className="flex items-center gap-3 border-b ...">
      <span className="w-5 shrink-0 ...">{i + 1}</span>
      <div className="flex-1 min-w-0">...</div>    {/* title, flex-1 min-w-0 */}
      <span className="shrink-0 w-[Npx] whitespace-nowrap">...</span>
      <div className="shrink-0 flex gap-1">...</div>  {/* actions */}
    </div>
  ))}
</div>
```

Tables (`table-fixed md:table-auto`, `pr-4` padding) are fine for QB-style data where ALL columns are uniform and there's no dominant label column.

### Fixed-width metadata columns
When a flex-row column has variable text (e.g. status: "Pending" / "Processing" / "Available"), give it a fixed `w-[Npx]` sized to the **longest possible value** at the relevant font size. This prevents the title column from jittering as values change.

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
