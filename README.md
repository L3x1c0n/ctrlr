<div align="center">
  <img src="https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/icon.png" width="120" alt="CTRLr" />
  <h1>CTRLr</h1>
</div>

**One place for your entire media stack. Built out of frustration with jumping between Sonarr, Radarr, Plex, qBittorrent, and five other tabs just to see what's going on.**

> **Work in progress.** This is a personal project that grew into something shareable. It runs daily on a real home server and the core functionality is solid, but rough edges exist. Mobile is enabled and largely working. New features and fixes are ongoing — issues and PRs welcome.

## How this was built

I know AI vibe-coded projects have a reputation right now — slop shipped fast, no understanding of what's underneath, security holes left open because nobody thought to ask. I want to be upfront about what this is and isn't.

I'm a hobbyist with no programming background. I used [Claude Code](https://claude.com/claude-code) to build CTRLr — every line of code came from AI. What I contributed was the problem, the taste, and the persistence to keep pushing until it worked the way I wanted. The result is a real application running on my home server every day.

I'm not pretending otherwise, and I'm not pretending it's been security-audited or architecturally reviewed by a senior engineer. The security section below is honest about what's in place and what isn't. If you're a developer who can see how to do it better — that's exactly the point of putting it out here. Issues, PRs, and critique are welcome.

## Security

This project was built by a non-developer using AI. That warrants transparency about what has and hasn't been hardened.

**What is in place:**
- All API routes are protected by middleware — no endpoint is reachable without a valid session cookie or API token
- All calls to external services (Sonarr, Radarr, Plex, etc.) are server-side only — API keys are never sent to the browser
- `.env.local` is gitignored and will never be committed
- No database, no user table, no third-party auth dependencies — smaller attack surface by simplicity
- Rate limiting on the login endpoint — 5 failed attempts triggers a 15-minute lockout per IP
- CSRF protection — mutating requests are rejected if Origin/Referer doesn't match the host
- Content Security Policy headers — scripts, styles, fonts and images locked to known-safe sources
- Session expiry — auth cookie expires after 7 days
- Settings write path restricted to session-authenticated requests only — API token clients cannot overwrite credentials

**What is not in place:**
- No independent security audit has been performed
- Single shared secret auth (one user, no per-user permissions)

**Intended deployment:**
CTRLr is designed to run **behind a reverse proxy with HTTPS** (Caddy, nginx). It is **not designed to be exposed directly on port 3000** to the internet. Running it without a reverse proxy or on an open port is not a supported or recommended configuration.

For context on how I run it: single household, behind Caddy with HTTPS, on a home network. That's the threat model this was designed for.

If you find a security issue, open an issue or email directly.

---

![qBittorrent and Trakt calendar](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/01-qb-trakt.png)
![Sonarr and Radarr](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/02-arr.png)
![Plex recently added](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/03-plex.png)
![Seer requests](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/04-seer.png)
![Discover](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/05-discover.png)

---

## What it does

Single-page dashboard that surfaces everything you care about across your media stack without switching between tabs:

- **Sonarr + Radarr** — active queue, download progress, upcoming calendar, health alerts, per-item search/grab
- **qBittorrent** — torrent list, speed, ratio, pause/resume/delete
- **Plex** — recently added (movies + shows), library search, delete from library, edit metadata and artwork, fix incorrect matches
- **Tautulli** — active streams with progress, transcode decision, synopsis
- **Seer** (Overseerr/Jellyseerr) — request list, search with full metadata preview before requesting, approve/decline, sync
- **Trakt** — watchlist with release lookup and one-click grab via Sonarr/Radarr
- **Discover** — trending movies and TV via TMDB with request flow
- **System status** — service health dots (Sonarr, Radarr, Plex, Tautulli, qBit, Prowlarr, autobrr), RAM/swap/CPU/disk bars, per-process memory

## What makes it different

Most media stack dashboards show you what's happening. CTRLr lets you do something about it without leaving the page.

Every item in CTRLr is actionable end-to-end. A few examples of what that looks like in practice:

**Trakt → grab → download → library:**
You see something on your watchlist. One click opens the detail drawer — metadata, release search, available qualities. You can filter and sort releases the same way you would natively in Sonarr or Radarr, then grab directly into either. From there you watch it appear in the queue, track the torrent downloading in qBittorrent, and see it land in Plex once it's imported — all from the same dashboard without switching tabs.

![Trakt detail drawer](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/trakt-drawer.png)

**Seer → approve → download → library:**
A request comes in from someone on your server. You approve it from the Seer panel — it lands straight in Sonarr or Radarr's queue, gets picked up by qBittorrent, and you can watch the download progress in real time. Once it's done, it imports automatically and shows up in Plex. The whole chain, visible from one place, without touching any of the individual tools.

**Failed download → re-grab → back on track:**
A torrent stalls or fails. You delete it from qBittorrent, open the detail drawer in the Arr panel, trigger a new release search, and grab a different one — it drops back into the queue and starts downloading. No need to open Sonarr, qBittorrent, or anything else directly.

**Discover → request → download → library:**
You find something trending on TMDB. Full metadata preview right in the drawer — cast, synopsis, ratings. Quality profile and save location are pre-populated with sensible defaults, but you can change them before requesting if you want. One click sends the request via Seer, which hands it off to Sonarr or Radarr. From there it follows the same path: queue, torrent, download, import, Plex. You triggered the whole thing without leaving the dashboard.

![Discover request flow](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/discover-drawer.png)

The cross-service orchestration is the point. CTRLr doesn't just surface information from each tool — it connects them into workflows you can act on from a single place.

## Why it exists

Every tool in the *arr stack has its own UI. Switching between them constantly to check on downloads, approve requests, or see what's airing this week gets old. CTRLr puts it all in one place with a consistent aesthetic and a single login.

## Who this is for

**CTRLr fits well if you:**
- Run a personal media server at home for yourself (and maybe family)
- Already have some version of the *arr stack running — Sonarr, Radarr, qBittorrent, Plex
- Are tired of having six browser tabs open just to see what's downloading, what's airing, and what's been requested
- Want something that looks good on a phone without a separate app

**It probably won't work for you if you:**
- Are managing a serious multi-user media server with dozens of accounts — there's no user management, one login, no per-user permissions
- Need enterprise-grade security or audit logging — this wasn't built for that and makes no pretense of it
- Want a plug-and-play setup with no configuration — you'll need to know your service URLs and API keys and be comfortable editing a config file or settings form
- Run Jellyfin or Emby instead of Plex — Plex is the only media server supported right now
- Need Docker container management — CTRLr monitors services but can't start, stop, or restart containers

**The sweet spot:**
One person (or one household) running a home media server on a NAS or spare PC, who knows their stack well enough to have set it up but doesn't want to babysit six different UIs every time they want to check on something.

---

## iPadOS / iOS companion app

![iPadOS companion app](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/screenshots/ipad-app-01.png)

The web dashboard is deliberately terminal-flavoured — monospace type, neon on dark, function over form. The iPadOS app is a different thing entirely. It's built to feel native to the device: fluid animations, translucent materials, the design language of a screen you pick up from the couch. But beyond aesthetics, it goes deeper into the platform than a web app can. Downloads surface on your lock screen as Live Activities. Sonarr and Radarr push updates in real time over WebSocket rather than polling. Siri and Shortcuts can reach into your media stack. The app is ambient in a way the dashboard isn't — it integrates with how you actually use an iPhone or iPad rather than asking you to open a tab.

Same data. Different relationship with it.

There is a native SwiftUI companion app in `CTRLr/` targeting iPadOS/iOS 16+. It talks to the same media stack and covers most of the same ground as the web dashboard — sometimes more, sometimes less.

Since the web dashboard and app were built independently, they don't have full feature parity — each has capabilities the other lacks. Active work was underway to close that gap, but has been paused in favour of the more fundamental question: merging them into a proper frontend/backend architecture where the web dashboard serves as the API layer for the app. That work takes priority over parity patches that would need to be redone anyway once the backend unification lands.

**What it has that the web doesn't:**
- Live Activities and lock screen widgets (WidgetKit) for active downloads
- Real-time push updates via ntfy WebSocket — Sonarr/Radarr/Plex refresh on event rather than polling
- Siri/Shortcuts integration and Focus Filter via App Intents
- Background refresh every 15 minutes via BGTaskScheduler

**What the web has that the app doesn't:**
- Plex library search
- Trakt detail drawer with release search and direct grab
- Sonarr episode picker

The app is a local build only — not on the App Store or TestFlight. The source is in this repo if you want to build it yourself in Xcode. Credentials are stored in Keychain; the app currently talks directly to each service, but the longer-term direction is to route everything through the web dashboard as a backend — one authenticated endpoint, one set of credentials, and services that don't need to be individually internet-exposed. That work is in progress.

## Stack

- **Next.js** (App Router, standalone output)
- **Tailwind CSS**
- **TypeScript**
- Runs as a systemd service or in Docker

## Setup

### Prerequisites

- Node.js 20+
- A running *arr stack (Sonarr, Radarr, qBittorrent, Plex, etc.)

### Install

```bash
git clone https://github.com/L3x1c0n/ctrlr.git
cd ctrlr/web
npm install
```

### Configure

All service URLs and API keys can be configured via the **Settings page in the UI** — you don't need to edit the env file manually after first run. The minimum you need in `.env.local` to get started is the auth block at the bottom; everything else can be filled in through the browser.

If you prefer to configure everything upfront, copy the example env file:

```bash
cp .env.local.example .env.local
```

```env
# qBittorrent
QBIT_URL=http://localhost:8080
QBIT_USERNAME=admin

# Sonarr
SONARR_URL=http://localhost:8989
SONARR_API_KEY=your_key_here

# Radarr
RADARR_URL=http://localhost:7878
RADARR_API_KEY=your_key_here

# Plex
PLEX_URL=http://localhost:32400
PLEX_TOKEN=your_token_here

# Tautulli
TAUTULLI_URL=http://localhost:8181
TAUTULLI_API_KEY=your_key_here

# Seer (Overseerr / Jellyseerr)
SEER_URL=http://localhost:5055
SEER_API_KEY=your_key_here

# Prowlarr (optional — for system status panel)
PROWLARR_URL=http://localhost:9696
PROWLARR_API_KEY=your_key_here

# autobrr (optional — for system status panel)
AUTOBRR_URL=http://localhost:7474

# Trakt (optional — configure via Settings UI)
TRAKT_CLIENT_ID=
TRAKT_CLIENT_SECRET=

# Auth
AUTH_USERNAME=admin
AUTH_PASSWORD=changeme
AUTH_SECRET=generate_a_random_64_char_hex_string
```

API keys are also configurable via the Settings page in the UI after first run.

### Run (development)

```bash
npm run dev
```

### Run (production)

```bash
npm run build
node .next/standalone/server.js
```

Or use the included `start.sh` which sources `.env.local` automatically.

### systemd service

```ini
[Unit]
Description=CTRLr Web Dashboard
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/ctrlr/web
ExecStart=/path/to/ctrlr/web/start.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Customisation

**Web dashboard**
Eleven themes selectable from the TopBar — all drawn from familiar developer colour schemes: Catppuccin Mocha, Dracula, Nord, Gruvbox Dark, Night Owl, Cobalt2, Atomic, Tokyo Night, One Dark, and Monochrome. Each theme recolours the entire TopBar with matching neon accents throughout.

Section order is configurable via drag-and-drop — put what you care about most at the top.

**iPadOS / iOS app**
Appearance follows the system automatically — light during the day, dark at night. You can also override it manually and lock to either mode regardless of system setting. Section order is configurable here too.

## Features

- Terminal/mono aesthetic with neon accents and per-theme TopBar (11 themes)
- Mobile-optimised — Sonarr/Radarr and Plex tabs on narrow screens, full grid on desktop
- Section reordering via drag-and-drop
- Single-cookie auth — no database, no user management
- All API calls are server-side — only one port needs to be internet-exposed

## Limitations / known gaps

- Single-user only
- No push notifications
- No Docker container management
- Services must be reachable from the machine running CTRLr (localhost or LAN)
- Not yet one-command deployable (working on it)

## Contributing

Issues and PRs welcome. This is a personal project that grew into something potentially useful — if you run a similar stack and something doesn't work or could be better, say so.

If you're interested in taking over maintenance, open an issue.

## License

MIT

## Disclaimer

CTRLr is a management interface for software you already run. It doesn't download content, index trackers, or provide access to anything. The legality of what you do with your media stack is determined by the tools underneath and how you use them — not by the dashboard on top.
