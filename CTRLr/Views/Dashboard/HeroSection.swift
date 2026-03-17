import SwiftUI
import UIKit

// MARK: - HeroSection

struct HeroSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel

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
            )

            if dashVM.plex.recentlyAdded.isEmpty {
                emptyState
                    .padding(.horizontal, 20)
            } else {
                if !movies.isEmpty {
                    mediaRow(title: "Movies", items: movies)
                }
                if !movies.isEmpty && !shows.isEmpty {
                    Divider()
                        .background(Color.white.opacity(0.08))
                        .padding(.horizontal, 20)
                }
                if !shows.isEmpty {
                    mediaRow(title: "TV Shows", items: shows)
                }
            }
        }
    }

    // MARK: - Media row

    private func mediaRow(title: String, items: [PlexRecentItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.45))
                .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
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
                    .foregroundStyle(.white.opacity(0.2))
                Text(dashVM.plex.isConnected
                     ? "Nothing recently added"
                     : (dashVM.plex.error ?? "Connecting to Plex…"))
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.3))
                if !dashVM.plex.isTokenConfigured {
                    Text("Add your Plex token in Settings")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.2))
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
    @ObservedObject private var motion = MotionManager.shared

    @State private var posterImage:   UIImage? = nil
    @State private var tilt:          CGSize   = .zero
    @State private var isInteracting: Bool     = false
    @State private var showDetail:    Bool     = false

    private let posterShift:     CGFloat = 18
    private let maxTiltDegreesX: Double  = 58
    private let maxTiltDegreesY: Double  = 50
    private let gyroScale:       CGFloat = 0.22

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            card
            titleArea
        }
        .task(id: item.posterURL) { await loadPoster() }
        .onChange(of: motion.tilt) { _, newTilt in
            guard !isInteracting else { return }
            withAnimation(.interactiveSpring(response: 0.5, dampingFraction: 0.85)) {
                tilt = CGSize(width: newTilt.width * gyroScale,
                              height: newTilt.height * gyroScale)
            }
        }
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) {
            RecentlyAddedDetailSheet(item: item, posterImage: posterImage)
                .environmentObject(dashVM)
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
                Color.white.opacity(0.06)
                    .overlay {
                        Image(systemName: item.mediaType == .movie ? "film" : "tv")
                            .font(.system(size: 28, weight: .thin))
                            .foregroundStyle(.white.opacity(0.2))
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
            HStack(spacing: 4) {
                Text(item.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if !item.isWatched {
                    Circle()
                        .fill(Color(hex: "#FF6B00"))
                        .frame(width: 5, height: 5)
                        .padding(.top, 1)
                }
            }
            Text(item.year.map { String($0) } ?? " ")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.4))
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

    @State private var mediaInfo: OverseerrMediaInfo? = nil
    @State private var isLoading = true

    private var overseerrType: String { item.mediaType == .movie ? "movie" : "tv" }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#0A0A0F").ignoresSafeArea()

                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {

                            // MARK: Header — poster | metadata | summary
                            HStack(alignment: .top, spacing: 12) {

                                // Poster
                                Group {
                                    if let img = posterImage {
                                        Image(uiImage: img).resizable().scaledToFill()
                                    } else {
                                        Color.white.opacity(0.06)
                                            .overlay {
                                                Image(systemName: item.mediaType == .movie ? "film" : "tv")
                                                    .font(.system(size: 28, weight: .thin))
                                                    .foregroundStyle(.white.opacity(0.2))
                                            }
                                    }
                                }
                                .frame(width: 150, height: 225)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                // Metadata column
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(item.title)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .lineLimit(2)

                                    HStack(spacing: 6) {
                                        Text(item.mediaType == .movie ? "Movie" : "TV Series")
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.5))
                                            .padding(.horizontal, 7).padding(.vertical, 3)
                                            .background(Color.white.opacity(0.08), in: Capsule())
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
                                                .foregroundStyle(.white.opacity(0.6))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.white.opacity(0.25), lineWidth: 1))
                                        }
                                        if let runtime = mediaInfo?.runtimeFormatted {
                                            Text(runtime)
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white.opacity(0.5))
                                        }
                                    }

                                    if let year = item.year {
                                        HStack(spacing: 4) {
                                            Text(String(year))
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white.opacity(0.45))
                                            if let s = mediaInfo?.numberOfSeasons {
                                                Text("· \(s) season\(s == 1 ? "" : "s")")
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(.white.opacity(0.45))
                                            }
                                            if let e = mediaInfo?.numberOfEpisodes {
                                                Text("· \(e) eps")
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(.white.opacity(0.45))
                                            }
                                        }
                                    }

                                    // Resolution + codec
                                    HStack(spacing: 5) {
                                        if let res = item.resolutionLabel {
                                            Text(res)
                                                .font(.system(size: 10, weight: .semibold))
                                                .foregroundStyle(.white.opacity(0.8))
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(Color(hex: "#0A84FF").opacity(0.25), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                        if let codec = item.videoCodec?.uppercased() {
                                            Text(codec)
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.5))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                        if let audio = item.audioCodec?.uppercased() {
                                            Text(audio)
                                                .font(.system(size: 10, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.5))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 4))
                                        }
                                    }

                                    if let bitrate = item.bitrateLabel {
                                        Text(bitrate)
                                            .font(.system(size: 10))
                                            .foregroundStyle(.white.opacity(0.35))
                                    }

                                    Spacer(minLength: 0)

                                    Text("Added \(item.addedAt.formatted(.relative(presentation: .named)))")
                                        .font(.system(size: 10))
                                        .foregroundStyle(.white.opacity(0.3))
                                }
                                .frame(width: 140, height: 225, alignment: .topLeading)

                                // Summary box
                                ZStack(alignment: .topLeading) {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.white.opacity(0.04))
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                                    Text(mediaInfo?.overview ?? item.summary ?? "No summary available")
                                        .font(.system(size: 12))
                                        .foregroundStyle((mediaInfo?.overview ?? item.summary) != nil ? Color.white.opacity(0.65) : Color.white.opacity(0.2))
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
                                                .foregroundStyle(.white.opacity(0.7))
                                                .padding(.horizontal, 10).padding(.vertical, 5)
                                                .background(Color.white.opacity(0.08), in: Capsule())
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
                                        .foregroundStyle(.white.opacity(0.3))
                                        .padding(.horizontal, 20)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 10) {
                                            ForEach(info.cast) { member in
                                                VStack(spacing: 4) {
                                                    AsyncImage(url: member.profilePath.flatMap { URL(string: "https://image.tmdb.org/t/p/w185\($0)") }) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Color.white.opacity(0.06)
                                                            .overlay {
                                                                Image(systemName: "person.fill")
                                                                    .font(.system(size: 18))
                                                                    .foregroundStyle(.white.opacity(0.15))
                                                            }
                                                    }
                                                    .frame(width: 56, height: 56)
                                                    .clipShape(Circle())

                                                    Text(member.name)
                                                        .font(.system(size: 10, weight: .medium))
                                                        .foregroundStyle(.white.opacity(0.8))
                                                        .lineLimit(1)
                                                    if let character = member.character, !character.isEmpty {
                                                        Text(character)
                                                            .font(.system(size: 9))
                                                            .foregroundStyle(.white.opacity(0.4))
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
                        }
                    }
                }
            }
            .navigationTitle(item.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await loadInfo() }
    }

    // MARK: - Helpers

    private func infoRow(label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.4))
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func loadInfo() async {
        // Search Overseerr by title to get TMDB ID, then fetch rich info
        let results = await dashVM.overseerr.search(query: item.title)
        if let match = results.first(where: { $0.mediaType == overseerrType })
                        ?? results.first {
            mediaInfo = await dashVM.overseerr.fetchMediaInfo(tmdbId: match.id, mediaType: overseerrType)
        }
        isLoading = false
    }
}

