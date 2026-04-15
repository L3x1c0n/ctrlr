import SwiftUI
import UIKit

// MARK: - HeroSection

struct HeroSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @AppStorage("sectionLightTint_recentlyAdded") private var tintHex = "#0A84FF"
    @State private var isRefreshing = false

    private let cardWidth:  CGFloat = 150
    private let cardHeight: CGFloat = 225

    private var movies: [PlexRecentItem] {
        dashVM.plex.recentlyAdded.filter { $0.mediaType == .movie }
    }
    private var shows: [PlexRecentItem] {
        dashVM.plex.recentlyAdded.filter { $0.mediaType == .tv }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {

            // Section header
            SectionHeader(
                iconGradient: [Color(hex: "#00E5A0"), Color(hex: "#0A84FF"),
                               Color(hex: "#6366F1"), Color(hex: "#A855F7")],
                title:        "Recently Added",
                sources:      dashVM.plex.isConnected ? [.plex] : []
            ) {
                SectionRefreshButton(isRefreshing: isRefreshing) {
                    isRefreshing = true
                    dashVM.plex.refresh()
                    Task {
                        try? await Task.sleep(nanoseconds: 1_500_000_000)
                        isRefreshing = false
                    }
                }
            }

            if dashVM.plex.recentlyAdded.isEmpty {
                emptyState
                    .padding(.horizontal, 20)
            } else {
                if !movies.isEmpty {
                    mediaRow(title: "Movies", items: movies)
                }
                if !movies.isEmpty && !shows.isEmpty {
                    Divider()
                        .background(Color.primary.opacity(0.08))
                        .padding(.horizontal, 20)
                }
                if !shows.isEmpty {
                    mediaRow(title: "TV Shows", items: shows)
                }
            }
        }
        .glassCard(cornerRadius: 20, lightTint: Color(hex: tintHex), lightOnly: true)
    }

    // MARK: - Media row

    private func mediaRow(title: String, items: [PlexRecentItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.primary.opacity(0.45))
                .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(items) { item in
                        RecentlyAddedCard(
                            item:       item,
                            cardWidth:  cardWidth,
                            cardHeight: cardHeight
                        )
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        HStack {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: dashVM.plex.isConnected ? "sparkles" : "wifi.slash")
                    .font(.system(size: 28, weight: .thin))
                    .foregroundStyle(.primary.opacity(0.2))
                Text(dashVM.plex.isConnected
                     ? "Nothing recently added"
                     : (dashVM.plex.error ?? "Connecting to Plex…"))
                    .font(.system(size: 13))
                    .foregroundStyle(.primary.opacity(0.3))
                if !dashVM.plex.isTokenConfigured {
                    Text("Add your Plex token in Settings")
                        .font(.system(size: 11))
                        .foregroundStyle(.primary.opacity(0.2))
                }
            }
            .padding(.vertical, 32)
            Spacer()
        }
        .glassCard(cornerRadius: 16)
    }
}

// MARK: - RecentlyAddedCard

private struct RecentlyAddedCard: View {
    let item:       PlexRecentItem
    let cardWidth:  CGFloat
    let cardHeight: CGFloat

    @EnvironmentObject var dashVM: DashboardViewModel

    @State private var posterImage:   UIImage? = nil
    @State private var tilt:          CGSize   = .zero
    @State private var isInteracting: Bool     = false
    @State private var showDetail:    Bool     = false

    private let posterShift:     CGFloat = 18
    private let maxTiltDegreesX: Double  = 58
    private let maxTiltDegreesY: Double  = 50

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            card
            titleArea
        }
        .task(id: item.posterURL) { await loadPoster() }
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) {
            RecentlyAddedDetailSheet(item: item, posterImage: posterImage)
                .environmentObject(dashVM)
                .presentationDetents([.large])
        }
    }

    private var card: some View {
        ZStack {
            posterContent
                .scaleEffect(1.06)
                .offset(x: tilt.width  * posterShift,
                        y: tilt.height * posterShift)
            PosterGlassOverlay(tilt: tilt, cornerRadius: 10)
                .offset(x: tilt.width  * 6,
                        y: tilt.height * 6)
        }
        .frame(width: cardWidth, height: cardHeight)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay { bezel }
        .rotation3DEffect(
            .degrees(Double(tilt.height) * -maxTiltDegreesY),
            axis: (x: 1, y: 0, z: 0), perspective: 0.5
        )
        .rotation3DEffect(
            .degrees(Double(tilt.width)  *  maxTiltDegreesX),
            axis: (x: 0, y: 1, z: 0), perspective: 0.5
        )
        .shadow(
            color: .black.opacity(isInteracting ? 0.55 : 0.30),
            radius: isInteracting ? 22 : 8,
            x: tilt.width  * 20,
            y: tilt.height * 20 + 6
        )
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
            switch phase {
            case .active(let loc):
                let target = amplifiedTilt(normX: loc.x / cardWidth  - 0.5,
                                           normY: loc.y / cardHeight - 0.5)
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
    }

    // MARK: - Poster content

    @ViewBuilder
    private var posterContent: some View {
        Group {
            if let img = posterImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity.animation(.easeIn(duration: 0.25)))
            } else {
                Color.primary.opacity(0.06)
                    .overlay {
                        Image(systemName: item.mediaType == .movie ? "film" : "tv")
                            .font(.system(size: 28, weight: .thin))
                            .foregroundStyle(.primary.opacity(0.2))
                    }
            }
        }
        .frame(width: cardWidth, height: cardHeight)
    }

    // MARK: - Bezel (anchored overlay — never offset, always on card edge)

    private var bezel: some View {
        PosterBezel(cornerRadius: 10)
    }

    // MARK: - Title area

    private var titleArea: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if !item.isWatched {
                    Circle()
                        .fill(Color(hex: "#FF6B00"))
                        .frame(width: 5, height: 5)
                        .padding(.top, 2)
                }
            }
            Text(item.year.map { String($0) } ?? " ")
                .font(.system(size: 10))
                .foregroundStyle(.primary.opacity(0.4))
                .lineLimit(1)
        }
        .frame(width: cardWidth, alignment: .leading)
    }

    // MARK: - Poster fetch

    private func loadPoster() async {
        guard let urlStr = item.posterURL,
              let url    = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }
}

// MARK: - Recently Added Detail Sheet

private struct RecentlyAddedDetailSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    let item:        PlexRecentItem
    let posterImage: UIImage?       // pass through already-loaded image

    @State private var mediaInfo:         OverseerrMediaInfo? = nil
    @State private var tmdbId:            Int? = nil
    @State private var backdropImage:     UIImage? = nil
    @State private var itemDetails:       PlexItemDetails? = nil
    @State private var watchHistory:      [TautulliWatchEvent] = []
    @State private var isLoading          = true
    @State private var showDeleteConfirm  = false
    @State private var isDeleting         = false
    @State private var deleteError:       String? = nil
    // Plex actions
    @State private var isRefreshing       = false
    @State private var refreshMessage:    String? = nil
    @State private var showFixMatch       = false
    @State private var showSelectPoster   = false

    private var overseerrType: String { item.mediaType == .movie ? "movie" : "tv" }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                // Backdrop at ZStack level so it bleeds through the navigation bar.
                // Pinned to the top of the screen with ignoresSafeArea, fades to
                // #0A0A0F before the content below the header begins.
                if let backdrop = backdropImage {
                    VStack(spacing: 0) {
                        Image(uiImage: backdrop)
                            .resizable()
                            .scaledToFill()
                            .frame(maxWidth: .infinity)
                            .frame(height: 420)
                            .clipped()
                            .blur(radius: 4, opaque: true)
                            .overlay {
                                LinearGradient(
                                    stops: [
                                        .init(color: .black.opacity(0.3),  location: 0.0),
                                        .init(color: Color.appBackground, location: 1.0),
                                    ],
                                    startPoint: .top,
                                    endPoint:   .bottom
                                )
                            }
                        Spacer()
                    }
                    .ignoresSafeArea(edges: .top)
                    .allowsHitTesting(false)
                }

                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {


                            // MARK: Header — poster | metadata + summary
                            HStack(alignment: .top, spacing: 14) {

                                // Poster
                                Group {
                                    if let img = posterImage {
                                        Image(uiImage: img).resizable().scaledToFill()
                                    } else {
                                        Color.primary.opacity(0.06)
                                            .overlay {
                                                Image(systemName: item.mediaType == .movie ? "film" : "tv")
                                                    .font(.system(size: 28, weight: .thin))
                                                    .foregroundStyle(.primary.opacity(0.2))
                                            }
                                    }
                                }
                                .frame(width: 150, height: 225)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                // Right column: metadata + summary stacked
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(item.title)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(2)

                                    HStack(spacing: 6) {
                                        Text(item.mediaType == .movie ? "Movie" : "TV Series")
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(.primary.opacity(0.5))
                                            .padding(.horizontal, 7).padding(.vertical, 3)
                                            .background(Color.primary.opacity(0.08), in: Capsule())
                                        if item.isWatched {
                                            Label("Watched", systemImage: "checkmark.circle.fill")
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundStyle(Color(hex: "#00E5A0"))
                                        }
                                    }

                                    HStack(spacing: 6) {
                                        if let rating = mediaInfo?.ratingFormatted {
                                            Label(rating, systemImage: "star.fill")
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundStyle(Color(hex: "#FFD700"))
                                        }
                                        if let cert = mediaInfo?.certification, !cert.isEmpty {
                                            Text(cert)
                                                .font(.system(size: 10, weight: .semibold))
                                                .foregroundStyle(.primary.opacity(0.6))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.primary.opacity(0.25), lineWidth: 1))
                                        }
                                        if let runtime = mediaInfo?.runtimeFormatted {
                                            Text(runtime)
                                                .font(.system(size: 11))
                                                .foregroundStyle(.primary.opacity(0.5))
                                        }
                                    }

                                    HStack(spacing: 4) {
                                        if let year = item.year {
                                            Text(String(year))
                                                .font(.system(size: 11))
                                                .foregroundStyle(.primary.opacity(0.45))
                                        }
                                        if let s = mediaInfo?.numberOfSeasons {
                                            Text("· \(s) season\(s == 1 ? "" : "s")")
                                                .font(.system(size: 11))
                                                .foregroundStyle(.primary.opacity(0.45))
                                        }
                                    }

                                    // Resolution + codec badges
                                    HStack(spacing: 5) {
                                        if let res = item.resolutionLabel {
                                            Text(res)
                                                .font(.system(size: 10, weight: .semibold))
                                                .foregroundStyle(.primary.opacity(0.8))
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(Color(hex: "#0A84FF").opacity(0.25), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                        if let codec = item.videoCodec?.uppercased() {
                                            Text(codec)
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundStyle(.primary.opacity(0.5))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                        if let audio = item.audioCodec?.uppercased() {
                                            Text(audio)
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundStyle(.primary.opacity(0.5))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                    }

                                    // Summary
                                    Text(mediaInfo?.overview ?? item.summary ?? "No summary available.")
                                        .font(.system(size: 12))
                                        .foregroundStyle((mediaInfo?.overview ?? item.summary) != nil ? Color.primary.opacity(0.6) : Color.primary.opacity(0.2))
                                        .lineSpacing(3)
                                        .lineLimit(5)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .frame(maxWidth: .infinity, alignment: .topLeading)
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
                                                    AsyncImage(url: member.profilePath.flatMap { URL(string: "https://image.tmdb.org/t/p/w185\($0)") }) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Color.primary.opacity(0.06)
                                                            .overlay {
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

                            // MARK: Director / Studio rows
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

                            // MARK: Recommendations
                            if let id = tmdbId, dashVM.overseerr.isConnected {
                                Divider().opacity(0.1)
                                RecommendationsRow(tmdbId: id, mediaType: overseerrType)
                            }

                            // MARK: Actions + Info columns
                            Divider().opacity(0.1)
                            VStack(spacing: 10) {

                                // Two equal columns
                                HStack(alignment: .top, spacing: 12) {


                                    // ── Left: 4 action buttons ──
                                    VStack(spacing: 10) {
                                        Button { Task { await refreshMetadata() } } label: {
                                            actionButton(icon: isRefreshing ? nil : "arrow.clockwise.circle.fill",
                                                         label: refreshMessage ?? "Refresh Metadata",
                                                         color: Color(hex: "#0A84FF"),
                                                         isLoading: isRefreshing)
                                        }
                                        .buttonStyle(.plain).disabled(isRefreshing)

                                        Button { showFixMatch = true } label: {
                                            actionButton(icon: "text.magnifyingglass",
                                                         label: "Fix Match",
                                                         color: Color(hex: "#6366F1"))
                                        }
                                        .buttonStyle(.plain)

                                        Button { showSelectPoster = true } label: {
                                            actionButton(icon: "photo.circle.fill",
                                                         label: "Select Artwork",
                                                         color: Color(hex: "#00E5A0"))
                                        }
                                        .buttonStyle(.plain)

                                        if let url = URL(string: "plex://") {
                                            Link(destination: url) {
                                                actionButton(icon: "play.square.stack.fill",
                                                             label: "Open Plex",
                                                             color: Color(hex: "#E5A00D"))
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .top)

                                    // ── Right: info cards ──
                                    VStack(spacing: 10) {

                                        // File details card
                                        VStack(alignment: .leading, spacing: 8) {
                                            Label("File Details", systemImage: "doc.circle")
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundStyle(.primary.opacity(0.4))

                                            if let details = itemDetails {
                                                infoChip(label: "Plays",   value: details.playCount == 0 ? "Never" : "\(details.playCount)×")
                                                if let last = details.lastViewedAt {
                                                    infoChip(label: "Last",    value: last.formatted(.relative(presentation: .named)))
                                                }
                                                if let size = details.fileSizeFormatted {
                                                    infoChip(label: "Size",    value: size)
                                                }
                                                if let section = details.sectionTitle {
                                                    infoChip(label: "Library", value: section)
                                                }
                                            } else {
                                                ProgressView().tint(.white).scaleEffect(0.7)
                                                    .frame(maxWidth: .infinity, alignment: .leading)
                                            }
                                        }
                                        .frame(maxWidth: .infinity, alignment: .topLeading)
                                        .padding(12)
                                        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))

                                        // Watch history card
                                        VStack(alignment: .leading, spacing: 8) {
                                            Label("Watch History", systemImage: "clock.circle")
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundStyle(.primary.opacity(0.4))

                                            if watchHistory.isEmpty {
                                                Text("No history")
                                                    .font(.system(size: 12))
                                                    .foregroundStyle(.primary.opacity(0.25))
                                            } else {
                                                ForEach(watchHistory) { event in
                                                    HStack(spacing: 6) {
                                                        Text(event.user)
                                                            .font(.system(size: 12, weight: .medium))
                                                            .foregroundStyle(.primary.opacity(0.8))
                                                            .lineLimit(1)
                                                        Spacer()
                                                        Text("\(event.percentComplete)%")
                                                            .font(.system(size: 11))
                                                            .foregroundStyle(event.percentComplete >= 90
                                                                ? Color(hex: "#00E5A0")
                                                                : .white.opacity(0.4))
                                                        Text(event.watchedAt.formatted(.relative(presentation: .named)))
                                                            .font(.system(size: 10))
                                                            .foregroundStyle(.primary.opacity(0.3))
                                                            .lineLimit(1)
                                                    }
                                                }
                                            }
                                        }
                                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                        .padding(12)
                                        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
                                    }
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                                }

                                // ── Delete spans full width ──
                                Divider().opacity(0.08)
                                if let err = deleteError {
                                    Text(err)
                                        .font(.system(size: 11))
                                        .foregroundStyle(Color(hex: "#FF6B6B"))
                                }
                                Button { showDeleteConfirm = true } label: {
                                    HStack(spacing: 10) {
                                        if isDeleting {
                                            ProgressView().tint(.white).scaleEffect(0.8)
                                        } else {
                                            Image(systemName: "trash.circle.fill").font(.system(size: 17))
                                        }
                                        Text("Delete from Library").font(.system(size: 15, weight: .semibold))
                                    }
                                    .frame(maxWidth: .infinity, alignment: .center)
                                    .foregroundStyle(.primary)
                                    .padding(.horizontal, 16).padding(.vertical, 14)
                                    .background(Color(hex: "#FF4757").opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#FF4757").opacity(0.4), lineWidth: 1))
                                }
                                .buttonStyle(.plain).disabled(isDeleting)
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 20)
                            .padding(.bottom, 32)
                        }
                        .containerRelativeFrame(.horizontal)
                    }
                }
            }
            .navigationTitle(item.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Delete \"\(item.title)\" from your Plex library?",
                                isPresented: $showDeleteConfirm,
                                titleVisibility: .visible) {
                Button("Delete from Library", role: .destructive) {
                    Task {
                        isDeleting = true
                        deleteError = nil
                        do {
                            try await dashVM.plex.deleteMedia(ratingKey: item.deleteRatingKey ?? item.id)
                            dismiss()
                        } catch {
                            deleteError = error.localizedDescription
                        }
                        isDeleting = false
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(isPresented: $showFixMatch) {
                FixMatchSheet(item: item)
                    .environmentObject(dashVM)
            }
            .sheet(isPresented: $showSelectPoster) {
                SelectPosterSheet(item: item)
                    .environmentObject(dashVM)
            }
        }
        .task { await loadInfo() }
    }

    // MARK: - Helpers

    private func refreshMetadata() async {
        isRefreshing   = true
        refreshMessage = nil
        do {
            try await dashVM.plex.refreshMetadata(ratingKey: item.id)
            refreshMessage = "Refresh queued"
        } catch {
            refreshMessage = error.localizedDescription
        }
        isRefreshing = false
    }

    @ViewBuilder
    private func actionButton(icon: String?, label: String, color: Color, isLoading: Bool = false) -> some View {
        HStack(spacing: 10) {
            if isLoading {
                ProgressView().tint(.white).scaleEffect(0.8)
            } else if let icon {
                Image(systemName: icon).font(.system(size: 17))
            }
            Text(label).font(.system(size: 15, weight: .semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(.primary)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(color.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color.opacity(0.4), lineWidth: 1))
    }

    @ViewBuilder
    private func infoChip(label: String, value: String) -> some View {
        HStack(spacing: 0) {
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.primary.opacity(0.35))
                .frame(width: 48, alignment: .leading)
            Text(value)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.primary.opacity(0.8))
                .lineLimit(1)
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

    private func loadInfo() async {
        // All four fetches run concurrently
        async let backdropTask: UIImage? = {
            guard let urlStr = item.backdropURL, let url = URL(string: urlStr) else { return nil }
            return await ArtworkCache.shared.fetchAndCache(url: url)
        }()
        async let detailsTask: PlexItemDetails? = try? await dashVM.plex.fetchItemDetails(ratingKey: item.id)
        async let historyTask: [TautulliWatchEvent] = dashVM.tautulli.fetchItemHistory(ratingKey: item.id)
        let mediaType = overseerrType
        async let overseerrTask: (OverseerrMediaInfo?, Int?) = {
            let results = await dashVM.overseerr.search(query: item.title)
            guard let match = results.first(where: { $0.mediaType == mediaType }) ?? results.first else { return (nil, nil) }
            let info = await dashVM.overseerr.fetchMediaInfo(tmdbId: match.id, mediaType: mediaType)
            return (info, match.id)
        }()

        let (bd, det, hist, overseerPair) = await (backdropTask, detailsTask, historyTask, overseerrTask)
        backdropImage = bd
        itemDetails   = det
        watchHistory  = hist
        mediaInfo     = overseerPair.0
        tmdbId        = overseerPair.1
        isLoading     = false
    }
}

// MARK: - Fix Match Sheet

private struct FixMatchSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    let item: PlexRecentItem

    @State private var searchText: String
    @State private var results:    [PlexMatchCandidate] = []
    @State private var isSearching = false
    @State private var isApplying  = false
    @State private var error:      String?

    init(item: PlexRecentItem) {
        self.item    = item
        _searchText  = State(initialValue: item.title)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.primary.opacity(0.4))
                        TextField("Search title…", text: $searchText)
                            .foregroundStyle(.primary)
                            .textInputAutocapitalization(.never)
                            .onSubmit { Task { await search() } }
                        if isSearching {
                            ProgressView().tint(.white).scaleEffect(0.8)
                        }
                    }
                    .padding(10)
                    .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)

                    if let error {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(Color(hex: "#FF6B6B"))
                            .padding(.horizontal, 20)
                            .padding(.bottom, 8)
                    }

                    List(results) { match in
                        Button {
                            guard !isApplying else { return }
                            Task { await applyMatch(match) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(match.name)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.primary)
                                    if let year = match.year {
                                        Text(String(year))
                                            .font(.system(size: 12))
                                            .foregroundStyle(.primary.opacity(0.5))
                                    }
                                }
                                Spacer()
                                if match.score > 0 {
                                    Text("\(match.score)%")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.primary.opacity(0.4))
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .listRowBackground(Color.primary.opacity(0.04))
                    }
                    .listStyle(.plain)
                    .overlay {
                        if isApplying {
                            Color.black.opacity(0.4)
                                .overlay { ProgressView().tint(.white) }
                        }
                    }
                }
            }
            .navigationTitle("Fix Match")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Search") { Task { await search() } }
                        .disabled(isSearching || searchText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .task { await search() }
    }

    private func search() async {
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSearching = true
        error       = nil
        do {
            results = try await dashVM.plex.fetchMatches(
                ratingKey: item.id, title: searchText, year: item.year)
        } catch {
            self.error = error.localizedDescription
        }
        isSearching = false
    }

    private func applyMatch(_ match: PlexMatchCandidate) async {
        isApplying = true
        error      = nil
        do {
            try await dashVM.plex.applyMatch(
                ratingKey: item.id, guid: match.guid, name: match.name, year: match.year)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        isApplying = false
    }
}

// MARK: - Select Poster Sheet

private struct SelectPosterSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    let item: PlexRecentItem

    enum ArtMode: String, CaseIterable {
        case poster     = "Poster"
        case background = "Background"
    }

    @State private var mode:      ArtMode       = .poster
    @State private var posters:   [PlexPosterItem] = []
    @State private var arts:      [PlexPosterItem] = []
    @State private var isLoading  = true
    @State private var isSetting  = false
    @State private var error:     String?

    private var currentItems: [PlexPosterItem] { mode == .poster ? posters : arts }
    // Poster: 2:3  |  Background: 16:9
    private var thumbWidth:  CGFloat { mode == .poster ? 100 : 160 }
    private var thumbHeight: CGFloat { mode == .poster ? 150 :  90 }
    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: thumbWidth), spacing: 8)]
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                Group {
                    if isLoading {
                        ProgressView().tint(.white)
                    } else if let error {
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 32, weight: .thin))
                                .foregroundStyle(.primary.opacity(0.3))
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(.primary.opacity(0.6))
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 32)
                        }
                    } else if currentItems.isEmpty {
                        Text("No \(mode == .poster ? "posters" : "backgrounds") available")
                            .foregroundStyle(.primary.opacity(0.4))
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, spacing: 8) {
                                ForEach(currentItems) { artwork in
                                    Button {
                                        Task { await setArtwork(artwork) }
                                    } label: {
                                        AsyncImage(url: URL(string: artwork.thumbURL)) { img in
                                            img.resizable().scaledToFill()
                                        } placeholder: {
                                            Color.primary.opacity(0.06)
                                                .overlay {
                                                    Image(systemName: "photo")
                                                        .foregroundStyle(.primary.opacity(0.15))
                                                }
                                        }
                                        .frame(width: thumbWidth, height: thumbHeight)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .strokeBorder(
                                                    artwork.selected ? Color(hex: "#E5A00D") : Color.primary.opacity(0.12),
                                                    lineWidth: artwork.selected ? 2 : 1
                                                )
                                        )
                                        .overlay(alignment: .topTrailing) {
                                            if artwork.selected {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .foregroundStyle(Color(hex: "#E5A00D"))
                                                    .background(Circle().fill(Color.black.opacity(0.6)))
                                                    .padding(5)
                                            }
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(isSetting)
                                }
                            }
                            .padding(20)
                        }
                    }
                }

                if isSetting {
                    Color.black.opacity(0.5)
                        .ignoresSafeArea()
                        .overlay { ProgressView().tint(.white) }
                }
            }
            .navigationTitle("Select Artwork")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Picker("Mode", selection: $mode) {
                        ForEach(ArtMode.allCases, id: \.self) { m in
                            Text(m.rawValue).tag(m)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 200)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onChange(of: mode) { _, _ in
                error = nil
                Task { await loadCurrentMode() }
            }
        }
        .task { await loadBoth() }
    }

    private func loadBoth() async {
        isLoading = true
        error     = nil
        async let p = dashVM.plex.fetchPosters(ratingKey: item.id)
        async let a = dashVM.plex.fetchArts(ratingKey: item.id)
        do {
            (posters, arts) = try await (p, a)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func loadCurrentMode() async {
        isLoading = true
        do {
            if mode == .poster {
                posters = try await dashVM.plex.fetchPosters(ratingKey: item.id)
            } else {
                arts = try await dashVM.plex.fetchArts(ratingKey: item.id)
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func setArtwork(_ artwork: PlexPosterItem) async {
        isSetting = true
        error     = nil
        do {
            if mode == .poster {
                try await dashVM.plex.setPoster(ratingKey: item.id, posterKey: artwork.key)
                posters = posters.map {
                    PlexPosterItem(key: $0.key, selected: $0.key == artwork.key, thumbURL: $0.thumbURL)
                }
            } else {
                try await dashVM.plex.setArt(ratingKey: item.id, artKey: artwork.key)
                arts = arts.map {
                    PlexPosterItem(key: $0.key, selected: $0.key == artwork.key, thumbURL: $0.thumbURL)
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
        isSetting = false
    }
}

