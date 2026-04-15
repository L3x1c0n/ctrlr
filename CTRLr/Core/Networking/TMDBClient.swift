import Foundation

// MARK: - TMDBClient
//
// Lightweight client for TMDB API v3.
// Currently used for:
//   • Watch providers (streaming availability) per movie/TV show
//
// API key stored in CredentialStore under .tmdb:
//   apiKey  → v3 API key (32-char hex)

actor TMDBClient {
    static let shared = TMDBClient()

    private let base    = "https://api.themoviedb.org/3"
    private let region  = "US"

    // In-memory cache: "movie-123" → [StreamingProvider]
    private var providerCache: [String: [StreamingProvider]] = [:]

    private var apiKey: String {
        CredentialStore.shared.load(.tmdb).apiKey
    }

    private init() {}

    // MARK: - Watch providers

    /// Returns the flat-rate / subscription streaming providers for a title.
    /// Results are cached in memory for the lifetime of the app session.
    func watchProviders(tmdbId: Int, mediaType: String) async -> [StreamingProvider] {
        let cacheKey = "\(mediaType)-\(tmdbId)"
        if let cached = providerCache[cacheKey] { return cached }

        let key = apiKey
        guard !key.isEmpty else { return [] }

        let path = mediaType == "movie"
            ? "/movie/\(tmdbId)/watch/providers"
            : "/tv/\(tmdbId)/watch/providers"

        guard let url = URL(string: "\(base)\(path)?api_key=\(key)") else { return [] }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let response  = try JSONDecoder().decode(WatchProvidersResponse.self, from: data)
            let providers = (response.results[region]?.flatrate ?? [])
                .sorted { $0.display_priority < $1.display_priority }
                .map { StreamingProvider(id: $0.provider_id, name: $0.provider_name, logoPath: $0.logo_path) }
            providerCache[cacheKey] = providers
            return providers
        } catch {
            return []
        }
    }

    // MARK: - Poster path

    /// Returns the TMDB poster path (e.g. "/abc123.jpg") for a given title.
    /// Results are cached for the app session.
    private var posterPathCache: [String: String] = [:]

    func posterPath(tmdbId: Int, mediaType: String) async -> String? {
        let cacheKey = "\(mediaType)-\(tmdbId)-poster"
        if let cached = posterPathCache[cacheKey] { return cached }

        let key = apiKey
        guard !key.isEmpty else { return nil }

        let path = mediaType == "movie"
            ? "/movie/\(tmdbId)?api_key=\(key)&fields=poster_path"
            : "/tv/\(tmdbId)?api_key=\(key)&fields=poster_path"

        guard let url = URL(string: "\(base)\(path)") else { return nil }

        struct PosterResponse: Decodable { let poster_path: String? }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let response  = try? JSONDecoder().decode(PosterResponse.self, from: data),
              let pp = response.poster_path
        else { return nil }

        posterPathCache[cacheKey] = pp
        return pp
    }

    // MARK: - Decodable shims

    private struct WatchProvidersResponse: Decodable {
        let results: [String: RegionProviders]
    }

    private struct RegionProviders: Decodable {
        let flatrate: [ProviderEntry]?
    }

    private struct ProviderEntry: Decodable {
        let provider_id:       Int
        let provider_name:     String
        let logo_path:         String
        let display_priority:  Int
    }
}
