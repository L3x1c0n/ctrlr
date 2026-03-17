import UIKit
import SwiftUI

// MARK: - AmbientColorExtractor

enum AmbientColorExtractor {
    /// Extracts a dominant, saturated color from the center region of an image.
    /// Returns nil if extraction fails or the image is too dark/desaturated.
    static func extract(from image: UIImage) -> Color? {
        guard let cgImage = image.cgImage else { return nil }
        let side = 40
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        var pixelData = [UInt8](repeating: 0, count: side * side * 4)
        guard let ctx = CGContext(data: &pixelData,
                                  width: side, height: side,
                                  bitsPerComponent: 8, bytesPerRow: side * 4,
                                  space: colorSpace,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))

        // Sample center 20×20 region
        let start = 10; let end = 30
        var rSum: CGFloat = 0; var gSum: CGFloat = 0; var bSum: CGFloat = 0
        var count: CGFloat = 0
        for y in start..<end {
            for x in start..<end {
                let idx = (y * side + x) * 4
                rSum += CGFloat(pixelData[idx])
                gSum += CGFloat(pixelData[idx + 1])
                bSum += CGFloat(pixelData[idx + 2])
                count += 1
            }
        }
        guard count > 0 else { return nil }
        var r = rSum / count / 255
        var g = gSum / count / 255
        var b = bSum / count / 255

        // Boost saturation via HSB
        var h: CGFloat = 0; var s: CGFloat = 0; var v: CGFloat = 0; var a: CGFloat = 0
        UIColor(red: r, green: g, blue: b, alpha: 1).getHue(&h, saturation: &s, brightness: &v, alpha: &a)
        guard v > 0.15 else { return nil }
        s = min(s * 1.6, 1.0)
        v = min(v * 1.1, 1.0)
        let boosted = UIColor(hue: h, saturation: s, brightness: v, alpha: 1)
        boosted.getRed(&r, green: &g, blue: &b, alpha: &a)
        return Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}
