import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct QueueEntry: TimelineEntry {
    let date:     Date
    let snapshot: WidgetSnapshot?
}

// MARK: - Provider

struct QueueProvider: TimelineProvider {
    func placeholder(in context: Context) -> QueueEntry {
        QueueEntry(date: .now, snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (QueueEntry) -> Void) {
        completion(QueueEntry(date: .now, snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QueueEntry>) -> Void) {
        let entry      = QueueEntry(date: .now, snapshot: loadSnapshot())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: .now)!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func loadSnapshot() -> WidgetSnapshot? {
        guard let data = UserDefaults.shared.data(forKey: SharedDefaultsKey.widgetSnapshot),
              let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else { return nil }
        return snap
    }
}

// MARK: - Entry view dispatcher

struct QueueWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: QueueEntry

    var body: some View {
        switch family {
        case .systemSmall:          QueueSmallView(entry: entry)
        case .systemLarge:          QueueLargeView(entry: entry)
        case .systemExtraLarge:     QueueExtraLargeView(entry: entry)
        case .accessoryCircular:    QueueAccessoryCircular(entry: entry)
        case .accessoryRectangular: QueueAccessoryRectangular(entry: entry)
        case .accessoryInline:      QueueAccessoryInline(entry: entry)
        default:                    QueueMediumView(entry: entry)
        }
    }
}

// MARK: - Small: speed summary + active count

struct QueueSmallView: View {
    let entry: QueueEntry

    var body: some View {
        Group {
            if let snap = entry.snapshot {
                let active = snap.queueItems.filter { $0.status == "downloading" }
                VStack(alignment: .leading, spacing: 6) {
                    Label("Downloads", systemImage: "arrow.down.circle.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Spacer(minLength: 0)

                    Text("\(active.count)")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                    Text("active")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)

                    Spacer(minLength: 0)

                    HStack(spacing: 8) {
                        Label(formatBytes(snap.globalDL), systemImage: "arrow.down")
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(Color(red: 0, green: 0.898, blue: 0.627))
                        Label(formatBytes(snap.globalUL), systemImage: "arrow.up")
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(14)
            } else {
                emptyView("No data")
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Medium: top 4 torrents

struct QueueMediumView: View {
    let entry: QueueEntry

    var body: some View {
        Group {
            if let snap = entry.snapshot, !snap.queueItems.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(snap.queueItems.prefix(4)) { item in
                        QueueRow(item: item)
                        if item.id != snap.queueItems.prefix(4).last?.id {
                            Divider().opacity(0.2)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            } else {
                emptyView("No active downloads")
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Large: top 8 torrents

struct QueueLargeView: View {
    let entry: QueueEntry

    var body: some View {
        Group {
            if let snap = entry.snapshot, !snap.queueItems.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    speedHeader(snap: snap)
                        .padding(.horizontal, 14)
                        .padding(.top, 10)
                        .padding(.bottom, 6)
                    Divider().opacity(0.2).padding(.horizontal, 14)
                    ForEach(snap.queueItems.prefix(8)) { item in
                        QueueRow(item: item)
                            .padding(.horizontal, 14)
                        if item.id != snap.queueItems.prefix(8).last?.id {
                            Divider().opacity(0.2).padding(.horizontal, 14)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.bottom, 10)
            } else {
                emptyView("No active downloads")
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Extra Large: 2-column top 12

struct QueueExtraLargeView: View {
    let entry: QueueEntry

    var body: some View {
        Group {
            if let snap = entry.snapshot, !snap.queueItems.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    speedHeader(snap: snap)
                        .padding(.horizontal, 14)
                        .padding(.top, 10)
                        .padding(.bottom, 6)
                    Divider().opacity(0.2)
                    let items = Array(snap.queueItems.prefix(12))
                    let left  = items.enumerated().filter { $0.offset.isMultiple(of: 2) }.map(\.element)
                    let right = items.enumerated().filter { !$0.offset.isMultiple(of: 2) }.map(\.element)
                    HStack(alignment: .top, spacing: 0) {
                        VStack(spacing: 0) {
                            ForEach(left) { item in
                                QueueRow(item: item)
                                Divider().opacity(0.2)
                            }
                        }
                        Divider().opacity(0.2)
                        VStack(spacing: 0) {
                            ForEach(right) { item in
                                QueueRow(item: item)
                                Divider().opacity(0.2)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    Spacer(minLength: 0)
                }
                .padding(.bottom, 10)
            } else {
                emptyView("No active downloads")
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Shared row

private struct QueueRow: View {
    let item: WidgetQueueItem

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(item.title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(item.eta > 0 ? formatETA(item.eta) : item.status.capitalized)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.1))
                        .frame(height: 3)
                    Capsule().fill(progressTint(item.status))
                        .frame(width: geo.size.width * CGFloat(min(item.progress, 1)), height: 3)
                }
            }
            .frame(height: 3)
        }
        .padding(.vertical, 7)
    }
}

// MARK: - Speed header (large+)

private func speedHeader(snap: WidgetSnapshot) -> some View {
    HStack {
        Label(formatBytes(snap.globalDL), systemImage: "arrow.down")
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color(red: 0, green: 0.898, blue: 0.627))
        Label(formatBytes(snap.globalUL), systemImage: "arrow.up")
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundStyle(.secondary)
        Spacer()
        Text("\(snap.queueItems.count) item\(snap.queueItems.count == 1 ? "" : "s")")
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
    }
}

// MARK: - Empty state

private func emptyView(_ message: String) -> some View {
    Text(message)
        .font(.system(size: 12))
        .foregroundStyle(.tertiary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
}

// MARK: - Lock screen / StandBy accessories

struct QueueAccessoryCircular: View {
    let entry: QueueEntry

    var body: some View {
        if let snap = entry.snapshot {
            VStack(spacing: 1) {
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .widgetAccentable()
                Text("\(snap.queueItems.count)")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
            }
            .containerBackground(.fill, for: .widget)
        } else {
            Image(systemName: "arrow.down.circle")
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
                .containerBackground(.fill, for: .widget)
        }
    }
}

struct QueueAccessoryRectangular: View {
    let entry: QueueEntry

    var body: some View {
        if let snap = entry.snapshot {
            VStack(alignment: .leading, spacing: 3) {
                Label(formatBytes(snap.globalDL) + "/s  ↑ " + formatBytes(snap.globalUL) + "/s",
                      systemImage: "arrow.down.circle.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .widgetAccentable()
                if let top = snap.queueItems.first {
                    Text(top.title)
                        .font(.system(size: 11))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                Text("\(snap.queueItems.count) active")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
            .containerBackground(.fill, for: .widget)
        } else {
            Text("CTRLr — no data")
                .font(.system(size: 12))
                .containerBackground(.fill, for: .widget)
        }
    }
}

struct QueueAccessoryInline: View {
    let entry: QueueEntry

    var body: some View {
        if let snap = entry.snapshot {
            Label("\(snap.queueItems.count) downloads · \(formatBytes(snap.globalDL))/s",
                  systemImage: "arrow.down.circle.fill")
                .widgetAccentable()
        } else {
            Label("No downloads", systemImage: "arrow.down.circle")
        }
    }
}

// MARK: - Widget definition

struct QueueProgressWidget: Widget {
    let kind = "QueueProgressWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QueueProvider()) { entry in
            QueueWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Downloads")
        .description("Shows active qBittorrent downloads and transfer speeds.")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge, .systemExtraLarge,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
    }
}

// MARK: - Plex Recently Added Widget (large only)

struct PlexRecentWidget: Widget {
    let kind = "PlexRecentWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QueueProvider()) { entry in
            PlexPosterGridView(entry: entry)
        }
        .configurationDisplayName("Recently Added")
        .description("Poster grid of recently added movies and TV shows from Plex.")
        .supportedFamilies([.systemLarge])
    }
}

// MARK: - Poster grid view (last 6 recently added, movies + TV, no duplicates)

private struct PlexPosterGridView: View {
    let entry: QueueEntry

    private let cols:    Int     = 3
    private let spacing: CGFloat = 6
    private let bg = Color(red: 0.039, green: 0.039, blue: 0.059)

    private var items: [WidgetRecentItem] {
        Array((entry.snapshot?.recentItems ?? []).prefix(6))
    }

    private func fallbackSymbol(for item: WidgetRecentItem) -> String {
        item.mediaType == "movie" ? "film" : "tv"
    }

    var body: some View {
        GeometryReader { geo in
            let cardW = (geo.size.width  - spacing * CGFloat(cols - 1)) / CGFloat(cols)
            let cardH = cardW * 1.5
            let rows  = max(1, Int((geo.size.height + spacing) / (cardH + spacing)))

            if items.isEmpty {
                Text("No recently added")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.3))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: spacing) {
                    ForEach(0..<rows, id: \.self) { row in
                        HStack(spacing: spacing) {
                            ForEach(0..<cols, id: \.self) { col in
                                let idx = row * cols + col
                                if idx < items.count {
                                    let item = items[idx]
                                    ZStack {
                                        if let data = item.posterData, let img = UIImage(data: data) {
                                            Image(uiImage: img).resizable().scaledToFill()
                                        } else {
                                            Color.white.opacity(0.06)
                                                .overlay {
                                                    Image(systemName: fallbackSymbol(for: item))
                                                        .font(.system(size: 14, weight: .thin))
                                                        .foregroundStyle(.white.opacity(0.25))
                                                }
                                        }
                                        PosterGlassOverlay(cornerRadius: 8)
                                    }
                                    .frame(width: cardW, height: cardH)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .overlay { PosterBezel(cornerRadius: 8, lineWidth: 1.5) }
                                } else {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color.white.opacity(0.02))
                                        .frame(width: cardW, height: cardH)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(10)
        .containerBackground(for: .widget) {
            bg
        }
    }
}

// MARK: - Helpers

private func progressTint(_ status: String) -> Color {
    switch status {
    case "downloading": return Color(red: 0, green: 0.898, blue: 0.627)
    case "uploading":   return Color(red: 0.482, green: 0.549, blue: 0.871)
    case "error":       return Color(red: 1, green: 0.420, blue: 0.420)
    default:            return Color.white.opacity(0.4)
    }
}

private func formatBytes(_ bps: Int) -> String {
    let d = Double(bps)
    if d >= 1_000_000_000 { return String(format: "%.1fGB/s", d / 1_000_000_000) }
    if d >= 1_000_000     { return String(format: "%.1fMB/s", d / 1_000_000) }
    if d >= 1_000         { return String(format: "%.0fKB/s", d / 1_000) }
    return "0KB/s"
}

private func formatETA(_ seconds: Int) -> String {
    guard seconds > 0, seconds < 8_640_000 else { return "∞" }
    if seconds < 3600  { return "\(seconds / 60)m" }
    if seconds < 86400 { return "\(seconds / 3600)h \((seconds % 3600) / 60)m" }
    return "\(seconds / 86400)d"
}
