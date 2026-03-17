import AppIntents

// MARK: - CTRLrFocusFilter
//
// Integrates CTRLr with iOS Focus modes. Users configure which dashboard
// sections are visible for each Focus (Work, Personal, Sleep, etc.).
//
// The active filter is read by DashboardView via @AppStorage.
// Example: during Work focus, suppress Overseerr requests and active streams.

struct CTRLyesrFocusFilter: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "CTRLr"
    static var description: LocalizedStringResource =
        "Control which CTRLr sections are visible during this Focus."

    // MARK: - Filter parameters

    @Parameter(title: "Show Downloads", default: true)
    var showDownloads: Bool

    @Parameter(title: "Show Upcoming Releases", default: true)
    var showUpcoming: Bool

    @Parameter(title: "Show Active Streams", default: true)
    var showStreams: Bool

    @Parameter(title: "Show Requests", default: true)
    var showRequests: Bool

    // MARK: - Display (shown in Focus settings summary)

    var displayRepresentation: DisplayRepresentation {
        let sections = [
            showDownloads ? "Downloads" : nil,
            showUpcoming  ? "Upcoming"  : nil,
            showStreams    ? "Streams"   : nil,
            showRequests   ? "Requests"  : nil,
        ].compactMap { $0 }

        let subtitle = sections.isEmpty
            ? "All sections hidden"
            : sections.joined(separator: ", ")

        return DisplayRepresentation(
            title: "CTRLr",
            subtitle: LocalizedStringResource(stringLiteral: subtitle)
        )
    }

    // MARK: - Apply

    func perform() async throws -> some IntentResult {
        // Write to UserDefaults so DashboardView can read via @AppStorage
        UserDefaults.standard.set(showDownloads, forKey: FocusKey.showDownloads)
        UserDefaults.standard.set(showUpcoming,  forKey: FocusKey.showUpcoming)
        UserDefaults.standard.set(showStreams,    forKey: FocusKey.showStreams)
        UserDefaults.standard.set(showRequests,  forKey: FocusKey.showRequests)
        return .result()
    }
}

// MARK: - FocusKey
//
// UserDefaults keys read by DashboardView.
// Add @AppStorage(FocusKey.showDownloads) var showDownloads = true
// to DashboardView to react to Focus changes automatically.

enum FocusKey {
    static let showDownloads = "focus.showDownloads"
    static let showUpcoming  = "focus.showUpcoming"
    static let showStreams   = "focus.showStreams"
    static let showRequests  = "focus.showRequests"
}
