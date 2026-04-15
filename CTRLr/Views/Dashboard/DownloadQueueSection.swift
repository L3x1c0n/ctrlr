import SwiftUI

// MARK: - DownloadQueueSection

struct DownloadQueueSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @AppStorage("sectionLightTint_downloads") private var tintHex = "#00E5A0"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {

            // Section header — icon + title + logo + speeds inline
            SectionHeader(
                iconGradient: [Color(hex: "#00E5A0"), Color(hex: "#0A84FF")],
                title:        "Downloads",
                sources:      dashVM.qbt.isConnected ? [.qbittorrent] : []
            ) {
                HStack(spacing: 10) {
                    inlineSpeed("arrow.down", formatBytes(dashVM.globalDL), Color(hex: "#00E5A0"))
                    inlineSpeed("arrow.up",   formatBytes(dashVM.globalUL), Color(hex: "#7B8CDE"))
                    SectionRefreshButton(isRefreshing: false) {
                        dashVM.qbt.startPolling()
                        Task {
                            await dashVM.radarr.refreshQueue()
                            await dashVM.sonarr.refreshQueue()
                        }
                    }
                }
            }

            if dashVM.activeDownloads.isEmpty {
                emptyState
                    .padding(.horizontal, 20)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(dashVM.enrichedDownloads.prefix(12)) { item in
                            DownloadQueueRow(
                                item:     item,
                                onPause:  { dashVM.qbt.pause(hash: item.torrent.hash) },
                                onResume: { dashVM.qbt.resume(hash: item.torrent.hash) },
                                onDelete: { deleteFiles in dashVM.qbt.delete(hash: item.torrent.hash, deleteFiles: deleteFiles) }
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
        .background(alignment: .bottom) {
            SpeedGraphView(
                dlHistory: dashVM.dlHistory,
                ulHistory: dashVM.ulHistory
            )
            .allowsHitTesting(false)
        }
        .glassCard(cornerRadius: 20, lightTint: Color(hex: tintHex), lightOnly: true)
    }

    private func inlineSpeed(_ icon: String, _ label: String, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 8, weight: .bold))
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
        }
        .foregroundStyle(color)
    }

    private var emptyState: some View {
        HStack {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: dashVM.qbt.isConnected ? "tray" : "wifi.slash")
                    .font(.system(size: 28, weight: .thin))
                    .foregroundStyle(.primary.opacity(0.2))
                Text(dashVM.qbt.isConnected
                     ? "No active downloads"
                     : (dashVM.qbt.error ?? "Connecting…"))
                    .font(.system(size: 13))
                    .foregroundStyle(.primary.opacity(0.3))
            }
            .padding(.vertical, 32)
            Spacer()
        }
        .glassCard(cornerRadius: 16)
    }
}

// MARK: - SpeedGraphView

struct SpeedGraphView: View {
    let dlHistory: [Int]
    let ulHistory: [Int]
    var dlColor: Color = Color(hex: "#00E5A0")
    var ulColor: Color = Color(hex: "#7B8CDE")

    @State private var pulseScale:  CGFloat = 1.0
    @State private var pulseFade:   Double  = 1.0
    @State private var scrollOffset: CGFloat = 0

    private var currentDL:   Int    { dlHistory.last ?? 0 }
    private var sessionPeak: Int    { max((dlHistory + ulHistory).max() ?? 1, 1) }
    private var speedFactor: Double {
        guard sessionPeak > 1 else { return 0 }
        return min(Double(currentDL) / Double(sessionPeak), 1.0)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {

                // Canvas: main curves + mirrored reflection + scan line
                Canvas { ctx, size in
                    let peak = sessionPeak
                    let sf   = speedFactor

                    // Main curves — brightness reacts to current speed vs session peak
                    drawSeries(ctx: ctx, size: size, values: dlHistory, peak: peak,
                               fill: dlColor,
                               fillAlpha: 0.07 + sf * 0.14,
                               lineAlpha: 0.20 + sf * 0.30)
                    drawSeries(ctx: ctx, size: size, values: ulHistory, peak: peak,
                               fill: ulColor,
                               fillAlpha: 0.05 + sf * 0.10,
                               lineAlpha: 0.14 + sf * 0.22)

                    // Mirrored reflection — same curves flipped around horizontal centre
                    var reflCtx = ctx
                    reflCtx.opacity = 0.035 + sf * 0.035
                    reflCtx.transform = CGAffineTransform(a: 1, b: 0, c: 0, d: -1,
                                                          tx: 0, ty: size.height)
                    drawSeries(ctx: reflCtx, size: size, values: dlHistory, peak: peak,
                               fill: dlColor, fillAlpha: 1.0, lineAlpha: 1.0)
                    drawSeries(ctx: reflCtx, size: size, values: ulHistory, peak: peak,
                               fill: ulColor, fillAlpha: 1.0, lineAlpha: 1.0)

                    // Vertical scan line at current leading edge
                    drawScanLine(ctx: ctx, size: size, peak: peak, sf: sf)
                }
                .offset(x: scrollOffset)
                .clipped()

                // Pulsing dot — must be SwiftUI layer (Canvas can't self-animate)
                pulsingDot(in: geo.size)
            }
        }
        .onChange(of: dlHistory.count) { _, _ in
            // Snap right by ~one step, then ease back — creates leftward flow illusion
            scrollOffset = 8
            withAnimation(.easeOut(duration: 0.5)) { scrollOffset = 0 }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                pulseScale = 2.2
                pulseFade  = 0
            }
        }
    }

    // MARK: - Pulsing dot overlay

    @ViewBuilder
    private func pulsingDot(in size: CGSize) -> some View {
        if dlHistory.count >= 2, let last = dlHistory.last {
            let peak = sessionPeak
            let x    = size.width
            let y    = size.height - CGFloat(last) / CGFloat(peak) * size.height * 0.85
            ZStack {
                // Expanding ring
                Circle()
                    .stroke(dlColor.opacity(pulseFade * 0.5), lineWidth: 1)
                    .frame(width: 12 * pulseScale, height: 12 * pulseScale)
                // Soft bloom halo
                Circle()
                    .fill(dlColor.opacity(0.12))
                    .frame(width: 16, height: 16)
                    .blur(radius: 5)
                // Solid core
                Circle()
                    .fill(dlColor)
                    .frame(width: 4, height: 4)
                    .shadow(color: dlColor, radius: 3)
            }
            .position(x: x, y: y)
        }
    }

    // MARK: - Canvas helpers

    private func drawScanLine(ctx: GraphicsContext, size: CGSize, peak: Int, sf: Double) {
        guard dlHistory.count >= 2, let last = dlHistory.last else { return }
        let x     = size.width
        let y     = size.height - CGFloat(last) / CGFloat(peak) * size.height * 0.85
        let alpha = 0.15 + sf * 0.30

        var path = Path()
        path.move(to: CGPoint(x: x, y: y))
        path.addLine(to: CGPoint(x: x, y: size.height))

        // Wide glow halo
        ctx.stroke(path,
                   with: .color(dlColor.opacity(alpha * 0.25)),
                   style: StrokeStyle(lineWidth: 8, lineCap: .round))
        // Tight core line
        ctx.stroke(path,
                   with: .color(dlColor.opacity(alpha)),
                   style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
    }

    private func drawSeries(ctx: GraphicsContext, size: CGSize,
                            values: [Int], peak: Int,
                            fill: Color, fillAlpha: Double, lineAlpha: Double) {
        guard values.count >= 2 else { return }

        let pts: [CGPoint] = values.enumerated().map { i, v in
            let x = CGFloat(i) / CGFloat(values.count - 1) * size.width
            let y = size.height - CGFloat(v) / CGFloat(peak) * size.height * 0.85
            return CGPoint(x: x, y: y)
        }

        // Smooth curve via cubic bezier control points
        var linePath = Path()
        linePath.move(to: pts[0])
        for i in 1..<pts.count {
            let p = pts[i - 1], q = pts[i]
            let cp1 = CGPoint(x: (p.x + q.x) / 2, y: p.y)
            let cp2 = CGPoint(x: (p.x + q.x) / 2, y: q.y)
            linePath.addCurve(to: q, control1: cp1, control2: cp2)
        }

        // Fill under the curve — vertical gradient: full color at the top, transparent at baseline.
        // More of the gradient shows when speeds are high (curve sits higher), less when idle.
        var fillPath = linePath
        fillPath.addLine(to: CGPoint(x: size.width, y: size.height))
        fillPath.addLine(to: CGPoint(x: 0,          y: size.height))
        fillPath.closeSubpath()
        ctx.fill(fillPath, with: .linearGradient(
            Gradient(stops: [
                .init(color: fill.opacity(fillAlpha),        location: 0.0),
                .init(color: fill.opacity(fillAlpha * 0.45), location: 0.55),
                .init(color: fill.opacity(0),                location: 1.0)
            ]),
            startPoint: CGPoint(x: 0, y: 0),
            endPoint:   CGPoint(x: 0, y: size.height)
        ))

        // Soft glow halo beneath the sharp line
        ctx.stroke(linePath, with: .color(fill.opacity(lineAlpha * 0.35)),
                   style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
        // Sharp line stroke
        ctx.stroke(linePath, with: .color(fill.opacity(lineAlpha)),
                   style: StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round))
    }
}

