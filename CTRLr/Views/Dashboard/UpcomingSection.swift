import SwiftUI

// MARK: - UpcomingSection
// 14-day horizontal calendar strip. Each day is a fixed-width column.
// Movies (Radarr) in yellow, TV (Sonarr) in blue.
// Release type badges: In Cinemas, Digital, Physical, Streaming, Airing.

struct UpcomingSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @AppStorage("sectionLightTint_upcoming") private var tintHex = "#6366F1"
    @State private var isRefreshing = false

    private let columnWidth: CGFloat = 220
    private let pastDays    = 7
    private let futureDays  = 14

    // All items: arr items take precedence; Trakt-only items fill the gaps
    private var allItems: [UpcomingItem] {
        let arrItems = dashVM.radarr.upcomingMovies + dashVM.sonarr.upcomingEpisodes
        let arrKeys  = Set(arrItems.map { dedupKey($0) })
        let traktOnly = dashVM.traktUpcoming.filter { !arrKeys.contains(dedupKey($0)) }
        return arrItems + traktOnly
    }

    private func dedupKey(_ item: UpcomingItem) -> String {
        let day = Calendar.current.startOfDay(for: item.airDate)
        return "\(item.title.lowercased())|\(Int(day.timeIntervalSince1970))"
    }

    // 7 days back + today + 14 days forward = 22 columns
    private var days: [Date] {
        let cal   = Calendar.current
        let today = cal.startOfDay(for: Date())
        return (-pastDays...futureDays).compactMap { cal.date(byAdding: .day, value: $0, to: today) }
    }

    private var todayDate: Date { Calendar.current.startOfDay(for: Date()) }

    // Items keyed by startOfDay
    private var itemsByDay: [Date: [UpcomingItem]] {
        let cal = Calendar.current
        var dict: [Date: [UpcomingItem]] = [:]
        for item in allItems {
            let key = cal.startOfDay(for: item.airDate)
            dict[key, default: []].append(item)
        }
        return dict
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            SectionHeader(
                iconGradient: [Color(hex: "#0A84FF"), Color(hex: "#6366F1"), Color(hex: "#A855F7")],
                title:        "Upcoming",
                sources:      [dashVM.radarr.isConnected ? ServiceSource.radarr : nil,
                               dashVM.sonarr.isConnected ? ServiceSource.sonarr : nil,
                               dashVM.trakt.isConnected  ? ServiceSource.trakt  : nil].compactMap { $0 }
            ) {
                SectionRefreshButton(isRefreshing: isRefreshing) {
                    isRefreshing = true
                    dashVM.radarr.startPolling()
                    dashVM.sonarr.startPolling()
                    Task {
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        isRefreshing = false
                    }
                }
            }

            if !dashVM.radarr.isConnected && !dashVM.sonarr.isConnected && allItems.isEmpty {
                emptyState
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 8) {
                            ForEach(days, id: \.self) { day in
                                DayColumn(
                                    day: day,
                                    items: itemsByDay[day] ?? [],
                                    width: columnWidth
                                )
                                .id(day)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                    }
                    .onAppear {
                        proxy.scrollTo(todayDate, anchor: .leading)
                    }
                }
            }
        }
        .glassCard(cornerRadius: 20, lightTint: Color(hex: tintHex), lightOnly: true)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        HStack {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "calendar.badge.exclamationmark")
                    .font(.system(size: 28, weight: .thin))
                    .foregroundStyle(.primary.opacity(0.2))
                Text("No upcoming releases")
                    .font(.system(size: 13))
                    .foregroundStyle(.primary.opacity(0.3))
                Text("Configure Radarr and Sonarr in Settings")
                    .font(.system(size: 11))
                    .foregroundStyle(.primary.opacity(0.2))
            }
            .padding(.vertical, 32)
            Spacer()
        }
        .padding(.horizontal, 20)
        .glassCard(cornerRadius: 16)
        .padding(.horizontal, 20)
    }
}

// MARK: - DayColumn

private struct DayColumn: View {
    let day:   Date
    let items: [UpcomingItem]
    let width: CGFloat

    private var isToday: Bool {
        Calendar.current.isDateInToday(day)
    }

    private var dayName: String {
        if isToday { return "Today" }
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return f.string(from: day)
    }

    private var dayNumber: String {
        let f = DateFormatter()
        f.dateFormat = "d"
        return f.string(from: day)
    }

    private var monthLabel: String {
        let f = DateFormatter()
        f.dateFormat = "MMM"
        return f.string(from: day)
    }

    var body: some View {
        VStack(spacing: 6) {
            // Day header
            VStack(spacing: 2) {
                Text(dayName)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isToday ? Color(hex: "#00E5A0") : .primary.opacity(0.6))

                Text(dayNumber)
                    .font(.system(size: 18, weight: isToday ? .bold : .semibold))
                    .foregroundStyle(isToday ? .white : .primary.opacity(0.85))

                Text(monthLabel)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.primary.opacity(0.45))
            }
            .frame(width: width)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isToday ? Color(hex: "#00E5A0").opacity(0.12) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(isToday ? Color(hex: "#00E5A0").opacity(0.3) : Color.clear, lineWidth: 1)
            )

            // Items
            if items.isEmpty {
                // Subtle empty indicator
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.primary.opacity(0.04))
                    .frame(width: width - 8, height: 2)
                    .padding(.top, 4)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 6) {
                        ForEach(items.sorted { $0.airDate < $1.airDate }) { item in
                            UpcomingCard(item: item, width: width)
                        }
                    }
                }
                .frame(maxHeight: 320)
                .overlay(alignment: .bottom) {
                    if items.count > 2 {
                        ZStack(alignment: .bottom) {
                            LinearGradient(
                                colors: [.clear, Color.appBackground.opacity(0.85)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(height: 36)

                            Image(systemName: "chevron.down")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.primary.opacity(0.35))
                                .padding(.bottom, 4)
                        }
                        .allowsHitTesting(false)
                    }
                }
            }
        }
    }
}

// MARK: - UpcomingCard

private struct UpcomingCard: View {
    let item:  UpcomingItem
    let width: CGFloat

    @EnvironmentObject private var dashVM: DashboardViewModel
    @State private var posterImage:    UIImage?
    @State private var tilt:           CGSize = .zero
    @State private var isInteracting:  Bool   = false
    @State private var showDetail:     Bool   = false
    @State private var providers:      [StreamingProvider] = []

    private let posterWidth: CGFloat = 78
    private let cardHeight:  CGFloat = 120

    private var accentColor: Color {
        switch item.source {
        case .radarr: return Color(hex: "#FFC230")
        case .sonarr: return Color(hex: "#35C5F4")
        case .trakt:  return providers.first?.brandColor ?? Color(hex: "#ED1C24")
        default:      return .primary.opacity(0.4)
        }
    }

    private var badgeText: String {
        if item.hasFile           { return "Downloaded" }
        if item.daysFromToday < 0 { return item.mediaType == .tv ? "Missing" : "Released" }
        return item.releaseType
    }

    private var badgeColor: Color {
        if item.hasFile           { return Color(hex: "#00E5A0") }
        if item.daysFromToday < 0 { return Color(hex: "#FF6B6B") }
        switch item.releaseType {
        case "In Cinemas": return Color(hex: "#FF6B6B")
        case "Digital":    return Color(hex: "#00E5A0")
        case "Physical":   return Color(hex: "#7B8CDE")
        case "Streaming":  return Color(hex: "#A78BFA")
        case "Airing":     return Color(hex: "#35C5F4")
        default:           return .primary.opacity(0.5)
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            // Poster
            Group {
                if let img = posterImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    Color.primary.opacity(0.06)
                        .overlay {
                            Image(systemName: item.mediaType == .movie ? "film" : "tv")
                                .font(.system(size: 14, weight: .thin))
                                .foregroundStyle(.primary.opacity(0.2))
                        }
                }
            }
            .frame(width: posterWidth, height: cardHeight)
            .clipped()
            .clipShape(.rect(topLeadingRadius: 6, bottomLeadingRadius: 6))

            // Accent strip
            Rectangle()
                .fill(accentColor)
                .frame(width: 2, height: cardHeight)

            // Text + provider logos
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.primary.opacity(0.9))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(item.subtitle ?? " ")
                    .font(.system(size: 9))
                    .foregroundStyle(.primary.opacity(0.4))
                    .lineLimit(1)

                Spacer(minLength: 0)

                // Bottom row: badge (leading) + provider logos (trailing, card bottom)
                HStack(alignment: .center) {
                    Text(badgeText)
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(badgeColor)
                        .padding(.horizontal, 4).padding(.vertical, 2)
                        .background(badgeColor.opacity(0.15),
                                    in: RoundedRectangle(cornerRadius: 3))

                    Spacer(minLength: 0)

                    if item.source == .trakt {
                        // Trakt-only: show where to stream it
                        if !providers.isEmpty {
                            HStack(spacing: 3) {
                                ForEach(providers.prefix(2)) { provider in
                                    ProviderLogo(provider: provider, size: 20)
                                }
                            }
                        }
                    } else {
                        // Arr-tracked: landing in Plex
                        Image("logo_plex")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 20, height: 20)
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .frame(width: width - 8, height: cardHeight, alignment: .leading)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
        .rotation3DEffect(.degrees(Double(tilt.height) * -50), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
        .rotation3DEffect(.degrees(Double(tilt.width)  *  58), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
        .shadow(color: .black.opacity(0.25), radius: 6,
                x: tilt.width * 20, y: tilt.height * 20 + 3)
        .overlay {
            TiltRecognizer(
                onChanged: { _, liveLoc in
                    let target = amplifiedTilt(normX: liveLoc.x - 0.5,
                                               normY: liveLoc.y - 0.5)
                    if !isInteracting {
                        isInteracting = true
                        tilt = .zero
                        Task { @MainActor in
                            withAnimation(.easeOut(duration: 0.22)) { tilt = target }
                        }
                    } else {
                        tilt = target
                    }
                },
                onEnded: {
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.92)) {
                        isInteracting = false
                        tilt = .zero
                    }
                }
            )
        }
        .onContinuousHover { phase in
            let w = CGFloat(width - 8)
            let h = CGFloat(cardHeight)
            switch phase {
            case .active(let loc):
                let target = amplifiedTilt(normX: loc.x / w - 0.5,
                                           normY: loc.y / h - 0.5)
                if !isInteracting {
                    isInteracting = true
                    tilt = .zero
                    Task { @MainActor in
                        withAnimation(.easeOut(duration: 0.22)) { tilt = target }
                    }
                } else {
                    tilt = target
                }
            case .ended:
                withAnimation(.spring(response: 0.5, dampingFraction: 0.92)) {
                    isInteracting = false
                    tilt = .zero
                }
            }
        }
        .task(id: item.posterURL) { await loadPoster() }
        .task(id: item.tmdbId) { await loadProviders() }
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) {
            UpcomingDetailSheet(item: item, posterImage: posterImage)
                .environmentObject(dashVM)
        }
    }

    private func loadPoster() async {
        let urlStr: String?
        if let direct = item.posterURL {
            urlStr = direct
        } else if item.source == .trakt, let tmdbId = item.tmdbId {
            let mediaType = item.mediaType == .movie ? "movie" : "tv"
            if let path = await TMDBClient.shared.posterPath(tmdbId: tmdbId, mediaType: mediaType) {
                urlStr = "https://image.tmdb.org/t/p/w342\(path)"
            } else { urlStr = nil }
        } else { urlStr = nil }

        guard let str = urlStr, let url = URL(string: str) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }

    private func loadProviders() async {
        guard let tmdbId = item.tmdbId,
              CredentialStore.shared.load(.tmdb).enabled
        else { return }
        let mediaType = item.mediaType == .movie ? "movie" : "tv"
        providers = await TMDBClient.shared.watchProviders(tmdbId: tmdbId, mediaType: mediaType)
    }
}

// MARK: - UpcomingDetailSheet

private struct UpcomingDetailSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    let item:        UpcomingItem
    let posterImage: UIImage?

    @State private var episodeOverview:      String?             = nil
    @State private var mediaInfo:            OverseerrMediaInfo? = nil
    @State private var isLoading             = true
    @State private var isSearching           = false
    @State private var searchTriggered       = false
    @State private var showInteractiveSearch = false
    @State private var releases:             [MediaRelease]      = []
    @State private var isLoadingReleases     = false
    @State private var isMonitored:          Bool?               = nil
    @State private var isTogglingMonitor     = false
    @State private var tmdbId:               Int?                = nil

    private var numericId: Int? { Int(item.id.components(separatedBy: "-").last ?? "") }
    private var overseerrType: String { item.mediaType == .movie ? "movie" : "tv" }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {

                            // MARK: Header
                            HStack(alignment: .top, spacing: 12) {
                                // Poster
                                Group {
                                    if let img = posterImage {
                                        Image(uiImage: img).resizable().scaledToFill()
                                    } else {
                                        Color.primary.opacity(0.06).overlay {
                                            Image(systemName: item.mediaType == .movie ? "film" : "tv")
                                                .font(.system(size: 28, weight: .thin))
                                                .foregroundStyle(.primary.opacity(0.2))
                                        }
                                    }
                                }
                                .frame(width: 150, height: 225)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                // Metadata
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(item.title)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(2)

                                    if let sub = item.subtitle {
                                        Text(sub)
                                            .font(.system(size: 11))
                                            .foregroundStyle(.primary.opacity(0.6))
                                            .lineLimit(2)
                                    }

                                    Text(item.hasFile ? "Downloaded" : item.releaseType)
                                        .font(.system(size: 9, weight: .semibold))
                                        .foregroundStyle(badgeColor)
                                        .padding(.horizontal, 6).padding(.vertical, 3)
                                        .background(badgeColor.opacity(0.15), in: Capsule())

                                    HStack(spacing: 4) {
                                        Image(systemName: "calendar")
                                            .font(.system(size: 10))
                                            .foregroundStyle(.primary.opacity(0.4))
                                        Text(item.airDate.formatted(date: .abbreviated, time: .shortened))
                                            .font(.system(size: 11))
                                            .foregroundStyle(.primary.opacity(0.5))
                                    }

                                    if let rating = mediaInfo?.ratingFormatted {
                                        Label(rating, systemImage: "star.fill")
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundStyle(Color(hex: "#FFD700"))
                                    }
                                    if let runtime = mediaInfo?.runtimeFormatted {
                                        Text(runtime)
                                            .font(.system(size: 11))
                                            .foregroundStyle(.primary.opacity(0.5))
                                    }

                                    Spacer(minLength: 0)
                                }
                                .frame(width: 140, height: 225, alignment: .topLeading)

                                // Summary box
                                ZStack(alignment: .topLeading) {
                                    RoundedRectangle(cornerRadius: 10).fill(Color.primary.opacity(0.04))
                                    RoundedRectangle(cornerRadius: 10).stroke(Color.primary.opacity(0.10), lineWidth: 1)
                                    let summary = episodeOverview ?? mediaInfo?.overview
                                    Text(summary ?? "No summary available.")
                                        .font(.system(size: 12))
                                        .foregroundStyle(summary != nil ? Color.primary.opacity(0.65) : Color.primary.opacity(0.2))
                                        .lineSpacing(4)
                                        .lineLimit(nil)
                                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                        .padding(12)
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 225)
                                .clipped()
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                            .padding(.bottom, 20)

                            // MARK: Genres
                            if let info = mediaInfo, !info.genres.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 6) {
                                        ForEach(info.genres, id: \.self) { genre in
                                            Text(genre)
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundStyle(.primary.opacity(0.7))
                                                .padding(.horizontal, 10).padding(.vertical, 5)
                                                .background(Color.primary.opacity(0.08), in: Capsule())
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                }
                                .padding(.bottom, 16)
                                Divider().opacity(0.1)
                            }

                            // MARK: Cast
                            if let info = mediaInfo, !info.cast.isEmpty {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("CAST")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.primary.opacity(0.3))
                                        .padding(.horizontal, 20)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 10) {
                                            ForEach(info.cast) { member in
                                                VStack(spacing: 4) {
                                                    AsyncImage(url: member.profilePath.flatMap {
                                                        URL(string: "https://image.tmdb.org/t/p/w185\($0)")
                                                    }) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Color.primary.opacity(0.06).overlay {
                                                            Image(systemName: "person.fill")
                                                                .font(.system(size: 18))
                                                                .foregroundStyle(.primary.opacity(0.15))
                                                        }
                                                    }
                                                    .frame(width: 56, height: 56)
                                                    .clipShape(Circle())

                                                    Text(member.name)
                                                        .font(.system(size: 10, weight: .medium))
                                                        .foregroundStyle(.primary.opacity(0.8))
                                                        .lineLimit(1)
                                                    if let character = member.character, !character.isEmpty {
                                                        Text(character)
                                                            .font(.system(size: 9))
                                                            .foregroundStyle(.primary.opacity(0.4))
                                                            .lineLimit(1)
                                                    }
                                                }
                                                .frame(width: 64)
                                            }
                                        }
                                        .padding(.horizontal, 20)
                                    }
                                }
                                .padding(.vertical, 16)
                                Divider().opacity(0.1)
                            }

                            // MARK: Director / Network
                            if let info = mediaInfo {
                                VStack(spacing: 0) {
                                    if !info.directors.isEmpty {
                                        infoRow(label: item.mediaType == .movie ? "Director" : "Creator",
                                                value: info.directors.joined(separator: ", "))
                                        Divider().opacity(0.07).padding(.leading, 20)
                                    }
                                    if !info.studios.isEmpty {
                                        infoRow(label: item.mediaType == .movie ? "Studio" : "Network",
                                                value: info.studios.prefix(2).joined(separator: ", "))
                                    }
                                }
                                .padding(.vertical, 4)
                            }

                            // MARK: Actions
                            Divider().opacity(0.1)
                            VStack(spacing: 10) {
                                // Automatic search
                                Button { Task { await forceSearch() } } label: {
                                    HStack(spacing: 8) {
                                        if isSearching {
                                            ProgressView().tint(.white).scaleEffect(0.8)
                                        } else {
                                            Image(systemName: searchTriggered ? "checkmark.circle.fill" : "magnifyingglass.circle.fill")
                                                .font(.system(size: 17))
                                        }
                                        Text(searchTriggered ? "Search Triggered" : "Automatic Search")
                                            .font(.system(size: 15, weight: .semibold))
                                    }
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color(hex: "#A855F7").opacity(searchTriggered ? 0.25 : 0.15),
                                                in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(
                                        Color(hex: "#A855F7").opacity(searchTriggered ? 0.6 : 0.4), lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                                .disabled(isSearching || searchTriggered || item.hasFile)

                                // Interactive search
                                Button { Task { await openInteractiveSearch() } } label: {
                                    HStack(spacing: 8) {
                                        if isLoadingReleases {
                                            ProgressView().tint(.white).scaleEffect(0.8)
                                        } else {
                                            Image(systemName: "list.bullet.rectangle.fill")
                                                .font(.system(size: 17))
                                        }
                                        Text("Interactive Search")
                                            .font(.system(size: 15, weight: .semibold))
                                    }
                                    .foregroundStyle(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color(hex: "#0A84FF").opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#0A84FF").opacity(0.4), lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                                .disabled(isLoadingReleases || item.hasFile)
                                .sheet(isPresented: $showInteractiveSearch) {
                                    InteractiveSearchSheet(releases: releases, isLoading: isLoadingReleases, onRefresh: {
                                        guard let id = numericId else { return }
                                        Task {
                                            isLoadingReleases = true
                                            if item.source == .radarr {
                                                releases = await dashVM.radarr.fetchReleases(movieId: id)
                                            } else {
                                                releases = await dashVM.sonarr.fetchReleases(episodeId: id)
                                            }
                                            isLoadingReleases = false
                                        }
                                    }) { release in
                                        Task {
                                            if item.source == .radarr {
                                                _ = await dashVM.radarr.downloadRelease(guid: release.guid, indexerId: release.indexerId)
                                            } else {
                                                _ = await dashVM.sonarr.downloadRelease(guid: release.guid, indexerId: release.indexerId)
                                            }
                                        }
                                    }
                                }

                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 20)
                            .padding(.bottom, 8)

                            // MARK: Recommendations
                            if let id = tmdbId, dashVM.overseerr.isConnected {
                                Divider().opacity(0.1)
                                RecommendationsRow(tmdbId: id, mediaType: overseerrType)
                                    .padding(.bottom, 32)
                            } else {
                                Spacer().frame(height: 32)
                            }
                        }
                    }
                }
            }
            .navigationTitle(item.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let monitored = isMonitored {
                        Button { Task { await toggleMonitor() } } label: {
                            if isTogglingMonitor {
                                ProgressView().tint(.white).scaleEffect(0.8)
                            } else {
                                Image(systemName: monitored ? "bookmark.fill" : "bookmark")
                                    .font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(.primary)
                            }
                        }
                        .disabled(isTogglingMonitor)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await loadInfo() }
    }

    private var badgeColor: Color {
        if item.hasFile           { return Color(hex: "#00E5A0") }
        if item.daysFromToday < 0 { return Color(hex: "#FF6B6B") }
        switch item.releaseType {
        case "In Cinemas": return Color(hex: "#FF6B6B")
        case "Digital":    return Color(hex: "#00E5A0")
        case "Physical":   return Color(hex: "#7B8CDE")
        case "Streaming":  return Color(hex: "#A78BFA")
        case "Airing":     return Color(hex: "#35C5F4")
        default:           return .primary.opacity(0.5)
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.4))
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func forceSearch() async {
        guard let id = numericId else { return }
        isSearching = true
        if item.source == .radarr {
            await dashVM.radarr.triggerSearch(movieId: id)
        } else {
            await dashVM.sonarr.triggerSearch(episodeId: id)
        }
        isSearching = false
        searchTriggered = true
    }

    private func toggleMonitor() async {
        guard let id = numericId, let current = isMonitored else { return }
        isTogglingMonitor = true
        let next = !current
        if item.source == .radarr {
            await dashVM.radarr.setMovieMonitored(movieId: id, monitored: next)
        } else {
            await dashVM.sonarr.setEpisodeMonitored(episodeId: id, monitored: next)
        }
        isMonitored = next
        isTogglingMonitor = false
    }

    private func openInteractiveSearch() async {
        guard let id = numericId else { return }
        isLoadingReleases = true
        if item.source == .radarr {
            releases = await dashVM.radarr.fetchReleases(movieId: id)
        } else {
            releases = await dashVM.sonarr.fetchReleases(episodeId: id)
        }
        isLoadingReleases = false
        showInteractiveSearch = true
    }

    private func loadInfo() async {
        guard let id = numericId else { isLoading = false; return }
        let mediaType = overseerrType
        let source    = item.source
        let title     = item.title

        // Use the overview that Radarr/Sonarr already provided in the calendar response.
        // Only fall back to a separate episode fetch if the calendar item had no overview.
        if let directOverview = item.overview, !directOverview.isEmpty {
            episodeOverview = directOverview
        } else if source == .sonarr {
            episodeOverview = await dashVM.sonarr.fetchEpisodeOverview(episodeId: id)
        }

        // Fetch Overseerr media info for rating, runtime, cast, genres etc.
        // Search by title rather than depending on a TMDB ID we don't carry.
        async let fetchedMediaInfoAndId: (OverseerrMediaInfo?, Int?) = {
            let results = await dashVM.overseerr.search(query: title)
            if let match = results.first(where: { $0.mediaType == mediaType }) ?? results.first {
                let info = await dashVM.overseerr.fetchMediaInfo(tmdbId: match.id, mediaType: mediaType)
                return (info, match.id)
            }
            return (nil, nil)
        }()

        async let fetchedMonitored: Bool? = source == .sonarr
            ? dashVM.sonarr.fetchEpisodeMonitored(episodeId: id)
            : dashVM.radarr.fetchMovieMonitored(movieId: id)

        let (infoAndId, monitored) = await (fetchedMediaInfoAndId, fetchedMonitored)
        mediaInfo   = infoAndId.0
        tmdbId      = infoAndId.1
        isMonitored = monitored
        isLoading   = false
    }
}

// MARK: - ProviderLogo

private struct ProviderLogo: View {
    let provider: StreamingProvider
    let size: CGFloat

    @State private var logoImage: UIImage? = nil

    var body: some View {
        Group {
            if let img = logoImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
            } else {
                // Fallback: brand color pill with abbreviated name
                provider.brandColor
                    .overlay(
                        Text(provider.name.prefix(1))
                            .font(.system(size: size * 0.45, weight: .bold))
                            .foregroundStyle(.white)
                    )
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
        .task(id: provider.id) { await loadLogo() }
    }

    private func loadLogo() async {
        guard let url = URL(string: provider.logoURL) else { return }
        logoImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }
}

