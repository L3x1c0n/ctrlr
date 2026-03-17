import SwiftUI

// MARK: - PosterImageView

/// Async poster image with a shimmer placeholder while loading.
struct PosterImageView: View {
    let url:     URL?
    let headers: [String: String]
    var aspectRatio: CGFloat = 2/3   // width:height (poster = 2:3)

    @State private var image: UIImage? = nil
    @State private var loading = false

    init(url: URL?, headers: [String: String] = [:], aspectRatio: CGFloat = 2/3) {
        self.url         = url
        self.headers     = headers
        self.aspectRatio = aspectRatio
    }

    var body: some View {
        GeometryReader { geo in
            Group {
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else {
                    shimmer
                        .frame(width: geo.size.width, height: geo.size.height)
                }
            }
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
        .task(id: url) { await load() }
    }

    private var shimmer: some View {
        RoundedRectangle(cornerRadius: 0)
            .fill(Color.white.opacity(0.06))
            .overlay(
                LinearGradient(
                    colors: [.clear, .white.opacity(0.08), .clear],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
    }

    private func load() async {
        guard let url, image == nil, !loading else { return }
        loading = true
        image   = await ArtworkCache.shared.fetchAndCache(url: url, headers: headers)
        loading = false
    }
}
