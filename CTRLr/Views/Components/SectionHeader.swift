import SwiftUI

// MARK: - SectionHeader
//
// Standardised section header: gradient icon + title + inline service logo(s).
// Trailing content (e.g. speed readouts) is supplied via a ViewBuilder closure.

struct SectionHeader<Trailing: View>: View {
    let iconGradient: [Color]
    let title:        String
    var titleFont:    Font = .custom("Monaco", size: 20)
    let sources:      [ServiceSource]
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            // Service logo(s) on the left
            if !sources.isEmpty {
                HStack(spacing: 5) {
                    ForEach(sources, id: \.rawValue) { source in
                        SectionLogoMark(source: source)
                    }
                }
            }

            // Title with gradient fill
            Text(title)
                .font(titleFont)
                .foregroundStyle(
                    LinearGradient(
                        colors: iconGradient,
                        startPoint: .leading, endPoint: .trailing
                    )
                )

            Spacer(minLength: 0)

            trailing
        }
        .padding(.horizontal, 20)
    }
}

// Convenience init for headers with no trailing content
extension SectionHeader where Trailing == EmptyView {
    init(iconGradient: [Color], title: String, titleFont: Font = .custom("Monaco", size: 20), sources: [ServiceSource]) {
        self.iconGradient = iconGradient
        self.title        = title
        self.titleFont    = titleFont
        self.sources      = sources
        self.trailing     = EmptyView()
    }
}

// MARK: - SectionLogoMark
//
// Small logo with ambient glow for use inside section headers.

private struct SectionLogoMark: View {
    let source: ServiceSource

    private var logoSize: CGFloat { source == .qbittorrent ? 21 : 19 }

    var body: some View {
        ZStack {
            Circle()
                .fill(source.color.opacity(0.25))
                .blur(radius: 10)
                .frame(width: 28, height: 28)

            if UIImage(named: source.logoAssetName) != nil {
                Image(source.logoAssetName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: logoSize, height: logoSize)
                    .if(source == .plex) { view in
                        view
                            .padding(1.5)
                            .clipShape(Circle())
                            .overlay(Circle().strokeBorder(.white.opacity(0.25), lineWidth: 0.75))
                    }
            } else {
                Image(systemName: source.fallbackSymbol)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(source.color)
            }
        }
        .frame(width: 28, height: 28)
    }
}

// MARK: - View.if helper (scoped to this file)

private extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition { transform(self) } else { self }
    }
}
