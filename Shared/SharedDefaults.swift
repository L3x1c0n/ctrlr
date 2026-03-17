import Foundation

/// App Group identifier shared between the main app and widget extension.
let appGroupID = "group.com.attakrit.CTRLr"

/// Convenience accessor for the shared UserDefaults suite.
extension UserDefaults {
    static let shared = UserDefaults(suiteName: appGroupID)!
}

/// Keys for data written by the main app and read by widgets.
enum SharedDefaultsKey {
    static let widgetSnapshot = "widgetSnapshot"
}
