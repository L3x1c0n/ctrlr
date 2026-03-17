import SwiftUI

// MARK: - UpcomingSection
// 14-day horizontal calendar strip. Each day is a fixed-width column.
// Movies (Radarr) in yellow, TV (Sonarr) in blue.
// Release type badges: In Cinemas, Digital, Physical, Streaming, Airing.

struct UpcomingSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel

    private let columnWidth: CGFloat = 220
    private let pastDays    = 7
    private let futureDays  = 14

    // All items from both clients
    private var allItems: [UpcomingItem] {
        dashVM.radarr.upcomingMovies + dashVM.sonarr.upcomingEpisodes
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
                               dashVM.sonarr.isConnected ? ServiceSource.sonarr : nil].compactMap { $0 }
            )

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
    }

    // MARK: - Empty state

    private var emptyState: some View {
        HStack {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "calendar.badge.exclamationmark")
                    .font(.system(size: 28, weight: .thin))
                    .foregroundStyle(.white.opacity(0.2))
                Text("No upcoming releases")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.3))
                Text("Configure Radarr and Sonarr in Settings")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.2))
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
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(isToday ? Color(hex: "#00E5A0") : .white.opacity(0.4))

                Text(dayNumber)
                    .font(.system(size: 18, weight: isToday ? .bold : .regular))
                    .foregroundStyle(isToday ? .white : .white.opacity(0.6))

                Text(monthLabel)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.white.opacity(0.25))
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
                    .fill(Color.white.opacity(0.04))
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
            }
        }
    }
}

// MARK: - UpcomingCard

private struct UpcomingCard: View {
    let item:  UpcomingItem
    let width: CGFloat

    @ObservedObject private var motion = MotionManager.shared
    @State private var posterImage: UIImage?
    @State private var tilt: CGSize = .zero

    private let posterWidth: CGFloat = 52
    private let cardHeight:  CGFloat = 80

    private var accentColor: Color {
        switch item.source {
        case .radarr:  return Color(hex: "#FFC230")
        case .sonarr:  return Color(hex: "#35C5F4")
        default:       return .white
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
        default:           return .white.opacity(0.5)
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
                    Color.white.opacity(0.06)
                        .overlay {
                            Image(systemName: item.mediaType == .movie ? "film" : "tv")
                                .font(.system(size: 14, weight: .thin))
                                .foregroundStyle(.white.opacity(0.2))
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

            // Text
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(item.subtitle ?? " ")
                    .font(.system(size: 9))
                    .foregroundStyle(.white.opacity(0.4))
                    .lineLimit(1)

                Text(badgeText)
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(badgeColor)
                    .padding(.horizontal, 4).padding(.vertical, 2)
                    .background(badgeColor.opacity(0.15),
                                in: RoundedRectangle(cornerRadius: 3))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: width - 8, height: cardHeight, alignment: .leading)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
        .rotation3DEffect(.degrees(Double(tilt.height) * -8), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
        .rotation3DEffect(.degrees(Double(tilt.width)  *  8), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
        .shadow(color: .black.opacity(0.25), radius: 6,
                x: tilt.width * 8, y: tilt.height * 8 + 3)
        .task(id: item.posterURL) { await loadPoster() }
        .onChange(of: motion.tilt) { _, newTilt in
            withAnimation(.interactiveSpring(response: 0.5, dampingFraction: 0.85)) {
                tilt = CGSize(width: newTilt.width * 0.35, height: newTilt.height * 0.35)
            }
        }
    }

    private func loadPoster() async {
        guard let urlStr = item.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }
}
