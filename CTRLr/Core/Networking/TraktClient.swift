import Foundation
import AuthenticationServices

// MARK: - TraktClient
//
// Handles OAuth 2.0 authorization via ASWebAuthenticationSession.
// Token storage layout in ServiceConfig:
//   apiKey   → access_token
//   username → refresh_token
//   baseURL  → expiry (seconds since 1970, as String)
//   enabled  → true when authenticated

@MainActor
final class TraktClient: ObservableObject {
    @Published var isConnected: Bool = false

    // Trakt API constants — embedded so no Info.plist secret is needed
    private let clientID     = "2492f3c406259a29b58822420cf532f96580c3f55ae32b3474edf058a1dfb7aa"
    private let clientSecret = "914999a9417ac72fdc5d05a5cbd6e842bd589e77269a2daf82037dc6c6af7623"
    private let redirectURI  = "ctrlr://trakt/callback"

    private let authBase = "https://trakt.tv"
    let apiBase          = "https://api.trakt.tv"

    private let anchor = PresentationAnchor()

    init() {
        let cfg = CredentialStore.shared.load(.trakt)
        isConnected = cfg.enabled && !cfg.apiKey.isEmpty
    }

    // MARK: - OAuth connect

    /// Launches the Trakt authorization page via `ASWebAuthenticationSession`.
    /// Exchanges the returned code for tokens and persists them to Keychain.
    func connect() async throws {
        var comps = URLComponents(string: "\(authBase)/oauth/authorize")!
        comps.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id",     value: clientID),
            URLQueryItem(name: "redirect_uri",  value: redirectURI),
        ]
        guard let authURL = comps.url else { throw TraktError.badURL }

        let code: String = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "ctrlr"
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard
                    let url   = callbackURL,
                    let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
                    let code  = comps.queryItems?.first(where: { $0.name == "code" })?.value
                else {
                    continuation.resume(throwing: TraktError.noCode)
                    return
                }
                continuation.resume(returning: code)
            }
            session.presentationContextProvider = anchor
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }

        try await exchangeCode(code)
    }

    // MARK: - Disconnect

    func disconnect() {
        CredentialStore.shared.save(ServiceConfig(), for: .trakt)
        isConnected = false
    }

    // MARK: - Token exchange

    private func exchangeCode(_ code: String) async throws {
        struct TokenRequest: Encodable {
            let code, client_id, client_secret, redirect_uri, grant_type: String
        }
        let body = TokenRequest(
            code:          code,
            client_id:     clientID,
            client_secret: clientSecret,
            redirect_uri:  redirectURI,
            grant_type:    "authorization_code"
        )
        let tokens = try await postTokenRequest(body)
        persist(tokens)
    }

    // MARK: - Token refresh

    /// Refreshes the access token if it expires within the next 7 days.
    func refreshTokenIfNeeded() async throws {
        let cfg = CredentialStore.shared.load(.trakt)
        guard cfg.enabled, !cfg.username.isEmpty else { return }

        let expiry = TimeInterval(cfg.baseURL) ?? 0
        let sevenDaysFromNow = Date().addingTimeInterval(7 * 86_400).timeIntervalSince1970
        guard sevenDaysFromNow > expiry else { return }

        struct RefreshRequest: Encodable {
            let refresh_token, client_id, client_secret, redirect_uri, grant_type: String
        }
        let body = RefreshRequest(
            refresh_token: cfg.username,
            client_id:     clientID,
            client_secret: clientSecret,
            redirect_uri:  redirectURI,
            grant_type:    "refresh_token"
        )
        let tokens = try await postTokenRequest(body)
        persist(tokens)
    }

    // MARK: - Shared token endpoint

    private struct TokenResponse: Decodable {
        let access_token: String
        let refresh_token: String
        let expires_in: Int
    }

    private func postTokenRequest<Body: Encodable>(_ body: Body) async throws -> TokenResponse {
        var req = URLRequest(url: URL(string: "\(apiBase)/oauth/token")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw TraktError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }

    private func persist(_ tokens: TokenResponse) {
        let expiry = Date().addingTimeInterval(TimeInterval(tokens.expires_in))
        let config = ServiceConfig(
            baseURL:  String(expiry.timeIntervalSince1970),
            apiKey:   tokens.access_token,
            username: tokens.refresh_token,
            enabled:  true
        )
        CredentialStore.shared.save(config, for: .trakt)
        isConnected = true
    }

    // MARK: - Authorized request headers

    /// Returns headers for an authenticated Trakt API call, or nil if not connected.
    func authorizedHeaders() -> [String: String]? {
        let cfg = CredentialStore.shared.load(.trakt)
        guard cfg.enabled, !cfg.apiKey.isEmpty else { return nil }
        return [
            "Content-Type":      "application/json",
            "trakt-api-version": "2",
            "trakt-api-key":     clientID,
            "Authorization":     "Bearer \(cfg.apiKey)",
        ]
    }

    /// Convenience: perform an authenticated GET and decode the response.
    func get<T: Decodable>(_ path: String) async throws -> T {
        guard let headers = authorizedHeaders() else { throw TraktError.notAuthenticated }
        var req = URLRequest(url: URL(string: "\(apiBase)\(path)")!)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            // Token expired — try refresh once then retry
            try await refreshTokenIfNeeded()
            if let newHeaders = authorizedHeaders() {
                var retry = URLRequest(url: URL(string: "\(apiBase)\(path)")!)
                newHeaders.forEach { retry.setValue($1, forHTTPHeaderField: $0) }
                let (retryData, _) = try await URLSession.shared.data(for: retry)
                return try JSONDecoder().decode(T.self, from: retryData)
            }
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Watchlist sync

    /// Adds shows (by TVDB ID) to the user's Trakt watchlist.
    /// Returns the number of shows successfully added.
    func syncShowsToWatchlist(tvdbIds: [Int]) async throws -> Int {
        guard let headers = authorizedHeaders() else { throw TraktError.notAuthenticated }

        struct SyncBody: Encodable {
            struct Show: Encodable {
                struct IDs: Encodable { let tvdb: Int }
                let ids: IDs
            }
            let shows: [Show]
        }

        let body = SyncBody(shows: tvdbIds.map { .init(ids: .init(tvdb: $0)) })
        var req = URLRequest(url: URL(string: "\(apiBase)/sync/watchlist")!)
        req.httpMethod = "POST"
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw TraktError.httpError(http.statusCode)
        }

        struct SyncResponse: Decodable {
            struct Added: Decodable { let shows: Int }
            let added: Added
        }
        let result = try JSONDecoder().decode(SyncResponse.self, from: data)
        return result.added.shows
    }

    // MARK: - Calendar

    // Wire models
    private struct TraktShowCalendarItem: Decodable {
        let first_aired: String
        let episode:     TraktEpisode
        let show:        TraktShow
    }
    private struct TraktEpisode: Decodable {
        let season:   Int
        let number:   Int
        let title:    String?
        let overview: String?
        let ids:      TraktIDs
    }
    private struct TraktShow: Decodable {
        let title: String
        let ids:   TraktIDs
    }
    private struct TraktMovieCalendarItem: Decodable {
        let released: String
        let movie:    TraktMovie
    }
    private struct TraktMovie: Decodable {
        let title: String
        let ids:   TraktIDs
    }
    private struct TraktIDs: Decodable {
        let tmdb: Int?
    }

    /// Fetches the Trakt calendar for the next 30 days (7 days back → 30 days forward)
    /// and returns items mapped to `UpcomingItem` with `source: .trakt`.
    func fetchUpcoming() async -> [UpcomingItem] {
        guard isConnected else { return [] }

        // Start 7 days ago to match the visible range in UpcomingSection
        let startDate: String = {
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd"
            df.locale = Locale(identifier: "en_US_POSIX")
            return df.string(from: Date().addingTimeInterval(-7 * 86_400))
        }()

        let isoFull = ISO8601DateFormatter()
        isoFull.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoBasic = ISO8601DateFormatter()
        isoBasic.formatOptions = [.withInternetDateTime]
        let dateOnly: DateFormatter = {
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd"
            df.locale = Locale(identifier: "en_US_POSIX")
            return df
        }()

        let shows: [TraktShowCalendarItem]
        let movies: [TraktMovieCalendarItem]
        do {
            async let showsTask:  [TraktShowCalendarItem]  = get("/calendars/my/shows/\(startDate)/37")
            async let moviesTask: [TraktMovieCalendarItem] = get("/calendars/my/movies/\(startDate)/37")
            shows  = try await showsTask
            movies = try await moviesTask
        } catch {
            print("[TraktClient] fetchUpcoming error: \(error)")
            return []
        }

        var items: [UpcomingItem] = []

        for item in shows {
            let airDate: Date
            if      let d = isoFull.date(from: item.first_aired)  { airDate = d }
            else if let d = isoBasic.date(from: item.first_aired)  { airDate = d }
            else { continue }

            let s        = item.episode.season
            let e        = item.episode.number
            let subtitle = "S\(String(format: "%02d", s))E\(String(format: "%02d", e))"
                + (item.episode.title.map { " · \($0)" } ?? "")
            items.append(UpcomingItem(
                id:          "trakt-show-\(item.show.ids.tmdb ?? 0)-s\(s)e\(e)",
                title:       item.show.title,
                subtitle:    subtitle,
                overview:    item.episode.overview,
                mediaType:   .tv,
                airDate:     airDate,
                releaseType: "Airing",
                hasFile:     false,
                source:      .trakt,
                posterURL:   nil,
                tmdbId:      item.show.ids.tmdb
            ))
        }

        for item in movies {
            guard let airDate = dateOnly.date(from: item.released) else { continue }
            items.append(UpcomingItem(
                id:          "trakt-movie-\(item.movie.ids.tmdb ?? 0)",
                title:       item.movie.title,
                subtitle:    nil,
                overview:    nil,
                mediaType:   .movie,
                airDate:     airDate,
                releaseType: "Release",
                hasFile:     false,
                source:      .trakt,
                posterURL:   nil,
                tmdbId:      item.movie.ids.tmdb
            ))
        }

        return items
    }
}

// MARK: - PresentationAnchor

private final class PresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        if let scene {
            return ASPresentationAnchor(windowScene: scene)
        }
        return UIWindow(frame: .zero) // fallback — no active scene found
    }
}

// MARK: - TraktError

enum TraktError: LocalizedError {
    case noCode
    case badURL
    case notAuthenticated
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .noCode:             return "Authorization code not received from Trakt."
        case .badURL:             return "Could not build authorization URL."
        case .notAuthenticated:   return "Not authenticated with Trakt."
        case .httpError(let c):   return "Trakt API error (HTTP \(c))."
        }
    }
}
