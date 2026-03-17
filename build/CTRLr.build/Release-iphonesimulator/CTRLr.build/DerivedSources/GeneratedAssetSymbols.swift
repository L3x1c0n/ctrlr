import Foundation
#if canImport(DeveloperToolsSupport)
import DeveloperToolsSupport
#endif

#if SWIFT_PACKAGE
private let resourceBundle = Foundation.Bundle.module
#else
private class ResourceBundleClass {}
private let resourceBundle = Foundation.Bundle(for: ResourceBundleClass.self)
#endif

// MARK: - Color Symbols -

@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
extension DeveloperToolsSupport.ColorResource {

}

// MARK: - Image Symbols -

@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
extension DeveloperToolsSupport.ImageResource {

    /// The "logo_overseerr" asset catalog image resource.
    static let logoOverseerr = DeveloperToolsSupport.ImageResource(name: "logo_overseerr", bundle: resourceBundle)

    /// The "logo_plex" asset catalog image resource.
    static let logoPlex = DeveloperToolsSupport.ImageResource(name: "logo_plex", bundle: resourceBundle)

    /// The "logo_qbittorrent" asset catalog image resource.
    static let logoQbittorrent = DeveloperToolsSupport.ImageResource(name: "logo_qbittorrent", bundle: resourceBundle)

    /// The "logo_radarr" asset catalog image resource.
    static let logoRadarr = DeveloperToolsSupport.ImageResource(name: "logo_radarr", bundle: resourceBundle)

    /// The "logo_sonarr" asset catalog image resource.
    static let logoSonarr = DeveloperToolsSupport.ImageResource(name: "logo_sonarr", bundle: resourceBundle)

    /// The "logo_tautulli" asset catalog image resource.
    static let logoTautulli = DeveloperToolsSupport.ImageResource(name: "logo_tautulli", bundle: resourceBundle)

}

