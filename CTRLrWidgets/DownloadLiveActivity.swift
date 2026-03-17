import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Poster helper

/// Reads the poster JPEG from the shared app group container.
private func loadPoster(filename: String?) -> UIImage? {
    guard let filename else { return nil }
    guard let dir = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: "group.com.attakrit.CTRLr") else { return nil }
    let url = dir.appendingPathComponent(filename)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return UIImage(data: data)
}

// MARK: - Lock Screen / StandBy view

struct DownloadLiveActivityView: View {
    let state: DownloadActivityAttributes.ContentState

    private var poster: UIImage? { loadPoster(filename: state.posterFilename) }

    var body: some View {
        HStack(spacing: 12) {

            // Poster thumbnail — only shown when available
            if let img = poster {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 54, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6)
                            .strokeBorder(Color.white.opacity(0.15), lineWidth: 1)
                    )
            } else {
                // Placeholder when no poster
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.white.opacity(0.08))
                    .frame(width: 54, height: 80)
                    .overlay(
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 20, weight: .thin))
                            .foregroundStyle(Color(red: 0, green: 0.898, blue: 0.627).opacity(0.6))
                    )
            }

            // Info column
            VStack(alignment: .leading, spacing: 6) {
                // Title + count badge
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(state.torrentName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if state.activeCount > 1 {
                        Text("+\(state.activeCount - 1)")
                            .font(.system(size: 10))
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.12))
                            .frame(height: 5)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 0, green: 0.898, blue: 0.627),
                                             Color(red: 0, green: 0.518, blue: 1.0)],
                                    startPoint: .leading, endPoint: .trailing
                                )
                            )
                            .frame(width: max(geo.size.width * CGFloat(state.progress), 4), height: 5)
                    }
                }
                .frame(height: 5)

                // Speeds + ETA
                HStack(spacing: 10) {
                    speedLabel("arrow.down", formatSpeed(state.dlSpeed),
                               Color(red: 0, green: 0.898, blue: 0.627))
                    speedLabel("arrow.up",   formatSpeed(state.ulSpeed),
                               Color(red: 0.482, green: 0.549, blue: 0.871))
                    Spacer(minLength: 0)
                    Text(etaLabel(state.eta))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.4))
                    Text(String(format: "%.0f%%", state.progress * 100))
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(red: 0.039, green: 0.039, blue: 0.059))
    }

    private func speedLabel(_ icon: String, _ text: String, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 8, weight: .bold))
            Text(text).font(.system(size: 10, weight: .medium, design: .monospaced))
        }
        .foregroundStyle(color)
    }
}

// MARK: - Widget Configuration

struct DownloadLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DownloadActivityAttributes.self) { context in
            // Lock Screen / StandBy
            DownloadLiveActivityView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — poster in leading, speeds trailing, bar + eta at bottom
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        // Poster (small)
                        if let img = loadPoster(filename: context.state.posterFilename) {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 36, height: 54)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        } else {
                            Image(systemName: "arrow.down.circle.fill")
                                .font(.system(size: 18))
                                .foregroundStyle(Color(red: 0, green: 0.898, blue: 0.627))
                                .frame(width: 36, height: 54)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.state.torrentName)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(.white)
                                .lineLimit(2)
                            Text(context.state.status)
                                .font(.system(size: 10))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 4) {
                        diSpeed("arrow.down", formatSpeed(context.state.dlSpeed))
                        diSpeed("arrow.up",   formatSpeed(context.state.ulSpeed))
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.white.opacity(0.12))
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color(red: 0, green: 0.898, blue: 0.627))
                                    .frame(width: max(geo.size.width * CGFloat(context.state.progress), 2))
                            }
                        }
                        .frame(height: 4)
                        HStack {
                            Text(etaLabel(context.state.eta))
                            Spacer()
                            Text(String(format: "%.0f%%", context.state.progress * 100))
                        }
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.45))
                    }
                    .padding(.horizontal, 4)
                    .padding(.bottom, 4)
                }
            } compactLeading: {
                HStack(spacing: 3) {
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(Color(red: 0, green: 0.898, blue: 0.627))
                    Text(formatSpeed(context.state.dlSpeed))
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white)
                }
            } compactTrailing: {
                Text(String(format: "%.0f%%", context.state.progress * 100))
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Color(red: 0, green: 0.898, blue: 0.627))
            } minimal: {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.15), lineWidth: 2)
                    Circle()
                        .trim(from: 0, to: CGFloat(context.state.progress))
                        .stroke(Color(red: 0, green: 0.898, blue: 0.627),
                                style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
            }
        }
    }

    @ViewBuilder
    private func diSpeed(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 2) {
            Image(systemName: icon).font(.system(size: 8, weight: .bold))
            Text(text).font(.system(size: 10, design: .monospaced))
        }
        .foregroundStyle(.white.opacity(0.7))
    }
}

// MARK: - Formatters

private func formatSpeed(_ bytesPerSec: Int) -> String {
    let kb = bytesPerSec / 1024
    if kb < 1024 { return "\(kb) KB/s" }
    return String(format: "%.1f MB/s", Double(kb) / 1024)
}

private func etaLabel(_ seconds: Int) -> String {
    guard seconds > 0, seconds < 360_000 else { return "—" }
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    let s = seconds % 60
    if h > 0 { return String(format: "%dh %02dm", h, m) }
    if m > 0 { return String(format: "%dm %02ds", m, s) }
    return "\(s)s"
}
