import SwiftUI

struct ContentView: View {
    @Bindable var model: PlayerAppModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    @State private var editorDraft: CharacterDraft?
    @State private var healthDraft: CharacterDraft?
    @State private var conditionsDraft: CharacterDraft?
    @State private var initiativeDraft: InitiativeDraft?
    @State private var inventoryCharacter: PlayerViewDTO?
    @State private var moneyCharacter: PlayerViewDTO?
    @State private var partyTreasureCharacter: PlayerViewDTO?
    @State private var showingSettings = false
    @State private var showingConnectionSheet = false
    @State private var showingPlayerIdentitySheet = false

    var body: some View {
        Group {
            switch model.launchPhase {
            case .connection:
                ConnectionSheetView(
                    serverURLString: $model.serverURLString,
                    statusMessage: model.statusMessage,
                    errorMessage: model.lastError,
                    onConnect: {
                        Task { await model.connect() }
                    },
                    showsCloseButton: false
                )
            case .playerName:
                PlayerIdentitySheetView(
                    playerName: $model.playerName,
                    onSave: {
                        Task { await model.savePlayerName() }
                    },
                    onChangeUser: nil,
                    title: "Join Campaign",
                    footerText: "Enter a player name to join this campaign.",
                    confirmButtonTitle: "Join",
                    showsCloseButton: false,
                    showsChangeUserButton: false
                )
            case .campaign:
                campaignContent
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(
                serverURL: model.normalizedServerURL,
                playerName: model.playerName,
                ownerId: model.ownerId,
                showPlayerNames: $model.showPlayerNames,
                showCharacterConditions: $model.showCharacterConditions,
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
                onSave: {
                    Task { await model.savePlayerName() }
                },
                onChangeUser: {
                    await model.signOut()
                }
            )
        }
        .sheet(item: $initiativeDraft) { draft in
            InitiativeEditorView(
                draft: binding(for: $initiativeDraft, fallback: draft),
                ruleSet: model.ruleSet,
                onSet: { initiative in
                    guard let character = model.gameState?.players.first(where: { $0.id == draft.id }) else {
                        initiativeDraft = nil
                        return
                    }
                    initiativeDraft = nil
                    Task { await model.setInitiative(for: character, initiative: initiative) }
                },
                onRoll: {
                    guard let character = model.gameState?.players.first(where: { $0.id == draft.id }) else {
                        initiativeDraft = nil
                        return
                    }
                    initiativeDraft = nil
                    if let rolled = rollInitiative(standardDie: model.ruleSet?.standardDie, bonus: character.initiativeBonus) {
                        Task { await model.setInitiative(for: character, initiative: rolled) }
                    } else {
                        Task {
                            model.statusMessage = "Unable to roll initiative."
                        }
                    }
                }
            )
            .presentationDetents([.height(240)])
            .presentationDragIndicator(.visible)
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
        .sheet(item: $healthDraft) { draft in
            HealthEditorView(
                draft: binding(for: $healthDraft, fallback: draft),
                ruleSet: model.ruleSet,
                onChange: {
                    guard let healthDraft else { return }
                    Task { await model.saveCharacter(healthDraft) }
                }
            )
            .presentationDetents([.height(220)])
            .presentationDragIndicator(.visible)
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
        .sheet(item: $inventoryCharacter) { character in
            CharacterInventorySheetView(
                character: character,
                serverURLString: model.normalizedServerURL,
                equipmentLibraryItems: model.equipmentLibraryItems,
                categoryIcons: model.ruleSet?.equipmentLibrary?.categoryIcons ?? [:],
                currencySystem: model.ruleSet?.currency,
                commonWeightUnits: model.ruleSet?.equipmentLibrary?.commonWeightUnits,
                onSendToPartyTreasure: { item, quantity in
                    await model.sendInventoryItemToPartyTreasure(item, quantity: quantity, from: character)
                    await MainActor.run {
                        inventoryCharacter = model.myCharacters.first(where: { $0.id == character.id })
                    }
                }
            ) { items in
                await model.saveCharacterInventory(items, for: character)
                await MainActor.run {
                    inventoryCharacter = model.myCharacters.first(where: { $0.id == character.id })
                }
            }
        }
        .sheet(item: $moneyCharacter) { character in
            CharacterMoneySheetView(
                character: character,
                currencySystem: model.ruleSet?.currency
            ) { currency in
                await model.saveCharacterCurrency(currency, for: character)
            }
        }
        .sheet(item: $partyTreasureCharacter) { character in
            PartyTreasureSheetView(
                campaignName: character.name,
                serverURLString: model.normalizedServerURL,
                currencySystem: model.ruleSet?.currency,
                commonWeightUnits: model.ruleSet?.equipmentLibrary?.commonWeightUnits,
                categoryIcons: model.ruleSet?.equipmentLibrary?.categoryIcons ?? [:],
                equipmentLibraryItems: model.equipmentLibraryItems,
                claimTarget: character,
                partyTreasure: model.campaign?.partyTreasure ?? [],
                campaignCurrency: model.campaign?.currency ?? [],
                onClaim: { item, quantity, target in
                    await model.claimPartyTreasureItem(item, quantity: quantity, to: target)
                },
                onSave: { items, currency in
                    await model.savePartyTreasure(items: items, currency: currency)
                }
            )
        }
        .task {
            await model.connect()
        }
    }

    private var campaignContent: some View {
        NavigationStack {
            VStack(spacing: 0) {
                encounterCard
                    .padding(.horizontal)
                    .padding(.top)

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if horizontalSizeClass == .regular {
                            HStack(alignment: .top, spacing: 20) {
                                initiativeSection
                                    .frame(maxWidth: .infinity, alignment: .topLeading)
                            }
                        } else {
                            initiativeSection
                        }
                    }
                    .frame(maxWidth: 1180, alignment: .leading)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .onDisappear {
                model.stopPolling()
            }
        }
    }

    private var encounterCard: some View {
        let encounterPresentation = EncounterPresentationState(
            campaignEncounterState: model.campaign?.encounterState,
            gameEncounterState: model.gameState?.encounterState
        )
        let encounterState = encounterPresentation.effectiveEncounterState
        let canRollInitiativeAll = encounterState == .active
            && model.myCharacters.contains(where: { $0.initiative == nil })
        let canCompleteTurn = encounterPresentation.shouldShowTurnCompleteButton(
            isMyTurn: model.isMyTurn,
            isCompletingTurn: model.isCompletingTurn
        )

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                HStack(alignment: .center, spacing: 12) {
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
                        .frame(width: 64, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.campaign?.name ?? "No campaign connected")
                            .font(.title3.weight(.semibold))
                        Text("Player: \(playerDisplayName)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

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
            }

            ZStack {
                HStack {
                    Button {
                        editorDraft = CharacterDraft.new(ruleSet: model.ruleSet)
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .foregroundStyle(.primary)
                            .frame(width: 18, height: 18)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(isShowingModal || model.playerSession == nil)

                    Spacer(minLength: 0)

                    HStack(spacing: 8) {
                        if canRollInitiativeAll {
                            Button {
                                Task { await model.rollInitiativeForMyCharacters() }
                            } label: {
                                Label("Init", systemImage: "die.face.5")
                                    .labelStyle(.titleAndIcon)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .accessibilityLabel("Roll for Initiative")
                            .disabled(isShowingModal)
                        }

                        if canCompleteTurn {
                            Button {
                                Task { await model.completeTurn() }
                            } label: {
                                Label("Done", systemImage: "checkmark")
                                    .labelStyle(.titleAndIcon)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                            .tint(.green)
                            .accessibilityLabel("Turn Complete")
                            .disabled(isShowingModal || model.isCompletingTurn)
                        }
                    }
                }

                HStack {
                    Spacer(minLength: 0)

                    Text(encounterPresentation.roundIndicatorText(round: model.gameState?.round))
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule(style: .continuous)
                                .fill(roundIndicatorBackground(for: encounterPresentation.roundIndicatorTone()))
                        )
                        .overlay(
                            Capsule(style: .continuous)
                                .strokeBorder(roundIndicatorBorder(for: encounterPresentation.roundIndicatorTone()), lineWidth: 1)
                        )
                        .foregroundStyle(roundIndicatorForeground(for: encounterPresentation.roundIndicatorTone()))
                        .fixedSize(horizontal: true, vertical: false)

                    Spacer(minLength: 0)
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

    private func roundIndicatorBackground(
        for tone: EncounterPresentationState.RoundIndicatorTone
    ) -> Color {
        switch tone {
        case .new:
            return Color(uiColor: .secondarySystemGroupedBackground)
        case .active:
            return Color.green.opacity(0.16)
        case .suspended:
            return Color.red.opacity(0.16)
        }
    }

    private func roundIndicatorBorder(
        for tone: EncounterPresentationState.RoundIndicatorTone
    ) -> Color {
        switch tone {
        case .new:
            return Color(uiColor: .systemGray4)
        case .active:
            return Color.green.opacity(0.45)
        case .suspended:
            return Color.red.opacity(0.45)
        }
    }

    private func roundIndicatorForeground(
        for tone: EncounterPresentationState.RoundIndicatorTone
    ) -> Color {
        switch tone {
        case .new:
            return .secondary
        case .active:
            return .green
        case .suspended:
            return .red
        }
    }

    private var initiativeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let players = model.gameState?.players, !players.isEmpty {
                VStack(spacing: 8) {
                    ForEach(players) { player in
                        encounterOrderRow(for: player)
                    }
                }
            } else {
                emptyCard(message: "No combatants yet.")
            }
        }
    }

    private func encounterOrderRow(for player: PlayerViewDTO) -> some View {
        let isMine = player.isClaimed(by: model.currentPlayerID)
        let canClaim = player.canBeClaimed
        let encounterPresentation = EncounterPresentationState(
            campaignEncounterState: model.campaign?.encounterState,
            gameEncounterState: model.gameState?.encounterState
        )
        let encounterState = encounterPresentation.effectiveEncounterState
        let isCurrentTurn = encounterState == .active && model.gameState?.currentTurnId == player.id
        let canRollInitiative = encounterState == .active
            && model.myCharacters.contains(where: { $0.initiative == nil })
        let displayedInitiative = encounterPresentation.displayedInitiative(player.initiative)
        let isRefereeOwned = player.controllerDisplayName.caseInsensitiveCompare("Referee") == .orderedSame
        let nameBadgeTone = encounterPresentation.nameBadgeTone(
            isMine: isMine,
            isRefereeOwned: isRefereeOwned,
            isClaimable: player.canBeClaimed
        )
        let shouldShowControllerName = encounterPresentation.shouldShowControllerName(
            isMine: isMine,
            showPlayerNames: model.showPlayerNames
        )
        let shouldShowConditions = encounterPresentation.shouldShowConditions(
            isMine: isMine,
            hasConditions: !player.conditions.isEmpty,
            showCharacterConditions: model.showCharacterConditions
        )

        return VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .top) {
                HStack(alignment: .top, spacing: 12) {
                    if isMine {
                        Button {
                            initiativeDraft = InitiativeDraft(character: player)
                        } label: {
                            initiativeBadge(for: player, initiative: displayedInitiative)
                        }
                        .buttonStyle(.plain)
                        .disabled(isShowingModal)
                    } else {
                        initiativeBadge(for: player, initiative: displayedInitiative)
                    }

                    Spacer(minLength: 0)

                    if isMine {
                        Button {
                            healthDraft = CharacterDraft(player: player, ruleSet: model.ruleSet)
                        } label: {
                            healthBadge(for: player)
                        }
                        .buttonStyle(.plain)
                        .disabled(isShowingModal)
                    } else {
                        healthBadge(for: player)
                    }
                }

                if isMine || canClaim {
                    Menu {
                        if isMine {
                            if isCurrentTurn {
                                Button {
                                    Task { await model.completeTurn() }
                                } label: {
                                    Label("Turn Complete", systemImage: "checkmark.circle")
                                }
                            }

                            if canRollInitiative {
                                Button {
                                    Task { await model.rollInitiativeForMyCharacters() }
                                } label: {
                                    Label("Roll for Initiative", systemImage: "die.face.5")
                                }
                            }

                            if isCurrentTurn || canRollInitiative {
                                Divider()
                            }

                            Button {
                                inventoryCharacter = player
                            } label: {
                                Label("Inventory", systemImage: "backpack")
                            }

                            if model.ruleSet?.currency != nil {
                                Button {
                                    moneyCharacter = player
                                } label: {
                                    Label("Money", systemImage: "dollarsign.circle")
                                }
                            }

                            Button {
                                partyTreasureCharacter = player
                            } label: {
                                Label("Party Treasure", systemImage: "shippingbox")
                            }

                            Divider()

                            Button {
                                editorDraft = CharacterDraft(player: player, ruleSet: model.ruleSet)
                            } label: {
                                Label("Edit Character", systemImage: "pencil")
                            }

                            Button {
                                Task { await model.releaseCharacter(player) }
                            } label: {
                                Text("Release \(player.name)")
                            }
                        }

                        if canClaim {
                            Button {
                                Task { await model.claimCharacter(player) }
                            } label: {
                                Text("Claim \(player.name)")
                            }
                        }
                    } label: {
                        nameBadge(
                            title: player.name,
                            tone: nameBadgeTone,
                            isCurrentTurn: isCurrentTurn
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(isShowingModal)
                } else {
                    VStack(alignment: .center, spacing: 4) {
                        nameBadge(
                            title: player.name,
                            tone: nameBadgeTone,
                            isCurrentTurn: isCurrentTurn
                        )

                        if shouldShowControllerName {
                            Text(player.controllerDisplayName)
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                }
            }

            if shouldShowConditions {
                HStack(alignment: .center, spacing: 8) {
                    if isMine {
                        Button {
                            conditionsDraft = CharacterDraft(player: player, ruleSet: model.ruleSet)
                        } label: {
                            Text("🩸")
                                .font(.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isShowingModal)
                    }

                    Text(conditionSummary(for: player))
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(encounterRowBackground(for: player))
        )
        .overlay {
            if isMine {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.blue, lineWidth: 2)
            }
        }
    }

    private func nameBadge(
        title: String,
        tone: EncounterPresentationState.NameBadgeTone,
        isCurrentTurn: Bool
    ) -> some View {
        let colors = nameBadgeStyle(tone: tone)

        return Text(title)
            .font(.headline.weight(isCurrentTurn ? .semibold : .regular))
            .foregroundStyle(colors.foreground)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous)
                    .fill(colors.background)
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(colors.border, lineWidth: 1)
            )
            .frame(maxWidth: 150, alignment: .center)
    }

    private func nameBadgeStyle(
        tone: EncounterPresentationState.NameBadgeTone
    ) -> (foreground: Color, background: Color, border: Color) {
        switch tone {
        case .mine:
            return (
                Color(red: 0.06, green: 0.23, blue: 0.37),
                Color(red: 0.81, green: 0.91, blue: 1.0),
                Color(red: 0.47, green: 0.70, blue: 0.90)
            )
        case .referee:
            return (
                Color(red: 0.42, green: 0.12, blue: 0.12),
                Color(red: 1.0, green: 0.84, blue: 0.84),
                Color(red: 0.88, green: 0.56, blue: 0.56)
            )
        case .unclaimed:
            return (
                Color(red: 0.34, green: 0.11, blue: 0.50),
                Color(red: 0.92, green: 0.84, blue: 0.99),
                Color(red: 0.68, green: 0.51, blue: 0.87)
            )
        case .other:
            return (
                .primary,
                Color(uiColor: .tertiarySystemGroupedBackground),
                Color.primary.opacity(0.08)
            )
        }
    }

    private func displayStats(for character: PlayerViewDTO) -> [StatEntryDTO] {
        let stats = character.stats
        if !stats.isEmpty {
            let preferredKeys = orderedStatKeys()
            var orderedStats: [StatEntryDTO] = preferredKeys.compactMap { key in
                stats.first(where: { $0.key == key })
            }
            let remainingStats = stats.filter { stat in
                !preferredKeys.contains(stat.key)
            }
            orderedStats.append(contentsOf: remainingStats)
            return orderedStats
        }

        let fallbackKey = orderedStatKeys().first ?? "HP"
        return [StatEntryDTO(key: fallbackKey, current: 0, max: 0)]
    }

    private func orderedStatKeys() -> [String] {
        var keys = model.ruleSet?.stats ?? []
        if model.ruleSet?.supportsTempHp == true && !keys.contains("TempHP") {
            keys.append("TempHP")
        }
        if keys.isEmpty {
            keys = ["HP"]
        }
        return keys
    }

    private func statValueText(for stat: StatEntryDTO) -> String {
        stat.key == "TempHP" ? "\(stat.current)" : "\(stat.current)/\(stat.max)"
    }

    private func encounterStatsStyle(for player: PlayerViewDTO) -> (foreground: Color, background: Color) {
        let visibleStats = visibleEncounterStats(for: player)
        guard let summary = healthSummary(for: visibleStats) else {
            return (.secondary, Color(uiColor: .tertiarySystemGroupedBackground))
        }

        let isDead = summary.current <= 0
        let ratio = Double(summary.current) / Double(summary.max)

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

    private func healthSummary(for stats: [StatEntryDTO]) -> (current: Int, max: Int)? {
        let trackedStats = stats.filter { $0.key != "TempHP" }
        guard !trackedStats.isEmpty else { return nil }

        let totals = trackedStats.reduce(into: (current: 0, max: 0)) { partialResult, stat in
            partialResult.current += stat.current
            partialResult.max += stat.max
        }

        guard totals.max > 0 else { return nil }
        return totals
    }

    private func encounterRowBackground(for player: PlayerViewDTO) -> Color {
        if player.id == model.gameState?.currentTurnId {
            return Color.yellow.opacity(0.28)
        }
        return Color(uiColor: .secondarySystemGroupedBackground)
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
        return "Heavily Bloodied"
    }

    private var isShowingModal: Bool {
        editorDraft != nil
            || healthDraft != nil
            || conditionsDraft != nil
            || initiativeDraft != nil
            || inventoryCharacter != nil
            || moneyCharacter != nil
            || partyTreasureCharacter != nil
            || showingSettings
            || showingConnectionSheet
            || showingPlayerIdentitySheet
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
        guard !character.conditions.isEmpty else {
            return AttributedString()
        }

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
        let encounterPresentation = EncounterPresentationState(
            campaignEncounterState: model.campaign?.encounterState,
            gameEncounterState: model.gameState?.encounterState
        )
        return encounterPresentation.currentTurnSubtitle(
            isMyTurn: model.isMyTurn,
            currentTurnName: model.gameState?.currentTurnName,
            rulesetLabel: model.campaign?.rulesetLabel
        )
    }

    private var nextTurnSubtitle: String? {
        let encounterPresentation = EncounterPresentationState(
            campaignEncounterState: model.campaign?.encounterState,
            gameEncounterState: model.gameState?.encounterState
        )
        guard encounterPresentation.effectiveEncounterState == .active else {
            return nil
        }
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

    private func rollInitiative(standardDie: String?, bonus: Int) -> Double? {
        guard let standardDie else { return nil }
        let pattern = /^(\d+)[dD](\d+)$/
        guard let match = standardDie.wholeMatch(of: pattern),
              let count = Int(match.1),
              let sides = Int(match.2),
              count > 0,
              sides > 0 else {
            return nil
        }
        let rollTotal = (0..<count).reduce(0) { partialResult, _ in
            partialResult + Int.random(in: 1...sides)
        }
        return Double(rollTotal + bonus)
    }

    private func formattedInitiative(_ initiative: Double?) -> String {
        let encounterPresentation = EncounterPresentationState(
            campaignEncounterState: model.campaign?.encounterState,
            gameEncounterState: model.gameState?.encounterState
        )
        return encounterPresentation.initiativeText(initiative)
    }

    private func initiativeBadge(for character: PlayerViewDTO, initiative: Double?) -> some View {
        let colors = initiativeBadgeStyle(initiative: initiative)

        return Text(formattedInitiative(initiative))
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous)
                    .fill(colors.background)
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .accessibilityLabel("Initiative for \(character.name)")
    }

    private func initiativeBadgeStyle(initiative: Double?) -> (foreground: Color, background: Color) {
        guard initiative != nil else {
            return (.secondary, Color(uiColor: .tertiarySystemGroupedBackground))
        }

        return (Color(red: 0.06, green: 0.23, blue: 0.37), Color(red: 0.81, green: 0.91, blue: 1.0))
    }

    private func healthBadge(for character: PlayerViewDTO) -> some View {
        let stats = visibleEncounterStats(for: character)
        let summary = healthBadgeText(for: character, stats: stats)
        let colors = encounterStatsStyle(for: character)

        return Text(summary)
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.foreground)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous)
                    .fill(colors.background)
            )
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .accessibilityLabel("Health for \(character.name)")
    }

    private func healthBadgeText(for character: PlayerViewDTO, stats: [StatEntryDTO]) -> String {
        guard let summary = healthSummary(for: stats) else { return "—" }

        let isDead = summary.current <= 0
        let ratio = Double(summary.current) / Double(summary.max)
        if character.ownerId != model.currentPlayerID && !character.revealStats {
            return healthStatusLabel(ratio: ratio, isDead: isDead)
        }

        let hpLine = "HP \(summary.current)/\(summary.max)"
        let tempHp = stats.first(where: { $0.key == "TempHP" && $0.current > 0 })
        if let tempHp {
            return "\(hpLine)\nTemp HP \(tempHp.current)"
        }
        return hpLine
    }

}
