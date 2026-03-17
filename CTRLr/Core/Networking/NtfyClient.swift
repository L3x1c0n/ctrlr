import Foundation

// MARK: - NtfyClient
//
// Subscribes to ntfy topics via WebSocket (wss://server/topic/ws).
// Radarr and Sonarr each POST to their own topic on import/download events.
// When a message arrives the onEvent callback fires so DashboardViewModel
// can trigger a targeted one-shot fetch on the affected service.
//
// Setup in Radarr/Sonarr:
//   Settings → Connect → Webhook → URL: https://ntfy.sh/{topic}
//   Trigger on: Download, Import, Upgrade
//
// Plex uses multipart/form-data webhooks and cannot be cleanly relayed
// through ntfy — Plex data is refreshed on launch and pull-to-refresh instead.

final class NtfyClient: NSObject {

    var onEvent: ((ServiceSource) -> Void)?

    private let session = URLSession(configuration: .default)
    private var radarrTask: URLSessionWebSocketTask?
    private var sonarrTask: URLSessionWebSocketTask?
    private var radarrTopic  = ""
    private var sonarrTopic  = ""
    private var ntfyServer   = "https://ntfy.sh"
    private var stopped      = false

    // MARK: - Public

    func start(server: String, radarrTopic: String, sonarrTopic: String) {
        stopped = false
        self.ntfyServer   = server.isEmpty ? "https://ntfy.sh" : server
        self.radarrTopic  = radarrTopic
        self.sonarrTopic  = sonarrTopic
        connect(source: .radarr)
        connect(source: .sonarr)
    }

    func stop() {
        stopped = true
        radarrTask?.cancel(with: .goingAway, reason: nil)
        sonarrTask?.cancel(with: .goingAway, reason: nil)
        radarrTask = nil
        sonarrTask = nil
    }

    // MARK: - Internal

    private func topic(for source: ServiceSource) -> String {
        source == .radarr ? radarrTopic : sonarrTopic
    }

    private func connect(source: ServiceSource) {
        let t = topic(for: source)
        guard !t.isEmpty else { return }

        // Convert https → wss for the WebSocket URL.
        // ntfy.sh always uses wss:// — never allow an unencrypted ws:// connection
        // for the ntfy.sh domain even if http:// was stored in settings.
        var wsBase = ntfyServer
            .replacingOccurrences(of: "https://", with: "wss://")
        // For ntfy.sh specifically, refuse to downgrade to unencrypted WebSocket
        let isNtfySh = wsBase.contains("ntfy.sh")
        if isNtfySh {
            // If somehow http:// slipped through, enforce wss://
            wsBase = wsBase.replacingOccurrences(of: "http://", with: "wss://")
        } else {
            wsBase = wsBase.replacingOccurrences(of: "http://", with: "ws://")
        }
        guard let url = URL(string: "\(wsBase)/\(t)/ws") else { return }

        let task = session.webSocketTask(with: url)
        if source == .radarr { radarrTask = task } else { sonarrTask = task }
        task.resume()
        receive(task: task, source: source)
    }

    private func receive(task: URLSessionWebSocketTask, source: ServiceSource) {
        task.receive { [weak self] result in
            guard let self, !self.stopped else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message,
                   let data = text.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   (json["event"] as? String) == "message" {
                    DispatchQueue.main.async { self.onEvent?(source) }
                }
                self.receive(task: task, source: source)   // keep listening

            case .failure:
                // Reconnect after 10s back-off
                DispatchQueue.global().asyncAfter(deadline: .now() + 10) { [weak self] in
                    guard let self, !self.stopped else { return }
                    self.connect(source: source)
                }
            }
        }
    }
}
