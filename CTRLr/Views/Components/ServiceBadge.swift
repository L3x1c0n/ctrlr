import SwiftUI

// MARK: - ServiceBadge
//
// Logo-only badge with a coloured ambient glow behind it.
// PNG asset (logo_<service>) is used when available; falls back to SF Symbol.

struct ServiceBadge: View {
    let source: ServiceSource

    var body: some View {
        ZStack {
            // Ambient glow — soft radial bloom in the service's brand colour
            Circle()
                .fill(source.color.opacity(0.25))
                .blur(radius: 10)
                .frame(width: 28, height: 28)

            logoIcon
        }
        .frame(width: 28, height: 28)
    }

    @ViewBuilder
    private var logoIcon: some View {
        if UIImage(named: source.logoAssetName) != nil {
            let size: CGFloat = source == .qbittorrent ? 21 : 19
            let img = Image(source.logoAssetName)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
            if source == .plex {
                img
                    .padding(2)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(.white.opacity(0.28), lineWidth: 1))
            } else {
                img
            }
        } else {
            Image(systemName: source.fallbackSymbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(source.color)
        }
    }
}

// MARK: - ServiceSource extensions for badge rendering

extension ServiceSource {
    /// Asset name to look up in xcassets (add the PNG there to use a real logo).
    var logoAssetName: String { "logo_\(rawValue)" }

    /// SF Symbol used when no PNG asset is found.
    var fallbackSymbol: String {
        switch self {
        case .plex:        return "play.fill"
        case .qbittorrent: return "arrow.down.circle.fill"
        case .radarr:      return "film.fill"
        case .sonarr:      return "tv.fill"
        case .overseerr:   return "person.crop.circle.badge.plus"
        case .tautulli:    return "chart.bar.fill"
        }
    }
}

// MARK: - Preview

#Preview {
    HStack(spacing: 16) {
        ServiceBadge(source: .plex)
        ServiceBadge(source: .qbittorrent)
        ServiceBadge(source: .radarr)
        ServiceBadge(source: .sonarr)
    }
    .padding()
    .background(Color(hex: "#0A0A0F"))
}
