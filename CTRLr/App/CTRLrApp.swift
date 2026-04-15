import SwiftUI
import UserNotifications
import UIKit

// MARK: - Info.plist requirements
//
// Add the following keys before shipping:
//   BGTaskSchedulerPermittedIdentifiers (Array):
//     - com.attakrit.CTRLr.refresh       (Phase 1, active)
//     - com.attakrit.CTRLr.mediaCheck    (Phase 2, add when ready)
//     - com.attakrit.CTRLr.streamCheck   (Phase 3, add when ready)
//     - com.attakrit.CTRLr.requestCheck  (Phase 4, add when ready)
//   NSUserNotificationsUsageDescription: "CTRLr notifies you when downloads complete..."
//   NSUserActivityTypes (Array):
//     - com.attakrit.CTRLr.dashboard

@main
struct CTRLrAppthein : App {
    @StateObject private var dashVM = DashboardViewModel()
    init() {
        // Pre-warm CredentialStore so all Keychain reads happen here,
        // synchronously on the main thread, before any Swift Concurrency
        // task is spawned. Subsequent load() calls return from memory cache.
        _ = CredentialStore.shared

        // Pre-warm the app-group UserDefaults so its first CFPrefs IPC call
        // happens here on the main thread, not inside a Swift Concurrency Task.
        // Prevents "unsafeForcedSync called from Swift Concurrent context" and
        // the matching cfprefsd detach warning from BackgroundTaskManager.
        _ = UserDefaults.shared

        // Register background refresh tasks before any scene is created
        BackgroundTaskManager.shared.registerTasks()

        // Set notification delegate so foreground notifications display correctly
        UNUserNotificationCenter.current().delegate = NotificationManager.shared

        // Give the navigation bar an opaque background matching the app colour.
        // This is set at the UIKit level so the status bar area is always covered
        // regardless of SwiftUI's toolbar visibility state.
        let navBG = UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 10/255, green: 10/255, blue: 15/255, alpha: 1)
                : .systemBackground
        }
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = navBG
        appearance.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance          = appearance
        UINavigationBar.appearance().compactAppearance           = appearance
        UINavigationBar.appearance().scrollEdgeAppearance        = appearance
        UINavigationBar.appearance().compactScrollEdgeAppearance = appearance
    }

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environmentObject(dashVM)
                .onAppear {
                    BackgroundTaskManager.shared.scheduleAppRefresh()
                }
                .onScenePhase(.background) {
                    BackgroundTaskManager.shared.scheduleAppRefresh()
                }
        }
        // Future: add a .commands block here for menu bar keyboard shortcut documentation.
    }
}

// MARK: - Scene phase helper

private extension View {
    func onScenePhase(_ phase: ScenePhase, perform action: @escaping () -> Void) -> some View {
        self.modifier(ScenePhaseModifier(targetPhase: phase, action: action))
    }
}

private struct ScenePhaseModifier: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    let targetPhase: ScenePhase
    let action: () -> Void

    func body(content: Content) -> some View {
        content.onChange(of: scenePhase) { _, newPhase in
            if newPhase == targetPhase { action() }
        }
    }
}
