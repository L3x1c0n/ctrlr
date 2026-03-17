#import <Foundation/Foundation.h>

#if __has_attribute(swift_private)
#define AC_SWIFT_PRIVATE __attribute__((swift_private))
#else
#define AC_SWIFT_PRIVATE
#endif

/// The "logo_overseerr" asset catalog image resource.
static NSString * const ACImageNameLogoOverseerr AC_SWIFT_PRIVATE = @"logo_overseerr";

/// The "logo_plex" asset catalog image resource.
static NSString * const ACImageNameLogoPlex AC_SWIFT_PRIVATE = @"logo_plex";

/// The "logo_qbittorrent" asset catalog image resource.
static NSString * const ACImageNameLogoQbittorrent AC_SWIFT_PRIVATE = @"logo_qbittorrent";

/// The "logo_radarr" asset catalog image resource.
static NSString * const ACImageNameLogoRadarr AC_SWIFT_PRIVATE = @"logo_radarr";

/// The "logo_sonarr" asset catalog image resource.
static NSString * const ACImageNameLogoSonarr AC_SWIFT_PRIVATE = @"logo_sonarr";

/// The "logo_tautulli" asset catalog image resource.
static NSString * const ACImageNameLogoTautulli AC_SWIFT_PRIVATE = @"logo_tautulli";

#undef AC_SWIFT_PRIVATE
