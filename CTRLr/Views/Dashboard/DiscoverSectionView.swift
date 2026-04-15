import SwiftUI

// MARK: - DiscoverSectionView

struct DiscoverSectionView: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @AppStorage("sectionLightTint_discover") private var tintHex = "#CC2260"
    @State private var selectedForDetail: OverseerrSearchResult? = nil
    @State private var isRefreshing = false

    var body: some View {
        if !dashVM.discoverSections.isEmpty || dashVM.overseerr.isConnected || dashVM.overseerr.hasCredentials {
            VStack(alignment: .leading, spacing: 16) {

                SectionHeader(
                    iconGradient: [Color(hex: "#A855F7"), Color(hex: "#6366F1"),
                                   Color(hex: "#3B82F6"), Color(hex: "#06B6D4")],
                    title:        "Discover",
                    sources:      dashVM.overseerr.isConnected ? [.overseerr] : []
                ) {
                    SectionRefreshButton(isRefreshing: isRefreshing) {
                        isRefreshing = true
                        dashVM.fetchDiscover()
                        Task {
                            try? await Task.sleep(nanoseconds: 1_500_000_000)
                            isRefreshing = false
                        }
                    }
                }
                .padding(.horizontal, 20)

                ForEach(dashVM.discoverSections) { section in
                    discoverRow(section)
                }
            }
            .sheet(item: $selectedForDetail) { result in
                MediaDetailSheet(result: result)
                    .environmentObject(dashVM)
            }
            .glassCard(cornerRadius: 20, lightTint: Color(hex: tintHex), lightOnly: true)
        }
    }

    // MARK: - Per-seed row

    private func discoverRow(_ section: DiscoverSection) -> some View {
        VStack(alignment: .leading, spacing: 12) {

            // Section title
            Text(section.seedTitle)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.primary.opacity(0.75))
                .padding(.horizontal, 14)

            // Recommendation cards — horizontal scroll, fixed 110pt cards
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(section.items) { item in
                        DiscoverCard(item: item, onTap: { selectedForDetail = item })
                    }
                    SeeMoreCard(
                        isLoading: dashVM.discoverLoadingMore.contains(section.mediaType),
                        onTap: { dashVM.loadMoreDiscover(mediaType: section.mediaType) }
                    )
                }
                .padding(.horizontal, 14)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
    }
}

// MARK: - DiscoverCard

private struct DiscoverCard: View {
    let item:  OverseerrSearchResult
    let onTap: () -> Void

    private let cardWidth:  CGFloat = 110
    private let cardHeight: CGFloat = 165

    @State private var posterImage: UIImage? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let img = posterImage {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        Color.primary.opacity(0.06)
                            .overlay {
                                Image(systemName: item.mediaType == "tv" ? "tv" : "film")
                                    .font(.system(size: 20, weight: .thin))
                                    .foregroundStyle(.primary.opacity(0.2))
                            }
                    }
                }
                .frame(width: cardWidth, height: cardHeight)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                }

                statusBadge.padding(5)
            }

            Text(item.title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if let year = item.year {
                Text(year)
                    .font(.system(size: 10))
                    .foregroundStyle(.primary.opacity(0.4))
            }
        }
        .frame(width: cardWidth, alignment: .leading)
        .onTapGesture { onTap() }
        .task(id: item.posterURL) { await loadPoster() }
    }

    private func loadPoster() async {
        guard let urlStr = item.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if item.isAvailable {
            badgeIcon("checkmark.circle.fill", color: Color(hex: "#00E5A0"))
        } else if item.isRequested {
            badgeIcon("clock.fill", color: Color(hex: "#FF9F43"))
        } else {
            badgeIcon("plus.circle.fill", color: .primary.opacity(0.85))
        }
    }

    private func badgeIcon(_ name: String, color: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 18))
            .foregroundStyle(color)
            .background(Circle().fill(.black.opacity(0.55)).padding(-2))
    }
}

// MARK: - RecommendationsRow
// Fits exactly as many poster cards as the available width allows — no scroll.

struct RecommendationsRow: View {
    let tmdbId:    Int
    let mediaType: String

    @EnvironmentObject var dashVM: DashboardViewModel
    @State private var recommendations:  [OverseerrSearchResult] = []
    @State private var selected:         OverseerrSearchResult?  = nil
    @State private var containerWidth:   CGFloat                 = 320

    private let count:   Int     = 5
    private let spacing: CGFloat = 10
    private let hPad:    CGFloat = 20

    private var cardW: CGFloat {
        let w = containerWidth > 0 ? containerWidth : 320
        return (w - hPad * 2 - spacing * CGFloat(count - 1)) / CGFloat(count)
    }
    private var cardH: CGFloat { cardW * 1.5 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("You Might Also Like")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.primary.opacity(0.45))
                .padding(.horizontal, hPad)

            HStack(spacing: spacing) {
                if recommendations.isEmpty {
                    ForEach(0..<count, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.primary.opacity(0.05))
                            .frame(width: cardW, height: cardH)
                    }
                } else {
                    ForEach(recommendations.prefix(count)) { item in
                        RecommendationCard(item: item, cardW: cardW, cardH: cardH)
                            .onTapGesture { selected = item }
                    }
                }
            }
            .padding(.horizontal, hPad)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { if geo.size.width > 0 { containerWidth = geo.size.width } }
                    .onChange(of: geo.size.width) { _, w in if w > 0 { containerWidth = w } }
            }
        )
        .task(id: tmdbId) {
            recommendations = await dashVM.overseerr.fetchRecommendations(
                tmdbId: tmdbId, mediaType: mediaType)
        }
        .sheet(item: $selected) { result in
            MediaDetailSheet(result: result)
                .environmentObject(dashVM)
        }
    }
}

// MARK: - RecommendationCard

private struct RecommendationCard: View {
    let item:  OverseerrSearchResult
    let cardW: CGFloat
    let cardH: CGFloat

    @State private var posterImage: UIImage? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let img = posterImage {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        Color.primary.opacity(0.05)
                            .overlay {
                                Image(systemName: item.mediaType == "tv" ? "tv" : "film")
                                    .font(.system(size: 16, weight: .thin))
                                    .foregroundStyle(.primary.opacity(0.2))
                            }
                    }
                }
                .frame(width: cardW, height: cardH)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                }

                statusBadge.padding(4)
            }

            Text(item.title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: cardW, alignment: .leading)
        }
        .task(id: item.id) { await loadPoster() }
    }

    @ViewBuilder private var statusBadge: some View {
        if item.isAvailable {
            badgeIcon("checkmark.circle.fill", color: Color(hex: "#00E5A0"))
        } else if item.isRequested {
            badgeIcon("clock.fill",            color: Color(hex: "#FF9F43"))
        } else {
            badgeIcon("plus.circle.fill",      color: .primary.opacity(0.8))
        }
    }

    private func badgeIcon(_ name: String, color: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 16))
            .foregroundStyle(color)
            .background(Circle().fill(.black.opacity(0.55)).padding(-2))
    }

    private func loadPoster() async {
        guard let urlStr = item.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }
}

// MARK: - SeeMoreCard

private struct SeeMoreCard: View {
    let isLoading: Bool
    let onTap: () -> Void

    private let cardWidth:  CGFloat = 110
    private let cardHeight: CGFloat = 165

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .tint(.primary.opacity(0.5))
                } else {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 28, weight: .ultraLight))
                        .foregroundStyle(.primary.opacity(0.4))
                    Text("More")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.primary.opacity(0.4))
                }
            }
            .frame(width: cardWidth, height: cardHeight)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(.primary.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}
