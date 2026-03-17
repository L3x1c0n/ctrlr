import SwiftUI

// MARK: - GlassCard container

struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = 20
    var tint: Color = .clear
    let content: () -> Content

    var body: some View {
        content()
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(.ultraThinMaterial)
            )
            .glassEffect(
                tint == .clear
                    ? .regular
                    : .regular.tint(tint.opacity(0.25)),
                in: RoundedRectangle(cornerRadius: cornerRadius)
            )
            .hoverEffect(.automatic) // pointer/trackpad lift on Magic Keyboard
    }
}

// MARK: - View modifier convenience

extension View {
    func glassCard(cornerRadius: CGFloat = 20, tint: Color = .clear) -> some View {
        GlassCard(cornerRadius: cornerRadius, tint: tint) { self }
    }
}
