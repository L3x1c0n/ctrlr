import WidgetKit
import SwiftUI

@main
struct CTRLrWidgetBundle: WidgetBundle {
    var body: some Widget {
        QueueProgressWidget()
        PlexRecentWidget()
        DownloadLiveActivity()
        // UpcomingReleasesWidget() — Phase 5
    }
}
