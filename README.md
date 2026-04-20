# CTRLr

**One place for your entire media stack. Built out of frustration with jumping between Sonarr, Radarr, Plex, qBittorrent, and five other tabs just to see what's going on.**

![Terminal mono aesthetic with neon accents](https://raw.githubusercontent.com/L3x1c0n/ctrlr/main/web/public/apple-touch-icon.png)

## What it does

Single-page dashboard that surfaces everything you care about across your media stack without switching between tabs:

- **Sonarr + Radarr** — active queue, download progress, upcoming calendar, health alerts, per-item search/grab
- **qBittorrent** — torrent list, speed, ratio, pause/resume/delete
- **Plex** — recently added (movies + shows), library search, delete from library
- **Tautulli** — active streams with progress, transcode decision, synopsis
- **Seer** (Overseerr/Jellyseerr) — request list, search with full metadata preview before requesting, approve/decline, sync
- **Trakt** — watchlist with release lookup and one-click grab via Sonarr/Radarr
- **Discover** — trending movies and TV via TMDB with request flow
- **System status** — service health dots (Sonarr, Radarr, Plex, Tautulli, qBit, Prowlarr, autobrr), RAM/swap/CPU/disk bars, per-process memory

## Why it exists

Every tool in the *arr stack has its own UI. Switching between them constantly to check on downloads, approve requests, or see what's airing this week gets old. CTRLr puts it all in one place with a consistent aesthetic and a single login.

## Built entirely with Claude Code

This project was written from scratch and is maintained entirely using [Claude Code](https://claude.com/claude-code) — Anthropic's AI coding CLI. Not a line was written manually. This is an experiment in what it looks like to build and maintain a real, running web application through AI-driven development.

Critique, suggestions, and contributions are genuinely welcome — especially if you think something could be done better. Open an issue or a PR.

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

Copy the example env file and fill in your service URLs and API keys:

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

## Features

- Terminal/mono aesthetic with neon accents and per-theme TopBar (10 themes)
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
