import SwiftUI

// MARK: - GlassCard container

struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = 20
    var tint:      Color = .clear   // applies in both modes
    var lightTint: Color = .clear   // applies in light mode only — never affects dark
    var lightOnly: Bool  = false    // when true, renders nothing in dark mode (for section containers)
    let content: () -> Content

    @Environment(\.colorScheme) private var colorScheme

    private var activeTint: Color {
        colorScheme == .dark ? tint : (lightTint == .clear ? tint : lightTint)
    }

    var body: some View {
        if lightOnly && colorScheme == .dark {
            content()
        } else {
            content()
                .background(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .fill(.ultraThinMaterial)
                )
                .glassEffect(
                    activeTint == .clear
                        ? .regular
                        : .regular.tint(activeTint),
                    in: RoundedRectangle(cornerRadius: cornerRadius)
                )
                .hoverEffect(.automatic)
        }
    }
}

// MARK: - View modifier convenience

extension View {
    func glassCard(cornerRadius: CGFloat = 20, tint: Color = .clear, lightTint: Color = .clear, lightOnly: Bool = false) -> some View {
        GlassCard(cornerRadius: cornerRadius, tint: tint, lightTint: lightTint, lightOnly: lightOnly) { self }
    }
}
