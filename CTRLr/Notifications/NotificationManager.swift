import UserNotifications
import Foundation

// MARK: - NotificationManager

@MainActor
final class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()
    private override init() { super.init() }

    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined

    // MARK: - Category identifiers

    enum Category {
        static let downloadComplete = "DOWNLOAD_COMPLETE"
        static let plexItemAdded    = "PLEX_ITEM_ADDED"
        static let streamStarted    = "STREAM_STARTED"
        static let newRequest       = "NEW_REQUEST"
        static let requestAvailable = "REQUEST_AVAILABLE"
    }

    enum Action {
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

    private func registerCategories() {
        let downloadComplete = UNNotificationCategory(
            identifier: Category.downloadComplete,
            actions: [], intentIdentifiers: [], options: []
        )
        let plexItemAdded = UNNotificationCategory(
            identifier: Category.plexItemAdded,
            actions: [], intentIdentifiers: [], options: []
        )
        let streamStarted = UNNotificationCategory(
            identifier: Category.streamStarted,
            actions: [], intentIdentifiers: [], options: []
        )
        let newRequest = UNNotificationCategory(
            identifier: Category.newRequest,
            actions: [], intentIdentifiers: [], options: []
        )
        let requestAvailable = UNNotificationCategory(
            identifier: Category.requestAvailable,
            actions: [], intentIdentifiers: [], options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([
            downloadComplete, plexItemAdded, streamStarted, newRequest, requestAvailable
        ])
    }

    // MARK: - Schedule helpers

    func scheduleDownloadComplete(torrentName: String) {
        let content = UNMutableNotificationContent()
        content.title = "Download Complete"
        content.body  = torrentName
        content.sound = .default
        content.categoryIdentifier = Category.downloadComplete
        schedule(content, id: "dl-\(torrentName.hashValue)")
    }

    func schedulePlexItemAdded(title: String, mediaType: String) {
        let content = UNMutableNotificationContent()
        content.title = "\(mediaType) Added to Plex"
        content.body  = title
        content.sound = .default
        content.categoryIdentifier = Category.plexItemAdded
        schedule(content, id: "plex-\(title.hashValue)")
    }

    func scheduleStreamStarted(userName: String, title: String) {
        let content = UNMutableNotificationContent()
        content.title = "Now Playing"
        content.body  = "\(userName) is watching \(title)"
        content.sound = .default
        content.categoryIdentifier = Category.streamStarted
        schedule(content, id: "stream-\(userName.hashValue)-\(title.hashValue)")
    }

    func scheduleNewRequest(title: String, requestID: Int) {
        let content = UNMutableNotificationContent()
        content.title = "New Request"
        content.body  = title
        content.sound = .default
        content.categoryIdentifier = Category.newRequest
        content.userInfo = ["requestID": requestID]
        schedule(content, id: "req-\(requestID)")
    }

    func scheduleRequestAvailable(title: String) {
        let content = UNMutableNotificationContent()
        content.title = "Now Available"
        content.body  = title
        content.sound = .default
        content.categoryIdentifier = Category.requestAvailable
        schedule(content, id: "avail-\(title.hashValue)")
    }

    // MARK: - Private

    private func schedule(_ content: UNMutableNotificationContent, id: String) {
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
