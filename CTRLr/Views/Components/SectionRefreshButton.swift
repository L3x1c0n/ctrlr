import SwiftUI

// MARK: - SectionRefreshButton
//
// A small spinning arrow button for per-section manual refresh.
// Used in SectionHeader trailing slots.

struct SectionRefreshButton: View {
    let isRefreshing: Bool
    let action: () -> Void

    @State private var rotation: Double = 0

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isRefreshing ? Color(hex: "#00E5A0") : .white.opacity(0.55))
                .rotationEffect(.degrees(isRefreshing ? rotation : 0))
                .animation(
                    isRefreshing
                        ? .linear(duration: 0.7).repeatForever(autoreverses: false)
                        : .default,
                    value: isRefreshing
                )
        }
        .buttonStyle(.plain)
        .onChange(of: isRefreshing) {
            if isRefreshing { rotation = 360 }
        }
    }
}
