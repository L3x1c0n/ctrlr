import UIKit
import CryptoKit

// MARK: - ArtworkCache
//
// Actor-based two-tier cache: memory (NSCache) → disk (FileManager).
// Task closures capture only Sendable value types (URL, String, [String:String])
// so no self-capture warnings arise.

actor ArtworkCache {
    static let shared = ArtworkCache()

    private let memory   = NSCache<NSString, UIImage>()
    private var inFlight: [String: Task<UIImage?, Never>] = [:]

    nonisolated let diskCacheURL: URL = {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let dir = caches.appendingPathComponent("CTRLrArtwork", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private init() {
        memory.totalCostLimit = 150 * 1024 * 1024
        memory.countLimit     = 300
    }

    // MARK: - Public fetch + cache

    func fetchAndCache(url: URL, headers: [String: String] = [:], key: String? = nil) async -> UIImage? {
        let cacheKey = key ?? url.absoluteString

        // 1. Memory
        if let img = memory.object(forKey: cacheKey as NSString) { return img }

        // 2. Disk (suspends actor — no self capture in closure)
        let fileURL = diskCacheURL.appendingPathComponent(Self.filename(for: cacheKey))
        if let img = await Self.readDisk(fileURL: fileURL) {
            memory.setObject(img, forKey: cacheKey as NSString, cost: Self.decodedCost(img))
            return img
        }

        // Re-check after disk suspension
        if let img = memory.object(forKey: cacheKey as NSString) { return img }

        // 3. Network — deduplicate via inFlight
        if let existing = inFlight[cacheKey] { return await existing.value }

        // Task captures only Sendable values: url, headers, cacheKey, fileURL — no self
        let diskCacheURL = diskCacheURL
        let t = Task<UIImage?, Never> {
            guard let data = await NetworkClient.shared.fetchData(url, headers: headers),
                  let img  = UIImage(data: data) else { return nil }
            Task.detached(priority: .utility) {
                try? data.write(to: fileURL)
                Self.enforceDiskCap(directory: diskCacheURL, limitBytes: 200 * 1024 * 1024)
            }
            return img
        }
        inFlight[cacheKey] = t

        // Await result back on the actor, then clean up and store
        let img = await t.value
        inFlight.removeValue(forKey: cacheKey)
        if let img {
            memory.setObject(img, forKey: cacheKey as NSString, cost: Self.decodedCost(img))
        }
        return img
    }

    // MARK: - Static helpers (no actor isolation — no self)

    private static let diskTTL: TimeInterval = 30 * 24 * 3600   // 30 days

    private static func readDisk(fileURL: URL) async -> UIImage? {
        await Task.detached(priority: .utility) {
            // Treat files older than 30 days as cache misses so stale artwork is refreshed
            guard let attrs    = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
                  let modified = attrs[.modificationDate] as? Date,
                  Date().timeIntervalSince(modified) < Self.diskTTL
            else { return nil as UIImage? }
            guard let data = try? Data(contentsOf: fileURL),
                  let img  = UIImage(data: data) else { return nil as UIImage? }
            return img
        }.value
    }

    // Evict oldest files when the cache directory exceeds limitBytes.
    private static func enforceDiskCap(directory: URL, limitBytes: Int) {
        let fm  = FileManager.default
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        guard let files = try? fm.contentsOfDirectory(at: directory,
                                                      includingPropertiesForKeys: keys,
                                                      options: .skipsHiddenFiles)
        else { return }

        var infos: [(url: URL, size: Int, date: Date)] = files.compactMap { url in
            guard let res  = try? url.resourceValues(forKeys: Set(keys)),
                  let size = res.fileSize,
                  let date = res.contentModificationDate
            else { return nil }
            return (url, size, date)
        }

        let total = infos.reduce(0) { $0 + $1.size }
        guard total > limitBytes else { return }

        infos.sort { $0.date < $1.date }   // oldest first
        var remaining = total
        for info in infos {
            guard remaining > limitBytes else { break }
            try? fm.removeItem(at: info.url)
            remaining -= info.size
        }
    }

    private static func filename(for key: String) -> String {
        SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Cache size

    /// Total bytes of artwork files on disk. Runs off-actor since it only touches nonisolated state.
    nonisolated func diskCacheBytes() -> Int64 {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: diskCacheURL, includingPropertiesForKeys: [.fileSizeKey], options: .skipsHiddenFiles
        ) else { return 0 }
        return files.reduce(0) { sum, url in
            sum + Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    // MARK: - Cache clearing

    func clearAll() {
        memory.removeAllObjects()
        inFlight.values.forEach { $0.cancel() }
        inFlight.removeAll()
        let dir = diskCacheURL
        Task.detached(priority: .utility) {
            guard let files = try? FileManager.default.contentsOfDirectory(
                at: dir, includingPropertiesForKeys: nil, options: .skipsHiddenFiles
            ) else { return }
            for file in files { try? FileManager.default.removeItem(at: file) }
        }
    }

    private static func decodedCost(_ img: UIImage) -> Int {
        Int(img.size.width * img.scale * img.size.height * img.scale) * 4
    }
}
