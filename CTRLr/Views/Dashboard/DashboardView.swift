import SwiftUI

// MARK: - DashboardView

struct DashboardView: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @State private var showSettings = false

    // Stage Manager / size class adaptation
    @Environment(\.horizontalSizeClass) private var hSizeClass
    @Environment(\.verticalSizeClass)   private var vSizeClass

    // Focus Filter — sections toggled per Focus mode via FocusFilterIntent
    @AppStorage(FocusKey.showDownloads) private var showDownloads = true
    @AppStorage(FocusKey.showUpcoming)  private var showUpcoming  = true
    @AppStorage(FocusKey.showStreams)   private var showStreams    = true
    @AppStorage(FocusKey.showRequests)  private var showRequests   = true

    // Appearance
    @AppStorage("appearanceMode") private var appearanceMode: AppearanceMode = .dark

    // Section order — persisted, updated by SectionArrangerView
    @AppStorage(SectionOrderKey.appStorage) private var orderRaw = SectionOrderKey.defaultValue

    private var sectionOrder: [DashboardSection] { orderRaw.asSectionOrder }

    // Handoff activity type — must be listed in Info.plist NSUserActivityTypes
    private let dashboardActivityType = "com.attakrit.CTRLr.dashboard"

    var body: some View {
        ZStack(alignment: .top) {
            // Keyboard shortcuts — hidden, zero-size, in main hierarchy so shortcuts register
            keyboardShortcutButtons

            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: hSizeClass == .regular ? 36 : 28) {
                    ForEach(sectionOrder) { section in
                        sectionView(for: section)
                    }

                    Spacer().frame(height: 40)
                }
                .padding(.top, 24)
            }
            .refreshable { dashVM.refreshAll() }

            // Status bar backing — zero-height view whose background extends
            // upward into the safe area, painting #0A0A0F behind the status bar.
            Color.appBackground
                .frame(maxWidth: .infinity)
                .frame(height: 0)
                .background(Color.appBackground, ignoresSafeAreaEdges: .top)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .overlay {
            if !dashVM.tautulli.streams.isEmpty {
                NowPlayingShelf(streams: dashVM.tautulli.streams)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            Button { showSettings = true } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.primary.opacity(0.7))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .contentShape(Circle())
            .glassEffect(.regular.interactive(), in: Circle())
            // 56pt from trailing clears the Stage Manager resize handle on iPad; 16pt on iPhone
            .padding(.trailing, hSizeClass == .regular ? 56 : 16)
            .padding(.bottom, 20)
        }
        .fullScreenCover(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(dashVM)
        }
        .preferredColorScheme(appearanceMode == .dark ? .dark : appearanceMode == .light ? .light : nil)
    }

    // MARK: - Section dispatch

    @ViewBuilder
    private func sectionView(for section: DashboardSection) -> some View {
        switch section {
        case .downloads:     if showDownloads { DownloadQueueSection() }
        case .recentlyAdded: if showStreams   { HeroSection() }
        case .upcoming:      if showUpcoming  { UpcomingSection() }
        case .requests:      if showRequests  { RequestsSection() }
        case .discover:      DiscoverSectionView()
        case .nowPlaying:    NowPlayingSection()
        }
    }

    // MARK: - Keyboard shortcuts
    //
    // Hidden buttons so the system registers shortcuts even without a visible control.
    // Works with Magic Keyboard attached to iPad, and in Stage Manager windows.

    private var keyboardShortcutButtons: some View {
        Group {
            Button("Refresh") { dashVM.refreshAll() }
                .keyboardShortcut("r", modifiers: .command)

            Button("Settings") { showSettings = true }
                .keyboardShortcut(",", modifiers: .command)


            Button("Pause All") {
                // TODO: Phase 1 — dashVM.qbt.pauseAll()
            }
            .keyboardShortcut("p", modifiers: .command)

            Button("Resume All") {
                // TODO: Phase 1 — dashVM.qbt.resumeAll()
            }
            .keyboardShortcut("r", modifiers: [.command, .shift])

            // TODO: Phase 2 — ⌘U Upcoming, Phase 3 — ⌘S Streams, Phase 4 — ⌘O Requests
        }
        .frame(width: 0, height: 0)
        .opacity(0)
    }

}
