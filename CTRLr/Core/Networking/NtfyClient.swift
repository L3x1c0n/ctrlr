import Foundation

// NtfyClient is no longer used.
// Plex WebSocket event stream (PlexClient.startEventStream) now handles
// library.new notifications directly — no third-party relay needed.
// Radarr/Sonarr queue updates happen on their own polling intervals.
final class NtfyClient {
    func start(server: String, radarrTopic: String, sonarrTopic: String, plexTopic: String) {}
    func stop() {}
}
