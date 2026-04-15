import SwiftUI

// MARK: - RequestsSection

struct RequestsSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @AppStorage("sectionLightTint_requests") private var tintHex = "#A855F7"
    @State private var showSearch = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {

            // Header
            SectionHeader(
                iconGradient: [Color(hex: "#A855F7"), Color(hex: "#CC2260"), Color(hex: "#0A84FF")],
                title:        "Requests",
                sources:      dashVM.overseerr.isConnected ? [.overseerr] : []
            )

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    // Add request placeholder — always first
                    addRequestCard

                    if dashVM.overseerr.requests.isEmpty {
                        // Empty state inline when no requests yet
                        VStack(spacing: 6) {
                            Text(dashVM.overseerr.isConnected
                                 ? "No requests yet"
                                 : (dashVM.overseerr.error ?? "Connecting…"))
                                .font(.system(size: 12))
                                .foregroundStyle(.primary.opacity(0.3))
                                .multilineTextAlignment(.center)
                        }
                        .frame(width: 150, height: 225)
                        .glassCard(cornerRadius: 10)
                    } else {
                        ForEach(dashVM.overseerr.requests) { request in
                            RequestCard(request: request)
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
        .sheet(isPresented: $showSearch) {
            RequestSearchSheet()
                .environmentObject(dashVM)
        }
        .glassCard(cornerRadius: 20, lightTint: Color(hex: tintHex), lightOnly: true)
    }

    // MARK: - Add request card

    private var addRequestCard: some View {
        Button { showSearch = true } label: {
            VStack(alignment: .leading, spacing: 8) {
                // Poster-sized placeholder
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.primary.opacity(0.04))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(
                                    LinearGradient(
                                        colors: [Color(hex: "#A855F7").opacity(0.5),
                                                 Color(hex: "#CC2260").opacity(0.3)],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    ),
                                    style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])
                                )
                        )
                    ZStack {
                        Circle()
                            .fill(Color(hex: "#A855F7").opacity(0.15))
                            .frame(width: 48, height: 48)
                        Image(systemName: "plus")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(Color(hex: "#A855F7"))
                    }
                }
                .frame(width: 150, height: 225)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                // Title — matches RequestCard layout exactly
                Text("Request")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .frame(width: 150, height: 34, alignment: .topLeading)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - RequestCard

private struct RequestCard: View {
    let request: OverseerrRequest
    @EnvironmentObject var dashVM: DashboardViewModel

    private let cardWidth:  CGFloat = 150
    private let cardHeight: CGFloat = 225

    @State private var posterImage:   UIImage?
    @State private var title:         String?
    @State private var showDetail     = false
    @State private var tilt:          CGSize = .zero
    @State private var isInteracting: Bool   = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Poster card
            ZStack(alignment: .topTrailing) {
                // Poster
                Group {
                    if let img = posterImage {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Color.primary.opacity(0.06)
                            .overlay {
                                Image(systemName: request.mediaType == "movie" ? "film" : "tv")
                                    .font(.system(size: 28, weight: .thin))
                                    .foregroundStyle(.primary.opacity(0.2))
                            }
                    }
                }
                .frame(width: cardWidth, height: cardHeight)
                .clipShape(RoundedRectangle(cornerRadius: 10))

                // Glass overlay
                PosterGlassOverlay(cornerRadius: 10)

                // Status badge — prefer media availability over approval status
                VStack(alignment: .trailing, spacing: 4) {
                    if request.isInLibrary {
                        Label("In Library", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Color(hex: "#CC2260"), in: Capsule())
                    } else if request.isPartiallyAvailable {
                        Label("Partial", systemImage: "circle.lefthalf.filled")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Color(hex: "#CC2260"), in: Capsule())
                    } else {
                        Text(request.status.label)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(request.status.color, in: Capsule())
                    }
                }
                .padding(8)

                // Bottom gradient + requester
                VStack {
                    Spacer()
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.7)],
                        startPoint: .top, endPoint: .bottom
                    )
                    .frame(height: 60)
                    .overlay(alignment: .bottomLeading) {
                        HStack(spacing: 3) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 7))
                            Text(request.requestedBy)
                                .font(.system(size: 9))
                        }
                        .foregroundStyle(.primary.opacity(0.6))
                        .padding(.horizontal, 8)
                        .padding(.bottom, 8)
                    }
                }
                .frame(width: cardWidth, height: cardHeight)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay { PosterBezel(cornerRadius: 10) }
            .rotation3DEffect(.degrees(Double(tilt.height) * -50), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
            .rotation3DEffect(.degrees(Double(tilt.width)  *  58), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
            .shadow(
                color: .black.opacity(isInteracting ? 0.55 : 0.30),
                radius: isInteracting ? 22 : 8,
                x: tilt.width * 20, y: tilt.height * 20 + 4
            )
            .overlay {
                TiltRecognizer(
                    onChanged: { _, liveLoc in
                        let target = amplifiedTilt(normX: liveLoc.x - 0.5, normY: liveLoc.y - 0.5)
                        if !isInteracting {
                            isInteracting = true
                            tilt = .zero
                            Task { @MainActor in
                                withAnimation(.easeOut(duration: 0.22)) { tilt = target }
                            }
                        } else {
                            tilt = target
                        }
                    },
                    onEnded: {
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.92)) {
                            isInteracting = false
                            tilt = .zero
                        }
                    }
                )
            }
            .onContinuousHover { phase in
                switch phase {
                case .active(let loc):
                    let target = amplifiedTilt(normX: loc.x / cardWidth  - 0.5,
                                               normY: loc.y / cardHeight - 0.5)
                    if !isInteracting {
                        isInteracting = true
                        tilt = .zero
                        Task { @MainActor in
                            withAnimation(.easeOut(duration: 0.22)) { tilt = target }
                        }
                    } else {
                        tilt = target
                    }
                case .ended:
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.92)) {
                        isInteracting = false
                        tilt = .zero
                    }
                }
            }

            // Title — fixed height so all cards align regardless of line count
            Text(title ?? request.title ?? "Loading…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: cardWidth, height: 34, alignment: .topLeading)
        }
        .task(id: request.id) { await loadDetails() }
        .onTapGesture { showDetail = true }
        .sheet(isPresented: $showDetail) {
            RequestDetailSheet(request: request)
                .environmentObject(dashVM)
        }
    }

    private func loadDetails() async {
        guard let tmdbId = request.tmdbId else { return }

        // Use the client's persistent cache for both title and posterPath.
        // On first run this hits the network; on subsequent launches it returns instantly.
        let detail = await dashVM.overseerr.fetchMediaDetail(tmdbId: tmdbId,
                                                             mediaType: request.mediaType)
        if title == nil { title = detail.title }

        // Resolve poster URL: prefer the cached detail path, fall back to request's own path
        let posterPath = detail.posterPath ?? request.posterPath
        if let path = posterPath, let url = URL(string: "https://image.tmdb.org/t/p/w342\(path)") {
            posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
        }
    }
}

// MARK: - RequestSearchSheet

struct RequestSearchSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    // MARK: - Sort / Filter enums

    enum SortOrder: String, CaseIterable {
        case relevance = "Relevance"
        case yearDesc  = "Year ↓"
        case yearAsc   = "Year ↑"
        case titleAZ   = "Title A–Z"
        case titleZA   = "Title Z–A"
    }

    enum TypeFilter: String, CaseIterable {
        case all    = "All"
        case movies = "Movies"
        case tv     = "TV"
    }

    enum StatusFilter: String, CaseIterable {
        case all        = "All"
        case available  = "Available"
        case requested  = "Requested"
        case unrequested = "New"
    }

    @State private var isDismissing       = false
    @State private var query              = ""
    @State private var results:           [OverseerrSearchResult] = []
    @State private var isSearching        = false
    @State private var searchTask:        Task<Void, Never>?
    @State private var requested:         Set<Int>               = []
    @State private var selectedForDetail: OverseerrSearchResult? = nil

    @State private var sortOrder:   SortOrder   = .relevance
    @State private var typeFilter:  TypeFilter  = .all
    @State private var statusFilter: StatusFilter = .all

    // MARK: - Derived results

    private var filteredResults: [OverseerrSearchResult] {
        var out = results

        // Type filter
        switch typeFilter {
        case .movies: out = out.filter { $0.mediaType == "movie" }
        case .tv:     out = out.filter { $0.mediaType == "tv" }
        case .all:    break
        }

        // Status filter
        switch statusFilter {
        case .available:   out = out.filter { $0.isAvailable }
        case .requested:   out = out.filter { $0.isRequested && !$0.isAvailable }
        case .unrequested: out = out.filter { !$0.isAvailable && !$0.isRequested }
        case .all:         break
        }

        // Sort
        switch sortOrder {
        case .relevance: break  // keep API order
        case .yearDesc:  out.sort { ($0.year ?? "") > ($1.year ?? "") }
        case .yearAsc:   out.sort { ($0.year ?? "") < ($1.year ?? "") }
        case .titleAZ:   out.sort { $0.title.localizedCompare($1.title) == .orderedAscending  }
        case .titleZA:   out.sort { $0.title.localizedCompare($1.title) == .orderedDescending }
        }

        return out
    }

    private var isFiltered: Bool {
        sortOrder != .relevance || typeFilter != .all || statusFilter != .all
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.primary.opacity(0.4))
                    TextField("Search movies and TV shows…", text: $query)
                        .foregroundStyle(.primary)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { runSearch() }
                    if isSearching {
                        ProgressView().controlSize(.small).tint(.white)
                    } else if !query.isEmpty {
                        Button { runSearch() } label: {
                            Image(systemName: "arrow.clockwise")
                                .foregroundStyle(Color(hex: "#00E5A0"))
                                .font(.system(size: 15))
                        }
                        .buttonStyle(.plain)
                        Button { query = ""; results = [] } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.primary.opacity(0.4))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 20)
                .padding(.top, 12)

                // Sort / filter bar — shown once results exist
                if !results.isEmpty {
                    filterBar
                        .padding(.top, 10)
                        .padding(.bottom, 2)
                }

                Divider().opacity(0.1).padding(.top, 10)

                // Results
                let displayed = filteredResults
                if displayed.isEmpty && !query.isEmpty && !isSearching {
                    Spacer()
                    VStack(spacing: 12) {
                        Text(results.isEmpty ? "No results" : "No results match filters")
                            .font(.system(size: 14))
                            .foregroundStyle(.primary.opacity(0.3))
                        if isFiltered {
                            Button { resetFilters() } label: {
                                Label("Clear Filters", systemImage: "xmark.circle")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(Color(hex: "#A855F7"))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(displayed) { result in
                                SearchResultRow(
                                    result:      result,
                                    isRequested: requested.contains(result.id),
                                    onTap:       { selectedForDetail = result }
                                )
                                Divider().opacity(0.15).padding(.leading, 102)
                            }
                            if !displayed.isEmpty {
                                Button { runSearch() } label: {
                                    Label("Search Again", systemImage: "arrow.clockwise")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(Color(hex: "#00E5A0"))
                                }
                                .buttonStyle(.plain)
                                .padding(.vertical, 20)
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .background(Color.appBackground.ignoresSafeArea())
            .safeAreaInset(edge: .bottom) { errorBanner }
            .onChange(of: query) { _, _ in scheduleSearch() }
            .sheet(item: $selectedForDetail) { result in
                MediaDetailSheet(result: result) { id in
                    requested.insert(id)
                }
                .environmentObject(dashVM)
            }
            .navigationTitle("Request Content")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { runSearch() } label: {
                        Image(systemName: "arrow.clockwise")
                            .foregroundStyle(Color(hex: "#00E5A0"))
                    }
                    .buttonStyle(.plain)
                    .opacity(!query.isEmpty && !isSearching ? 1 : 0)
                    .disabled(query.isEmpty || isSearching)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        isDismissing = true
                        DispatchQueue.main.async { dismiss() }
                    }
                    .fontWeight(.semibold)
                    .opacity(isDismissing ? 0 : 1)
                }
            }
        }
    }

    // MARK: - Filter bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Sort menu
                Menu {
                    ForEach(SortOrder.allCases, id: \.self) { order in
                        Button {
                            sortOrder = order
                        } label: {
                            if sortOrder == order {
                                Label(order.rawValue, systemImage: "checkmark")
                            } else {
                                Text(order.rawValue)
                            }
                        }
                    }
                } label: {
                    filterChip(
                        label: sortOrder == .relevance ? "Sort" : sortOrder.rawValue,
                        icon: "arrow.up.arrow.down",
                        isActive: sortOrder != .relevance
                    )
                }

                Divider()
                    .frame(height: 20)
                    .opacity(0.3)

                // Type filter chips
                ForEach(TypeFilter.allCases, id: \.self) { f in
                    Button { typeFilter = (typeFilter == f && f != .all) ? .all : f } label: {
                        filterChip(label: f.rawValue, icon: nil, isActive: typeFilter == f && f != .all)
                    }
                    .buttonStyle(.plain)
                }

                Divider()
                    .frame(height: 20)
                    .opacity(0.3)

                // Status filter chips
                ForEach(StatusFilter.allCases.filter { $0 != .all }, id: \.self) { f in
                    Button { statusFilter = (statusFilter == f) ? .all : f } label: {
                        filterChip(label: f.rawValue, icon: nil, isActive: statusFilter == f)
                    }
                    .buttonStyle(.plain)
                }

                // Clear all
                if isFiltered {
                    Button { resetFilters() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(.primary.opacity(0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
        }
    }

    private func filterChip(label: String, icon: String?, isActive: Bool) -> some View {
        HStack(spacing: 5) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .medium))
            }
            Text(label)
                .font(.system(size: 13, weight: isActive ? .semibold : .regular))
        }
        .foregroundStyle(isActive ? Color(hex: "#A855F7") : .primary.opacity(0.6))
        .padding(.horizontal, 12).padding(.vertical, 7)
        .background(
            isActive ? Color(hex: "#A855F7").opacity(0.15) : Color.primary.opacity(0.07),
            in: Capsule()
        )
        .overlay(Capsule().stroke(
            isActive ? Color(hex: "#A855F7").opacity(0.4) : Color.clear, lineWidth: 1
        ))
    }

    // MARK: - Helpers

    @ViewBuilder private var errorBanner: some View {
        if let err = dashVM.overseerr.error {
            Text(err)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.white)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(hex: "#FF4757").opacity(0.85))
        }
    }

    private func resetFilters() {
        sortOrder    = .relevance
        typeFilter   = .all
        statusFilter = .all
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            results = []; return
        }
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            runSearch()
        }
    }

    private func runSearch() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        isSearching = true
        Task {
            results     = await dashVM.overseerr.search(query: q)
            isSearching = false
        }
    }
}


// MARK: - SearchResultRow

private struct SearchResultRow: View {
    let result:      OverseerrSearchResult
    let isRequested: Bool   // locally requested this session
    let onTap:       () -> Void

    @State private var posterImage: UIImage?

    var body: some View {
        HStack(spacing: 12) {
            // Poster thumbnail
            Group {
                if let img = posterImage {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Color.primary.opacity(0.06)
                        .overlay {
                            Image(systemName: result.mediaType == "movie" ? "film" : "tv")
                                .font(.system(size: 18, weight: .thin))
                                .foregroundStyle(.primary.opacity(0.2))
                        }
                }
            }
            .frame(width: 70, height: 105)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Info
            VStack(alignment: .leading, spacing: 5) {
                Text(result.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if let year = result.year {
                        Text(year)
                            .font(.system(size: 13))
                            .foregroundStyle(.primary.opacity(0.4))
                    }
                    Text(result.mediaType == "movie" ? "Movie" : "TV Series")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.primary.opacity(0.3))
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Color.primary.opacity(0.08), in: Capsule())
                }
                if result.isAvailable {
                    Text("Available")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: "#00E5A0"))
                } else if result.isRequested {
                    Text("Already Requested")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: "#FF9F43"))
                }
            }

            Spacer(minLength: 0)

            // Status / action indicator — tapping always opens MediaDetailSheet via onTap
            if result.isAvailable || isRequested {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color(hex: "#00E5A0"))
                    .frame(width: 44)
            } else if result.isRequested {
                Image(systemName: "clock.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color(hex: "#FF9F43"))
                    .frame(width: 44)
            } else {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(Color(hex: "#A855F7"))
                    .frame(width: 44)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { onTap() }
        .task(id: result.id) { await loadPoster() }
    }

    private func loadPoster() async {
        guard let urlStr = result.posterURL, let url = URL(string: urlStr) else { return }
        posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
    }
}




// MARK: - Media Detail Sheet

struct MediaDetailSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    let result:      OverseerrSearchResult
    let onRequested: ((Int) -> Void)?

    init(result: OverseerrSearchResult, onRequested: ((Int) -> Void)? = nil) {
        self.result = result
        self.onRequested = onRequested
    }

    @State private var mediaInfo:          OverseerrMediaInfo?      = nil
    @State private var options:            OverseerrServiceOptions? = nil
    @State private var isLoadingInfo                                = true
    @State private var backdropImage:      UIImage?                 = nil
    @State private var posterImage:        UIImage?                 = nil
    @State private var selectedProfile:    OverseerrQualityProfile? = nil
    @State private var selectedFolder:     OverseerrRootFolder?     = nil
    @State private var selectedSeasons:    Set<Int>                 = []
    @State private var isSubmitting                                 = false
    @State private var isLocallyRequested                           = false
    @State private var navigateToSearch                             = false

    private var canSubmit: Bool {
        guard !isSubmitting, !isLocallyRequested,
              !result.isAvailable, !result.isRequested else { return false }
        if result.mediaType == "tv" { return !selectedSeasons.isEmpty }
        return true
    }

    private var totalSeasons: Int {
        mediaInfo?.numberOfSeasons ?? result.numberOfSeasons ?? 0
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 0) {
                        backdropHeader
                        contentBody
                            .background(Color.appBackground)
                    }
                }
                .ignoresSafeArea(edges: .top)
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)
                }
            }
            .navigationDestination(isPresented: $navigateToSearch) {
                PostAddSearchSheet(result: result)
                    .environmentObject(dashVM)
            }
        }
        .task { await loadContent() }
    }

    // MARK: - Backdrop header

    private var backdropHeader: some View {
        ZStack(alignment: .bottomLeading) {
            // Backdrop image or gradient fallback
            Group {
                if let img = backdropImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                } else {
                    LinearGradient(
                        colors: [Color(hex: "#1A1A2E"), Color.appBackground],
                        startPoint: .top, endPoint: .bottom
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: 260)
            .clipped()

            // Vignette
            LinearGradient(
                colors: [.black.opacity(0.05), .black.opacity(0.55), Color.appBackground],
                startPoint: .top, endPoint: .bottom
            )
            .frame(maxHeight: 260)

            // Poster + title info at bottom of backdrop
            HStack(alignment: .bottom, spacing: 14) {
                Group {
                    if let img = posterImage {
                        Image(uiImage: img).resizable().scaledToFill()
                    } else {
                        Color.primary.opacity(0.06)
                            .overlay {
                                Image(systemName: result.mediaType == "movie" ? "film" : "tv")
                                    .font(.system(size: 24, weight: .thin))
                                    .foregroundStyle(.primary.opacity(0.2))
                            }
                    }
                }
                .frame(width: 110, height: 165)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .shadow(color: .black.opacity(0.6), radius: 10, x: 0, y: 4)

                VStack(alignment: .leading, spacing: 6) {
                    Text(result.title)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.primary)
                        .lineLimit(3)
                    HStack(spacing: 6) {
                        if let year = result.year {
                            Text(year)
                                .font(.system(size: 13))
                                .foregroundStyle(.primary.opacity(0.55))
                        }
                        Text(result.mediaType == "movie" ? "Movie" : "TV Series")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.primary.opacity(0.4))
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Color.primary.opacity(0.1), in: Capsule())
                    }
                    if let info = mediaInfo {
                        HStack(spacing: 8) {
                            if let rating = info.ratingFormatted {
                                HStack(spacing: 3) {
                                    Image(systemName: "star.fill")
                                        .font(.system(size: 10))
                                        .foregroundStyle(Color(hex: "#FFD700"))
                                    Text(rating)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(.primary.opacity(0.8))
                                }
                            }
                            if let cert = info.certification, !cert.isEmpty {
                                Text(cert)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(.primary.opacity(0.6))
                                    .padding(.horizontal, 5).padding(.vertical, 2)
                                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.primary.opacity(0.3), lineWidth: 1))
                            }
                            if let rt = info.runtimeFormatted {
                                Text(rt)
                                    .font(.system(size: 12))
                                    .foregroundStyle(.primary.opacity(0.5))
                            }
                        }
                    }
                }
                .padding(.bottom, 14)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
        }
        .frame(height: 260)
    }

    // MARK: - Content body

    @ViewBuilder private var contentBody: some View {
        if isLoadingInfo {
            ProgressView()
                .tint(Color(hex: "#A855F7"))
                .padding(.top, 40)
                .padding(.bottom, 200)
                .frame(maxWidth: .infinity)
        } else {
            VStack(spacing: 0) {
                // Genres
                if let info = mediaInfo, !info.genres.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(info.genres, id: \.self) { genre in
                                Text(genre)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(.primary.opacity(0.7))
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(Color.primary.opacity(0.08), in: Capsule())
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                    .padding(.vertical, 14)
                    Divider().opacity(0.1)
                }

                // Overview
                if let overview = mediaInfo?.overview, !overview.isEmpty {
                    Text(overview)
                        .font(.system(size: 13))
                        .foregroundStyle(.primary.opacity(0.65))
                        .lineSpacing(4)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                    Divider().opacity(0.1)
                }

                // Cast
                if let info = mediaInfo, !info.cast.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("CAST")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.primary.opacity(0.3))
                            .padding(.horizontal, 20)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(info.cast) { member in
                                    VStack(spacing: 4) {
                                        AsyncImage(url: member.profilePath.flatMap { URL(string: "https://image.tmdb.org/t/p/w185\($0)") }) { img in
                                            img.resizable().scaledToFill()
                                        } placeholder: {
                                            Color.primary.opacity(0.06)
                                                .overlay {
                                                    Image(systemName: "person.fill")
                                                        .font(.system(size: 18))
                                                        .foregroundStyle(.primary.opacity(0.15))
                                                }
                                        }
                                        .frame(width: 52, height: 52)
                                        .clipShape(Circle())
                                        Text(member.name)
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(.primary.opacity(0.8))
                                            .lineLimit(1)
                                        if let character = member.character, !character.isEmpty {
                                            Text(character)
                                                .font(.system(size: 9))
                                                .foregroundStyle(.primary.opacity(0.4))
                                                .lineLimit(1)
                                        }
                                    }
                                    .frame(width: 60)
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .padding(.vertical, 16)
                    Divider().opacity(0.1)
                }

                // Director / Creator + Studio / Network
                if let info = mediaInfo, !info.directors.isEmpty || !info.studios.isEmpty {
                    VStack(spacing: 0) {
                        if !info.directors.isEmpty {
                            infoRow(label: result.mediaType == "tv" ? "Creator" : "Director",
                                    value: info.directors.joined(separator: ", "))
                            Divider().opacity(0.07).padding(.leading, 20)
                        }
                        if !info.studios.isEmpty {
                            infoRow(label: result.mediaType == "tv" ? "Network" : "Studio",
                                    value: info.studios.prefix(2).joined(separator: ", "))
                        }
                    }
                    .padding(.vertical, 4)
                    Divider().opacity(0.1)
                }

                // Season picker — TV only, none pre-selected
                if result.mediaType == "tv" && totalSeasons > 0 {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("SEASONS")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.primary.opacity(0.3))
                            Spacer()
                            Button {
                                if selectedSeasons.count == totalSeasons {
                                    selectedSeasons = []
                                } else {
                                    selectedSeasons = Set(1...totalSeasons)
                                }
                            } label: {
                                Text(selectedSeasons.count == totalSeasons ? "Deselect All" : "Select All")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(Color(hex: "#A855F7"))
                            }
                            .buttonStyle(.plain)
                        }

                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 64), spacing: 8)], spacing: 8) {
                            ForEach(1...totalSeasons, id: \.self) { season in
                                let on = selectedSeasons.contains(season)
                                Button {
                                    if on { selectedSeasons.remove(season) }
                                    else  { selectedSeasons.insert(season) }
                                } label: {
                                    Text("S\(season)")
                                        .font(.system(size: 13, weight: on ? .semibold : .regular))
                                        .foregroundStyle(on ? Color(hex: "#A855F7") : .primary.opacity(0.5))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 10)
                                        .background(on ? Color(hex: "#A855F7").opacity(0.15) : Color.primary.opacity(0.05),
                                                    in: RoundedRectangle(cornerRadius: 8))
                                        .overlay(RoundedRectangle(cornerRadius: 8)
                                            .stroke(on ? Color(hex: "#A855F7").opacity(0.5) : Color.clear, lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        if selectedSeasons.isEmpty {
                            Text("Select at least one season")
                                .font(.system(size: 11))
                                .foregroundStyle(Color(hex: "#FF9F43").opacity(0.8))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    Divider().opacity(0.1)
                }

                // Quality profile + root folder (always visible for requestable items)
                if !result.isAvailable && !result.isRequested && !isLocallyRequested {
                    if let opts = options {
                        VStack(spacing: 0) {
                            if !opts.profiles.isEmpty {
                                pickerRow(label: "Quality Profile",
                                          value: selectedProfile?.name ?? "Default") {
                                    ForEach(opts.profiles) { p in
                                        Button(p.name) { selectedProfile = p }
                                    }
                                }
                                Divider().opacity(0.08).padding(.leading, 20)
                            }
                            if !opts.rootFolders.isEmpty {
                                pickerRow(label: "Root Folder",
                                          value: selectedFolder.map { f in
                                              [folderName(f.path), f.freeSpace.map { formatFreeSpace($0) }]
                                                  .compactMap { $0 }.joined(separator: "  ·  ")
                                          } ?? "Default") {
                                    ForEach(opts.rootFolders) { f in
                                        Button {
                                            selectedFolder = f
                                        } label: {
                                            Label(folderMenuLabel(f), systemImage: "internaldrive")
                                        }
                                    }
                                }
                            }
                        }
                        Divider().opacity(0.1)
                    }
                }

                // Action
                actionSection
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
            }
        }
    }

    // MARK: - Action section

    @ViewBuilder private var actionSection: some View {
        if result.isAvailable {
            statusBadge(icon: "checkmark.circle.fill", label: "Available in Library",
                        color: Color(hex: "#00E5A0"))
        } else if result.isRequested && !isLocallyRequested {
            statusBadge(icon: "clock.fill", label: "Already Requested",
                        color: Color(hex: "#FF9F43"))
        } else if isLocallyRequested {
            statusBadge(icon: "checkmark.circle.fill", label: "Request Submitted",
                        color: Color(hex: "#00E5A0"))
        } else {
            Button {
                Task { await submit() }
            } label: {
                HStack(spacing: 10) {
                    if isSubmitting {
                        ProgressView().controlSize(.small).tint(.white)
                    } else {
                        Image(systemName: "plus.circle.fill").font(.system(size: 18))
                    }
                    Text("Add to Library").font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    canSubmit ? Color(hex: "#A855F7").opacity(0.2) : Color.primary.opacity(0.04),
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .overlay(RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(canSubmit ? Color(hex: "#A855F7").opacity(0.4) : Color.primary.opacity(0.08),
                                  lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(!canSubmit)
        }
    }

    private func statusBadge(icon: String, label: String, color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(color)
            Text(label).font(.system(size: 15, weight: .semibold)).foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color.opacity(0.25), lineWidth: 1))
    }

    // MARK: - Helpers

    private func infoRow(label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.4))
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func pickerRow<Content: View>(label: String, value: String,
                                          @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label).font(.system(size: 16, weight: .medium)).foregroundStyle(.primary)
            Spacer()
            Menu { content() } label: {
                HStack(spacing: 6) {
                    Text(value).font(.system(size: 15)).foregroundStyle(.primary.opacity(0.85))
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.primary.opacity(0.6))
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
    }

    private func folderName(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    /// Menu item label: "parent/name  ·  1.2 TB free" — distinguishes same-named folders.
    private func folderMenuLabel(_ f: OverseerrRootFolder) -> String {
        let parts   = f.path.split(separator: "/")
        let name    = parts.last.map(String.init) ?? f.path
        let parent  = parts.dropLast().last.map(String.init)
        let display = parent.map { "\($0)/\(name)" } ?? name
        if let free = f.freeSpace {
            return "\(display)  ·  \(formatFreeSpace(free)) free"
        }
        return display
    }

    private func formatFreeSpace(_ bytes: Int64) -> String {
        let d = Double(bytes)
        if d >= 1_099_511_627_776 { return String(format: "%.1f TB", d / 1_099_511_627_776) }
        if d >= 1_073_741_824     { return String(format: "%.0f GB", d / 1_073_741_824) }
        return String(format: "%.0f MB", d / 1_048_576)
    }

    // MARK: - Data loading

    private func loadContent() async {
        async let infoTask    = dashVM.overseerr.fetchMediaInfo(tmdbId: result.id, mediaType: result.mediaType)
        async let optionsTask = dashVM.overseerr.fetchServiceOptions(mediaType: result.mediaType)
        let (info, opts) = await (infoTask, optionsTask)
        mediaInfo     = info
        options       = opts
        isLoadingInfo = false

        if let opts {
            selectedProfile = opts.profiles.first { p in
                let n = p.name
                return n.localizedCaseInsensitiveContains("4k")   ||
                       n.localizedCaseInsensitiveContains("2160")  ||
                       n.localizedCaseInsensitiveContains("uhd")   ||
                       n.localizedCaseInsensitiveContains("ultra")
            } ?? opts.profiles.first
            selectedFolder = opts.rootFolders.max { ($0.freeSpace ?? 0) < ($1.freeSpace ?? 0) }
                          ?? opts.rootFolders.first
        }

        // Load poster
        let posterPath = info?.posterPath ?? result.posterPath
        if let path = posterPath, let url = URL(string: "https://image.tmdb.org/t/p/w342\(path)") {
            posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
        }
        // Load backdrop
        if let path = info?.backdropPath, let url = URL(string: "https://image.tmdb.org/t/p/w780\(path)") {
            backdropImage = await ArtworkCache.shared.fetchAndCache(url: url)
        }
    }

    // MARK: - Submit

    private func submit() async {
        isSubmitting = true
        let seasons = result.mediaType == "tv" ? Array(selectedSeasons.sorted()) : nil
        let ok = await dashVM.overseerr.submitRequest(
            tmdbId:    result.id,
            mediaType: result.mediaType,
            seasons:   seasons,
            serverId:  options?.serverId,
            profileId: selectedProfile?.id,
            rootFolder: selectedFolder?.path
        )
        isSubmitting = false
        if ok {
            isLocallyRequested = true
            onRequested?(result.id)
            if result.mediaType == "movie" {
                navigateToSearch = true
            }
        }
    }
}

// MARK: - Post-Add Search Sheet

private struct PostAddSearchSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    let result: OverseerrSearchResult

    private enum Phase {
        case polling(Int)
        case ready(Int)
        case timedOut
    }

    @State private var phase:             Phase          = .polling(0)
    @State private var foundMovieId:      Int?           = nil
    @State private var releases:          [MediaRelease] = []
    @State private var isLoadingReleases: Bool           = false
    @State private var isTriggering:      Bool           = false
    @State private var showInteractive:   Bool           = false

    var body: some View {
        ZStack {
            Color.appBackground.ignoresSafeArea()
            VStack(spacing: 24) {
                Spacer()
                switch phase {
                case .polling(let attempt): pollingView(attempt: attempt)
                case .ready(let movieId):   readyView(movieId: movieId)
                case .timedOut:             timedOutView
                }
                Spacer()
            }
            .padding(24)
        }
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }.fontWeight(.semibold)
            }
        }
        .sheet(isPresented: $showInteractive) {
            InteractiveSearchSheet(
                releases:  releases,
                isLoading: isLoadingReleases,
                onRefresh: {
                    guard let mid = foundMovieId else { return }
                    Task {
                        isLoadingReleases = true
                        releases          = await dashVM.radarr.fetchReleases(movieId: mid)
                        isLoadingReleases = false
                    }
                }
            ) { release in
                Task {
                    _ = await dashVM.radarr.downloadRelease(guid: release.guid, indexerId: release.indexerId)
                    showInteractive = false
                    dismiss()
                }
            }
        }
        .task { await pollForMovie() }
    }

    // MARK: - Phase views

    @ViewBuilder private func pollingView(attempt: Int) -> some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(Color(hex: "#A855F7"))
                .scaleEffect(1.3)
            VStack(spacing: 6) {
                Text("Waiting for Radarr to index")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.primary.opacity(0.7))
                Text(result.title)
                    .font(.system(size: 13))
                    .foregroundStyle(.primary.opacity(0.35))
                    .lineLimit(1)
            }
            if attempt > 0 {
                Text("Attempt \(attempt) of 20")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.primary.opacity(0.2))
            }
        }
    }

    @ViewBuilder private func readyView(movieId: Int) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40, weight: .thin))
                .foregroundStyle(Color(hex: "#00E5A0"))

            Text("Ready to search")
                .font(.system(size: 14))
                .foregroundStyle(.primary.opacity(0.45))

            Divider().opacity(0.1).padding(.vertical, 4)

            searchButton(
                title: isTriggering ? "Searching…" : "Automatic Search",
                icon:  "magnifyingglass.circle.fill",
                color: Color(hex: "#A855F7")
            ) {
                isTriggering = true
                await dashVM.radarr.triggerSearch(movieId: movieId)
                dismiss()
            }
            .disabled(isTriggering)

            searchButton(
                title: "Interactive Search",
                icon:  "list.bullet.circle.fill",
                color: Color(hex: "#00E5A0")
            ) {
                await loadAndShowInteractive(movieId: movieId)
            }
            .disabled(isTriggering)
        }
    }

    @ViewBuilder private var timedOutView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40, weight: .thin))
                .foregroundStyle(Color(hex: "#FF9F43"))
            VStack(spacing: 6) {
                Text("Radarr hasn't indexed this yet")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.primary.opacity(0.7))
                Text("The request was submitted. You can retry or search directly in Radarr.")
                    .font(.system(size: 12))
                    .foregroundStyle(.primary.opacity(0.35))
                    .multilineTextAlignment(.center)
            }
            Button {
                phase = .polling(0)
                Task { await pollForMovie() }
            } label: {
                Label("Retry", systemImage: "arrow.clockwise")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color(hex: "#A855F7"))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }

    // MARK: - Button helper

    private func searchButton(title: String, icon: String, color: Color,
                               action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.system(size: 18))
                Text(title).font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Logic

    private func pollForMovie() async {
        for attempt in 1...20 {
            guard !Task.isCancelled else { return }
            phase = .polling(attempt)
            if let movieId = await dashVM.radarr.findMovieId(tmdbId: result.id) {
                foundMovieId = movieId
                phase = .ready(movieId)
                return
            }
            if attempt < 20 {
                try? await Task.sleep(for: .seconds(3))
            }
        }
        phase = .timedOut
    }

    private func loadAndShowInteractive(movieId: Int) async {
        isLoadingReleases = true
        showInteractive   = true
        releases          = await dashVM.radarr.fetchReleases(movieId: movieId)
        isLoadingReleases = false
    }
}

// MARK: - Release Filter State

struct ReleaseFilter {
    var approvedOnly:    Bool             = false
    var releaseProtocol: ReleaseProto     = .any
    var qualities:       Set<String>      = []
    var indexers:        Set<String>      = []
    var minSeeders:      Int?             = nil
    var maxSizeGB:       Double?          = nil
    var sortOrder:       ReleaseSortOrder = .seeders(asc: false)

    var isActive: Bool {
        approvedOnly || releaseProtocol != .any || !qualities.isEmpty ||
        !indexers.isEmpty || minSeeders != nil || maxSizeGB != nil || sortOrder != .seeders(asc: false)
    }

    var activeCount: Int {
        [approvedOnly, releaseProtocol != .any, !qualities.isEmpty,
         !indexers.isEmpty, minSeeders != nil, maxSizeGB != nil, sortOrder != .seeders(asc: false)]
            .filter { $0 }.count
    }

    enum ReleaseProto: Equatable { case any, torrent, usenet }

    enum ReleaseSortOrder: Equatable {
        case `default`
        case seeders(asc: Bool)
        case size(asc: Bool)
        case age(asc: Bool)

        var label: String {
            switch self {
            case .default:          return "Default"
            case .seeders(let asc): return asc ? "Seeds ↑" : "Seeds ↓"
            case .size(let asc):    return asc ? "Size ↑"  : "Size ↓"
            case .age(let asc):     return asc ? "Age ↑"   : "Age ↓"
            }
        }
    }
}

// MARK: - Interactive Search Sheet

struct InteractiveSearchSheet: View {
    let releases:   [MediaRelease]
    let isLoading:  Bool
    let onRefresh:  () -> Void
    let onSelected: (MediaRelease) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isDismissing   = false
    @State private var filter         = ReleaseFilter()
    @State private var showFilters    = false
    @State private var pendingRelease: MediaRelease? = nil

    private var availableQualities: [String] {
        Array(Set(releases.map(\.quality))).sorted()
    }
    private var availableIndexers: [String] {
        Array(Set(releases.map(\.indexer))).sorted()
    }
    private var hasTorrent: Bool { releases.contains { $0.releaseProtocol == "torrent" } }
    private var hasUsenet:  Bool { releases.contains { $0.releaseProtocol == "usenet"  } }

    private var displayedReleases: [MediaRelease] {
        var result = releases
        if filter.approvedOnly { result = result.filter(\.approved) }
        switch filter.releaseProtocol {
        case .torrent: result = result.filter { $0.releaseProtocol == "torrent" }
        case .usenet:  result = result.filter { $0.releaseProtocol == "usenet"  }
        case .any:     break
        }
        if !filter.qualities.isEmpty { result = result.filter { filter.qualities.contains($0.quality) } }
        if !filter.indexers.isEmpty  { result = result.filter { filter.indexers.contains($0.indexer)  } }
        if let min = filter.minSeeders { result = result.filter { ($0.seeders ?? 0) >= min } }
        if let max = filter.maxSizeGB  { result = result.filter { Double($0.size) / 1_073_741_824 <= max } }
        switch filter.sortOrder {
        case .default:          break
        case .seeders(let asc): result.sort { asc ? ($0.seeders ?? 0) < ($1.seeders ?? 0) : ($0.seeders ?? 0) > ($1.seeders ?? 0) }
        case .size(let asc):    result.sort { asc ? $0.size < $1.size : $0.size > $1.size }
        case .age(let asc):     result.sort { asc ? ($0.ageHours ?? Int.max) < ($1.ageHours ?? Int.max) : ($0.ageHours ?? Int.max) > ($1.ageHours ?? Int.max) }
        }
        return result
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    if filter.isActive {
                        activeChipStrip
                    }

                    if isLoading {
                        Spacer()
                        ProgressView().tint(.white)
                        Spacer()
                    } else if releases.isEmpty {
                        Spacer()
                        Text("No releases found")
                            .font(.system(size: 14))
                            .foregroundStyle(.primary.opacity(0.3))
                        Spacer()
                    } else if displayedReleases.isEmpty {
                        Spacer()
                        VStack(spacing: 10) {
                            Text("No releases match filters")
                                .font(.system(size: 14))
                                .foregroundStyle(.primary.opacity(0.3))
                            Button("Clear Filters") { filter = ReleaseFilter() }
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Color(hex: "#A855F7"))
                        }
                        Spacer()
                    } else {
                        ScrollView {
                            if filter.isActive {
                                Text("Showing \(displayedReleases.count) of \(releases.count)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(.primary.opacity(0.3))
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                    .padding(.horizontal, 16)
                                    .padding(.top, 10)
                            }
                            LazyVStack(spacing: 0) {
                                ForEach(displayedReleases) { release in
                                    ReleaseRow(release: release) { pendingRelease = release }
                                    Divider().opacity(0.1).padding(.leading, 16)
                                }
                            }
                            .padding(.top, 4)
                        }
                    }
                }
            }
            .navigationTitle("Interactive Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        isDismissing = true
                        DispatchQueue.main.async { dismiss() }
                    }
                    .opacity(isDismissing ? 0 : 1)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        onRefresh()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .foregroundStyle(isLoading ? Color.primary.opacity(0.3) : Color(hex: "#00E5A0"))
                    }
                    .disabled(isLoading)
                    filterToolbarButton
                }
            }
            .sheet(isPresented: $showFilters) {
                ReleaseFilterSheet(
                    filter:             $filter,
                    availableQualities: availableQualities,
                    availableIndexers:  availableIndexers,
                    hasTorrent:         hasTorrent,
                    hasUsenet:          hasUsenet
                )
            }
            .confirmationDialog(
                pendingRelease.map { "\($0.quality) · \($0.sizeFormatted)" } ?? "",
                isPresented: Binding(get: { pendingRelease != nil }, set: { if !$0 { pendingRelease = nil } }),
                titleVisibility: .visible
            ) {
                if let release = pendingRelease {
                    Button("Download") { onSelected(release); pendingRelease = nil }
                    Button("Cancel", role: .cancel) { pendingRelease = nil }
                }
            } message: {
                if let release = pendingRelease {
                    Text(release.title)
                }
            }
        }
    }

    // MARK: Filter toolbar button with badge

    private var filterToolbarButton: some View {
        Button { showFilters = true } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(filter.isActive ? Color(hex: "#A855F7") : .primary.opacity(0.6))
                if filter.activeCount > 0 {
                    Text("\(filter.activeCount)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 14, height: 14)
                        .background(Color(hex: "#A855F7"), in: Circle())
                        .offset(x: 6, y: -6)
                }
            }
            .padding(.trailing, 2)
        }
        .buttonStyle(.plain)
    }

    // MARK: Active chip strip

    private var activeChipStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if filter.approvedOnly {
                    activeChip("Approved Only") { filter.approvedOnly = false }
                }
                if filter.releaseProtocol == .torrent {
                    activeChip("Torrent") { filter.releaseProtocol = .any }
                } else if filter.releaseProtocol == .usenet {
                    activeChip("Usenet") { filter.releaseProtocol = .any }
                }
                ForEach(filter.qualities.sorted(), id: \.self) { q in
                    activeChip(q) { filter.qualities.remove(q) }
                }
                ForEach(filter.indexers.sorted(), id: \.self) { idx in
                    activeChip(idx) { filter.indexers.remove(idx) }
                }
                if let min = filter.minSeeders {
                    activeChip("≥\(min) seeds") { filter.minSeeders = nil }
                }
                if let max = filter.maxSizeGB {
                    activeChip("<\(Int(max)) GB") { filter.maxSizeGB = nil }
                }
                if filter.sortOrder != .seeders(asc: false) {
                    activeChip(filter.sortOrder.label) { filter.sortOrder = .seeders(asc: false) }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color.primary.opacity(0.04))
    }

    private func activeChip(_ label: String, onRemove: @escaping () -> Void) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
            Button(action: onRemove) {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
            }
        }
        .foregroundStyle(Color(hex: "#A855F7"))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(hex: "#A855F7").opacity(0.12), in: Capsule())
        .overlay(Capsule().stroke(Color(hex: "#A855F7").opacity(0.3), lineWidth: 0.5))
    }
}

// MARK: - Release Filter Sheet

private struct ReleaseFilterSheet: View {
    @Binding var filter: ReleaseFilter
    let availableQualities: [String]
    let availableIndexers:  [String]
    let hasTorrent:         Bool
    let hasUsenet:          Bool

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {

                        // Status
                        filterSection("Status") {
                            Toggle(isOn: $filter.approvedOnly) {
                                Text("Approved only")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.primary.opacity(0.85))
                            }
                            .tint(Color(hex: "#A855F7"))
                            .padding(.horizontal, 16)
                        }

                        // Protocol — only shown when both exist
                        if hasTorrent && hasUsenet {
                            filterSection("Protocol") {
                                HStack(spacing: 8) {
                                    protoChip("Any",     value: .any)
                                    protoChip("Torrent", value: .torrent)
                                    protoChip("Usenet",  value: .usenet)
                                }
                                .padding(.horizontal, 16)
                            }
                        }

                        // Quality
                        if !availableQualities.isEmpty {
                            filterSection("Quality") {
                                ReleaseChipFlow(spacing: 8) {
                                    ForEach(availableQualities, id: \.self) { q in
                                        multiChip(q, selected: filter.qualities.contains(q),
                                                  color: Color(hex: "#A855F7")) {
                                            toggleSet(&filter.qualities, q)
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }

                        // Indexer
                        if availableIndexers.count > 1 {
                            filterSection("Indexer") {
                                ReleaseChipFlow(spacing: 8) {
                                    ForEach(availableIndexers, id: \.self) { idx in
                                        multiChip(idx, selected: filter.indexers.contains(idx),
                                                  color: Color(hex: "#A855F7")) {
                                            toggleSet(&filter.indexers, idx)
                                        }
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }

                        // Min seeders
                        filterSection("Min Seeders") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    seederChip("Any", value: nil)
                                    seederChip("1+",  value: 1)
                                    seederChip("5+",  value: 5)
                                    seederChip("20+", value: 20)
                                }
                                .padding(.horizontal, 16)
                            }
                        }

                        // Max size
                        filterSection("Max Size") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    sizeChip("Any",    value: nil)
                                    sizeChip("<2 GB",  value: 2)
                                    sizeChip("<5 GB",  value: 5)
                                    sizeChip("<10 GB", value: 10)
                                    sizeChip("<25 GB", value: 25)
                                }
                                .padding(.horizontal, 16)
                            }
                        }

                        // Sort
                        filterSection("Sort By") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    sortChip("Default", value: .default)
                                    sortChip(.seeders(asc: false))
                                    sortChip(.size(asc: false))
                                    sortChip(.age(asc: false))
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }
                    .padding(.vertical, 24)
                }
            }
            .navigationTitle(filter.activeCount > 0 ? "Filters (\(filter.activeCount))" : "Filter Releases")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") { filter = ReleaseFilter() }
                        .foregroundStyle(Color(hex: "#FF4757"))
                        .disabled(!filter.isActive)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: Section wrapper

    private func filterSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(.primary.opacity(0.3))
                .tracking(1.5)
                .padding(.horizontal, 16)
            content()
        }
    }

    // MARK: Chip helpers

    private func protoChip(_ label: String, value: ReleaseFilter.ReleaseProto) -> some View {
        let on = filter.releaseProtocol == value
        return Button { filter.releaseProtocol = value } label: {
            chipLabel(label, on: on, color: Color(hex: "#A855F7"))
        }.buttonStyle(.plain)
    }

    private func multiChip(_ label: String, selected: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) { chipLabel(label, on: selected, color: color) }.buttonStyle(.plain)
    }

    private func seederChip(_ label: String, value: Int?) -> some View {
        let on = filter.minSeeders == value
        return Button { filter.minSeeders = value } label: {
            chipLabel(label, on: on, color: Color(hex: "#00E5A0"))
        }.buttonStyle(.plain)
    }

    private func sizeChip(_ label: String, value: Double?) -> some View {
        let on = filter.maxSizeGB == value
        return Button { filter.maxSizeGB = value } label: {
            chipLabel(label, on: on, color: Color(hex: "#0A84FF"))
        }.buttonStyle(.plain)
    }

    // Default chip (no direction)
    private func sortChip(_ label: String, value: ReleaseFilter.ReleaseSortOrder) -> some View {
        let on = filter.sortOrder == value
        return Button { filter.sortOrder = value } label: {
            chipLabel(label, on: on, color: Color(hex: "#FFD60A"))
        }.buttonStyle(.plain)
    }

    // Directional sort chip — first tap selects with default direction, second tap flips
    private func sortChip(_ value: ReleaseFilter.ReleaseSortOrder) -> some View {
        let isSeeds   = if case .seeders = filter.sortOrder { true } else { false }
        let isSize    = if case .size    = filter.sortOrder { true } else { false }
        let isAge     = if case .age     = filter.sortOrder { true } else { false }
        let on: Bool
        switch value {
        case .seeders: on = isSeeds
        case .size:    on = isSize
        case .age:     on = isAge
        default:       on = false
        }
        let action: () -> Void = {
            switch filter.sortOrder {
            case .seeders(let asc) where on && isSeeds: filter.sortOrder = .seeders(asc: !asc)
            case .size(let asc)    where on && isSize:  filter.sortOrder = .size(asc: !asc)
            case .age(let asc)     where on && isAge:   filter.sortOrder = .age(asc: !asc)
            default: filter.sortOrder = value
            }
        }
        let label = on ? filter.sortOrder.label : value.label
        let isAsc: Bool = {
            switch filter.sortOrder {
            case .seeders(let asc), .size(let asc), .age(let asc): return asc
            default: return false
            }
        }()
        let color: Color = !on ? Color(hex: "#FFD60A") : isAsc ? Color(hex: "#00E5A0") : Color(hex: "#FF9F43")
        return Button(action: action) {
            chipLabel(label, on: on, color: color)
        }.buttonStyle(.plain)
    }

    private func chipLabel(_ text: String, on: Bool, color: Color) -> some View {
        Text(text)
            .font(.system(size: 12, weight: on ? .semibold : .regular))
            .foregroundStyle(on ? color : .primary.opacity(0.45))
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(on ? color.opacity(0.15) : Color.primary.opacity(0.05), in: Capsule())
            .overlay(Capsule().stroke(on ? color.opacity(0.5) : Color.clear, lineWidth: 1))
    }

    private func toggleSet(_ set: inout Set<String>, _ value: String) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }
}

// MARK: - Flow Layout (wrapping chip rows)

private struct ReleaseChipFlow<Content: View>: View {
    let spacing: CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        _FlowLayout(spacing: spacing) { content() }
    }
}

private struct _FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var y: CGFloat = 0; var x: CGFloat = 0; var rowH: CGFloat = 0
        for view in subviews {
            let s = view.sizeThatFits(.unspecified)
            if x + s.width > width, x > 0 { y += rowH + spacing; x = 0; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX; var y = bounds.minY; var rowH: CGFloat = 0
        for view in subviews {
            let s = view.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { y += rowH + spacing; x = bounds.minX; rowH = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
    }
}

// MARK: - Release Row

private struct ReleaseRow: View {
    let release:    MediaRelease
    let onSelected: () -> Void

    var body: some View {
        Button(action: onSelected) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(release.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 8) {
                        tag(release.quality,       color: Color(hex: "#A855F7"))
                        tag(release.sizeFormatted, color: .primary.opacity(0.3))
                        tag(release.indexer,       color: .primary.opacity(0.2))
                        if let seeds = release.seeders {
                            tag("↑\(seeds)", color: Color(hex: "#00E5A0"))
                        }
                        if let leechers = release.leechers {
                            tag("↓\(leechers)", color: Color(hex: "#FF9F43"))
                        }
                        if let age = release.ageHours {
                            let label = age < 24 ? "\(age)h" : "\(age / 24)d"
                            tag(label, color: .primary.opacity(0.2))
                        }
                        if !release.releaseProtocol.isEmpty {
                            tag(release.releaseProtocol, color: .primary.opacity(0.15))
                        }
                    }

                    if !release.approved {
                        Text(release.rejections.first ?? "Not approved")
                            .font(.system(size: 10))
                            .foregroundStyle(Color(hex: "#FF4757"))
                    }
                }
                Spacer()
                Image(systemName: "arrow.down.circle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(release.approved ? Color(hex: "#00E5A0") : Color(hex: "#FF9F43"))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
    }

    private func tag(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12), in: Capsule())
    }
}

// MARK: - Request Detail Sheet

struct RequestDetailSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var isDismissing = false
    let request: OverseerrRequest

    @State private var options:          OverseerrServiceOptions? = nil
    @State private var selectedProfile:  OverseerrQualityProfile? = nil
    @State private var selectedFolder:   OverseerrRootFolder?     = nil
    @State private var monitored:        Bool                     = true
    @State private var radarrMovieId:    Int?                     = nil
    @State private var isLoading         = true
    @State private var isSaving          = false
    @State private var isDeleting        = false
    @State private var showDeleteConfirm = false
    @State private var posterImage:      UIImage?                 = nil
    @State private var resolvedTitle:    String?                  = nil
    @State private var mediaInfo:        OverseerrMediaInfo?      = nil
    @State private var showInteractive   = false
    @State private var releases:         [MediaRelease]           = []
    @State private var isLoadingReleases = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    ScrollView {
                        VStack(spacing: 0) {

                            // MARK: Header — poster | metadata | summary
                            HStack(alignment: .top, spacing: 12) {

                                // Column 1: Poster
                                Group {
                                    if let img = posterImage {
                                        Image(uiImage: img).resizable().scaledToFill()
                                    } else {
                                        Color.primary.opacity(0.06)
                                            .overlay {
                                                Image(systemName: "film")
                                                    .font(.system(size: 28, weight: .thin))
                                                    .foregroundStyle(.primary.opacity(0.2))
                                            }
                                    }
                                }
                                .frame(width: 150, height: 225)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                // Column 2: Metadata
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(resolvedTitle ?? request.title ?? "Unknown")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(2)

                                    HStack(spacing: 6) {
                                        Text(request.status.label)
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 7).padding(.vertical, 3)
                                            .background(request.status.color, in: Capsule())
                                        Text(request.mediaType == "tv" ? "TV" : "Movie")
                                            .font(.system(size: 11))
                                            .foregroundStyle(.primary.opacity(0.4))
                                    }

                                    HStack(spacing: 6) {
                                        if let rating = mediaInfo?.ratingFormatted {
                                            Label(rating, systemImage: "star.fill")
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundStyle(Color(hex: "#FFD700"))
                                        }
                                        if let cert = mediaInfo?.certification, !cert.isEmpty {
                                            Text(cert)
                                                .font(.system(size: 10, weight: .semibold))
                                                .foregroundStyle(.primary.opacity(0.6))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.primary.opacity(0.25), lineWidth: 1))
                                        }
                                        if let runtime = mediaInfo?.runtimeFormatted {
                                            Text(runtime)
                                                .font(.system(size: 11))
                                                .foregroundStyle(.primary.opacity(0.5))
                                        }
                                    }

                                    if let year = mediaInfo?.year {
                                        HStack(spacing: 4) {
                                            Text(year)
                                                .font(.system(size: 11))
                                                .foregroundStyle(.primary.opacity(0.45))
                                            if let s = mediaInfo?.numberOfSeasons {
                                                Text("· \(s) season\(s == 1 ? "" : "s")")
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(.primary.opacity(0.45))
                                            }
                                            if let e = mediaInfo?.numberOfEpisodes {
                                                Text("· \(e) eps")
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(.primary.opacity(0.45))
                                            }
                                        }
                                    }

                                    Spacer(minLength: 0)

                                    HStack(spacing: 4) {
                                        Image(systemName: "person.fill")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.primary.opacity(0.3))
                                        Text(request.requestedBy)
                                            .font(.system(size: 10))
                                            .foregroundStyle(.primary.opacity(0.4))
                                    }
                                    if let date = request.createdAt {
                                        Text(date.formatted(.relative(presentation: .named)))
                                            .font(.system(size: 10))
                                            .foregroundStyle(.primary.opacity(0.3))
                                    }
                                }
                                .frame(width: 140, height: 225, alignment: .topLeading)

                                // Column 3: Summary — fills remaining width
                                ZStack(alignment: .topLeading) {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.primary.opacity(0.04))
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.primary.opacity(0.10), lineWidth: 1)
                                    Text(mediaInfo?.overview?.isEmpty == false ? mediaInfo!.overview! : "No summary available")
                                        .font(.system(size: 12))
                                        .foregroundStyle(mediaInfo?.overview?.isEmpty == false ? Color.primary.opacity(0.65) : Color.primary.opacity(0.2))
                                        .lineSpacing(4)
                                        .lineLimit(nil)
                                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                                        .padding(12)
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 225)
                                .clipped()
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                            .padding(.bottom, 20)

                            // MARK: Genres
                            if let info = mediaInfo, !info.genres.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 6) {
                                        ForEach(info.genres, id: \.self) { genre in
                                            Text(genre)
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundStyle(.primary.opacity(0.7))
                                                .padding(.horizontal, 10).padding(.vertical, 5)
                                                .background(Color.primary.opacity(0.08), in: Capsule())
                                        }
                                    }
                                    .padding(.horizontal, 20)
                                }
                                .padding(.bottom, 16)
                            }

                            Divider().opacity(0.1)


                            // MARK: Cast
                            if let info = mediaInfo, !info.cast.isEmpty {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("CAST")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.primary.opacity(0.3))
                                        .padding(.horizontal, 20)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 10) {
                                            ForEach(info.cast) { member in
                                                VStack(spacing: 4) {
                                                    AsyncImage(url: member.profilePath.flatMap { URL(string: "https://image.tmdb.org/t/p/w185\($0)") }) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Color.primary.opacity(0.06)
                                                            .overlay {
                                                                Image(systemName: "person.fill")
                                                                    .font(.system(size: 18))
                                                                    .foregroundStyle(.primary.opacity(0.15))
                                                            }
                                                    }
                                                    .frame(width: 56, height: 56)
                                                    .clipShape(Circle())

                                                    Text(member.name)
                                                        .font(.system(size: 10, weight: .medium))
                                                        .foregroundStyle(.primary.opacity(0.8))
                                                        .lineLimit(1)
                                                    if let character = member.character, !character.isEmpty {
                                                        Text(character)
                                                            .font(.system(size: 9))
                                                            .foregroundStyle(.primary.opacity(0.4))
                                                            .lineLimit(1)
                                                    }
                                                }
                                                .frame(width: 64)
                                            }
                                        }
                                        .padding(.horizontal, 20)
                                    }
                                }
                                .padding(.vertical, 16)
                                Divider().opacity(0.1)
                            }

                            // MARK: Details rows
                            if let info = mediaInfo {
                                VStack(spacing: 0) {
                                    if !info.directors.isEmpty {
                                        infoRow(label: request.mediaType == "tv" ? "Creator" : "Director",
                                                value: info.directors.joined(separator: ", "))
                                        Divider().opacity(0.07).padding(.leading, 20)
                                    }
                                    if !info.studios.isEmpty {
                                        infoRow(label: request.mediaType == "tv" ? "Network" : "Studio",
                                                value: info.studios.prefix(2).joined(separator: ", "))
                                        Divider().opacity(0.07).padding(.leading, 20)
                                    }
                                }
                                .padding(.vertical, 4)
                                Divider().opacity(0.1)
                            }

                            // MARK: Recommendations
                            if let id = request.tmdbId, dashVM.overseerr.isConnected {
                                RecommendationsRow(tmdbId: id, mediaType: request.mediaType)
                                Divider().opacity(0.1)
                            }

                            // MARK: Edit fields
                            if let opts = options {
                                VStack(spacing: 0) {
                                    if !opts.profiles.isEmpty {
                                        detailRow(label: "Quality Profile", value: selectedProfile?.name ?? "—") {
                                            ForEach(opts.profiles) { p in
                                                Button(p.name) { selectedProfile = p }
                                            }
                                        }
                                        Divider().opacity(0.08).padding(.leading, 20)
                                    }

                                    if !opts.rootFolders.isEmpty {
                                        detailRow(label: "Root Folder", value: selectedFolder.map { folderMenuLabel($0) } ?? "—") {
                                            ForEach(opts.rootFolders) { f in
                                                Button {
                                                    selectedFolder = f
                                                } label: {
                                                    Label(folderMenuLabel(f), systemImage: "internaldrive")
                                                }
                                            }
                                        }
                                        Divider().opacity(0.08).padding(.leading, 20)
                                    }

                                    if request.mediaType == "movie" {
                                        Toggle(isOn: $monitored) {
                                            Text("Monitored")
                                                .font(.system(size: 15))
                                                .foregroundStyle(.primary)
                                        }
                                        .tint(Color(hex: "#A855F7"))
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 14)
                                    }
                                }
                            } else {
                                Text("Not yet in Radarr/Sonarr")
                                    .font(.system(size: 13))
                                    .foregroundStyle(.primary.opacity(0.3))
                                    .padding(20)
                            }

                            Divider().opacity(0.1)

                            // Actions
                            VStack(spacing: 10) {
                                if options != nil && radarrMovieId != nil {
                                    Button {
                                        Task { await save() }
                                    } label: {
                                        HStack(spacing: 8) {
                                            if isSaving { ProgressView().controlSize(.small).tint(.white) }
                                            else { Image(systemName: "checkmark.circle.fill").font(.system(size: 17)) }
                                            Text("Save Changes").font(.system(size: 15, weight: .semibold))
                                        }
                                        .foregroundStyle(.primary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 14)
                                        .background(Color(hex: "#A855F7").opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
                                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#A855F7").opacity(0.4), lineWidth: 1))
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(isSaving || isDeleting)

                                    if request.mediaType == "movie", let mid = radarrMovieId {
                                        Button {
                                            Task { await loadAndShowInteractive(movieId: mid) }
                                        } label: {
                                            HStack(spacing: 8) {
                                                Image(systemName: "list.bullet.circle.fill").font(.system(size: 17))
                                                Text("Interactive Search").font(.system(size: 15, weight: .semibold))
                                            }
                                            .foregroundStyle(.primary)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 14)
                                            .background(Color(hex: "#00E5A0").opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#00E5A0").opacity(0.4), lineWidth: 1))
                                        }
                                        .buttonStyle(.plain)
                                        .disabled(isSaving || isDeleting)
                                    }
                                }

                                Button {
                                    showDeleteConfirm = true
                                } label: {
                                    HStack(spacing: 8) {
                                        if isDeleting { ProgressView().controlSize(.small).tint(.white) }
                                        else { Image(systemName: "trash.circle.fill").font(.system(size: 17)) }
                                        Text("Delete Request").font(.system(size: 15, weight: .semibold))
                                    }
                                    .foregroundStyle(.primary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(Color(hex: "#FF4757").opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(hex: "#FF4757").opacity(0.4), lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                                .disabled(isSaving || isDeleting)
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 20)
                            .padding(.bottom, 32)
                        }
                    }
                }
            }
            .navigationTitle("Request Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        isDismissing = true
                        DispatchQueue.main.async { dismiss() }
                    }
                    .opacity(isDismissing ? 0 : 1)
                }
            }
            .confirmationDialog("Cancel this request?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete Request", role: .destructive) { Task { await deleteRequest() } }
                Button("Keep", role: .cancel) {}
            }
            .sheet(isPresented: $showInteractive) {
                InteractiveSearchSheet(releases: releases, isLoading: isLoadingReleases, onRefresh: {
                    guard let mid = radarrMovieId else { return }
                    Task {
                        isLoadingReleases = true
                        releases          = await dashVM.radarr.fetchReleases(movieId: mid)
                        isLoadingReleases = false
                    }
                }) { release in
                    Task {
                        _ = await dashVM.radarr.downloadRelease(guid: release.guid, indexerId: release.indexerId)
                        showInteractive = false
                        dismiss()
                    }
                }
            }
        }
        .task { await loadState() }
    }

    // MARK: - Helpers

    private func infoRow(label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.4))
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(.primary.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func detailRow<Content: View>(label: String, value: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label).font(.system(size: 16, weight: .medium)).foregroundStyle(.primary)
            Spacer()
            Menu {
                content()
            } label: {
                HStack(spacing: 6) {
                    Text(value).font(.system(size: 15)).foregroundStyle(.primary.opacity(0.85))
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 13, weight: .medium)).foregroundStyle(.primary.opacity(0.6))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    private func folderName(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func folderMenuLabel(_ f: OverseerrRootFolder) -> String {
        let parts   = f.path.split(separator: "/")
        let name    = parts.last.map(String.init) ?? f.path
        let parent  = parts.dropLast().last.map(String.init)
        let display = parent.map { "\($0)/\(name)" } ?? name
        if let free = f.freeSpace {
            return "\(display)  ·  \(formatFreeSpace(free)) free"
        }
        return display
    }

    private func formatFreeSpace(_ bytes: Int64) -> String {
        let d = Double(bytes)
        if d >= 1_099_511_627_776 { return String(format: "%.1f TB", d / 1_099_511_627_776) }
        if d >= 1_073_741_824     { return String(format: "%.0f GB", d / 1_073_741_824) }
        return String(format: "%.0f MB", d / 1_048_576)
    }

    private func loadAndShowInteractive(movieId: Int) async {
        isLoadingReleases = true
        showInteractive   = true
        releases          = await dashVM.radarr.fetchReleases(movieId: movieId)
        isLoadingReleases = false
    }

    private func loadState() async {
        // Fetch rich media info (title, cast, genres, etc.)
        if let tmdbId = request.tmdbId {
            async let infoTask   = dashVM.overseerr.fetchMediaInfo(tmdbId: tmdbId, mediaType: request.mediaType)
            async let optionsTask = dashVM.overseerr.fetchServiceOptions(mediaType: request.mediaType)
            let (info, opts) = await (infoTask, optionsTask)
            mediaInfo = info
            options   = opts
            resolvedTitle = info?.title ?? request.title
            let posterURLStr = info?.posterURL ?? request.posterURL
            if let urlStr = posterURLStr, let url = URL(string: urlStr) {
                posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
            }
        } else {
            options = await dashVM.overseerr.fetchServiceOptions(mediaType: request.mediaType)
            if let urlStr = request.posterURL, let url = URL(string: urlStr) {
                posterImage = await ArtworkCache.shared.fetchAndCache(url: url)
            }
        }

        // Load current Radarr state
        if request.mediaType == "movie", let tmdbId = request.tmdbId {
            if let state = await dashVM.radarr.fetchMovieState(tmdbId: tmdbId) {
                radarrMovieId = state.id
                monitored     = state.monitored
                // Match current profile and folder
                selectedProfile = options?.profiles.first { $0.id == state.qualityProfileId }
                                  ?? options?.profiles.first { $0.name.localizedCaseInsensitiveContains("4k") || $0.name.localizedCaseInsensitiveContains("2160") }
                                  ?? options?.profiles.first
                selectedFolder  = options?.rootFolders.first { $0.path == state.rootFolderPath }
                                  ?? options?.rootFolders.max { ($0.freeSpace ?? 0) < ($1.freeSpace ?? 0) }
            }
        } else {
            selectedProfile = options?.profiles.first { $0.name.localizedCaseInsensitiveContains("4k") || $0.name.localizedCaseInsensitiveContains("2160") }
                              ?? options?.profiles.first
            selectedFolder  = options?.rootFolders.max { ($0.freeSpace ?? 0) < ($1.freeSpace ?? 0) }
                              ?? options?.rootFolders.first
        }

        isLoading = false
    }

    private func save() async {
        guard let movieId = radarrMovieId,
              let profileId = selectedProfile?.id,
              let folderPath = selectedFolder?.path else { return }
        isSaving = true
        _ = await dashVM.radarr.updateMovie(id: movieId, qualityProfileId: profileId,
                                            rootFolderPath: folderPath, monitored: monitored)
        isSaving = false
        dismiss()
    }

    private func deleteRequest() async {
        isDeleting = true
        let ok = await dashVM.overseerr.deleteRequest(id: request.id)
        isDeleting = false
        if ok { dismiss() }
    }
}
