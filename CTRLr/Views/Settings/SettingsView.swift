import SwiftUI
import UserNotifications

// MARK: - SettingsView

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var dashVM: DashboardViewModel

    @State private var configs: [Service: ServiceConfig] = [:]
    @State private var testResults: [Service: ConnectionResult] = [:]
    @State private var testing: Set<Service> = []


    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined
    @State private var requestingNotifications = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // ── Notifications ─────────────────────────────────────────
                    NotificationsSection(
                        status:     notificationStatus,
                        requesting: requestingNotifications,
                        onRequest:  { await requestNotifications() }
                    )

                    // qBittorrent first — it's Phase 1 and the only active service
                    ForEach(orderedServices, id: \.self) { service in
                        ServiceSettingsSection(
                            service:    service,
                            config:     binding(for: service),
                            testResult: testResults[service],
                            isTesting:  testing.contains(service),
                            canTest:    [.qbittorrent, .radarr, .sonarr, .plex, .overseerr, .tautulli].contains(service),
                            onTest:     { await test(service) }
                        )
                    }

                    TraktSettingsSection()
                        .environmentObject(dashVM)

                    TMDBSettingsSection(config: binding(for: .tmdb))

                    SectionArrangerSection()

                    ClearCacheSection { dashVM.clearAllCaches() }

                    Spacer(minLength: 40)
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        saveAll()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .onAppear {
            loadAll()
            Task { await refreshNotificationStatus() }
        }
    }

    // MARK: - Helpers

    // qBittorrent shown first; others follow when their phases ship
    private let orderedServices: [Service] = [
        .qbittorrent, .radarr, .sonarr, .plex, .tautulli, .overseerr
    ]

    private func binding(for service: Service) -> Binding<ServiceConfig> {
        Binding(
            get: { configs[service] ?? ServiceConfig() },
            set: { configs[service] = $0 }
        )
    }

    private func refreshNotificationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notificationStatus = settings.authorizationStatus
    }

    private func requestNotifications() async {
        requestingNotifications = true
        if notificationStatus == .denied {
            // Already denied — send user to system Settings
            if let url = URL(string: UIApplication.openSettingsURLString) {
                await UIApplication.shared.open(url)
            }
        } else {
            _ = try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        }
        await refreshNotificationStatus()
        requestingNotifications = false
    }

    private func loadAll() {
        for service in Service.allCases {
            configs[service] = CredentialStore.shared.load(service)
        }
    }

    private func saveAll() {
        for (service, config) in configs {
            CredentialStore.shared.save(config, for: service)
        }
        dashVM.startAll()
    }

    private func test(_ service: Service) async {
        testing.insert(service)
        testResults.removeValue(forKey: service)
        let cfg = configs[service] ?? ServiceConfig()
        let result: ConnectionResult
        switch service {
        case .radarr:      result = await dashVM.radarr.testConnection(with: cfg)
        case .sonarr:      result = await dashVM.sonarr.testConnection(with: cfg)
        case .plex:        result = await dashVM.plex.testConnection(with: cfg)
        case .overseerr:   result = await dashVM.overseerr.testConnection(with: cfg)
        case .tautulli:    result = await dashVM.tautulli.testConnection(with: cfg)
        default:           result = await dashVM.qbt.testConnection(with: cfg)
        }
        testResults[service] = result
        testing.remove(service)
    }
}

// MARK: - NotificationsSection

private struct NotificationsSection: View {
    let status:     UNAuthorizationStatus
    let requesting: Bool
    let onRequest:  () async -> Void

    private var statusLabel: String {
        switch status {
        case .authorized:          return "Enabled"
        case .denied:              return "Denied — tap to open Settings"
        case .provisional:         return "Provisional"
        case .ephemeral:           return "Ephemeral"
        case .notDetermined:       return "Not requested"
        @unknown default:          return "Unknown"
        }
    }

    private var statusColor: Color {
        switch status {
        case .authorized, .provisional, .ephemeral: return Color(hex: "#00E5A0")
        case .denied:                                return Color(hex: "#FF4757")
        default:                                     return .primary.opacity(0.4)
        }
    }

    private var buttonLabel: String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "Notifications Enabled"
        case .denied:                                return "Open Settings"
        default:                                     return "Enable Notifications"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Notifications")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.primary)

            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Push Notifications")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.primary)
                    Text(statusLabel)
                        .font(.system(size: 12))
                        .foregroundStyle(statusColor)
                }
                Spacer()
                Button {
                    Task { await onRequest() }
                } label: {
                    HStack(spacing: 6) {
                        if requesting {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        } else {
                            Image(systemName: status == .authorized ? "checkmark.circle.fill" : "bell.badge")
                                .foregroundStyle(statusColor)
                        }
                        Text(requesting ? "Requesting…" : buttonLabel)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.primary.opacity(0.85))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 10))
                .disabled(requesting || status == .authorized)
            }
        }
        .padding(18)
        .glassCard(cornerRadius: 20)
    }
}

// MARK: - ClearCacheSection

private struct ClearCacheSection: View {
    let onClear: () -> Void
    @State private var showConfirm  = false
    @State private var cleared      = false
    @State private var cacheSizeStr = "calculating…"

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Data")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.primary)

            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Clear All Caches")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.primary)
                    Text(cacheSizeStr)
                        .font(.system(size: 12))
                        .foregroundStyle(.primary.opacity(0.4))
                }
                Spacer()
                Button {
                    guard !cleared else { return }
                    showConfirm = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: cleared ? "checkmark.circle.fill" : "trash")
                            .foregroundStyle(cleared ? Color(hex: "#00E5A0") : Color(hex: "#FF4757"))
                        Text(cleared ? "Cleared" : "Clear")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.primary.opacity(0.85))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 10))
                .confirmationDialog("Clear all caches?",
                                    isPresented: $showConfirm,
                                    titleVisibility: .visible) {
                    Button("Clear All Caches", role: .destructive) {
                        onClear()
                        cleared = true
                        cacheSizeStr = "0 bytes"
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Plex recently added, Tautulli stats, Overseerr requests, and all artwork will be purged and re-fetched.")
                }
            }
        }
        .padding(18)
        .glassCard(cornerRadius: 20)
        .task { cacheSizeStr = await computeCacheSizeLabel() }
    }

    private func computeCacheSizeLabel() async -> String {
        // UserDefaults entries (synchronous, small)
        let udKeys = [
            "PlexRecentlyAddedCache",
            "cache_tautulli_libraryCounts", "cache_tautulli_driveStats", "cache_tautulli_dailyPlays",
            "cache_overseerr_requests", "cache_overseerr_media_details",
        ]
        let udBytes = udKeys.reduce(0) { $0 + Int64(UserDefaults.standard.data(forKey: $1)?.count ?? 0) }

        // Artwork disk cache (nonisolated — no actor hop needed)
        let diskBytes = ArtworkCache.shared.diskCacheBytes()

        let total = udBytes + diskBytes
        let sizeStr: String
        let d = Double(total)
        if d >= 1_073_741_824 { sizeStr = String(format: "%.1f GB", d / 1_073_741_824) }
        else if d >= 1_048_576 { sizeStr = String(format: "%.1f MB", d / 1_048_576) }
        else if d >= 1_024     { sizeStr = String(format: "%.0f KB", d / 1_024) }
        else                   { sizeStr = "\(total) bytes" }
        return "\(sizeStr) cached — Plex, Tautulli, Overseerr, artwork"
    }
}

// MARK: - SectionArrangerSection

private struct SectionArrangerSection: View {
    @AppStorage("appearanceMode") private var appearanceMode: AppearanceMode = .dark

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label {
                Text("Appearance & Layout")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.primary.opacity(0.5))
            } icon: {
                Image(systemName: "paintbrush.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.primary.opacity(0.5))
            }

            // Colour scheme picker
            VStack(alignment: .leading, spacing: 8) {
                Text("Theme")
                    .font(.system(size: 13))
                    .foregroundStyle(.primary.opacity(0.55))

                Picker("Theme", selection: $appearanceMode) {
                    Text("Dark").tag(AppearanceMode.dark)
                    Text("Light").tag(AppearanceMode.light)
                    Text("Auto").tag(AppearanceMode.auto)
                }
                .pickerStyle(.segmented)
            }
            .padding(14)
            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))

            NavigationLink(destination: SectionArrangerView()) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Arrange & Colour Sections")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.primary)
                        Text("Reorder sections and set light mode colours")
                            .font(.system(size: 12))
                            .foregroundStyle(.primary.opacity(0.4))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.primary.opacity(0.3))
                }
                .padding(14)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - ServiceSettingsSection

struct ServiceSettingsSection: View {
    let service:    Service
    @Binding var config: ServiceConfig
    let testResult: ConnectionResult?
    let isTesting:  Bool
    let canTest:    Bool
    let onTest:     () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {

            // Header
            HStack {
                Circle()
                    .fill(ServiceSource(rawValue: service.rawValue)?.color ?? .white)
                    .frame(width: 10, height: 10)
                Text(service.displayName)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer()
                Toggle("", isOn: $config.enabled)
                    .labelsHidden()
                    .tint(ServiceSource(rawValue: service.rawValue)?.color ?? .white)
            }

            if config.enabled {
                VStack(spacing: 10) {
                    settingsField("Base URL", placeholder: "http://192.168.1.x:port",
                                  text: $config.baseURL)

                    if service == .qbittorrent {
                        settingsField("Username", placeholder: "admin",
                                      text: $config.username)
                        settingsField("Password", placeholder: "••••••••",
                                      text: $config.apiKey, secure: true)
                    } else if service == .plex {
                        settingsField("Token", placeholder: "••••••••••••••••",
                                      text: $config.apiKey, secure: true)
                    } else if service == .radarr || service == .sonarr {
                        settingsField("API Key", placeholder: "••••••••••••••••",
                                      text: $config.apiKey, secure: true)
                    } else {
                        settingsField("API Key", placeholder: "••••••••••••••••",
                                      text: $config.apiKey, secure: true)
                    }

                    // Test connection — only shown for implemented services
                    if canTest {
                        HStack(spacing: 12) {
                            Button {
                                Task { await onTest() }
                            } label: {
                                HStack(spacing: 6) {
                                    if isTesting {
                                        ProgressView()
                                            .controlSize(.small)
                                            .tint(.white)
                                    } else {
                                        Image(systemName: "antenna.radiowaves.left.and.right")
                                    }
                                    Text(isTesting ? "Testing…" : "Test Connection")
                                        .font(.system(size: 13, weight: .medium))
                                }
                                .foregroundStyle(.primary.opacity(0.8))
                                .padding(.horizontal, 14).padding(.vertical, 8)
                            }
                            .buttonStyle(.plain)
                            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 10))
                            .disabled(isTesting)

                            if let result = testResult {
                                resultLabel(result)
                            }
                        }
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(18)
        .glassCard(cornerRadius: 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: config.enabled)
    }

    @ViewBuilder
    private func settingsField(_ label: String, placeholder: String,
                                text: Binding<String>, secure: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.primary.opacity(0.4))
            Group {
                if secure {
                    SecureField(placeholder, text: text)
                } else {
                    TextField(placeholder, text: text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
            }
            .font(.system(size: 14))
            .foregroundStyle(.primary)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    @ViewBuilder
    private func resultLabel(_ result: ConnectionResult) -> some View {
        switch result {
        case .success(let msg):
            Label(msg, systemImage: "checkmark.circle.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: "#00E5A0"))
                .lineLimit(1)
        case .failure(let msg):
            Label(msg, systemImage: "xmark.circle.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: "#FF4757"))
                .lineLimit(1)
        }
    }
}

// MARK: - TraktSettingsSection

private struct TraktSettingsSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @State private var isConnecting  = false
    @State private var connectError: String?
    @State private var isSyncing     = false
    @State private var syncResult:   String?

    private let traktPurple = Color(hex: "#ED1C24")   // Trakt brand red

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {

            // Header
            HStack {
                Circle()
                    .fill(traktPurple)
                    .frame(width: 10, height: 10)
                Text("Trakt")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer()
                if dashVM.trakt.isConnected {
                    Label("Connected", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color(hex: "#00E5A0"))
                }
            }

            Text("Track shows & movies across Netflix, Apple TV+, Prime, and more. Trakt syncs your watchlist and provides episode calendars.")
                .font(.system(size: 12))
                .foregroundStyle(.primary.opacity(0.45))
                .fixedSize(horizontal: false, vertical: true)

            if dashVM.trakt.isConnected {
                HStack(spacing: 10) {
                    // Sync Sonarr → Trakt
                    Button {
                        Task { await syncSonarrToTrakt() }
                    } label: {
                        HStack(spacing: 6) {
                            if isSyncing {
                                ProgressView().controlSize(.small).tint(.white)
                            } else {
                                Image(systemName: "arrow.triangle.2.circlepath")
                            }
                            Text(isSyncing ? "Syncing…" : "Sync Sonarr → Trakt")
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundStyle(.primary.opacity(0.85))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 10))
                    .disabled(isSyncing || !dashVM.sonarr.isConnected)

                    // Disconnect button
                    Button {
                        dashVM.trakt.disconnect()
                    } label: {
                        Image(systemName: "xmark.circle")
                            .foregroundStyle(Color(hex: "#FF4757"))
                            .padding(8)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 10))
                }

                if let result = syncResult {
                    Text(result)
                        .font(.system(size: 12))
                        .foregroundStyle(.primary.opacity(0.5))
                }
            } else {
                // Connect button
                HStack(spacing: 12) {
                    Button {
                        Task { await connectTrakt() }
                    } label: {
                        HStack(spacing: 6) {
                            if isConnecting {
                                ProgressView()
                                    .controlSize(.small)
                                    .tint(.white)
                            } else {
                                Image(systemName: "link")
                            }
                            Text(isConnecting ? "Connecting…" : "Connect with Trakt")
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundStyle(.primary.opacity(0.85))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 10))
                    .disabled(isConnecting)

                    if let err = connectError {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: "#FF4757"))
                            .lineLimit(2)
                    }
                }
            }
        }
        .padding(18)
        .glassCard(cornerRadius: 20)
    }

    private func syncSonarrToTrakt() async {
        isSyncing  = true
        syncResult = nil
        let tvdbIds = await dashVM.sonarr.fetchAllTvdbIds()
        guard !tvdbIds.isEmpty else {
            syncResult = "No series found in Sonarr."
            isSyncing  = false
            return
        }
        do {
            let added = try await dashVM.trakt.syncShowsToWatchlist(tvdbIds: tvdbIds)
            syncResult = "Added \(added) of \(tvdbIds.count) shows to Trakt watchlist."
        } catch {
            syncResult = "Sync failed: \(error.localizedDescription)"
        }
        isSyncing = false
    }

    private func connectTrakt() async {
        isConnecting  = true
        connectError  = nil
        do {
            try await dashVM.trakt.connect()
        } catch {
            // ASWebAuthenticationSession cancellation is not an error worth surfacing
            let msg = error.localizedDescription
            if !msg.lowercased().contains("cancel") {
                connectError = msg
            }
        }
        isConnecting = false
    }
}

// MARK: - TMDBSettingsSection

private struct TMDBSettingsSection: View {
    @Binding var config: ServiceConfig

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Circle()
                    .fill(Color(hex: "#01D277"))
                    .frame(width: 10, height: 10)
                Text("TMDB")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer()
                Toggle("", isOn: $config.enabled)
                    .labelsHidden()
                    .tint(Color(hex: "#01D277"))
            }

            Text("The Movie Database API key for streaming availability (where to watch). Free at themoviedb.org.")
                .font(.system(size: 12))
                .foregroundStyle(.primary.opacity(0.45))
                .fixedSize(horizontal: false, vertical: true)

            if config.enabled {
                VStack(alignment: .leading, spacing: 4) {
                    Text("API Key (v3)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.primary.opacity(0.4))
                    SecureField("32-character hex key", text: $config.apiKey)
                        .font(.system(size: 14))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Color.primary.opacity(0.06),
                                    in: RoundedRectangle(cornerRadius: 10))
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(18)
        .glassCard(cornerRadius: 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: config.enabled)
    }
}
