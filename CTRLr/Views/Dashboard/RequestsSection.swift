import SwiftUI

// MARK: - RequestsSection

struct RequestsSection: View {
    @EnvironmentObject var dashVM: DashboardViewModel
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
                                .foregroundStyle(.white.opacity(0.3))
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
    }

    // MARK: - Add request card

    private var addRequestCard: some View {
        Button { showSearch = true } label: {
            VStack(alignment: .leading, spacing: 8) {
                // Poster-sized placeholder
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.04))
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
                    .foregroundStyle(.white)
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

    @State private var posterImage: UIImage?
    @State private var title: String?
    @State private var showDetail = false

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
                        Color.white.opacity(0.06)
                            .overlay {
                                Image(systemName: request.mediaType == "movie" ? "film" : "tv")
                                    .font(.system(size: 28, weight: .thin))
                                    .foregroundStyle(.white.opacity(0.2))
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
                        .foregroundStyle(.white.opacity(0.6))
                        .padding(.horizontal, 8)
                        .padding(.bottom, 8)
                    }
                }
                .frame(width: cardWidth, height: cardHeight)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay { PosterBezel(cornerRadius: 10) }

            // Title — fixed height so all cards align regardless of line count
            Text(title ?? request.title ?? "Loading…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
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

    @State private var isDismissing = false
    @State private var query       = ""
    @State private var results:    [OverseerrSearchResult] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?
    @State private var requesting: Set<Int> = []
    @State private var requested:  Set<Int> = []
    @State private var failed:     Set<Int> = []
    @State private var requestingOptions:  OverseerrSearchResult? = nil
    @State private var selectedRequest:    OverseerrRequest?      = nil
    @State private var isResolvingRequest: Bool                   = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.white.opacity(0.4))
                    TextField("Search movies and TV shows…", text: $query)
                        .foregroundStyle(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onSubmit { runSearch() }
                    if isSearching {
                        ProgressView().controlSize(.small).tint(.white)
                    } else if !query.isEmpty {
                        Button { query = ""; results = [] } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.white.opacity(0.4))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 12)

                // Results
                if results.isEmpty && !query.isEmpty && !isSearching {
                    Spacer()
                    Text("No results")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.3))
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(results) { result in
                                SearchResultRow(
                                    result:       result,
                                    isRequesting: requesting.contains(result.id),
                                    isRequested:  requested.contains(result.id),
                                    isFailed:     failed.contains(result.id),
                                    onRequest:    { submitRequest(result) },
                                    onTap:        { openResult(result) }
                                )
                                Divider().opacity(0.15).padding(.leading, 102)
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .overlay {
                if isResolvingRequest {
                    Color.black.opacity(0.4).ignoresSafeArea()
                    ProgressView().tint(.white).scaleEffect(1.3)
                }
            }
            .background(Color(hex: "#0A0A0F").ignoresSafeArea())
            .safeAreaInset(edge: .bottom) { errorBanner }
            .onChange(of: query) { _, _ in scheduleSearch() }
            .sheet(item: $requestingOptions) { result in
                RequestOptionsSheet(result: result) { ok in
                    if ok { requested.insert(result.id) } else { failed.insert(result.id) }
                    requestingOptions = nil
                }
                .environmentObject(dashVM)
            }
            .sheet(item: $selectedRequest) { request in
                RequestDetailSheet(request: request)
                    .environmentObject(dashVM)
            }
            .navigationTitle("Request Content")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
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

    private func openResult(_ result: OverseerrSearchResult) {
        // Items already in Overseerr (requested or available/in library) → RequestDetailSheet.
        // Everything else → RequestOptionsSheet (add-request flow).
        guard result.isRequested || result.isAvailable else {
            requestingOptions = result; return
        }

        // 1. Already in the live requests list — instant.
        if let match = dashVM.overseerr.requests.first(where: {
            $0.tmdbId == result.id && $0.mediaType == result.mediaType
        }) {
            selectedRequest = match; return
        }

        // 2. requestId embedded in search response — build synthetic request instantly.
        if let synthetic = result.asRequest() {
            selectedRequest = synthetic; return
        }

        // 3. Fetch request ID from the movie/TV detail endpoint.
        isResolvingRequest = true
        Task {
            let rid = await dashVM.overseerr.fetchRequestId(tmdbId: result.id, mediaType: result.mediaType)
            isResolvingRequest = false
            if let rid {
                selectedRequest = OverseerrRequest(
                    id:          rid,
                    status:      OverseerrRequestStatus(rawValue: result.mediaStatus ?? 1) ?? .unknown,
                    mediaType:   result.mediaType,
                    tmdbId:      result.id,
                    requestedBy: "",
                    createdAt:   nil,
                    title:       result.title,
                    posterPath:  result.posterPath,
                    mediaStatus: result.mediaStatus
                )
            } else {
                // No request found — open the add-request flow as fallback.
                requestingOptions = result
            }
        }
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

    private func submitRequest(_ result: OverseerrSearchResult) {
        requestingOptions = result
    }
}

// MARK: - SearchResultRow

private struct SearchResultRow: View {
    let result:       OverseerrSearchResult
    let isRequesting: Bool
    let isRequested:  Bool
    let isFailed:     Bool
    let onRequest:    () -> Void
    let onTap:        () -> Void

    @State private var posterImage: UIImage?

    var body: some View {
        HStack(spacing: 12) {
            // Poster thumbnail
            Group {
                if let img = posterImage {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Color.white.opacity(0.06)
                        .overlay {
                            Image(systemName: result.mediaType == "movie" ? "film" : "tv")
                                .font(.system(size: 18, weight: .thin))
                                .foregroundStyle(.white.opacity(0.2))
                        }
                }
            }
            .frame(width: 70, height: 105)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Info
            VStack(alignment: .leading, spacing: 5) {
                Text(result.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if let year = result.year {
                        Text(year)
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    Text(result.mediaType == "movie" ? "Movie" : "TV Series")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.3))
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(Color.white.opacity(0.08), in: Capsule())
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

            // Action button
            if result.isAvailable || result.isRequested {
                Image(systemName: result.isAvailable ? "checkmark.circle.fill" : "clock.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(result.isAvailable ? Color(hex: "#00E5A0") : Color(hex: "#FF9F43"))
                    .frame(width: 44)
            } else if isRequested {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color(hex: "#00E5A0"))
                    .frame(width: 44)
            } else if isFailed {
                Button(action: onRequest) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(Color(hex: "#FF4757"))
                }
                .buttonStyle(.plain)
                .frame(width: 44)
            } else if isRequesting {
                ProgressView().controlSize(.small).tint(.white).frame(width: 44)
            } else {
                Button(action: onRequest) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Color(hex: "#A855F7"))
                }
                .buttonStyle(.plain)
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




// MARK: - Request Options Sheet

struct RequestOptionsSheet: View {
    @EnvironmentObject var dashVM: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var isDismissing = false
    let result:      OverseerrSearchResult
    let onCompleted: (Bool) -> Void

    @State private var options:         OverseerrServiceOptions? = nil
    @State private var isLoading                                 = true
    @State private var selectedProfile: OverseerrQualityProfile? = nil
    @State private var selectedFolder:  OverseerrRootFolder?     = nil
    @State private var isSubmitting      = false
    @State private var showInteractive   = false
    @State private var releases:         [MediaRelease] = []
    @State private var isLoadingReleases = false
    @State private var searchImmediately = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#0A0A0F").ignoresSafeArea()

                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    ScrollView {
                      VStack(spacing: 0) {
                        // Poster + title
                        HStack(alignment: .top, spacing: 16) {
                            Group {
                                if let url = result.posterURL.flatMap({ URL(string: $0) }) {
                                    AsyncImage(url: url) { img in
                                        img.resizable().scaledToFill()
                                    } placeholder: {
                                        Color.white.opacity(0.06)
                                            .overlay {
                                                ProgressView().tint(.white.opacity(0.3))
                                            }
                                    }
                                } else {
                                    Color.white.opacity(0.06)
                                        .overlay {
                                            Image(systemName: "film")
                                                .font(.system(size: 28, weight: .thin))
                                                .foregroundStyle(.white.opacity(0.2))
                                        }
                                }
                            }
                            .frame(width: 120, height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                            VStack(alignment: .leading, spacing: 6) {
                                Text(result.title)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .lineLimit(4)
                                if let year = result.year {
                                    Text(year)
                                        .font(.system(size: 13))
                                        .foregroundStyle(.white.opacity(0.4))
                                }
                                Text(result.mediaType == "tv" ? "TV Series" : "Movie")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.3))
                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                    .background(Color.white.opacity(0.07), in: Capsule())
                                if let overview = result.overview, !overview.isEmpty {
                                    Divider().opacity(0.1)
                                    Text(overview)
                                        .font(.system(size: 11))
                                        .foregroundStyle(.white.opacity(0.4))
                                        .lineLimit(6)
                                }
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 20)

                        Divider().opacity(0.1)

                        // Pickers
                        if let opts = options {
                            VStack(spacing: 0) {
                                if !opts.profiles.isEmpty {
                                    pickerRow(
                                        label: "Quality Profile",
                                        value: selectedProfile?.name ?? "Default"
                                    ) {
                                        ForEach(opts.profiles) { p in
                                            Button(p.name) { selectedProfile = p }
                                        }
                                    }
                                    Divider().opacity(0.1).padding(.leading, 20)
                                }
                                if !opts.rootFolders.isEmpty {
                                    pickerRow(
                                        label: "Root Folder",
                                        value: selectedFolder.map { folderName($0.path) } ?? "Default"
                                    ) {
                                        ForEach(opts.rootFolders) { f in
                                            Button(folderName(f.path)) { selectedFolder = f }
                                        }
                                    }
                                }
                            }
                        } else {
                            Text("Using server defaults")
                                .font(.system(size: 13))
                                .foregroundStyle(.white.opacity(0.3))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 16)
                        }

                        Divider().opacity(0.1)

                        // Search immediately toggle
                        Toggle(isOn: $searchImmediately) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Search immediately")
                                    .font(.system(size: 15))
                                    .foregroundStyle(.white)
                                Text("Trigger a release search right after adding")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.4))
                            }
                        }
                        .tint(Color(hex: "#CC2260"))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 14)

                        Divider().opacity(0.1)

                        // Action buttons
                        VStack(spacing: 10) {
                            actionButton(
                                title: "Request",
                                icon:  "plus.circle.fill",
                                color: Color(hex: "#A855F7")
                            ) { await submit(andSearch: searchImmediately) }

                            if result.mediaType == "movie" {
                                actionButton(
                                    title: "Interactive Search",
                                    icon:  "list.bullet.circle.fill",
                                    color: Color(hex: "#00E5A0")
                                ) { await submitThenInteractive() }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 20)
                    } // end inner VStack
                    } // end ScrollView
                }
            } // end ZStack
            .navigationTitle("Request Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isDismissing = true
                        DispatchQueue.main.async { dismiss() }
                    }
                    .opacity(isDismissing ? 0 : 1)
                }
            }
            .sheet(isPresented: $showInteractive) {
                InteractiveSearchSheet(releases: releases, isLoading: isLoadingReleases) { release in
                    Task {
                        let ok = await dashVM.radarr.downloadRelease(guid: release.guid, indexerId: release.indexerId)
                        showInteractive = false
                        onCompleted(ok)
                        dismiss()
                    }
                }
            }
        } // end NavigationStack
        .task { await loadOptions() }
    }

    // MARK: - Helpers

    private func pickerRow<Content: View>(label: String, value: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(.white)
            Spacer()
            Menu {
                content()
            } label: {
                HStack(spacing: 4) {
                    Text(value)
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.6))
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private func actionButton(title: String, icon: String, color: Color, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color.opacity(0.2), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(color.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }

    private func folderName(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    private func loadOptions() async {
        options   = await dashVM.overseerr.fetchServiceOptions(mediaType: result.mediaType)
        isLoading = false
        if let opts = options {
            selectedProfile = opts.profiles.first
            selectedFolder  = opts.rootFolders.first
        }
    }

    private func submit(andSearch: Bool) async {
        isSubmitting = true
        let ok = await dashVM.overseerr.submitRequest(
            tmdbId:          result.id,
            mediaType:       result.mediaType,
            numberOfSeasons: result.numberOfSeasons,
            serverId:        options?.serverId,
            profileId:       selectedProfile?.id,
            rootFolder:      selectedFolder?.path
        )
        if ok && andSearch {
            if result.mediaType == "movie" {
                if let movieId = await dashVM.radarr.findMovieId(tmdbId: result.id) {
                    await dashVM.radarr.triggerSearch(movieId: movieId)
                }
            }
        }
        isSubmitting = false
        onCompleted(ok)
        dismiss()
    }

    private func submitThenInteractive() async {
        isSubmitting     = true
        isLoadingReleases = true
        let ok = await dashVM.overseerr.submitRequest(
            tmdbId:          result.id,
            mediaType:       result.mediaType,
            numberOfSeasons: result.numberOfSeasons,
            serverId:        options?.serverId,
            profileId:       selectedProfile?.id,
            rootFolder:      selectedFolder?.path
        )
        guard ok else { isSubmitting = false; onCompleted(false); dismiss(); return }

        showInteractive = true
        isSubmitting    = false

        if let movieId = await dashVM.radarr.findMovieId(tmdbId: result.id) {
            releases          = await dashVM.radarr.fetchReleases(movieId: movieId)
        }
        isLoadingReleases = false
    }
}

// MARK: - Interactive Search Sheet

struct InteractiveSearchSheet: View {
    let releases:   [MediaRelease]
    let isLoading:  Bool
    let onSelected: (MediaRelease) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isDismissing = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "#0A0A0F").ignoresSafeArea()

                if isLoading {
                    ProgressView().tint(.white)
                } else if releases.isEmpty {
                    Text("No releases found")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.3))
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(releases) { release in
                                ReleaseRow(release: release) {
                                    onSelected(release)
                                }
                                Divider().opacity(0.1).padding(.leading, 16)
                            }
                        }
                        .padding(.top, 4)
                    }
                }
            }
            .navigationTitle("Interactive Search")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isDismissing = true
                        DispatchQueue.main.async { dismiss() }
                    }
                    .opacity(isDismissing ? 0 : 1)
                }
            }
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
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 8) {
                        tag(release.quality,  color: Color(hex: "#A855F7"))
                        tag(release.sizeFormatted, color: .white.opacity(0.3))
                        tag(release.indexer,  color: .white.opacity(0.2))
                        if let seeds = release.seeders {
                            tag("↑\(seeds)", color: Color(hex: "#00E5A0"))
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
                Color(hex: "#0A0A0F").ignoresSafeArea()

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
                                        Color.white.opacity(0.06)
                                            .overlay {
                                                Image(systemName: "film")
                                                    .font(.system(size: 28, weight: .thin))
                                                    .foregroundStyle(.white.opacity(0.2))
                                            }
                                    }
                                }
                                .frame(width: 150, height: 225)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                // Column 2: Metadata
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(resolvedTitle ?? request.title ?? "Unknown")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .lineLimit(2)

                                    HStack(spacing: 6) {
                                        Text(request.status.label)
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 7).padding(.vertical, 3)
                                            .background(request.status.color, in: Capsule())
                                        Text(request.mediaType == "tv" ? "TV" : "Movie")
                                            .font(.system(size: 11))
                                            .foregroundStyle(.white.opacity(0.4))
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
                                                .foregroundStyle(.white.opacity(0.6))
                                                .padding(.horizontal, 5).padding(.vertical, 2)
                                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color.white.opacity(0.25), lineWidth: 1))
                                        }
                                        if let runtime = mediaInfo?.runtimeFormatted {
                                            Text(runtime)
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white.opacity(0.5))
                                        }
                                    }

                                    if let year = mediaInfo?.year {
                                        HStack(spacing: 4) {
                                            Text(year)
                                                .font(.system(size: 11))
                                                .foregroundStyle(.white.opacity(0.45))
                                            if let s = mediaInfo?.numberOfSeasons {
                                                Text("· \(s) season\(s == 1 ? "" : "s")")
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(.white.opacity(0.45))
                                            }
                                            if let e = mediaInfo?.numberOfEpisodes {
                                                Text("· \(e) eps")
                                                    .font(.system(size: 11))
                                                    .foregroundStyle(.white.opacity(0.45))
                                            }
                                        }
                                    }

                                    Spacer(minLength: 0)

                                    HStack(spacing: 4) {
                                        Image(systemName: "person.fill")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.white.opacity(0.3))
                                        Text(request.requestedBy)
                                            .font(.system(size: 10))
                                            .foregroundStyle(.white.opacity(0.4))
                                    }
                                    if let date = request.createdAt {
                                        Text(date.formatted(.relative(presentation: .named)))
                                            .font(.system(size: 10))
                                            .foregroundStyle(.white.opacity(0.3))
                                    }
                                }
                                .frame(width: 140, height: 225, alignment: .topLeading)

                                // Column 3: Summary — fills remaining width
                                ZStack(alignment: .topLeading) {
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(Color.white.opacity(0.04))
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                                    Text(mediaInfo?.overview?.isEmpty == false ? mediaInfo!.overview! : "No summary available")
                                        .font(.system(size: 12))
                                        .foregroundStyle(mediaInfo?.overview?.isEmpty == false ? Color.white.opacity(0.65) : Color.white.opacity(0.2))
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
                                                .foregroundStyle(.white.opacity(0.7))
                                                .padding(.horizontal, 10).padding(.vertical, 5)
                                                .background(Color.white.opacity(0.08), in: Capsule())
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
                                        .foregroundStyle(.white.opacity(0.3))
                                        .padding(.horizontal, 20)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 10) {
                                            ForEach(info.cast) { member in
                                                VStack(spacing: 4) {
                                                    AsyncImage(url: member.profilePath.flatMap { URL(string: "https://image.tmdb.org/t/p/w185\($0)") }) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Color.white.opacity(0.06)
                                                            .overlay {
                                                                Image(systemName: "person.fill")
                                                                    .font(.system(size: 18))
                                                                    .foregroundStyle(.white.opacity(0.15))
                                                            }
                                                    }
                                                    .frame(width: 56, height: 56)
                                                    .clipShape(Circle())

                                                    Text(member.name)
                                                        .font(.system(size: 10, weight: .medium))
                                                        .foregroundStyle(.white.opacity(0.8))
                                                        .lineLimit(1)
                                                    if let character = member.character, !character.isEmpty {
                                                        Text(character)
                                                            .font(.system(size: 9))
                                                            .foregroundStyle(.white.opacity(0.4))
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
                                        detailRow(label: "Root Folder", value: selectedFolder.map { folderName($0.path) } ?? "—") {
                                            ForEach(opts.rootFolders) { f in
                                                Button(folderName(f.path)) { selectedFolder = f }
                                            }
                                        }
                                        Divider().opacity(0.08).padding(.leading, 20)
                                    }

                                    if request.mediaType == "movie" {
                                        Toggle(isOn: $monitored) {
                                            Text("Monitored")
                                                .font(.system(size: 15))
                                                .foregroundStyle(.white)
                                        }
                                        .tint(Color(hex: "#A855F7"))
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 14)
                                    }
                                }
                            } else {
                                Text("Not yet in Radarr/Sonarr")
                                    .font(.system(size: 13))
                                    .foregroundStyle(.white.opacity(0.3))
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
                                        .foregroundStyle(.white)
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
                                            .foregroundStyle(.white)
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
                                    .foregroundStyle(.white)
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
                ToolbarItem(placement: .cancellationAction) {
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
                InteractiveSearchSheet(releases: releases, isLoading: isLoadingReleases) { release in
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
                .foregroundStyle(.white.opacity(0.4))
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func detailRow<Content: View>(label: String, value: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label).font(.system(size: 15)).foregroundStyle(.white)
            Spacer()
            Menu {
                content()
            } label: {
                HStack(spacing: 4) {
                    Text(value).font(.system(size: 14)).foregroundStyle(.white.opacity(0.6))
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 11)).foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private func folderName(_ path: String) -> String {
        path.split(separator: "/").last.map(String.init) ?? path
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
                                  ?? options?.profiles.first
                selectedFolder  = options?.rootFolders.first { $0.path == state.rootFolderPath }
                                  ?? options?.rootFolders.first
            }
        } else {
            selectedProfile = options?.profiles.first
            selectedFolder  = options?.rootFolders.first
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
