import SwiftUI

// MARK: - DownloadQueueRow

struct DownloadQueueRow: View {
    let item:     EnrichedQBTorrent
    let onPause:  () -> Void
    let onResume: () -> Void
    let onDelete: (_ deleteFiles: Bool) -> Void

    @State private var showDetail = false

    @State private var posterImage: UIImage? = nil
    @State private var tileOrder:   [Int]   = []

    private let cardWidth:  CGFloat = 150
    private let cardHeight: CGFloat = 225
    private let cols = 15
    private let rows = 20
    private var total: Int { cols * rows }
    private let borderPerimeter: CGFloat = 730

    private var tilesTarget: Int {
        tileOrder.isEmpty ? 0 : min(Int(item.torrent.progress * Double(total)), total)
    }

    private var revealedSet: Set<Int> { Set(tileOrder.prefix(tilesTarget)) }
    private var showMosaic:  Bool     { item.torrent.isActiveDownload }

    private var stateColor: Color {
        switch item.torrent.state {
        case "downloading", "forcedDL", "metaDL":               return Color(hex: "#00E5A0")
        case "stalledDL", "stalledUP", "error", "missingFiles": return Color(hex: "#FF6B6B")
        case "uploading", "forcedUP", "pausedUP":               return Color(hex: "#7B8CDE")
        default:                                                 return Color.white.opacity(0.15)
        }
    }

    private var stateColorBright: Color {
        switch item.torrent.state {
        case "downloading", "forcedDL", "metaDL":               return Color(hex: "#40FFBE")
        case "stalledDL", "stalledUP", "error", "missingFiles": return Color(hex: "#FF9999")
        case "uploading", "forcedUP", "pausedUP":               return Color(hex: "#A0AEFF")
        default:                                                 return Color.white.opacity(0.35)
        }
    }

    private var cometGradientColors: [Color] {
        switch item.torrent.state {
        case "downloading", "forcedDL", "metaDL":
            return [Color(hex: "#E0FFF5"), Color(hex: "#00FFB8"),
                    Color(hex: "#00E5A0"), Color(hex: "#006644"), Color(hex: "#002B1C")]
        case "stalledDL", "stalledUP", "error", "missingFiles":
            return [Color(hex: "#FFE8E8"), Color(hex: "#FF9999"),
                    Color(hex: "#FF6B6B"), Color(hex: "#AA1111"), Color(hex: "#4A0000")]
        case "uploading", "forcedUP", "pausedUP":
            return [Color(hex: "#EEF0FF"), Color(hex: "#B8C4FF"),
                    Color(hex: "#7B8CDE"), Color(hex: "#2D3E9E"), Color(hex: "#0D1440")]
        default:
            return [Color.white.opacity(0.6), Color.white.opacity(0.2),
                    Color.white.opacity(0.05), Color.white.opacity(0.2), Color.white.opacity(0.6)]
        }
    }

    private var stateColorDim: Color {
        switch item.torrent.state {
        case "downloading", "forcedDL", "metaDL":               return Color(hex: "#00996A")
        case "stalledDL", "stalledUP", "error", "missingFiles": return Color(hex: "#C03030")
        case "uploading", "forcedUP", "pausedUP":               return Color(hex: "#4A5DB0")
        default:                                                 return Color.white.opacity(0.08)
        }
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            card
            labelArea
        }
        .draggable(item.title)
        .task(id: item.posterURL) { await loadPoster() }
    }

    // MARK: - Card

    private var card: some View {
        ZStack {
            posterLayer

            if item.torrent.isPaused {
                Color.black.opacity(0.45).saturation(0)
            }

            PosterGlassOverlay(cornerRadius: 12)

            pauseOverlay
        }
        .animation(.easeInOut(duration: 0.3), value: item.torrent.isPaused)
        .animation(.easeInOut(duration: 0.6), value: showMosaic)
        .frame(width: cardWidth, height: cardHeight)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay { borderOverlay }
        .overlay(alignment: .bottomLeading) {
            if item.torrent.isActiveDownload && item.torrent.progress > 0 {
                Text(String(format: "%.0f%%", item.torrent.progress * 100))
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(stateColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(6)
            }
        }
        .shadow(color: .black.opacity(0.30), radius: 8, x: 0, y: 4)
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) {
            TorrentDetailSheet(item: item, onPause: onPause, onResume: onResume, onDelete: onDelete)
        }
    }

    // MARK: - Border overlay (comet / static)

    @ViewBuilder
    private var borderOverlay: some View {
        let staticGradient = LinearGradient(
            colors: [stateColorBright, stateColor, stateColorDim],
            startPoint: .topLeading,
            endPoint:   .bottomTrailing
        )

        if item.torrent.isActiveDownload {
            CometBorder(colors: cometGradientColors, perimeter: borderPerimeter)
        } else {
            RoundedRectangle(cornerRadius: 12)
                .stroke(staticGradient, lineWidth: 2)
        }
    }

    // MARK: - Label area

    private var labelArea: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Text(item.subtitle ?? " ")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.5))
                .lineLimit(1)
        }
        .frame(width: cardWidth, alignment: .leading)
    }

    // MARK: - Poster layer

    @ViewBuilder
    private var posterLayer: some View {
        if let img = posterImage {
            if showMosaic {
                mosaicGrid(img: img).transition(.opacity)
            } else {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: cardWidth, height: cardHeight)
                    .transition(.opacity)
            }
        } else {
            Color.white.opacity(0.06)
                .frame(width: cardWidth, height: cardHeight)
                .overlay {
                    Image(systemName: "film")
                        .font(.system(size: 24, weight: .thin))
                        .foregroundStyle(.white.opacity(0.2))
                }
        }
    }

    // MARK: - Mosaic grid

    private func mosaicGrid(img: UIImage) -> some View {
        let revealed = revealedSet
        return VStack(spacing: 0.5) {
            ForEach(0..<rows, id: \.self) { row in
                HStack(spacing: 0.5) {
                    ForEach(0..<cols, id: \.self) { col in
                        let idx = row * cols + col
                        TileCell(
                            image:      img,
                            gridIdx:    idx,
                            cols:       cols,
                            rows:       rows,
                            cardW:      cardWidth,
                            cardH:      cardHeight,
                            isRevealed: revealed.contains(idx)
                        )
                    }
                }
            }
        }
        .background(Color(hex: "#0A0A0F"))
        .frame(width: cardWidth, height: cardHeight)
    }

    // MARK: - Poster fetch

    private func loadPoster() async {
        guard let urlStr = item.posterURL,
              let url    = URL(string: urlStr) else { return }
        guard let img = await ArtworkCache.shared.fetchAndCache(url: url, headers: item.posterHeaders) else { return }
        posterImage = img
        tileOrder   = makeShuffledOrder(seed: item.torrent.hash)
    }

    private func makeShuffledOrder(seed: String) -> [Int] {
        var state = UInt64(bitPattern: Int64(seed.hashValue)) ^ 0x9E3779B97F4A7C15
        func rand() -> UInt64 {
            state ^= state >> 12; state ^= state << 25; state ^= state >> 27
            return state &* 0x2545F4914F6CDD1D
        }
        var arr = Array(0..<total)
        for i in stride(from: total - 1, through: 1, by: -1) {
            arr.swapAt(i, Int(rand() % UInt64(i + 1)))
        }
        return arr
    }

    // MARK: - Pause overlay

    @ViewBuilder
    private var pauseOverlay: some View {
        if item.torrent.isPaused {
            Circle()
                .fill(.black.opacity(0.45))
                .frame(width: 44, height: 44)
                .overlay {
                    Image(systemName: "play.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(.white)
                        .offset(x: 2)
                }
        }
    }
}

// MARK: - Comet border (isolated state so animation survives parent re-renders)

struct CometBorder: View {
    let colors:       [Color]
    let perimeter:    CGFloat
    var cornerRadius: CGFloat = 12

    @State private var phase: CGFloat = 0

    private var gradient: AngularGradient {
        AngularGradient(
            colors: colors + [colors[0]],
            center: .center,
            startAngle: .degrees(0),
            endAngle:   .degrees(360)
        )
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(gradient.opacity(0.25),
                        style: StrokeStyle(lineWidth: 10, lineCap: .round,
                                           dash: [perimeter * 0.14, perimeter * 0.86],
                                           dashPhase: phase))
                .blur(radius: 5)
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(gradient.opacity(0.6),
                        style: StrokeStyle(lineWidth: 6, lineCap: .round,
                                           dash: [perimeter * 0.05, perimeter * 0.95],
                                           dashPhase: phase))
                .blur(radius: 3)
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(gradient.opacity(0.2),
                        style: StrokeStyle(lineWidth: 2, lineCap: .round,
                                           dash: [perimeter * 0.16, perimeter * 0.84],
                                           dashPhase: phase))
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(gradient,
                        style: StrokeStyle(lineWidth: 2, lineCap: .round,
                                           dash: [perimeter * 0.09, perimeter * 0.91],
                                           dashPhase: phase))
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(gradient,
                        style: StrokeStyle(lineWidth: 3, lineCap: .round,
                                           dash: [perimeter * 0.03, perimeter * 0.97],
                                           dashPhase: phase))
        }
        .onAppear {
            withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                phase = perimeter
            }
        }
    }
}

// MARK: - Tile flip card

private struct TileCell: View {
    let image:      UIImage
    let gridIdx:    Int
    let cols:       Int
    let rows:       Int
    let cardW:      CGFloat
    let cardH:      CGFloat
    let isRevealed: Bool

    @State private var rotY:     Double = 0
    @State private var revealed: Bool   = false

    private var tileW: CGFloat { cardW / CGFloat(cols) }
    private var tileH: CGFloat { cardH / CGFloat(rows) }
    private var col:   Int     { gridIdx % cols }
    private var row:   Int     { gridIdx / cols }

    private var flipSpeed: Double { 0.5 + tileHash(gridIdx)   * 1.5 }
    private var flipDelay: Double { tileHash(gridIdx + 500)   * 2.0 }

    var body: some View {
        ZStack {
            if revealed {
                posterFragment.transition(.opacity)
            } else {
                ZStack {
                    Rectangle()
                        .fill(Color(hex: "#0D0D1A"))
                        .opacity(showingBack ? 1 : 0)
                    posterFragment
                        .rotation3DEffect(.degrees(180), axis: (0, 1, 0))
                        .opacity(showingBack ? 0 : 1)
                }
                .rotation3DEffect(.degrees(rotY), axis: (0, 1, 0))
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: revealed)
        .frame(width: tileW, height: tileH)
        .onAppear {
            startFlipping()
            if isRevealed {
                DispatchQueue.main.asyncAfter(deadline: .now() + flipDelay + flipSpeed) {
                    revealed = true
                }
            }
        }
        .onChange(of: isRevealed) { _, newValue in
            if newValue { revealed = true }
        }
    }

    private var showingBack: Bool {
        let a = rotY.truncatingRemainder(dividingBy: 360)
        let n = a < 0 ? a + 360 : a
        return n < 90 || n > 270
    }

    private var posterFragment: some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(width: cardW, height: cardH)
            .offset(x: -CGFloat(col) * tileW, y: -CGFloat(row) * tileH)
            .frame(width: tileW, height: tileH, alignment: .topLeading)
            .clipped()
    }

    private func startFlipping() {
        DispatchQueue.main.asyncAfter(deadline: .now() + flipDelay) {
            guard !revealed else { return }
            withAnimation(.easeInOut(duration: flipSpeed).repeatForever(autoreverses: true)) {
                rotY = 180
            }
        }
    }

    private func tileHash(_ idx: Int) -> Double {
        var x = UInt32(truncatingIfNeeded: idx &* 2246822519 &+ 374761393)
        x = ((x << 17) | (x >> 15)) &* 668265263
        x ^= x >> 15; x &*= 2246822519
        x ^= x >> 13; x &*= 3266489917
        x ^= x >> 16
        return Double(x) / Double(UInt32.max)
    }
}

// MARK: - Torrent Detail Sheet

struct TorrentDetailSheet: View {
    let item:     EnrichedQBTorrent
    let onPause:  () -> Void
    let onResume: () -> Void
    let onDelete: (_ deleteFiles: Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var posterImage:      UIImage? = nil
    @State private var showDeleteConfirm = false

    private var torrent: QBTorrentItem { item.torrent }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#0A0A0F").ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 0) {

                        // MARK: Header — large poster + stats side by side
                        HStack(alignment: .top, spacing: 16) {
                            // Poster
                            Group {
                                if let img = posterImage {
                                    Image(uiImage: img).resizable().scaledToFill()
                                } else {
                                    Color.white.opacity(0.06)
                                        .overlay {
                                            Image(systemName: "film")
                                                .font(.system(size: 28, weight: .thin))
                                                .foregroundStyle(.white.opacity(0.2))
                                        }
                                }
                            }
                            .frame(width: 150, height: 225)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                            // Title + status + stats
                            VStack(alignment: .leading, spacing: 10) {
                                Text(item.title)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .lineLimit(3)

                                Text(torrent.statusLabel)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(stateColor)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(stateColor.opacity(0.15), in: Capsule())

                                Divider().opacity(0.1)

                                inlineStat(label: "↓", value: torrent.dlSpeed > 0 ? "\(formatBytes(torrent.dlSpeed))/s" : "—", color: Color(hex: "#00E5A0"))
                                inlineStat(label: "↑", value: torrent.upSpeed > 0 ? "\(formatBytes(torrent.upSpeed))/s" : "—", color: Color(hex: "#7B8CDE"))
                                inlineStat(label: "ETA", value: torrent.etaFormatted, color: .white)
                                inlineStat(label: "Size", value: formatBytes(torrent.size), color: .white)

                                Spacer(minLength: 0)

                                // Progress bar at bottom of stats column
                                VStack(spacing: 4) {
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 3).fill(Color.white.opacity(0.08))
                                            RoundedRectangle(cornerRadius: 3).fill(stateColor)
                                                .frame(width: geo.size.width * torrent.progress)
                                        }
                                    }
                                    .frame(height: 5)
                                    Text(String(format: "%.1f%%", torrent.progress * 100))
                                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(.white.opacity(0.6))
                                        .frame(maxWidth: .infinity, alignment: .trailing)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 20)

                        Divider().opacity(0.1)

                        // MARK: Extra stats
                        VStack(spacing: 0) {
                            statRow(label: "Added", value: addedDateFormatted)
                        }
                        .padding(.vertical, 4)

                        Divider().opacity(0.1)

                        // MARK: File name
                        VStack(alignment: .leading, spacing: 6) {
                            Text("File")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(.white.opacity(0.35))
                            Text(torrent.name)
                                .font(.system(size: 13))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)

                        Divider().opacity(0.1)

                        // MARK: Action buttons
                        VStack(spacing: 10) {
                            // Pause / Resume
                            Button {
                                if torrent.isPaused { onResume() } else { onPause() }
                                dismiss()
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: torrent.isPaused ? "play.circle.fill" : "pause.circle.fill")
                                        .font(.system(size: 17))
                                    Text(torrent.isPaused ? "Resume" : "Pause")
                                        .font(.system(size: 15, weight: .semibold))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color(hex: "#A855F7").opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#A855F7").opacity(0.4), lineWidth: 1))
                            }
                            .buttonStyle(.plain)

                            // Delete
                            Button { showDeleteConfirm = true } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "trash.circle.fill").font(.system(size: 17))
                                    Text("Delete").font(.system(size: 15, weight: .semibold))
                                }
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color(hex: "#FF4757").opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#FF4757").opacity(0.4), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 20)
                        .padding(.bottom, 32)
                    }
                }
            }
            .navigationTitle("Torrent Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Delete torrent?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Remove torrent only", role: .destructive) {
                    onDelete(false); dismiss()
                }
                Button("Remove and delete files", role: .destructive) {
                    onDelete(true); dismiss()
                }
                Button("Cancel", role: .cancel) {}
            }
        }
        .task { await loadPoster() }
    }

    // MARK: - Helpers

    private var stateColor: Color {
        switch torrent.state {
        case "downloading", "forcedDL", "metaDL":               return Color(hex: "#00E5A0")
        case "stalledDL", "stalledUP", "error", "missingFiles": return Color(hex: "#FF6B6B")
        case "uploading", "forcedUP", "pausedUP":               return Color(hex: "#7B8CDE")
        default:                                                 return Color.white.opacity(0.4)
        }
    }

    private var addedDateFormatted: String {
        guard torrent.addedOn > 0 else { return "—" }
        let date = Date(timeIntervalSince1970: TimeInterval(torrent.addedOn))
        let f = DateFormatter()
        f.dateStyle = .medium; f.timeStyle = .short
        return f.string(from: date)
    }

    private func inlineStat(label: String, value: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.4))
                .frame(width: 30, alignment: .leading)
            Text(value)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(color)
                .lineLimit(1)
        }
    }

    private func statRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.5))
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func loadPoster() async {
        guard let urlStr = item.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url, headers: item.posterHeaders)
    }
}
