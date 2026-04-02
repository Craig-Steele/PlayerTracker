import SwiftUI

struct ContentView: View {
    @Bindable var model: PlayerAppModel

    @State private var editorDraft: CharacterDraft?
    @State private var conditionsDraft: CharacterDraft?
    @State private var showingSettings = false
    @State private var showingConnectionSheet = false
    @State private var showingPlayerIdentitySheet = false

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
            .navigationTitle("PlayerTracker")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        editorDraft = CharacterDraft.new(ruleSet: model.ruleSet)
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                }
            }
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
                        guard let editorDraft else { return }
                        Task { await model.saveCharacter(editorDraft) }
                    },
                    onDelete: draft.id == nil ? nil : {
                        guard let id = draft.id else { return }
                        Task { await model.deleteCharacter(id: id) }
                    }
                )
            }
            .sheet(item: $conditionsDraft) { draft in
                ConditionsEditorView(
                    draft: binding(for: $conditionsDraft, fallback: draft),
                    ruleSet: model.ruleSet,
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
                if !model.hasPlayerName {
                    showingPlayerIdentitySheet = true
                }
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
                    Text(encounterSubtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let round = model.gameState?.round {
                    Text("Round \(round)")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.accentColor.opacity(0.12)))
                }
            }

            if let error = model.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
            } else {
                Text(model.statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
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
            HStack {
                Text("My Characters")
                    .font(.headline)
                Spacer()
                Button("Player") {
                    showingPlayerIdentitySheet = true
                }
                .buttonStyle(.borderless)
            }

            if model.myCharacters.isEmpty {
                emptyCard(message: "No characters yet. Tap + to add one.")
            } else {
                ForEach(model.myCharacters) { character in
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(character.name)
                    .font(.title3.weight(.semibold))
                Spacer()
                Text("Init \(character.initiative)")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            LazyVGrid(columns: statColumns, alignment: .leading, spacing: 12) {
                ForEach(displayStats(for: character)) { stat in
                    statPod(for: character, stat: stat)
                }
            }

            HStack(spacing: 12) {
                Text(character.conditions.isEmpty ? "Conditions" : character.conditions.joined(separator: ", "))
                    .font(.subheadline)
                    .foregroundStyle(character.conditions.isEmpty ? .secondary : .primary)
                    .lineLimit(2)
                Spacer()
                Button {
                    conditionsDraft = CharacterDraft(player: character, ruleSet: model.ruleSet)
                } label: {
                    Image(systemName: "pencil")
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.bordered)
            }

            HStack {
                Button("Edit") {
                    editorDraft = CharacterDraft(player: character, ruleSet: model.ruleSet)
                }
                .buttonStyle(.bordered)

                Spacer()

                if model.isCurrentTurn(for: character) {
                    Button("Turn Complete") {
                        Task { await model.completeTurn() }
                    }
                    .buttonStyle(.borderedProminent)
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
                .frame(height: 34)
        }
        .buttonStyle(.bordered)
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

    private func binding<Item>(for source: Binding<Item?>, fallback: Item) -> Binding<Item> {
        Binding(
            get: { source.wrappedValue ?? fallback },
            set: { source.wrappedValue = $0 }
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

    private var encounterSubtitle: String {
        if model.isMyTurn {
            return "Your turn"
        }
        if let currentTurnName = model.gameState?.currentTurnName {
            return "Current turn: \(currentTurnName)"
        }
        if let rulesetLabel = model.campaign?.rulesetLabel, !rulesetLabel.isEmpty {
            return rulesetLabel
        }
        return "Waiting for encounter state"
    }
}
