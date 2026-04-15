import SwiftUI
import UIKit

// MARK: - Color ↔ hex conversion

extension Color {
    /// Returns a 6-digit uppercase hex string, e.g. "#A855F7".
    func toHex() -> String {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02X%02X%02X",
                      Int((r * 255).rounded()),
                      Int((g * 255).rounded()),
                      Int((b * 255).rounded()))
    }
}

// MARK: - Semantic app colours
//
// Use these instead of hard-coded hex or .white/.black in all views.
// They adapt automatically when the user changes the appearance setting.
//
//  appBackground   — the main canvas colour (#0A0A0F in dark, systemBackground in light)
//
// For text, surfaces, and borders use Color.primary.opacity(X):
//   .primary            ≡ .white in dark / .label in light      (full-brightness text)
//   .primary.opacity(~0.75)  secondary text
//   .primary.opacity(~0.45)  tertiary text / disabled
//   .primary.opacity(~0.06)  subtle card surface
//   .primary.opacity(~0.10)  slightly more visible surface / border

extension Color {
    /// Main app canvas — #0A0A0F in dark mode, systemBackground in light mode.
    /// Computed (not stored) so each call returns a fresh UIColor instance,
    /// preventing multiple views from competing for the same trait-change handler slot.
    static var appBackground: Color {
        Color(UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 10/255, green: 10/255, blue: 15/255, alpha: 1)
                : .systemBackground
        })
    }
}
