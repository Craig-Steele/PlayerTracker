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
                VStack(spacing: 10) {
                    ForEach(Array(players.enumerated()), id: \.element.id) { index, player in
                        HStack(spacing: 12) {
                            Text("\(index + 1).")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(player.name)
                                    .fontWeight(player.id == model.gameState?.currentTurnId ? .semibold : .regular)
                                Text(player.ownerName)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("Init \(player.initiative)")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(player.id == model.gameState?.currentTurnId ? Color.accentColor.opacity(0.12) : Color(uiColor: .secondarySystemGroupedBackground))
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
