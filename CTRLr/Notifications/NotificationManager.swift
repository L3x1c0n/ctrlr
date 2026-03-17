import UserNotifications
import Foundation

// MARK: - NotificationManager
//
// Manages local notification permissions, categories, and scheduling.
// Each phase introduces new notification categories as services come online.
//
// REQUIRED: Add NSUserNotificationsUsageDescription to Info.plist.
// Call requestAuthorization() early in app lifecycle (CTRLrApp.onAppear).

@MainActor
final class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()
    private override init() { super.init() }

    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined

    // MARK: - Category identifiers

    enum Category {
        static let downloadComplete = "DOWNLOAD_COMPLETE"   // Phase 1
        static let importReady      = "IMPORT_READY"        // Phase 2
        static let streamStarted    = "STREAM_STARTED"      // Phase 3
        static let newRequest       = "NEW_REQUEST"         // Phase 4
    }

    // MARK: - Action identifiers

    enum Action {
        static let approve = "APPROVE_REQUEST"   // Phase 4
        static let decline = "DECLINE_REQUEST"   // Phase 4
        static let view    = "VIEW_ITEM"
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            if granted { registerCategories() }
            await refreshStatus()
        } catch {
            await refreshStatus()
        }
    }

    func refreshStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    // MARK: - Category registration
    //
    // Registers all notification categories and their interactive actions.
    // Uncomment each phase's category as the relevant service client is added.

    private func registerCategories() {
        // ── Phase 1: Download complete (info only, no actions) ────────────
        let downloadComplete = UNNotificationCategory(
            identifier: Category.downloadComplete,
            actions: [],
            intentIdentifiers: [],
            options: []
        )

        // ── Phase 2: Import ready — view action ───────────────────────────
        // let viewAction = UNNotificationAction(
        //     identifier: Action.view,
        //     title: "View",
        //     options: [.foreground]
        // )
        // let importReady = UNNotificationCategory(
        //     identifier: Category.importReady,
        //     actions: [viewAction],
        //     intentIdentifiers: [],
        //     options: []
        // )

        // ── Phase 3: Stream started (info only) ───────────────────────────
        // let streamStarted = UNNotificationCategory(
        //     identifier: Category.streamStarted,
        //     actions: [],
        //     intentIdentifiers: [],
        //     options: []
        // )

        // ── Phase 4: New request — approve/decline actions ────────────────
        // let approveAction = UNNotificationAction(
        //     identifier: Action.approve,
        //     title: "Approve",
        //     options: [.authenticationRequired]
        // )
        // let declineAction = UNNotificationAction(
        //     identifier: Action.decline,
        //     title: "Decline",
        //     options: [.destructive, .authenticationRequired]
        // )
        // let newRequest = UNNotificationCategory(
        //     identifier: Category.newRequest,
        //     actions: [approveAction, declineAction],
        //     intentIdentifiers: [],
        //     options: []
        // )

        UNUserNotificationCenter.current().setNotificationCategories([
            downloadComplete,
            // importReady,    // Phase 2
            // streamStarted,  // Phase 3
            // newRequest,     // Phase 4
        ])
    }

    // MARK: - Schedule helpers

    /// Phase 1 — call when a torrent transitions to seeding (completion detected).
    func scheduleDownloadComplete(torrentName: String) {
        let content = UNMutableNotificationContent()
        content.title = "Download Complete"
        content.body  = torrentName
        content.sound = .default
        content.categoryIdentifier = Category.downloadComplete

        let request = UNNotificationRequest(
            identifier: "dl-complete-\(torrentName.hashValue)",
            content: content,
            trigger: nil // deliver immediately
        )
        UNUserNotificationCenter.current().add(request)
    }

    // TODO: Phase 2
    // func scheduleImportReady(title: String, source: String) {
    //     let content = UNMutableNotificationContent()
    //     content.title = "\(source) Import Ready"
    //     content.body  = title
    //     content.sound = .default
    //     content.categoryIdentifier = Category.importReady
    //     let request = UNNotificationRequest(
    //         identifier: "import-\(title.hashValue)",
    //         content: content, trigger: nil
    //     )
    //     UNUserNotificationCenter.current().add(request)
    // }

    // TODO: Phase 3
    // func scheduleStreamStarted(user: String, title: String) {
    //     let content = UNMutableNotificationContent()
    //     content.title = "\(user) started watching"
    //     content.body  = title
    //     content.sound = .default
    //     content.categoryIdentifier = Category.streamStarted
    //     let request = UNNotificationRequest(
    //         identifier: "stream-\(user.hashValue)",
    //         content: content, trigger: nil
    //     )
    //     UNUserNotificationCenter.current().add(request)
    // }

    // TODO: Phase 4
    // func scheduleNewRequest(title: String, requester: String, requestID: Int) {
    //     let content = UNMutableNotificationContent()
    //     content.title = "New Request"
    //     content.body  = "\(requester) requested \(title)"
    //     content.sound = .default
    //     content.categoryIdentifier = Category.newRequest
    //     content.userInfo = ["requestID": requestID]
    //     let request = UNNotificationRequest(
    //         identifier: "request-\(requestID)",
    //         content: content, trigger: nil
    //     )
    //     UNUserNotificationCenter.current().add(request)
    // }
}

// MARK: - UNUserNotificationCenterDelegate
//
// Handles taps on notification actions (approve/decline).
// Register as delegate in CTRLrApp: UNUserNotificationCenter.current().delegate = NotificationManager.shared

extension NotificationManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notifications even when app is foregrounded
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        switch response.actionIdentifier {
        case Action.approve:
            // TODO: Phase 4 — extract requestID from userInfo, call OverseerrClient.approve(id:)
            break
        case Action.decline:
            // TODO: Phase 4 — extract requestID from userInfo, call OverseerrClient.decline(id:)
            break
        default:
            break
        }
        completionHandler()
    }
}
