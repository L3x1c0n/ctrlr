import AppKit

let size: CGFloat = 1024

let green = NSColor(red: 0x3a/255, green: 0xff/255, blue: 0xaa/255, alpha: 1)
let bg    = NSColor(red: 0x18/255, green: 0x1a/255, blue: 0x1d/255, alpha: 1)

// Load VT323
let fontURL = URL(fileURLWithPath: "CTRLr/Resources/Fonts/VT323-Regular.ttf")
if FileManager.default.fileExists(atPath: fontURL.path) {
    CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, nil)
}

let img = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
    // Background
    bg.setFill()
    rect.fill()

    // Caret (^) — tighter angle, glowing green
    let strokeW: CGFloat = size * 0.038
    let peakX:   CGFloat = size * 0.720
    let peakY:   CGFloat = size * 0.800
    let armDX:   CGFloat = size * 0.130
    let armDY:   CGFloat = size * 0.165

    let path = NSBezierPath()
    path.move(to: NSPoint(x: peakX - armDX, y: peakY - armDY))
    path.line(to: NSPoint(x: peakX,         y: peakY))
    path.line(to: NSPoint(x: peakX + armDX, y: peakY - armDY))
    path.lineWidth    = strokeW
    path.lineCapStyle = .round
    path.lineJoinStyle = .round

    // Outer glow pass
    NSGraphicsContext.current?.saveGraphicsState()
    let glow1 = NSShadow()
    glow1.shadowColor      = green.withAlphaComponent(0.35)
    glow1.shadowBlurRadius = size * 0.055
    glow1.shadowOffset     = .zero
    glow1.set()
    green.setStroke()
    path.stroke()
    NSGraphicsContext.current?.restoreGraphicsState()

    // Inner glow pass
    NSGraphicsContext.current?.saveGraphicsState()
    let glow2 = NSShadow()
    glow2.shadowColor      = green.withAlphaComponent(0.65)
    glow2.shadowBlurRadius = size * 0.022
    glow2.shadowOffset     = .zero
    glow2.set()
    green.setStroke()
    path.stroke()
    NSGraphicsContext.current?.restoreGraphicsState()

    // Sharp top pass
    green.setStroke()
    path.stroke()

    // "CTRL" — VT323, white, lower-left
    let ctrlPt: CGFloat = size * 0.235
    let ctrlFont = NSFont(name: "Menlo-Regular", size: ctrlPt) ?? NSFont.monospacedSystemFont(ofSize: ctrlPt, weight: .regular)
    let ctrlAttr: [NSAttributedString.Key: Any] = [.font: ctrlFont, .foregroundColor: NSColor.white]
    let ctrlStr  = NSAttributedString(string: "CTRL", attributes: ctrlAttr)
    let ctrlMeasure = ctrlStr.size()
    let textX: CGFloat = size * 0.09
    let textY: CGFloat = size * 0.115
    ctrlStr.draw(at: NSPoint(x: textX, y: textY))

    // "r" — Monaco, green, immediately after CTRL
    let rPt: CGFloat = size * 0.218
    let rFont = NSFont(name: "Monaco", size: rPt) ?? NSFont.monospacedSystemFont(ofSize: rPt, weight: .regular)
    let rAttr: [NSAttributedString.Key: Any] = [.font: rFont, .foregroundColor: green]
    let rStr  = NSAttributedString(string: "r", attributes: rAttr)
    let rSize = rStr.size()
    let rY = textY + (ctrlMeasure.height - rSize.height) * 0.0
    rStr.draw(at: NSPoint(x: textX + ctrlMeasure.width - size * 0.018, y: rY))

    return true
}

guard let tiff   = img.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png    = bitmap.representation(using: .png, properties: [:])
else {
    print("❌ PNG encoding failed")
    exit(1)
}

let outPath = "CTRLr/Assets.xcassets/AppIcon.appiconset/icon_1024.png"
do {
    try png.write(to: URL(fileURLWithPath: outPath))
    print("✅ Written to \(outPath)  (\(png.count / 1024) KB)")
} catch {
    print("❌ \(error)")
    exit(1)
}
