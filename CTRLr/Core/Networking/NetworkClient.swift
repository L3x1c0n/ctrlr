import Foundation

// MARK: - NetworkError

enum NetworkError: Error, LocalizedError {
    case badURL
    case badResponse(Int)
    case decodingFailed(Error)
    case notConfigured

    var errorDescription: String? {
        switch self {
        case .badURL:              return "Invalid URL"
        case .badResponse(let c):  return "HTTP \(c)"
        case .decodingFailed(let e): return "Decode error: \(e.localizedDescription)"
        case .notConfigured:       return "Service not configured"
        }
    }
}

// MARK: - NetworkClient

final class NetworkClient {
    static let shared = NetworkClient()

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest  = 15
        cfg.timeoutIntervalForResource = 30
        return URLSession(configuration: cfg)
    }()

    private init() {}

    // MARK: JSON fetch

    func fetch<T: Decodable>(_ url: URL, headers: [String: String] = [:]) async throws -> T {
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, resp) = try await session.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw NetworkError.badResponse(http.statusCode)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw NetworkError.decodingFailed(error)
        }
    }

    // MARK: POST (form-encoded) — used by qBittorrent

    func post(_ url: URL, body: String, headers: [String: String] = [:]) async throws -> Data {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody   = body.data(using: .utf8)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, _) = try await session.data(for: req)
        return data
    }

    // MARK: POST JSON — used by Overseerr approve/deny

    func postJSON(_ url: URL, body: Data?, headers: [String: String] = [:]) async throws -> Data {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody   = body
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, _) = try await session.data(for: req)
        return data
    }

    // MARK: Raw data — artwork

    func fetchData(_ url: URL, headers: [String: String] = [:]) async -> Data? {
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        return try? await session.data(for: req).0
    }

    // MARK: Cookie session (qBittorrent)

    lazy var qbtSession: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieStorage = HTTPCookieStorage()
        cfg.httpCookieAcceptPolicy = .always
        cfg.httpShouldSetCookies = true
        cfg.timeoutIntervalForRequest = 15
        return URLSession(configuration: cfg)
    }()
}
