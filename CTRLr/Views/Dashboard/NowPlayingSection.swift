import SwiftUI

// MARK: - NowPlayingSection

struct NowPlayingSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {

            SectionHeader(
                iconGradient: [Color(hex: "#FF7F50"), Color(hex: "#FF4757")],
                title:        "Now Playing",
                sources:      dashVM.tautulli.isConnected ? [.tautulli] : []
            )

            // ── Ring chart zone: boundary lines + speed graph backdrop ────
            hudBoundaryLine
            ZStack {
                SpeedGraphView(
                    dlHistory: dashVM.dlHistory,
                    ulHistory: dashVM.ulHistory,
                    dlColor:   Color(hex: "#FF006E"),
                    ulColor:   Color(hex: "#00E5FF")
                )
                .opacity(0.6)
                .allowsHitTesting(false)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 48) {
                        WeeklyPlaysDonutCard(dailyPlays: dashVM.tautulli.dailyPlays)
                        LibraryCountDonutCard(stats: dashVM.tautulli.libraryCounts)
                        LibraryDonutCard(driveStats: dashVM.tautulli.driveStats,
                                         libraryCounts: dashVM.tautulli.libraryCounts)
                        DriveRingsGroup(driveStats: dashVM.tautulli.driveStats)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
            hudBoundaryLine

            // Daily play bar chart
            DailyPlaysCard(data: dashVM.tautulli.dailyPlays)
                .padding(.horizontal, 20)
        }
    }

    // Horizontal rule that fades at both edges
    private var hudBoundaryLine: some View {
        LinearGradient(
            stops: [
                .init(color: .clear,                   location: 0),
                .init(color: .white.opacity(0.13),     location: 0.15),
                .init(color: .white.opacity(0.13),     location: 0.85),
                .init(color: .clear,                   location: 1),
            ],
            startPoint: .leading, endPoint: .trailing
        )
        .frame(height: 1)
        .padding(.horizontal, 20)
    }

}

// MARK: - Library Sections Donut Card
// One ring per library section, each filled proportional to its item count.
// Total disk (user-configured) shown in the center for context.

private struct LibraryDonutCard: View {
    let driveStats:    [TautulliDriveStat]
    let libraryCounts: [TautulliLibraryStat]

    @EnvironmentObject var dashVM: DashboardViewModel

    private var totalDiskTB: Double { Double(dashVM.radarr.totalDiskBytes) / 1_099_511_627_776 }
    private var freeDiskTB:  Double { Double(dashVM.radarr.freeDiskBytes)  / 1_099_511_627_776 }
    private var hasDisk: Bool { dashVM.radarr.totalDiskBytes > 0 }

    // Sort: movies → non-special shows → specials → artist → other
    private var sections: [TautulliDriveStat] {
        let typeOrder = ["movie", "show", "artist", "photo"]
        return driveStats
            .filter { $0.count > 0 }
            .sorted { a, b in
                let ta = typeOrder.firstIndex(of: a.type) ?? 99
                let tb = typeOrder.firstIndex(of: b.type) ?? 99
                if ta != tb { return ta < tb }
                let aSpecial = a.name.lowercased().contains("special")
                let bSpecial = b.name.lowercased().contains("special")
                if aSpecial != bSpecial { return !aSpecial }  // non-special first
                return a.name < b.name
            }
    }

    // Use libraryCounts as fallback when driveStats not yet loaded
    private var usesFallback: Bool { sections.isEmpty }

    var body: some View {
        if usesFallback {
            PosterDonutCard(
                title: "Library",
                rings: libraryCounts.enumerated().map { i, stat in
                    .init(value: Double(stat.count),
                          color: Self.palette[i % Self.palette.count],
                          label: stat.label, valueLabel: formatCount(stat.count))
                },
                centerValue: hasDisk ? formatTB(totalDiskTB) : nil,
                centerLabel: hasDisk ? "total disk" : nil
            )
        } else {
            PosterDonutCard(
                title: "Library",
                rings: sections.enumerated().map { i, stat in
                    .init(value: Double(stat.count),
                          color: Self.palette[i % Self.palette.count],
                          label: stat.name, valueLabel: formatCount(stat.count))
                },
                centerValue: hasDisk ? formatTB(totalDiskTB) : nil,
                centerLabel: hasDisk ? "total disk" : nil
            )
        }
    }

    private static let palette: [Color] = [
        Color(hex: "#E040FB"),   // violet       — Movies
        Color(hex: "#39FF14"),   // safety orange — TV
        Color(hex: "#FF6200"),   // safety orange — Specials
        Color(hex: "#FF2D78"),
        Color(hex: "#FFD60A"),
        Color(hex: "#00BFA5"),
        Color(hex: "#BF5FFF"),
    ]

    private func formatCount(_ n: Int) -> String {
        n >= 1_000 ? String(format: "%.1fK", Double(n) / 1000) : "\(n)"
    }

    private func formatTB(_ tb: Double) -> String {
        tb >= 1 ? String(format: "%.0f TB", tb) : String(format: "%.0f GB", tb * 1000)
    }
}

// MARK: - Weekly Plays Donut Card (poster size)

private struct WeeklyPlaysDonutCard: View {
    let dailyPlays: [TautulliDayPlays]
    private var totalMovies: Int { dailyPlays.reduce(0) { $0 + $1.movies } }
    private var totalTV:     Int { dailyPlays.reduce(0) { $0 + $1.tv } }
    private var grandTotal:  Int { totalMovies + totalTV }

    var body: some View {
        PosterDonutCard(
            title: "7-Day Plays",
            rings: [
                .init(value: Double(totalMovies), color: Color(hex: "#E040FB"),
                      label: "Movies", valueLabel: "\(totalMovies)"),
                .init(value: Double(totalTV),     color: Color(hex: "#39FF14"),
                      label: "TV",     valueLabel: "\(totalTV)"),
            ],
            centerValue: "\(grandTotal)",
            centerLabel: "plays"
        )
    }
}

// MARK: - Library Count Donut Card
// Rings show item count per content type, each as % of total item count.

private struct LibraryCountDonutCard: View {
    let stats: [TautulliLibraryStat]
    private var total: Int { stats.reduce(0) { $0 + $1.count } }

    var body: some View {
        PosterDonutCard(
            title: "By Type",
            rings: stats.map {
                .init(value: Double($0.count), color: $0.color,
                      label: $0.label, valueLabel: formatCount($0.count))
            },
            total: Double(total),
            centerValue: formatCount(total),
            centerLabel: "items"
        )
    }

    private func formatCount(_ n: Int) -> String {
        n >= 1_000 ? String(format: "%.1fK", Double(n) / 1000) : "\(n)"
    }
}

// MARK: - Drive Rings Group
// 2-column grid matching PosterDonutCard width (200pt).
// Orphan last item is centered between the two columns.

private struct DriveRingsGroup: View {
    let driveStats: [TautulliDriveStat]

    private var sections: [TautulliDriveStat] {
        let typeOrder = ["movie", "show", "artist", "photo"]
        return driveStats
            .filter { $0.count > 0 }
            .sorted { a, b in
                let ta = typeOrder.firstIndex(of: a.type) ?? 99
                let tb = typeOrder.firstIndex(of: b.type) ?? 99
                if ta != tb { return ta < tb }
                let aSpecial = a.name.lowercased().contains("special")
                let bSpecial = b.name.lowercased().contains("special")
                if aSpecial != bSpecial { return !aSpecial }
                return a.name < b.name
            }
    }

    private var maxCount: Double {
        Double(sections.map(\.count).max() ?? 1)
    }

    var body: some View {
        if sections.isEmpty { EmptyView() } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("SECTIONS")
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.35))
                    .tracking(2)

                Spacer()

                let pairs = stride(from: 0, to: sections.count, by: 2).map {
                    Array(sections[$0..<min($0 + 2, sections.count)])
                }
                VStack(spacing: 16) {
                    ForEach(Array(pairs.enumerated()), id: \.offset) { rowIdx, pair in
                        if pair.count == 2 {
                            HStack(spacing: 8) {
                                ForEach(Array(pair.enumerated()), id: \.offset) { colIdx, stat in
                                    let globalIdx = rowIdx * 2 + colIdx
                                    DriveRingCard(
                                        name:     stat.name,
                                        count:    stat.count,
                                        color:    sectionColor(at: globalIdx),
                                        fraction: Double(stat.count) / maxCount
                                    )
                                    .frame(maxWidth: .infinity)
                                }
                            }
                        } else {
                            // Orphan — center between the two column positions
                            HStack {
                                Spacer()
                                DriveRingCard(
                                    name:     pair[0].name,
                                    count:    pair[0].count,
                                    color:    sectionColor(at: rowIdx * 2),
                                    fraction: Double(pair[0].count) / maxCount
                                )
                                Spacer()
                            }
                        }
                    }
                }

                Spacer()
            }
            .frame(width: 200)
        }
    }

    private static let sectionPalette: [Color] = [
        Color(hex: "#E040FB"),   // violet       — Movies
        Color(hex: "#39FF14"),   // safety orange — TV
        Color(hex: "#FF6200"),   // safety orange — Specials
        Color(hex: "#FF2D78"),
        Color(hex: "#FFD60A"),
        Color(hex: "#BF5FFF"),
        Color(hex: "#FFAA00"),
    ]

    private func sectionColor(at index: Int) -> Color {
        Self.sectionPalette[index % Self.sectionPalette.count]
    }
}

// MARK: - Drive Ring Card (HUD mini)

private struct DriveRingCard: View {
    let name:     String
    let count:    Int
    let color:    Color
    let fraction: Double

    private let ringSize:    CGFloat = 78
    private let strokeWidth: CGFloat = 8

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                HUDGlowRing(
                    fraction:    appeared ? fraction : 0,
                    color:       color,
                    strokeWidth: strokeWidth
                )
                .frame(width: ringSize, height: ringSize)
                .animation(.easeOut(duration: 1.0), value: appeared)

                Text(formatCount(count))
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.85))
            }

            Text(name)
                .font(.system(size: 9))
                .foregroundStyle(.white.opacity(0.4))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .onAppear { appeared = true }
    }

    private func formatCount(_ n: Int) -> String {
        n >= 1_000 ? String(format: "%.1fK", Double(n) / 1000) : "\(n)"
    }
}

// MARK: - HUD Donut Card wrapper

private struct PosterDonutCard: View {
    let title:       String
    let rings:       [ActivityRingChart.Ring]
    var total:       Double? = nil
    var centerValue: String? = nil
    var centerLabel: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.35))
                .tracking(2)

            ActivityRingChart(
                rings:       rings,
                total:       total,
                centerValue: centerValue,
                centerLabel: centerLabel
            )
            .frame(width: 200, height: 200)

            // Legend
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                    HStack(spacing: 6) {
                        Capsule()
                            .fill(ring.color)
                            .frame(width: 14, height: 3)
                        Text(ring.label)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.4))
                        Spacer()
                        Text(ring.valueLabel)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(ring.color)
                    }
                }
            }
            .frame(width: 200)
        }
    }
}


// MARK: - Daily Plays Bar Chart

private struct DailyPlaysCard: View {
    let data: [TautulliDayPlays]

    private let chartHeight: CGFloat = 70
    private let barSpacing:  CGFloat = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Daily Activity")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.45))
                Spacer()
                HStack(spacing: 8) {
                    legendDot(color: Color(hex: "#FFC230"), label: "Movies")
                    legendDot(color: Color(hex: "#35C5F4"), label: "TV")
                }
            }

            if data.isEmpty {
                Rectangle()
                    .fill(Color.white.opacity(0.04))
                    .frame(height: chartHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            } else {
                GeometryReader { geo in
                    let maxTotal     = data.map(\.total).max() ?? 1
                    let barCount     = data.count
                    let totalSpacing = barSpacing * CGFloat(barCount - 1)
                    let barWidth     = (geo.size.width - totalSpacing) / CGFloat(barCount)

                    Canvas { ctx, size in
                        for (i, day) in data.enumerated() {
                            let x      = CGFloat(i) * (barWidth + barSpacing)
                            let totalH = CGFloat(day.total)  / CGFloat(maxTotal) * size.height
                            let movieH = CGFloat(day.movies) / CGFloat(maxTotal) * size.height
                            let tvH    = totalH - movieH

                            if movieH > 0 {
                                ctx.fill(
                                    Path(roundedRect: CGRect(x: x, y: size.height - movieH,
                                                             width: barWidth, height: movieH),
                                         cornerRadius: tvH < 1 ? 3 : 0),
                                    with: .color(Color(hex: "#FFC230").opacity(0.75)))
                            }
                            if tvH > 0 {
                                ctx.fill(
                                    Path(roundedRect: CGRect(x: x, y: size.height - totalH,
                                                             width: barWidth, height: tvH),
                                         cornerRadius: 3),
                                    with: .color(Color(hex: "#35C5F4").opacity(0.75)))
                            }
                            if day.total == 0 {
                                ctx.fill(
                                    Path(roundedRect: CGRect(x: x, y: 0,
                                                             width: barWidth, height: size.height),
                                         cornerRadius: 3),
                                    with: .color(.white.opacity(0.04)))
                            }
                        }
                    }
                    .frame(height: chartHeight)

                    HStack(spacing: 0) {
                        ForEach(data) { day in
                            Text(day.label)
                                .font(.system(size: 9))
                                .foregroundStyle(.white.opacity(0.3))
                                .frame(width: barWidth + barSpacing)
                        }
                    }
                    .offset(y: chartHeight + 4)
                }
                .frame(height: chartHeight + 18)
            }
        }
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 5, height: 5)
            Text(label).font(.system(size: 9)).foregroundStyle(.white.opacity(0.35))
        }
    }
}

// MARK: - Activity Ring Chart (HUD style)

private struct ActivityRingChart: View {
    struct Ring {
        let value:      Double
        let color:      Color
        let label:      String
        let valueLabel: String
    }

    let rings:       [Ring]
    var total:       Double? = nil
    var centerValue: String? = nil
    var centerLabel: String? = nil

    @State private var appeared = false

    private let strokeWidth: CGFloat = 14
    private let ringStep:    CGFloat = 22   // spacing centre-to-centre between rings

    private var ref: Double { total ?? rings.map(\.value).reduce(0, +) }

    var body: some View {
        ZStack {
            // HUD dial frame — fine graduation ring + cardinal brackets (Canvas)
            GeometryReader { geo in
                Canvas { ctx, size in
                    let cx     = size.width  / 2
                    let cy     = size.height / 2
                    let outerR = min(cx, cy) - 2

                    // Outer ghost ring — very faint full circle
                    ctx.stroke(
                        Path { p in p.addEllipse(in: CGRect(x: cx - outerR, y: cy - outerR,
                                                            width: outerR * 2, height: outerR * 2)) },
                        with: .color(.white.opacity(0.07)), lineWidth: 0.5)

                    // Second inner ghost ring — 6pt inside
                    let innerR = outerR - 6
                    ctx.stroke(
                        Path { p in p.addEllipse(in: CGRect(x: cx - innerR, y: cy - innerR,
                                                            width: innerR * 2, height: innerR * 2)) },
                        with: .color(.white.opacity(0.04)), lineWidth: 0.5)

                    // Graduation marks — every 6° around the outer rim
                    for deg in stride(from: 0.0, to: 360.0, by: 6.0) {
                        let rad  = (deg - 90) * .pi / 180
                        let isCardinal = Int(deg) % 90 == 0
                        let isMajor   = Int(deg) % 30 == 0
                        let tickLen:  CGFloat = isCardinal ? 10 : (isMajor ? 6 : 3)
                        let opacity:  Double  = isCardinal ? 0.55 : (isMajor ? 0.22 : 0.09)
                        let width:    CGFloat = isCardinal ? 1.5  : (isMajor ? 1.0  : 0.75)
                        let x1 = cx + outerR * cos(rad)
                        let y1 = cy + outerR * sin(rad)
                        let x2 = cx + (outerR - tickLen) * cos(rad)
                        let y2 = cy + (outerR - tickLen) * sin(rad)
                        ctx.stroke(
                            Path { p in p.move(to: .init(x: x1, y: y1))
                                        p.addLine(to: .init(x: x2, y: y2)) },
                            with: .color(.white.opacity(opacity)), lineWidth: width)
                    }

                    // Cardinal bracket decorations — L-shaped corners at N/E/S/W
                    let bR    = outerR - 14   // bracket sits just inside the tick
                    let bArm: CGFloat = 7     // arm length of each L
                    for deg in [0.0, 90.0, 180.0, 270.0] {
                        let rad = (deg - 90) * .pi / 180
                        let bx  = cx + bR * cos(rad)
                        let by  = cy + bR * sin(rad)
                        // Perpendicular direction for the L arms
                        let px  = -sin(rad)
                        let py  =  cos(rad)
                        // Draw two L-arms symmetric around the point
                        for sign: CGFloat in [-1, 1] {
                            let ax = bx + sign * px * bArm
                            let ay = by + sign * py * bArm
                            ctx.stroke(
                                Path { p in
                                    p.move(to: .init(x: ax, y: ay))
                                    p.addLine(to: .init(x: bx, y: by))
                                },
                                with: .color(.white.opacity(0.45)), lineWidth: 1.5)
                        }
                    }
                }
            }

            // Glowing rings — outermost first (index 0)
            ForEach(Array(rings.enumerated()), id: \.offset) { i, ring in
                let fraction = ref > 0 ? min(ring.value / ref, 1.0) : 0
                HUDGlowRing(
                    fraction:    appeared ? fraction : 0,
                    color:       ring.color,
                    strokeWidth: strokeWidth
                )
                .padding(CGFloat(i) * ringStep + strokeWidth / 2 + 2)
                .animation(
                    .easeOut(duration: 1.2).delay(Double(i) * 0.12),
                    value: appeared
                )
            }

            // Center readout
            if let val = centerValue {
                VStack(spacing: 3) {
                    Text(val)
                        .font(.system(size: 22, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                    if let lbl = centerLabel {
                        Text(lbl.uppercased())
                            .font(.system(size: 8, weight: .semibold, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.35))
                            .tracking(2)
                    }
                }
            }
        }
        .onAppear { appeared = true }
    }
}

// MARK: - HUD Glow Ring
// Layered bloom + halo + sharp core with gradient tail → bright head.
// Parameterised so the same struct serves both large chart rings and small mini rings.

private struct HUDGlowRing: View {
    let fraction:    Double
    let color:       Color
    let strokeWidth: CGFloat

    var bloomExtra:  CGFloat = 12
    var bloomBlur:   CGFloat = 10
    var haloExtra:   CGFloat = 4
    var haloBlur:    CGFloat = 4
    var capBlur:     CGFloat = 2

    var body: some View {
        ZStack {
            // Track — fine dots, very faint so the glow reads as the light source
            Circle()
                .stroke(
                    color.opacity(0.07),
                    style: StrokeStyle(lineWidth: strokeWidth, dash: [1, 5])
                )

            if fraction > 0.005 {
                // Solid arc — full palette colour, fades at tail
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(
                        AngularGradient(
                            stops: [
                                .init(color: color.opacity(0.4), location: 0),
                                .init(color: color,              location: fraction),
                                .init(color: color.opacity(0),   location: fraction + 0.001),
                            ],
                            center:     .center,
                            startAngle: .degrees(0),
                            endAngle:   .degrees(360)
                        ),
                        style: StrokeStyle(lineWidth: strokeWidth, lineCap: .butt)
                    )
                    .rotationEffect(.degrees(-90))
            }
        }
    }
}

// MARK: - Now Playing Overlay
// Floats over the download queue section — only visible when something is playing.

struct NowPlayingOverlay: View {
    let streams: [ActiveStream]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(streams) { stream in
                NowPlayingOverlayCard(stream: stream)
            }
        }
    }
}

private struct NowPlayingOverlayCard: View {
    let stream: ActiveStream

    private let cardWidth:  CGFloat = 100
    private let cardHeight: CGFloat = 150
    private let perimeter:  CGFloat = 500

    @State private var posterImage: UIImage?

    private var cometColors: [Color] {
        switch stream.state {
        case "playing":
            return [Color(hex: "#FFFFFF"), Color(hex: "#00FFB3"),
                    Color(hex: "#00E5A0"), Color(hex: "#006644"), Color(hex: "#002B1C")]
        case "paused":
            return [Color(hex: "#FFF8E0"), Color(hex: "#FFCC44"),
                    Color(hex: "#FFAA00"), Color(hex: "#885500"), Color(hex: "#332200")]
        default: // buffering
            return [Color(hex: "#E0F8FF"), Color(hex: "#00E5FF"),
                    Color(hex: "#00A8CC"), Color(hex: "#004455"), Color(hex: "#001A22")]
        }
    }

    var body: some View {
        ZStack {
            if let img = posterImage {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Color.white.opacity(0.06)
                    .overlay {
                        Image(systemName: stream.mediaType == .movie ? "film" : "tv")
                            .font(.system(size: 18, weight: .thin))
                            .foregroundStyle(.white.opacity(0.2))
                    }
            }

            PosterGlassOverlay(cornerRadius: 10)

            // State indicator — bottom strip
            VStack {
                Spacer()
                HStack(spacing: 4) {
                    Circle()
                        .fill(cometColors[1])
                        .frame(width: 5, height: 5)
                    Text(stream.state.capitalized)
                        .font(.system(size: 8, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.8))
                    Spacer()
                    Text(stream.timeRemaining)
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.5))
                }
                .padding(.horizontal, 6)
                .padding(.bottom, 6)
            }
        }
        .frame(width: cardWidth, height: cardHeight)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            CometBorder(colors: cometColors, perimeter: perimeter, cornerRadius: 10)
        }
        .shadow(color: cometColors[1].opacity(0.4), radius: 12, x: 0, y: 0)
        .task { await loadPoster() }
    }

    private func loadPoster() async {
        guard let urlStr = stream.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url, headers: [:])
    }
}

// MARK: - NowPlayingCard

private struct NowPlayingCard: View {
    let stream: ActiveStream

    private let cardWidth:  CGFloat = 150
    private let cardHeight: CGFloat = 225
    private let maxTiltDegreesX: Double  = 58
    private let maxTiltDegreesY: Double  = 50
    private let posterShift:     CGFloat = 18
    private let gyroScale:       CGFloat = 0.22

    @ObservedObject private var motion = MotionManager.shared
    @State private var posterImage: UIImage?
    @State private var tilt:          CGSize = .zero
    @State private var isInteracting: Bool   = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .bottom) {
                Group {
                    if let img = posterImage {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        Color.white.opacity(0.06)
                            .overlay {
                                Image(systemName: stream.mediaType == .movie ? "film" : "tv")
                                    .font(.system(size: 28, weight: .thin))
                                    .foregroundStyle(.white.opacity(0.2))
                            }
                    }
                }
                .scaleEffect(1.06)
                .offset(x: tilt.width * posterShift, y: tilt.height * posterShift)
                .frame(width: cardWidth, height: cardHeight)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                PosterGlassOverlay(tilt: tilt, cornerRadius: 10)
                    .offset(x: tilt.width * 6, y: tilt.height * 6)

                stateBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(8)

                transcodeBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(8)

                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black.opacity(0.75)],
                                   startPoint: .top, endPoint: .bottom)
                    .frame(height: 80)
                    .overlay(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 3) {
                                Image(systemName: "person.fill").font(.system(size: 7))
                                Text(stream.userName).font(.system(size: 9))
                            }
                            .foregroundStyle(.white.opacity(0.6))

                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(.white.opacity(0.15)).frame(height: 3)
                                    Capsule().fill(stateColor)
                                        .frame(width: geo.size.width * stream.progress, height: 3)
                                }
                            }
                            .frame(height: 3)

                            HStack {
                                Text(formatTime(stream.viewOffset))
                                Spacer()
                                Text("-\(formatTime(stream.duration - stream.viewOffset))")
                            }
                            .font(.system(size: 8))
                            .foregroundStyle(.white.opacity(0.4))
                        }
                        .padding(.horizontal, 8).padding(.bottom, 8)
                    }
                }
            }
            .frame(width: cardWidth, height: cardHeight)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay { PosterBezel(cornerRadius: 10) }
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
            .rotation3DEffect(
                .degrees(Double(tilt.height) * -maxTiltDegreesY),
                axis: (x: 1, y: 0, z: 0), perspective: 0.5
            )
            .rotation3DEffect(
                .degrees(Double(tilt.width) *  maxTiltDegreesX),
                axis: (x: 0, y: 1, z: 0), perspective: 0.5
            )
            .shadow(
                color: .black.opacity(isInteracting ? 0.55 : 0.30),
                radius: isInteracting ? 22 : 8,
                x: tilt.width  * 20,
                y: tilt.height * 20 + 6
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(stream.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let sub = stream.subtitle {
                    Text(sub)
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.45))
                        .lineLimit(1)
                }
            }
            .frame(width: cardWidth, alignment: .leading)
        }
        .task(id: stream.id) { await loadPoster() }
        .onChange(of: motion.tilt) { _, newTilt in
            guard !isInteracting else { return }
            withAnimation(.interactiveSpring(response: 0.5, dampingFraction: 0.85)) {
                tilt = CGSize(width: newTilt.width * gyroScale,
                              height: newTilt.height * gyroScale)
            }
        }
    }

    private var stateBadge: some View {
        HStack(spacing: 4) {
            Circle().fill(stateColor).frame(width: 5, height: 5)
            Text(stream.state.capitalized).font(.system(size: 9, weight: .semibold)).foregroundStyle(.white)
        }
        .padding(.horizontal, 6).padding(.vertical, 3)
        .background(.ultraThinMaterial, in: Capsule())
    }

    @ViewBuilder
    private var transcodeBadge: some View {
        Text(stream.transcoding ? "Transcoding" : "Direct Play")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(
                stream.transcoding
                    ? Color(hex: "#FF4757").opacity(0.75)
                    : Color(hex: "#00E5A0").opacity(0.6),
                in: Capsule())
    }

    private var stateColor: Color {
        switch stream.state {
        case "playing": return Color(hex: "#00E5A0")
        case "paused":  return Color(hex: "#FF9F43")
        default:        return .white.opacity(0.5)
        }
    }

    private func formatTime(_ s: Int) -> String {
        guard s > 0 else { return "0:00" }
        let h = s / 3600; let m = (s % 3600) / 60; let sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec)
                     : String(format: "%d:%02d", m, sec)
    }

    private func loadPoster() async {
        guard let urlStr = stream.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }
}
