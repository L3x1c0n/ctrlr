import SwiftUI

/// App icon view — all sizing proportional to `size` (default 1024).
struct CTRLrIconView: View {
    var size: CGFloat = 1024

    private var ctrlSize: CGFloat { size * 0.26 }
    private var rSize:    CGFloat { size * 0.22 }
    private var topPad:   CGFloat { size * 0.21 }
    private var leadPad:  CGFloat { size * 0.11 }
    private var glow1R:   CGFloat { size * 0.012 }
    private var glow2R:   CGFloat { size * 0.030 }

    private let green = Color(red: 0x3a/255, green: 0xff/255, blue: 0xaa/255)
    private let bg    = Color(red: 0x13/255, green: 0x15/255, blue: 0x1a/255)

    var body: some View {
        ZStack(alignment: .topLeading) {
            bg
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("CTRL")
                    .font(.custom("VT323", size: ctrlSize))
                    .foregroundColor(.white)
                Text("r")
                    .font(.custom("Monaco", size: rSize))
                    .foregroundColor(green)
                    .shadow(color: green.opacity(0.6),  radius: glow1R, x: 0, y: 0)
                    .shadow(color: green.opacity(0.25), radius: glow2R, x: 0, y: 0)
                Text("_")
                    .font(.custom("VT323", size: ctrlSize))
                    .foregroundColor(.white)
                    .baselineOffset(-ctrlSize * 0.18)
            }
            .padding(.top,     topPad)
            .padding(.leading, leadPad)
        }
        .frame(width: size, height: size)
    }
}

#Preview {
    CTRLrIconView(size: 400)
        .preferredColorScheme(.dark)
}
