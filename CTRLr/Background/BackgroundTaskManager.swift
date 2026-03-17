import BackgroundTasks
import Foundation
import WidgetKit

// MARK: - BackgroundTaskManager
//
// Registers and handles BGTaskScheduler tasks for keeping CTRLr data fresh
// when the app is backgrounded. Each phase has its own task identifier.
//
// REQUIRED: Add all task IDs to Info.plist under BGTaskSchedulerPermittedIdentifiers.
// REQUIRED: Call registerTasks() in CTRLrApp before the app finishes launching.

final class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()
    private init() {}

    // MARK: - Task identifiers
    // Must match Info.plist BGTaskSchedulerPermittedIdentifiers array exactly.

    enum TaskID {
        static let appRefresh   = "com.attakrit.CTRLr.refresh"      // Phase 1 — qBittorrent
        static let mediaCheck   = "com.attakrit.CTRLr.mediaCheck"    // Phase 2 — Radarr/Sonarr
        static let streamCheck  = "com.attakrit.CTRLr.streamCheck"   // Phase 3 — Plex/Tautulli
        static let requestCheck = "com.attakrit.CTRLr.requestCheck"  // Phase 4 — Overseerr
    }

    // MARK: - Registration (call once at app launch)

    func registerTasks() {
        // Phase 1 — active
        BGTaskScheduler.shared.register(forTaskWithIdentifier: TaskID.appRefresh, using: nil) { task in
            self.handleAppRefresh(task: task as! BGAppRefreshTask)
        }

        // Phase 2 — uncomment when RadarrClient/SonarrClient exist
        // BGTaskScheduler.shared.register(forTaskWithIdentifier: TaskID.mediaCheck, using: nil) { task in
        //     self.handleMediaCheck(task: task as! BGProcessingTask)
        // }

        // Phase 3 — uncomment when PlexClient/TautulliClient exist
        // BGTaskScheduler.shared.register(forTaskWithIdentifier: TaskID.streamCheck, using: nil) { task in
        //     self.handleStreamCheck(task: task as! BGProcessingTask)
        // }

        // Phase 4 — uncomment when OverseerrClient exists
        // BGTaskScheduler.shared.register(forTaskWithIdentifier: TaskID.requestCheck, using: nil) { task in
        //     self.handleRequestCheck(task: task as! BGProcessingTask)
        // }
    }

    // MARK: - Schedule next refresh

    func scheduleAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: TaskID.appRefresh)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes
        try? BGTaskScheduler.shared.submit(request)
    }

    // Phase 2 — uncomment and fill when media clients exist
    // func scheduleMediaCheck() {
    //     let request = BGProcessingTaskRequest(identifier: TaskID.mediaCheck)
    //     request.requiresNetworkConnectivity = true
    //     request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
    //     try? BGTaskScheduler.shared.submit(request)
    // }

    // MARK: - Handlers

    private func handleAppRefresh(task: BGAppRefreshTask) {
        scheduleAppRefresh() // Always reschedule immediately

        let fetchTask = Task {
            do {
                let client = QBIntentClient()
                async let torrentsTask = client.fetchTorrents()
                async let statsTask    = client.transferStats()
                let (torrents, stats)  = try await (torrentsTask, statsTask)

                // Refresh widget timeline with latest snapshot
                // NOTE: WidgetSharedModels.swift must also be added to the CTRLr main target
                //       (currently only compiled into CTRLrWidgets). Move it to Shared/ if needed.
                let activeItems = torrents.map {
                    WidgetQueueItem(id: $0.id, title: $0.name, progress: $0.progress,
                                   eta: $0.etaSeconds, status: $0.stateLabel, source: "qbittorrent")
                }
                let snapshot = WidgetSnapshot(
                    recentItems:   [],
                    queueItems:    activeItems,
                    upcomingItems: [],
                    globalDL:      stats.dlSpeed,
                    globalUL:      stats.ulSpeed,
                    updatedAt:     .now
                )
                if let data = try? JSONEncoder().encode(snapshot) {
                    UserDefaults.shared.set(data, forKey: SharedDefaultsKey.widgetSnapshot)
                }
                WidgetCenter.shared.reloadAllTimelines()

                // TODO: Phase 1 — fire completion notification if any torrent finished
                // NotificationManager.shared.scheduleDownloadComplete(torrentName: name)

                task.setTaskCompleted(success: true)
            } catch {
                task.setTaskCompleted(success: false)
            }
        }

        task.expirationHandler = { fetchTask.cancel() }
    }

    // TODO: Phase 2
    // private func handleMediaCheck(task: BGProcessingTask) {
    //     // Poll RadarrClient + SonarrClient, update widget upcoming section,
    //     // fire NotificationManager.shared.scheduleImportReady(title:) if new import detected.
    //     task.setTaskCompleted(success: true)
    // }

    // TODO: Phase 3
    // private func handleStreamCheck(task: BGProcessingTask) {
    //     // Poll TautulliClient, fire NotificationManager.shared.scheduleStreamStarted(user:title:)
    //     task.setTaskCompleted(success: true)
    // }

    // TODO: Phase 4
    // private func handleRequestCheck(task: BGProcessingTask) {
    //     // Poll OverseerrClient, fire NotificationManager.shared.scheduleNewRequest(title:requester:)
    //     task.setTaskCompleted(success: true)
    // }
}
