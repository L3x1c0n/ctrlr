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
                    Spacer(minLength: 40)
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(hex: "#0A0A0F").ignoresSafeArea())
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
        default:                                     return .white.opacity(0.4)
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
                .foregroundStyle(.white)

            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Push Notifications")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white)
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
                            .foregroundStyle(.white.opacity(0.85))
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
                    .foregroundStyle(.white)
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
                        settingsField("ntfy Topic", placeholder: "my-radarr-topic",
                                      text: $config.username)
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
                                .foregroundStyle(.white.opacity(0.8))
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
                .foregroundStyle(.white.opacity(0.4))
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
            .foregroundStyle(.white)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
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
