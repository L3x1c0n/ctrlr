import AppIntents

// MARK: - CTRLrShortcuts
//
// Donates pre-built Siri phrases automatically — no user setup required.
// These appear in Spotlight, Siri suggestions, and the Shortcuts app.
//
// Add new AppShortcut entries here as each phase is implemented.

struct CTRLrShortcuts: AppShortcutsProvider {

    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {

        // ── Phase 1: qBittorrent ───────────────────────────────────────

        AppShortcut(
            intent: GetDownloadStatusIntent(),
            phrases: [
                "What's downloading in \(.applicationName)",
                "Check downloads in \(.applicationName)",
                "Download status in \(.applicationName)"
            ],
            shortTitle: "Download Status",
            systemImageName: "arrow.down.circle"
        )

        AppShortcut(
            intent: PauseAllDownloadsIntent(),
            phrases: [
                "Pause downloads in \(.applicationName)",
                "Pause all in \(.applicationName)",
                "Stop downloading in \(.applicationName)"
            ],
            shortTitle: "Pause All",
            systemImageName: "pause.circle.fill"
        )

        AppShortcut(
            intent: ResumeAllDownloadsIntent(),
            phrases: [
                "Resume downloads in \(.applicationName)",
                "Resume all in \(.applicationName)",
                "Start downloading in \(.applicationName)"
            ],
            shortTitle: "Resume All",
            systemImageName: "play.circle.fill"
        )

        // ── Phase 2 additions (uncomment when implemented) ─────────────

        // AppShortcut(
        //     intent: GetUpcomingReleasesIntent(),
        //     phrases: [
        //         "What's coming out in \(.applicationName)",
        //         "Upcoming releases in \(.applicationName)"
        //     ],
        //     shortTitle: "Upcoming Releases",
        //     systemImageName: "calendar"
        // )

        // ── Phase 3 additions (uncomment when implemented) ─────────────

        // AppShortcut(
        //     intent: GetActiveStreamsIntent(),
        //     phrases: [
        //         "Who's watching in \(.applicationName)",
        //         "Active streams in \(.applicationName)"
        //     ],
        //     shortTitle: "Active Streams",
        //     systemImageName: "play.tv"
        // )

        // ── Phase 4 additions (uncomment when implemented) ─────────────

        // AppShortcut(
        //     intent: GetPendingRequestsIntent(),
        //     phrases: [
        //         "Pending requests in \(.applicationName)",
        //         "What's been requested in \(.applicationName)"
        //     ],
        //     shortTitle: "Pending Requests",
        //     systemImageName: "tray.and.arrow.down"
        // )
    }
}
