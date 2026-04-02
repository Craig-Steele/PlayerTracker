import SwiftUI

struct ContentView: View {
    @Bindable var model: PlayerAppModel

    @State private var editorDraft: CharacterDraft?
    @State private var conditionsDraft: CharacterDraft?
    @State private var showingSettings = false
    @State private var showingConnectionSheet = false
    @State private var showingPlayerIdentitySheet = false
    @State private var collapsedCharacterIDs: Set<UUID> = []

    private let statColumns = [
        GridItem(.adaptive(minimum: 108), spacing: 12, alignment: .top)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    encounterCard
                    myCharactersSection
                    initiativeSection
                }
                .padding()
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .sheet(isPresented: $showingSettings) {
                SettingsView(
                    serverURL: model.normalizedServerURL,
                    playerName: model.playerName,
                    ownerId: model.ownerId,
                    onChangeConnection: {
                        showingSettings = false
                        showingConnectionSheet = true
                    },
                    onChangePlayer: {
                        showingSettings = false
                        showingPlayerIdentitySheet = true
                    }
                )
            }
            .sheet(isPresented: $showingConnectionSheet) {
                ConnectionSheetView(
                    serverURLString: $model.serverURLString,
                    statusMessage: model.statusMessage,
                    errorMessage: model.lastError,
                    onConnect: {
                        Task { await model.connect() }
                    }
                )
            }
            .sheet(isPresented: $showingPlayerIdentitySheet) {
                PlayerIdentitySheetView(
                    playerName: $model.playerName,
                    ownerId: model.ownerId,
                    onSave: {
                        Task { await model.savePlayerName() }
                    }
                )
            }
            .sheet(item: $editorDraft) { draft in
                CharacterEditorView(
                    draft: binding(for: $editorDraft, fallback: draft),
                    ruleSet: model.ruleSet,
                    onManageConditions: {
                        conditionsDraft = editorDraft ?? draft
                    },
                    onSave: {
                        guard let draftToSave = editorDraft else { return }
                        editorDraft = nil
                        Task { await model.saveCharacter(draftToSave) }
                    },
                    onDelete: draft.id == nil ? nil : {
                        guard let id = draft.id else { return }
                        editorDraft = nil
                        Task { await model.deleteCharacter(id: id) }
                    }
                )
            }
            .sheet(item: $conditionsDraft) { draft in
                ConditionsEditorView(
                    draft: binding(for: $conditionsDraft, fallback: draft),
                    ruleSet: model.ruleSet,
                    serverURLString: model.normalizedServerURL,
                    onSave: {
                        guard let conditionsDraft else { return }
                        if editorDraft?.id == conditionsDraft.id {
                            editorDraft = conditionsDraft
                        }
                        Task { await model.saveConditions(for: conditionsDraft) }
                    }
                )
            }
            .task {
                await model.connect()
            }
            .onDisappear {
                model.stopPolling()
            }
        }
    }

    private var encounterCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.campaign?.name ?? "No campaign connected")
                        .font(.title3.weight(.semibold))
                    Text("Player: \(playerDisplayName)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if let round = model.gameState?.round {
                        Text("Round \(round)")
                            .font(.subheadline.weight(.semibold))
                    }
                    Text(currentTurnSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(model.isMyTurn ? .red : .primary)
                    if let nextTurnSubtitle {
                        Text(nextTurnSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 10) {
                    if let iconURL = rulesetIconURL {
                        AsyncImage(url: iconURL) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .scaledToFit()
                            default:
                                EmptyView()
                            }
                        }
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }

                    HStack(spacing: 10) {
                        Button {
                            showingSettings = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .foregroundStyle(.primary)
                                .frame(width: 18, height: 18)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isShowingModal)

                        Button {
                            editorDraft = CharacterDraft.new(ruleSet: model.ruleSet)
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .foregroundStyle(.primary)
                                .frame(width: 18, height: 18)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isShowingModal)
                    }
                }
            }

            if let error = model.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
    }

    private var myCharactersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.myCharacters.isEmpty {
                emptyCard(message: "No characters yet. Tap + to add one.")
            } else {
                ForEach(sortedMyCharacters) { character in
                    characterCard(character)
                }
            }
        }
    }

    private var initiativeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Encounter Order")
                .font(.headline)

            if let players = model.gameState?.players, !players.isEmpty {
                VStack(spacing: 8) {
                    ForEach(players) { player in
                        HStack(alignment: .top, spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(player.name)
                                    .font(.subheadline.weight(player.id == model.gameState?.currentTurnId ? .semibold : .regular))
                                Text("\(player.ownerName) • Init \(player.initiative)")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }

                            Spacer(minLength: 8)

                            VStack(alignment: .trailing, spacing: 4) {
                                Text(encounterStatsText(for: player))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(encounterStatsStyle(for: player).foreground)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(
                                        Capsule()
                                            .fill(encounterStatsStyle(for: player).background)
                                    )

                                if !player.conditions.isEmpty {
                                    Text(conditionSummary(for: player))
                                        .font(.caption)
                                        .foregroundStyle(.primary)
                                        .multilineTextAlignment(.trailing)
                                        .lineLimit(2)
                                }
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(player.id == model.gameState?.currentTurnId ? Color.yellow.opacity(0.28) : Color(uiColor: .secondarySystemGroupedBackground))
                        )
                    }
                }
            } else {
                emptyCard(message: "No combatants yet.")
            }
        }
    }

    private func characterCard(_ character: PlayerViewDTO) -> some View {
        let isExpanded = !collapsedCharacterIDs.contains(character.id)
        let isCurrentTurn = model.isCurrentTurn(for: character)

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Button {
                    toggleExpanded(for: character)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(character.name)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(isCurrentTurn ? .red : .primary)
                    }
                }
                .buttonStyle(.plain)
                Spacer()
                if isExpanded {
                    Text("Init \(character.initiative)")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }

            if isExpanded {
                LazyVGrid(columns: statColumns, alignment: .leading, spacing: 12) {
                    ForEach(displayStats(for: character)) { stat in
                        statPod(for: character, stat: stat)
                    }
                }

                HStack(spacing: 12) {
                    if character.conditions.isEmpty {
                        Text("Conditions")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    } else {
                        Text(conditionSummary(for: character))
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                            .lineLimit(3)
                    }
                    Spacer()
                    Button {
                        conditionsDraft = CharacterDraft(player: character, ruleSet: model.ruleSet)
                    } label: {
                        Image(systemName: "pencil")
                            .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                )

                HStack {
                    Button("Edit") {
                        editorDraft = CharacterDraft(player: character, ruleSet: model.ruleSet)
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    if isCurrentTurn {
                        Button("Turn Complete") {
                            Task { await model.completeTurn() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
    }

    private func statPod(for character: PlayerViewDTO, stat: StatEntryDTO) -> some View {
        VStack(spacing: 8) {
            statAdjustButton(systemName: "plus", character: character, stat: stat, delta: 1)
            Text(stat.key)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(statValueText(for: stat))
                .font(.headline.monospacedDigit())
            statAdjustButton(systemName: "minus", character: character, stat: stat, delta: -1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(uiColor: .tertiarySystemGroupedBackground))
        )
    }

    private func statAdjustButton(systemName: String, character: PlayerViewDTO, stat: StatEntryDTO, delta: Int) -> some View {
        Button {
            Task { await model.adjustStat(for: character, statKey: stat.key, delta: delta) }
        } label: {
            Image(systemName: systemName)
                .font(.headline.weight(.bold))
                .frame(maxWidth: .infinity)
                .frame(height: 26)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private func displayStats(for character: PlayerViewDTO) -> [StatEntryDTO] {
        let stats = character.stats
        if !stats.isEmpty {
            return stats
        }

        let fallbackKey = model.ruleSet?.stats?.first ?? "HP"
        return [StatEntryDTO(key: fallbackKey, current: 0, max: 0)]
    }

    private func statValueText(for stat: StatEntryDTO) -> String {
        stat.key == "TempHP" ? "\(stat.current)" : "\(stat.current)/\(stat.max)"
    }

    private func encounterStatsText(for player: PlayerViewDTO) -> String {
        let visibleStats = visibleEncounterStats(for: player)

        if player.ownerId == model.ownerId || player.revealStats {
            return visibleStats
                .map { stat in
                    stat.key == "TempHP" ? "\(stat.key) \(stat.current)" : "\(stat.key) \(stat.current)/\(stat.max)"
                }
                .joined(separator: " • ")
        }

        let trackedStats = visibleStats.filter { $0.key != "TempHP" }
        guard let primary = trackedStats.first else { return "—" }
        let isDead = primary.current <= 0
        let ratio = primary.max > 0 ? Double(primary.current) / Double(primary.max) : 0
        return healthStatusLabel(ratio: ratio, isDead: isDead)
    }

    private func encounterStatsStyle(for player: PlayerViewDTO) -> (foreground: Color, background: Color) {
        let visibleStats = visibleEncounterStats(for: player)
        let trackedStats = visibleStats.filter { $0.key != "TempHP" }
        guard let primary = trackedStats.first else {
            return (.secondary, Color(uiColor: .tertiarySystemGroupedBackground))
        }

        let isDead = primary.current <= 0
        let ratio = primary.max > 0 ? Double(primary.current) / Double(primary.max) : 0

        if isDead {
            return (.white, Color(red: 0.29, green: 0.29, blue: 0.29))
        }
        if ratio >= 1 {
            return (Color(red: 0.06, green: 0.23, blue: 0.37), Color(red: 0.81, green: 0.91, blue: 1.0))
        } else if ratio > 0.75 {
            return (Color(red: 0.07, green: 0.29, blue: 0.11), Color(red: 0.84, green: 0.96, blue: 0.84))
        } else if ratio > 0.5 {
            return (Color(red: 0.37, green: 0.29, blue: 0.0), Color(red: 1.0, green: 0.95, blue: 0.70))
        } else if ratio > 0.25 {
            return (Color(red: 0.42, green: 0.23, blue: 0.0), Color(red: 1.0, green: 0.84, blue: 0.70))
        }
        return (Color(red: 0.35, green: 0.04, blue: 0.04), Color(red: 1.0, green: 0.76, blue: 0.76))
    }

    private func visibleEncounterStats(for player: PlayerViewDTO) -> [StatEntryDTO] {
        let stats = displayStats(for: player)
        let orderedStats = stats.filter { $0.key != "TempHP" || $0.current > 0 }
        return orderedStats.isEmpty ? stats : orderedStats
    }

    private func healthStatusLabel(ratio: Double, isDead: Bool) -> String {
        if isDead {
            return "Dead"
        }
        if ratio >= 1 {
            return "Full"
        } else if ratio > 0.75 {
            return "Slight Damage"
        } else if ratio > 0.5 {
            return "Some Damage"
        } else if ratio > 0.25 {
            return "Bloodied"
        }
        return "Heavily Blooded"
    }

    private var isShowingModal: Bool {
        editorDraft != nil
            || conditionsDraft != nil
            || showingSettings
            || showingConnectionSheet
            || showingPlayerIdentitySheet
    }

    private var sortedMyCharacters: [PlayerViewDTO] {
        model.myCharacters.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private var playerDisplayName: String {
        let trimmedName = model.playerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedName.isEmpty ? "Not set" : trimmedName
    }

    private var serverBaseURL: URL? {
        let trimmed = model.normalizedServerURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let normalized = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "http://\(trimmed)"
        return URL(string: normalized)
    }

    private var rulesetIconURL: URL? {
        guard let icon = model.ruleSet?.icon?.trimmingCharacters(in: .whitespacesAndNewlines),
              !icon.isEmpty else {
            return nil
        }

        if icon.hasPrefix("http://") || icon.hasPrefix("https://") {
            return URL(string: icon)
        }

        guard let baseURL = serverBaseURL else { return nil }
        let path = icon.hasPrefix("/") ? icon : "/rulesets/\(icon)"
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    private func conditionURL(named name: String) -> URL? {
        guard let definition = model.ruleSet?.conditions.first(where: { $0.name == name }),
              let description = definition.description?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: description),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            return nil
        }
        return url
    }

    private func conditionSummary(for character: PlayerViewDTO) -> AttributedString {
        var summary = AttributedString()

        for (index, condition) in character.conditions.enumerated() {
            if index > 0 {
                summary.append(AttributedString(", "))
            }

            var fragment = AttributedString(condition)
            if let url = conditionURL(named: condition) {
                fragment.link = url
                fragment.foregroundColor = .accentColor
                fragment.underlineStyle = .single
            }
            summary.append(fragment)
        }

        return summary
    }

    private func binding<Item>(for source: Binding<Item?>, fallback: Item) -> Binding<Item> {
        Binding(
            get: { source.wrappedValue ?? fallback },
            set: {
                guard source.wrappedValue != nil else { return }
                source.wrappedValue = $0
            }
        )
    }

    private func emptyCard(message: String) -> some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
            )
    }

    private var currentTurnSubtitle: String {
        if model.isMyTurn, let currentTurnName = model.gameState?.currentTurnName {
            return "Your turn: \(currentTurnName)"
        }
        if let currentTurnName = model.gameState?.currentTurnName {
            return "Current turn: \(currentTurnName)"
        }
        if let rulesetLabel = model.campaign?.rulesetLabel, !rulesetLabel.isEmpty {
            return rulesetLabel
        }
        return "Waiting for encounter state"
    }

    private var nextTurnSubtitle: String? {
        guard let players = model.gameState?.players,
              !players.isEmpty,
              let currentTurnId = model.gameState?.currentTurnId,
              let currentIndex = players.firstIndex(where: { $0.id == currentTurnId }) else {
            return nil
        }

        let nextIndex = players.index(after: currentIndex)
        let wrappedIndex = nextIndex == players.endIndex ? players.startIndex : nextIndex
        let nextPlayer = players[wrappedIndex]
        return "Next turn: \(nextPlayer.name)"
    }

    private func toggleExpanded(for character: PlayerViewDTO) {
        if collapsedCharacterIDs.contains(character.id) {
            collapsedCharacterIDs.remove(character.id)
        } else {
            collapsedCharacterIDs.insert(character.id)
        }
    }
}
