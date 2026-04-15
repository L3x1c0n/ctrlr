# CTRLr — Project Context

This file is the shared brain between Claude instances. Keep it updated as the project evolves.
Last updated: 2026-04-15

---

## What is CTRLr?

CTRLr is a personal media stack control panel built for **gh05t** (GitHub: L3x1c0n).
It has two components:

- **`web/`** — a Next.js dashboard running on a self-hosted server called MORIARTY
- **`ios/`** — a native iPadOS companion app (in planning/early development)

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

## iOS app — `ios/`

To be populated by the iOS/iPadOS development context. The iOS app is planned as a companion to the web dashboard — native iPadOS client for the same media stack.

When the iOS Claude instance sets up context, it should document here:
- App architecture and patterns
- Which web API endpoints the app consumes (or plans to)
- Any shared data contracts or types
- Current state and backlog

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
