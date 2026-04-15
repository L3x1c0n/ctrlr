import SwiftUI

// MARK: - SectionArrangerView
// Dedicated page for reordering dashboard sections.
// Always in edit mode so drag handles are immediately visible.

struct SectionArrangerView: View {
    @AppStorage(SectionOrderKey.appStorage) private var orderRaw = SectionOrderKey.defaultValue
    @State private var sections: [DashboardSection] = []
    @State private var editMode: EditMode = .active

    var body: some View {
        List {
            ForEach(sections) { section in
                HStack(spacing: 14) {
                    Image(systemName: section.systemImage)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.primary.opacity(0.55))
                        .frame(width: 22)

                    Text(section.title)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.primary)

                    Spacer()

                    // Reset to default colour
                    Button {
                        UserDefaults.standard.removeObject(forKey: section.tintStorageKey)
                    } label: {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.primary.opacity(0.4))
                    }
                    .buttonStyle(.plain)

                    // Colour picker
                    ColorPicker("", selection: tintBinding(for: section), supportsOpacity: false)
                        .labelsHidden()
                        .frame(width: 28, height: 28)
                }
                .padding(.vertical, 4)
                .listRowBackground(Color.primary.opacity(0.06))
            }
            .onMove { from, to in
                sections.move(fromOffsets: from, toOffset: to)
                orderRaw = sections.map(\.rawValue).joined(separator: ",")
            }
        }
        .environment(\.editMode, $editMode)
        .scrollContentBackground(.hidden)
        .background(Color.appBackground.ignoresSafeArea())
        .navigationTitle("Arrange & Colour")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { sections = orderRaw.asSectionOrder }
    }

    // MARK: - Helpers

    private func tintBinding(for section: DashboardSection) -> Binding<Color> {
        Binding(
            get: {
                let hex = UserDefaults.standard.string(forKey: section.tintStorageKey)
                            ?? section.defaultLightTint
                return Color(hex: hex)
            },
            set: { color in
                UserDefaults.standard.set(color.toHex(), forKey: section.tintStorageKey)
            }
        )
    }
}
