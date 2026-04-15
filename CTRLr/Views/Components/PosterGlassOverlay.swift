import SwiftUI

// MARK: - Tilt amplification (used by touch-interactive poster cards)

/// Maps a raw –0.5…+0.5 normalised offset to a –1…+1 tilt value using tanh.
func amplifiedTilt(normX: CGFloat, normY: CGFloat) -> CGSize {
    let amp: CGFloat = 0.3
    return CGSize(
        width:  tanh(normX * amp * 2),
        height: tanh(normY * amp * 2)
    )
}

// MARK: - PosterGlassOverlay
//
// Apple TV-style glass surface effect for poster cards.
// Pass tilt (–1…+1 on each axis) to make the sheen react to card lean.
// Use tilt = .zero for static contexts (download queue cards, widgets).

struct PosterGlassOverlay: View {
    var tilt:         CGSize = .zero
    var cornerRadius: CGFloat = 10

    var body: some View {
        ZStack {
            topGloss
            sheenH
            sheenV
            vignette
        }
    }

    // Sharp edge-catch at the top
    private var topGloss: some View {
        LinearGradient(
            colors: [.white.opacity(0.11), .clear],
            startPoint: .top,
            endPoint:   UnitPoint(x: 0.5, y: 0.25)
        )
    }

    // Horizontal specular band — moves with tilt.width, invisible at rest
    private var sheenH: some View {
        let bandX = 0.5 - tilt.width  * 0.45
        let peak  = Double(abs(tilt.width)) * 0.58
        return LinearGradient(
            stops: [
                .init(color: .clear,               location: max(0, bandX - 0.08)),
                .init(color: .white.opacity(peak), location: bandX),
                .init(color: .clear,               location: min(1, bandX + 0.08)),
            ],
            startPoint: .leading,
            endPoint:   .trailing
        )
    }

    // Vertical specular band — moves with tilt.height, invisible at rest
    private var sheenV: some View {
        let bandY = 0.5 - tilt.height * 0.35
        let peak  = Double(abs(tilt.height)) * 0.36
        return LinearGradient(
            stops: [
                .init(color: .clear,               location: max(0, bandY - 0.08)),
                .init(color: .white.opacity(peak), location: bandY),
                .init(color: .clear,               location: min(1, bandY + 0.08)),
            ],
            startPoint: .top,
            endPoint:   .bottom
        )
    }

    // Light bottom vignette
    private var vignette: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(LinearGradient(
                stops: [
                    .init(color: .clear,               location: 0.65),
                    .init(color: .black.opacity(0.12), location: 1.00),
                ],
                startPoint: .top, endPoint: .bottom
            ))
    }
}

// MARK: - Card thickness

extension View {
    /// Simulates the card resting on a frosted-glass block — the edge layers are bright
    /// and translucent, like the side face of a glass material seen against a dark background.
    /// Inner layer (closest to card face) is brightest; outer is slightly dimmer.
    func cardThickness(cornerRadius: CGFloat = 10) -> some View {
        self.background(
            ZStack {
                // Outer edge — deeper into the glass, slightly dimmer
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color.white.opacity(0.25))
                    .offset(x: 2, y: 6)
                // Inner edge — closest to card face, brightest
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color.white.opacity(0.40))
                    .offset(x: 1, y: 3)
            }
        )
    }
}

// MARK: - PosterBezel
//
// Angular-gradient stroke that simulates a physical glass-lens bezel —
// bright at the top-left (light source) and dark at the bottom-right.

struct PosterBezel: View {
    var cornerRadius: CGFloat = 10
    var lineWidth:    CGFloat = 2

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .strokeBorder(
                AngularGradient(
                    stops: [
                        .init(color: .white.opacity(0.15), location: 0.00),
                        .init(color: .white.opacity(0.75), location: 0.08),
                        .init(color: .white.opacity(0.35), location: 0.25),
                        .init(color: .black.opacity(0.35), location: 0.55),
                        .init(color: .black.opacity(0.55), location: 0.72),
                        .init(color: .white.opacity(0.22), location: 0.90),
                        .init(color: .white.opacity(0.15), location: 1.00),
                    ],
                    center: .center
                ),
                lineWidth: lineWidth
            )
    }
}
