import Foundation
import SwiftUI
import UIKit

struct CharacterInventorySheetView: View {
    let character: PlayerViewDTO
    let serverURLString: String
    let equipmentLibraryItems: [EquipmentLibraryItemDTO]
    let categoryIcons: [String: String]
    let currencySystem: CurrencySystemDTO?
    let commonWeightUnits: [String]?
    let onSendToPartyTreasure: ((InventoryEntryDTO, Int) async -> Void)?
    let onSave: ([InventoryEntryDTO]) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var drafts: [InventoryEntryDraft]
    @State private var loadedEquipmentLibraryItems: [EquipmentLibraryItemDTO]
    @State private var editingContext: InventoryEntryEditorContext?
    @State private var pendingItemRemovalDraft: InventoryEntryDraft?
    @State private var pendingContainerRemovalDraft: InventoryEntryDraft?
    @State private var pendingTransferDraft: InventoryEntryDraft?
    @State private var validationMessage: String?
    @State private var loadMessage: String?
    @State private var isSaving = false

    init(
        character: PlayerViewDTO,
        serverURLString: String,
        equipmentLibraryItems: [EquipmentLibraryItemDTO],
        categoryIcons: [String: String],
        currencySystem: CurrencySystemDTO?,
        commonWeightUnits: [String]?,
        onSendToPartyTreasure: ((InventoryEntryDTO, Int) async -> Void)? = nil,
        onSave: @escaping ([InventoryEntryDTO]) async -> Void
    ) {
        self.character = character
        self.serverURLString = serverURLString
        self.equipmentLibraryItems = equipmentLibraryItems
        self.categoryIcons = categoryIcons
        self.currencySystem = currencySystem
        self.commonWeightUnits = commonWeightUnits
        self.onSendToPartyTreasure = onSendToPartyTreasure
        self.onSave = onSave
        _drafts = State(initialValue: InventoryEntryDraft.drafts(from: character.inventory))
        _loadedEquipmentLibraryItems = State(initialValue: equipmentLibraryItems)
    }

    var body: some View {
        let containerLabels = InventoryDraftOperations.containerDisplayLabels(in: drafts)
        NavigationStack {
            List {
                if drafts.isEmpty {
                    Section {
                        Text("No inventory items.")
                            .foregroundStyle(.secondary)
                    } header: {
                        Text(character.name)
                    }
                } else {
                    Section {
                        if rootEquippedItems.isEmpty {
                            Text("No equipped items.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(rootEquippedItems) { draft in
                                inventoryRow(for: draft, containerLabels: containerLabels)
                            }
                        }
                    } header: {
                        HStack {
                            Text("Equipped")
                            Spacer(minLength: 12)
                            Text(
                                "Wt: " + InventoryDisplayFormatting.formattedWeight(
                                    InventoryDraftOperations.totalWeight(for: rootEquippedItems),
                                    commonWeightUnits: commonWeightUnits
                                )
                            )
                        }
                    }

                    ForEach(topLevelContainerEntries) { container in
                        let containedItems = items(inContainer: container.id)
                        let weight = Double(container.weight.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
                            + InventoryDraftOperations.totalWeight(for: containedItems)
                        Section {
                            inventoryRow(for: container, containerLabels: containerLabels)
                            if containedItems.isEmpty {
                                Text("No items in this container.")
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(containedItems) { draft in
                                    inventoryRow(for: draft, containerLabels: containerLabels)
                                }
                            }
                        } header: {
                            HStack {
                                Text(containerSectionTitle(for: container, containerLabels: containerLabels))
                                Spacer(minLength: 2)
                                Text("Wt: " + InventoryDisplayFormatting.formattedWeight(weight, commonWeightUnits: commonWeightUnits))
                            }
                        }
                    }
                }
            }
            .navigationTitle("Inventory: " + character.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Add Item") {
                        editingContext = InventoryEntryEditorContext(
                            originalID: nil,
                            draft: InventoryEntryDraft(),
                            title: "Add Item"
                        )
                    }
                    .disabled(isSaving)
                }
            }
            .overlay(alignment: .bottom) {
                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(uiColor: .systemRed))
                        .padding(.bottom, 12)
                } else if let loadMessage {
                    Text(loadMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.bottom, 12)
                }
            }
        }
        .task {
            await loadEquipmentLibraryIfNeeded()
        }
        .onChange(of: character.inventory) { _, newInventory in
            syncDrafts(from: newInventory)
        }
        .sheet(item: $editingContext) { context in
            InventoryEntryEditorSheetView(
                title: context.title,
                draft: context.draft,
                serverURLString: serverURLString,
                equipmentLibraryItems: loadedEquipmentLibraryItems,
                containerOptions: InventoryDraftOperations.containerSelectionOptions(for: context.draft, in: drafts),
                onCancel: {
                    editingContext = nil
                },
                onSave: { updatedDraft in
                    upsertDraft(updatedDraft, replacing: context.originalID)
                    editingContext = nil
                    Task { await persistInventory() }
                }
            )
        }
        .confirmationDialog(
            "Remove Item?",
            isPresented: Binding(
                get: { pendingItemRemovalDraft != nil },
                set: { if !$0 { pendingItemRemovalDraft = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove Item", role: .destructive) {
                guard let draft = pendingItemRemovalDraft else { return }
                pendingItemRemovalDraft = nil
                Task { await removeInventoryEntry(draft.id) }
            }
            Button("Keep Item", role: .cancel) {
                pendingItemRemovalDraft = nil
            }
        } message: {
            Text(pendingItemRemovalDraft.map { draft in
                let trimmedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
                return "Remove \(trimmedName.isEmpty ? "this item" : trimmedName)?"
            } ?? "Remove this item?")
        }
        .confirmationDialog(
            "Remove Container?",
            isPresented: Binding(
                get: { pendingContainerRemovalDraft != nil },
                set: { if !$0 { pendingContainerRemovalDraft = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Keep Container and Contents", role: .cancel) {
                pendingContainerRemovalDraft = nil
            }
            Button("Keep Contents") {
                guard let draft = pendingContainerRemovalDraft else { return }
                pendingContainerRemovalDraft = nil
                Task { await removeInventoryEntry(draft.id, moveContainedItems: true) }
            }
            Button("Discard Contents", role: .destructive) {
                guard let draft = pendingContainerRemovalDraft else { return }
                pendingContainerRemovalDraft = nil
                Task { await removeInventoryEntry(draft.id, moveContainedItems: false) }
            }
        } message: {
            Text("Choose what should happen to the container and the items inside it.")
        }
        .sheet(item: $pendingTransferDraft) { draft in
                InventoryTransferQuantitySheetView(
                    title: "Send to Party Treasure",
                    itemName: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    availableQuantity: max(1, Int(draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 1),
                    actionTitle: "Send",
                    onConfirm: { quantity in
                        pendingTransferDraft = nil
                        let transferItem = draft.toDTOOrNil() ?? draft.fallbackTransferDTO()
                        Task {
                            if let onSendToPartyTreasure {
                                await onSendToPartyTreasure(transferItem, quantity)
                            }
                        }
                    },
                onCancel: {
                    pendingTransferDraft = nil
                }
            )
        }
    }

    private var rootEquippedItems: [InventoryEntryDraft] {
        drafts.filter { !$0.isContainer && InventoryDraftOperations.containerID(for: $0) == nil }
    }

    private var topLevelContainerEntries: [InventoryEntryDraft] {
        drafts.filter { $0.isContainer && InventoryDraftOperations.containerID(for: $0) == nil }
    }

    private func items(inContainer containerID: UUID) -> [InventoryEntryDraft] {
        drafts.filter { !$0.isContainer && InventoryDraftOperations.containerID(for: $0) == containerID }
    }

    private func containerSectionTitle(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> String {
        containerLabels[draft.id] ?? InventoryDraftOperations.containerDisplayLabel(for: draft, in: drafts)
    }

    @ViewBuilder
    private func inventoryRow(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> some View {
        HStack(spacing: 10) {
            Menu {
                inventoryMenuDetails(for: draft, containerLabels: containerLabels)

                Button {
                    editingContext = InventoryEntryEditorContext(
                        originalID: draft.id,
                        draft: draft,
                        title: draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? "Edit Item"
                            : draft.name
                    )
                } label: {
                    Label("Edit", systemImage: "pencil")
                }

                if !draft.isContainer {
                    if let onSendToPartyTreasure {
                        Button {
                            pendingTransferDraft = draft
                        } label: {
                            Label("Send to Party Treasure", systemImage: "shippingbox.circle")
                        }
                    }

                    let moveTargets = containerMoveTargets(for: draft)
                    if !moveTargets.isEmpty || normalizedContainerID(for: draft) != nil {
                        Menu {
                            if normalizedContainerID(for: draft) != nil {
                                Button {
                                    Task { await moveInventoryEntry(draft.id, to: nil) }
                                } label: {
                                    Label("Move to Inventory", systemImage: "bag")
                                }
                            }

                            ForEach(moveTargets) { target in
                                Button {
                                    Task { await moveInventoryEntry(draft.id, to: target.id) }
                                } label: {
                                    Text(target.label)
                                }
                            }
                        } label: {
                            Label("Move to Container", systemImage: "shippingbox")
                        }
                    }
                }

                if draft.isContainer {
                    Button(role: .destructive) {
                        pendingContainerRemovalDraft = draft
                    } label: {
                        Label("Remove Container", systemImage: "trash")
                    }
                } else {
                    Button(role: .destructive) {
                        pendingItemRemovalDraft = draft
                    } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(inventoryGlyph(for: draft))
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 24, height: 24)

                    Text(itemDisplayText(for: draft, containerLabels: containerLabels))
                        .font(.body)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                }
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func inventoryMenuDetails(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> some View {
        Text("\(inventoryGlyph(for: draft)) \(itemDisplayText(for: draft, containerLabels: containerLabels))")
            .lineLimit(1)
        Text("Value: \(InventoryDisplayFormatting.formattedValue(draft.value, currencySystem: currencySystem))")
        Text("Weight: \(InventoryDisplayFormatting.formattedWeight(draft.weight, commonWeightUnits: commonWeightUnits))")
        if let url = inventoryURL(for: draft) {
            Link("URL: \(displayHost(for: url))", destination: url)
        }
        Divider()
    }

    private func normalizedContainerID(for draft: InventoryEntryDraft) -> UUID? {
        InventoryDraftOperations.containerID(for: draft)
    }

    private func containerMoveTargets(for draft: InventoryEntryDraft) -> [InventoryDraftOperations.MoveTarget] {
        InventoryDraftOperations.containerMoveTargets(for: draft, in: drafts)
    }

    private func moveInventoryEntry(_ entryID: UUID, to containerID: UUID?) async {
        guard !isSaving else { return }
        guard let updatedDrafts = InventoryDraftOperations.movedDrafts(drafts, entryID: entryID, to: containerID) else {
            return
        }
        drafts = updatedDrafts
        await persistInventory()
    }

    private func removeInventoryEntry(_ entryID: UUID, moveContainedItems: Bool = false) async {
        guard !isSaving else { return }
        guard let updatedDrafts = InventoryDraftOperations.removedDrafts(
            drafts,
            entryID: entryID,
            moveContainedItems: moveContainedItems
        ) else {
            return
        }
        drafts = updatedDrafts
        await persistInventory()
    }

    private func upsertDraft(_ draft: InventoryEntryDraft, replacing originalID: UUID?) {
        guard let originalID else {
            drafts.append(draft)
            return
        }
        if let index = drafts.firstIndex(where: { $0.id == originalID }) {
            drafts[index] = draft
        } else {
            drafts.append(draft)
        }
    }

    private func inventoryGlyph(for draft: InventoryEntryDraft) -> String {
        InventoryCategoryIcons.glyph(for: draft, categoryIcons: categoryIcons)
    }

    private func itemDisplayText(for draft: InventoryEntryDraft) -> String {
        itemDisplayText(for: draft, containerLabels: InventoryDraftOperations.containerDisplayLabels(in: drafts))
    }

    private func itemDisplayText(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> String {
        if draft.isContainer, let label = containerLabels[draft.id] {
            return label
        }
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = name.isEmpty ? "Item" : name
        let quantity = draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
        guard quantity.isEmpty == false, quantity != "1" else {
            return displayName
        }
        return "\(displayName) (\(quantity))"
    }

    private func syncDrafts(from inventory: [InventoryEntryDTO]?) {
        let syncedDrafts = InventoryEntryDraft.drafts(from: inventory)
        guard drafts != syncedDrafts else { return }
        drafts = syncedDrafts
    }

    private func inventoryURL(for draft: InventoryEntryDraft) -> URL? {
        let trimmed = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: trimmed) ?? URL(string: "https://\(trimmed)")
    }

    private func inventoryDTO(for draft: InventoryEntryDraft) -> InventoryEntryDTO {
        (try? draft.toDTO()) ?? InventoryEntryDTO(
            id: draft.id,
            name: draft.name,
            quantity: Int(draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 1,
            value: Double(draft.value.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0,
            weight: Double(draft.weight.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0,
            url: {
                let trimmed = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }(),
            category: draft.category.isEmpty ? nil : draft.category,
            containerId: draft.containerId.isEmpty ? nil : UUID(uuidString: draft.containerId),
            isContainer: draft.isContainer
        )
    }

    private func displayHost(for url: URL) -> String {
        let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !host.isEmpty {
            return host
        }
        let raw = url.absoluteString
        let stripped = raw.replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
        return stripped.split(separator: "/").first.map(String.init) ?? raw
    }

    private func persistInventory() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            validationMessage = nil
            let items = try drafts.map { try $0.toDTO() }
            await onSave(items)
        } catch {
            validationMessage = error.localizedDescription
        }
    }

    private func loadEquipmentLibraryIfNeeded() async {
        guard loadedEquipmentLibraryItems.isEmpty else { return }
        do {
            let client = try APIClient(baseURLString: serverURLString)
            let response = try await client.fetchEquipmentLibrary(limit: 0)
            loadedEquipmentLibraryItems = response.items
            loadMessage = nil
        } catch {
            loadMessage = "Equipment lookup unavailable."
        }
    }
}

private struct InventoryEntryEditorContext: Identifiable {
    let id = UUID()
    let originalID: UUID?
    let draft: InventoryEntryDraft
    let title: String
}

private struct InventoryEntryEditorSheetView: View {
    let title: String
    let serverURLString: String
    let equipmentLibraryItems: [EquipmentLibraryItemDTO]
    let containerOptions: [InventoryDraftOperations.ContainerSelectionOption]
    let onCancel: () -> Void
    let onSave: (InventoryEntryDraft) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var localDraft: InventoryEntryDraft
    @State private var loadedEquipmentLibraryItems: [EquipmentLibraryItemDTO]
    @State private var validationMessage: String?
    @State private var presetName: String = ""
    @State private var showItemMatches = false

    init(
        title: String,
        draft: InventoryEntryDraft,
        serverURLString: String,
        equipmentLibraryItems: [EquipmentLibraryItemDTO],
        containerOptions: [InventoryDraftOperations.ContainerSelectionOption],
        onCancel: @escaping () -> Void,
        onSave: @escaping (InventoryEntryDraft) async -> Void
    ) {
        self.title = title
        self.serverURLString = serverURLString
        self.equipmentLibraryItems = equipmentLibraryItems
        self.containerOptions = containerOptions
        self.onCancel = onCancel
        self.onSave = onSave
        _localDraft = State(initialValue: draft)
        _loadedEquipmentLibraryItems = State(initialValue: equipmentLibraryItems)
        _presetName = State(initialValue: draft.name)
    }

    var body: some View {
        let libraryItems = loadedEquipmentLibraryItems.isEmpty ? equipmentLibraryItems : loadedEquipmentLibraryItems
        let itemMatches = InventoryDraftOperations.equipmentLibraryMatches(
            query: localDraft.name,
            in: libraryItems
        )
        NavigationStack {
            Form {
                Section {
                    InventoryEntryEditorFieldRow(
                        title: "Item",
                        text: $localDraft.name,
                        textAlignment: .leading
                    )
                    .onChange(of: localDraft.name) { _, newValue in
                        applyPreset(for: newValue)
                    }
                    Toggle("Show item matches", isOn: $showItemMatches)
                    if showItemMatches, !localDraft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        if itemMatches.isEmpty {
                            Text("No catalog matches. Keep typing or use a custom item name.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(Array(itemMatches.prefix(8))) { item in
                                Button {
                                    localDraft.name = item.name
                                    applyPreset(for: item.name)
                                    showItemMatches = false
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name)
                                            .foregroundStyle(.primary)
                                        if let category = item.category?.trimmingCharacters(in: .whitespacesAndNewlines),
                                           !category.isEmpty {
                                            Text(category)
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    InventoryEntryEditorFieldRow(
                        title: "Category",
                        text: $localDraft.category,
                        textAlignment: .leading
                    )
                    InventoryEntryEditorFieldRow(
                        title: "Qty",
                        text: $localDraft.quantity,
                        keyboardType: .numberPad
                    )
                    InventoryEntryEditorFieldRow(
                        title: "Value",
                        text: $localDraft.value,
                        keyboardType: .decimalPad
                    )
                    InventoryEntryEditorFieldRow(
                        title: "Weight",
                        text: $localDraft.weight,
                        keyboardType: .decimalPad
                    )
                    InventoryEntryEditorFieldRow(
                        title: "Link",
                        text: $localDraft.url,
                        keyboardType: .URL,
                        textAlignment: .leading,
                        autocapitalization: .never,
                        autocorrectionDisabled: true
                    )
                    InventoryEntryEditorContainerSelectorRow(
                        title: "In Container",
                        selection: $localDraft.containerId,
                        options: containerOptions,
                        isDisabled: localDraft.isContainer
                    )
                    InventoryEntryEditorToggleRow(title: "Is Container", isOn: $localDraft.isContainer)
                } footer: {
                    Text("Type any item name. Turn on item matches if you want to browse catalog suggestions.")
                }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                }
            }
            .overlay(alignment: .bottom) {
                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(uiColor: .systemRed))
                        .padding(.bottom, 12)
                }
            }
        }
        .onAppear {
            applyPreset(for: localDraft.name)
        }
        .task {
            await loadEquipmentLibraryIfNeeded()
        }
        .onChange(of: localDraft.isContainer) { _, isContainer in
            if isContainer {
                localDraft.containerId = ""
            }
        }
    }

    private func applyPreset(for itemName: String) {
        let libraryItems = loadedEquipmentLibraryItems.isEmpty ? equipmentLibraryItems : loadedEquipmentLibraryItems
        guard let preset = EquipmentPreset.findEquipmentPreset(
            itemName: itemName,
            equipmentLibraryItems: libraryItems
        ) else {
            presetName = ""
            return
        }

        presetName = preset.name
        if localDraft.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || localDraft.value == "0" {
            if let value = preset.value {
                localDraft.value = formatNumber(value)
            }
        }
        if localDraft.weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || localDraft.weight == "0" {
            if let weight = preset.weight {
                localDraft.weight = formatNumber(weight)
            }
        }
        if localDraft.url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let url = preset.url,
           !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            localDraft.url = url
        }
        if localDraft.category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let category = preset.category,
           !category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            localDraft.category = category
        }
    }

    private func loadEquipmentLibraryIfNeeded() async {
        guard loadedEquipmentLibraryItems.isEmpty else { return }
        do {
            let client = try APIClient(baseURLString: serverURLString)
            let response = try await client.fetchEquipmentLibrary(limit: 0)
            loadedEquipmentLibraryItems = response.items
            applyPreset(for: localDraft.name)
        } catch {
            return
        }
    }

    private func save() async {
        do {
            validationMessage = nil
            _ = try localDraft.toDTO()
            await onSave(localDraft)
            dismiss()
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}

struct CharacterMoneySheetView: View {
    let character: PlayerViewDTO
    let currencySystem: CurrencySystemDTO?
    let onSave: ([CurrencyAmountDTO]) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var drafts: [CurrencyAmountDraft]
    @State private var validationMessage: String?
    @State private var isSaving = false

    init(
        character: PlayerViewDTO,
        currencySystem: CurrencySystemDTO?,
        onSave: @escaping ([CurrencyAmountDTO]) async -> Void
    ) {
        self.character = character
        self.currencySystem = currencySystem
        self.onSave = onSave
        _drafts = State(initialValue: CurrencyAmountDraft.buildDrafts(
            from: character.currency ?? [],
            currencySystem: currencySystem
        ))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if drafts.isEmpty {
                        Text("No money recorded.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach($drafts) { $draft in
                            CurrencyAmountEditorRow(draft: $draft)
                        }
                    }
                } 
            }
            .navigationTitle("Money: " + character.name)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(isSaving)
                }
            }
            .overlay(alignment: .bottom) {
                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(uiColor: .systemRed))
                        .padding(.bottom, 12)
                }
            }
        }
    }

    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            validationMessage = nil
            let currency = try drafts.map { try $0.toDTO() }
            await onSave(currency)
            dismiss()
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}

struct PartyTreasureMoneySheetView: View {
    let campaignName: String?
    let currencySystem: CurrencySystemDTO?
    let onSave: ([CurrencyAmountDraft]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var drafts: [CurrencyAmountDraft]
    @State private var validationMessage: String?
    @State private var isSaving = false

    init(
        campaignName: String?,
        currencySystem: CurrencySystemDTO?,
        drafts: [CurrencyAmountDraft],
        onSave: @escaping ([CurrencyAmountDraft]) -> Void
    ) {
        self.campaignName = campaignName
        self.currencySystem = currencySystem
        self.onSave = onSave
        _drafts = State(initialValue: drafts)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if drafts.isEmpty {
                        Text("No party money recorded.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach($drafts) { $draft in
                            CurrencyAmountEditorRow(draft: $draft)
                        }
                    }
                }
            }
            .navigationTitle("Money: " + (campaignName ?? "Party Treasure"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(isSaving)
                }
            }
            .overlay(alignment: .bottom) {
                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(uiColor: .systemRed))
                        .padding(.bottom, 12)
                }
            }
        }
    }

    private func save() {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            validationMessage = nil
            _ = try drafts.map { try $0.toDTO() }
            onSave(drafts)
            dismiss()
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}

struct PartyTreasureSheetView: View {
    let campaignName: String?
    let serverURLString: String
    let currencySystem: CurrencySystemDTO?
    let commonWeightUnits: [String]?
    let categoryIcons: [String: String]
    let equipmentLibraryItems: [EquipmentLibraryItemDTO]
    let claimTarget: PlayerViewDTO
    let partyTreasure: [InventoryEntryDTO]
    let campaignCurrency: [CurrencyAmountDTO]
    let onClaim: (InventoryEntryDTO, Int, PlayerViewDTO) async -> Void
    let onSave: ([InventoryEntryDTO], [CurrencyAmountDTO]) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var itemDrafts: [InventoryEntryDraft]
    @State private var moneyDrafts: [CurrencyAmountDraft]
    @State private var loadedEquipmentLibraryItems: [EquipmentLibraryItemDTO]
    @State private var editingContext: InventoryEntryEditorContext?
    @State private var pendingNewItemID: UUID?
    @State private var showingMoneyEditor = false
    @State private var pendingClaimDraft: InventoryEntryDraft?
    @State private var validationMessage: String?
    @State private var isSaving = false

    init(
        campaignName: String?,
        serverURLString: String,
        currencySystem: CurrencySystemDTO?,
        commonWeightUnits: [String]?,
        categoryIcons: [String: String],
        equipmentLibraryItems: [EquipmentLibraryItemDTO],
        claimTarget: PlayerViewDTO,
        partyTreasure: [InventoryEntryDTO],
        campaignCurrency: [CurrencyAmountDTO],
        onClaim: @escaping (InventoryEntryDTO, Int, PlayerViewDTO) async -> Void,
        onSave: @escaping ([InventoryEntryDTO], [CurrencyAmountDTO]) async -> Void
    ) {
        self.campaignName = campaignName
        self.serverURLString = serverURLString
        self.currencySystem = currencySystem
        self.commonWeightUnits = commonWeightUnits
        self.categoryIcons = categoryIcons
        self.equipmentLibraryItems = equipmentLibraryItems
        self.claimTarget = claimTarget
        self.partyTreasure = partyTreasure
        self.campaignCurrency = campaignCurrency
        self.onClaim = onClaim
        self.onSave = onSave
        _itemDrafts = State(initialValue: partyTreasure.map(InventoryEntryDraft.init))
        _loadedEquipmentLibraryItems = State(initialValue: equipmentLibraryItems)
        _moneyDrafts = State(initialValue: CurrencyAmountDraft.buildDrafts(
            from: campaignCurrency,
            currencySystem: currencySystem
        ))
    }

    var body: some View {
        let containerLabels = InventoryDraftOperations.containerDisplayLabels(in: itemDrafts)
        let containerOptions = InventoryDraftOperations.containerSelectionOptions(in: itemDrafts)
        let itemWeight = InventoryDraftOperations.totalWeight(for: itemDrafts)
        NavigationStack {
            List {
                Section {
                    Button {
                        showingMoneyEditor = true
                    } label: {
                        InventoryEntrySummaryRow(
                            glyph: "🪙",
                            text: moneySummaryText()
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                } header: {
                    HStack {
                        Text("Money")
                        Spacer(minLength: 12)
                        Text("Tap to edit")
                    }
                }

                Section {
                    if itemDrafts.isEmpty {
                        Text("No party treasure items.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(itemDrafts) { draft in
                            partyTreasureRow(for: draft, containerLabels: containerLabels)
                        }
                    }
                } header: {
                    HStack {
                        Text(campaignName ?? "Party Treasure")
                        Spacer(minLength: 12)
                        Text("Wt: " + InventoryDisplayFormatting.formattedWeight(itemWeight, commonWeightUnits: commonWeightUnits))
                    }
                }
            }
            .navigationTitle("Party Treasure")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Add Item") {
                        let draft = InventoryEntryDraft()
                        itemDrafts.append(draft)
                        pendingNewItemID = draft.id
                        editingContext = InventoryEntryEditorContext(
                            originalID: draft.id,
                            draft: draft,
                            title: "Add Item"
                        )
                    }
                    .disabled(isSaving)
                }
            }
            .sheet(isPresented: $showingMoneyEditor) {
                PartyTreasureMoneySheetView(
                    campaignName: campaignName,
                    currencySystem: currencySystem,
                    drafts: moneyDrafts
                ) { updatedDrafts in
                    moneyDrafts = updatedDrafts
                }
            }
            .sheet(item: $pendingClaimDraft) { draft in
                InventoryTransferQuantitySheetView(
                    title: "Claim Party Treasure",
                    itemName: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    availableQuantity: max(1, Int(draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 1),
                    actionTitle: "Claim",
                    onConfirm: { quantity in
                        pendingClaimDraft = nil
                        let item = draft.toDTOOrNil() ?? draft.fallbackTransferDTO()
                        Task { await onClaim(item, quantity, claimTarget) }
                    },
                    onCancel: {
                        pendingClaimDraft = nil
                    }
                )
            }
            .sheet(item: $editingContext) { context in
                let libraryItems = loadedEquipmentLibraryItems.isEmpty ? equipmentLibraryItems : loadedEquipmentLibraryItems
                InventoryEntryEditorSheetView(
                    title: context.title,
                    draft: context.draft,
                    serverURLString: serverURLString,
                    equipmentLibraryItems: libraryItems,
                    containerOptions: containerOptions.filter { $0.id != context.draft.id },
                    onCancel: {
                        if let pendingNewItemID, pendingNewItemID == context.originalID {
                            removeItemDraft(id: pendingNewItemID)
                            self.pendingNewItemID = nil
                        }
                        editingContext = nil
                    },
                    onSave: { draft in
                        if pendingNewItemID == context.originalID {
                            pendingNewItemID = nil
                        }
                        upsertDraft(draft, replacing: context.originalID)
                        editingContext = nil
                        Task { await persistItems() }
                    }
                )
            }
            .overlay(alignment: .bottom) {
                if let validationMessage {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(uiColor: .systemRed))
                        .padding(.bottom, 12)
                }
            }
        }
        .onChange(of: partyTreasure) { _, newValue in
            syncItemDrafts(from: newValue)
        }
        .onChange(of: campaignCurrency) { _, newValue in
            syncMoneyDrafts(from: newValue)
        }
        .task {
            await loadEquipmentLibraryIfNeeded()
        }
    }

    private func syncItemDrafts(from treasure: [InventoryEntryDTO]) {
        let syncedDrafts = InventoryEntryDraft.drafts(from: treasure)
        guard itemDrafts != syncedDrafts else { return }
        itemDrafts = syncedDrafts
    }

    private func syncMoneyDrafts(from currency: [CurrencyAmountDTO]) {
        let syncedDrafts = CurrencyAmountDraft.buildDrafts(
            from: currency,
            currencySystem: currencySystem
        )
        guard moneyDrafts != syncedDrafts else { return }
        moneyDrafts = syncedDrafts
    }

    private func loadEquipmentLibraryIfNeeded() async {
        guard loadedEquipmentLibraryItems.isEmpty else { return }
        do {
            let client = try APIClient(baseURLString: serverURLString)
            let response = try await client.fetchEquipmentLibrary(limit: 0)
            loadedEquipmentLibraryItems = response.items
        } catch {
            return
        }
    }

    private func removeItemDraft(id: UUID) {
        itemDrafts.removeAll { $0.id == id }
    }

    private func upsertDraft(_ draft: InventoryEntryDraft, replacing originalID: UUID?) {
        guard let originalID else {
            itemDrafts.append(draft)
            return
        }
        if let index = itemDrafts.firstIndex(where: { $0.id == originalID }) {
            itemDrafts[index] = draft
        } else {
            itemDrafts.append(draft)
        }
    }

    @ViewBuilder
    private func partyTreasureRow(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> some View {
        HStack(spacing: 10) {
            Menu {
                partyTreasureMenuDetails(for: draft, containerLabels: containerLabels)

                Button {
                    editingContext = InventoryEntryEditorContext(
                        originalID: draft.id,
                        draft: draft,
                        title: draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? "Edit Item"
                            : draft.name
                    )
                } label: {
                    Label("Edit", systemImage: "pencil")
                }

                if !draft.isContainer {
                    Button {
                        pendingClaimDraft = draft
                    } label: {
                        Label("Claim to \(claimTarget.name)", systemImage: "person.crop.circle.badge.plus")
                    }
                }

                Button(role: .destructive) {
                    removeItemDraft(id: draft.id)
                    Task { await persistItems() }
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                HStack(spacing: 10) {
                    Text(inventoryEntryGlyph(for: draft, categoryIcons: categoryIcons))
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 24, height: 24)

                    Text(partyTreasureItemDisplayText(for: draft, containerLabels: containerLabels))
                        .font(.body)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .multilineTextAlignment(.leading)
                }
            }
            .buttonStyle(.plain)
            .disabled(isSaving)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func partyTreasureMenuDetails(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> some View {
        Text("\(inventoryEntryGlyph(for: draft, categoryIcons: categoryIcons)) \(partyTreasureItemDisplayText(for: draft, containerLabels: containerLabels))")
            .lineLimit(1)
        Text("Value: \(InventoryDisplayFormatting.formattedValue(draft.value, currencySystem: currencySystem))")
        Text("Weight: \(InventoryDisplayFormatting.formattedWeight(draft.weight, commonWeightUnits: commonWeightUnits))")
        if let url = partyTreasureURL(for: draft) {
            Link("URL: \(partyTreasureDisplayHost(for: url))", destination: url)
        }
        Divider()
    }

    private func partyTreasureItemDisplayText(
        for draft: InventoryEntryDraft,
        containerLabels: [UUID: String]
    ) -> String {
        partyTreasureEntryDisplayText(for: draft, containerLabels: containerLabels)
    }

    private func moneySummaryText() -> String {
        let parts = moneyDrafts.compactMap { draft -> String? in
            let amount = draft.amount.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !amount.isEmpty, amount != "0" else { return nil }
            return "\(amount) \(draft.label)"
        }
        return parts.isEmpty ? "No party money recorded." : parts.joined(separator: ", ")
    }

    private func partyTreasureURL(for draft: InventoryEntryDraft) -> URL? {
        let trimmed = draft.url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: trimmed) ?? URL(string: "https://\(trimmed)")
    }

    private func partyTreasureDisplayHost(for url: URL) -> String {
        let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !host.isEmpty {
            return host
        }
        let raw = url.absoluteString
        let stripped = raw.replacingOccurrences(of: #"^https?://"#, with: "", options: .regularExpression)
        return stripped.split(separator: "/").first.map(String.init) ?? raw
    }

    private func persistItems() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            validationMessage = nil
            let items = try itemDrafts.map { try $0.toDTO() }
            let currency = try moneyDrafts.map { try $0.toDTO() }
            await onSave(items, currency)
        } catch {
            validationMessage = error.localizedDescription
        }
    }
}

private struct InventoryEntryEditorRow: View {
    @Binding var draft: InventoryEntryDraft
    let containerOptions: [InventoryDraftOperations.ContainerSelectionOption]
    let containerLabels: [UUID: String]
    let onDelete: () -> Void

    var body: some View {
        Section {
            InventoryEntryEditorFieldRow(
                title: "Item",
                text: $draft.name,
                textAlignment: .leading
            )
            InventoryEntryEditorFieldRow(
                title: "Category",
                text: $draft.category,
                textAlignment: .leading
            )
            InventoryEntryEditorFieldRow(
                title: "Qty",
                text: $draft.quantity,
                keyboardType: .numberPad
            )
            InventoryEntryEditorFieldRow(
                title: "Value",
                text: $draft.value,
                keyboardType: .decimalPad
            )
            InventoryEntryEditorFieldRow(
                title: "Weight",
                text: $draft.weight,
                keyboardType: .decimalPad
            )
            InventoryEntryEditorFieldRow(
                title: "Link",
                text: $draft.url,
                keyboardType: .URL,
                textAlignment: .leading,
                autocapitalization: .never,
                autocorrectionDisabled: true
            )
            InventoryEntryEditorContainerSelectorRow(
                title: "In Container",
                selection: $draft.containerId,
                options: containerOptions,
                isDisabled: draft.isContainer
            )
            InventoryEntryEditorToggleRow(title: "Is Container", isOn: $draft.isContainer)
            .onChange(of: draft.isContainer) { _, isContainer in
                if isContainer {
                    draft.containerId = ""
                }
            }
        } header: {
            Text(
                draft.isContainer
                    ? (containerLabels[draft.id] ?? "Container")
                    : (draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Item" : draft.name)
            )
        } footer: {
            Button("Remove Item", role: .destructive, action: onDelete)
        }
    }
}

private struct InventoryEntrySummaryRow: View {
    let glyph: String
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Text(glyph)
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(width: 24, height: 24)

            Text(text)
                .font(.body)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
        }
        .padding(.vertical, 4)
    }
}

private struct InventoryTransferQuantitySheetView: View {
    let title: String
    let itemName: String
    let availableQuantity: Int
    let actionTitle: String
    let onConfirm: (Int) -> Void
    let onCancel: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var quantity: Double

    init(
        title: String,
        itemName: String,
        availableQuantity: Int,
        actionTitle: String,
        onConfirm: @escaping (Int) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.title = title
        self.itemName = itemName.isEmpty ? "Item" : itemName
        self.availableQuantity = max(1, availableQuantity)
        self.actionTitle = actionTitle
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        _quantity = State(initialValue: 1)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(itemName)
                        .font(.headline)
                    Text("Choose how many to move.")
                        .foregroundStyle(.secondary)
                }

                Section("Quantity") {
                    if availableQuantity == 1 {
                        Text("1")
                    } else {
                        Slider(
                            value: $quantity,
                            in: 1...Double(availableQuantity),
                            step: 1
                        )
                        Text("\(Int(quantity)) of \(availableQuantity)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(actionTitle) {
                        onConfirm(max(1, Int(quantity.rounded())))
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct InventoryEntryEditorFieldRow: View {
    let title: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var textAlignment: TextAlignment = .trailing
    var autocapitalization: TextInputAutocapitalization = .never
    var autocorrectionDisabled: Bool = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .leading)
            TextField("", text: $text)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled(autocorrectionDisabled)
                .multilineTextAlignment(textAlignment)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityLabel(title)
        }
    }
}

private func inventoryEntryGlyph(
    for draft: InventoryEntryDraft,
    categoryIcons: [String: String]
) -> String {
    InventoryCategoryIcons.glyph(for: draft, categoryIcons: categoryIcons)
}

private func inventoryEntryDisplayText(
    for draft: InventoryEntryDraft,
    containerLabels: [UUID: String]
) -> String {
    let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
    if draft.isContainer {
        return containerLabels[draft.id] ?? (name.isEmpty ? "Container" : name)
    }
    let quantity = draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
    let category = draft.category.trimmingCharacters(in: .whitespacesAndNewlines)
    let quantityPrefix = quantity.isEmpty || quantity == "1" ? "" : "\(quantity) "
    if category.isEmpty {
        return "\(quantityPrefix)\(name.isEmpty ? "Item" : name)"
    }
    return "\(quantityPrefix)\(name.isEmpty ? "Item" : name) [\(category)]"
}

func partyTreasureEntryDisplayText(
    for draft: InventoryEntryDraft,
    containerLabels: [UUID: String]
) -> String {
    if draft.isContainer, let label = containerLabels[draft.id] {
        return label
    }
    let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let displayName = name.isEmpty ? "Item" : name
    let quantity = draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)
    guard quantity.isEmpty == false, quantity != "1" else {
        return displayName
    }
    return "\(displayName) x\(quantity)"
}

private struct InventoryEntryEditorContainerSelectorRow: View {
    let title: String
    @Binding var selection: String
    let options: [InventoryDraftOperations.ContainerSelectionOption]
    var isDisabled: Bool = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .leading)
            Picker("", selection: $selection) {
                Text("Equipped").tag("")
                ForEach(options) { option in
                    Text(option.label).tag(option.id.uuidString)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .disabled(isDisabled)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .accessibilityLabel(title)
        }
    }
}

private struct InventoryEntryEditorToggleRow: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .leading)
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .accessibilityLabel(title)
        }
    }
}

private struct CurrencyAmountEditorRow: View {
    @Binding var draft: CurrencyAmountDraft

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(draft.label)
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .leading)
            TextField("", text: $draft.amount)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityLabel(draft.label)
        }
    }
}

struct InventoryEntryDraft: Identifiable, Equatable {
    var id: UUID
    var name: String
    var category: String
    var quantity: String
    var value: String
    var weight: String
    var url: String
    var containerId: String
    var isContainer: Bool

    init(
        id: UUID = UUID(),
        name: String = "",
        category: String = "",
        quantity: String = "1",
        value: String = "0",
        weight: String = "0",
        url: String = "",
        containerId: String = "",
        isContainer: Bool = false
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.quantity = quantity
        self.value = value
        self.weight = weight
        self.url = url
        self.containerId = containerId
        self.isContainer = isContainer
    }

    init(entry: InventoryEntryDTO) {
        self.init(
            id: entry.id ?? UUID(),
            name: entry.name,
            category: entry.category ?? "",
            quantity: String(entry.quantity),
            value: formatNumber(entry.value),
            weight: formatNumber(entry.weight),
            url: entry.url ?? "",
            containerId: entry.isContainer ? "" : entry.containerId?.uuidString ?? "",
            isContainer: entry.isContainer
        )
    }

    static func drafts(from inventory: [InventoryEntryDTO]?) -> [InventoryEntryDraft] {
        (inventory ?? []).map(InventoryEntryDraft.init)
    }

    func toDTO() throws -> InventoryEntryDTO {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw InventoryDraftError.missingName
        }
        guard let quantityValue = Int(quantity.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw InventoryDraftError.invalidQuantity
        }
        guard let parsedValue = Double(value.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw InventoryDraftError.invalidValue("value")
        }
        guard let parsedWeight = Double(weight.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw InventoryDraftError.invalidValue("weight")
        }
        let trimmedContainerId = containerId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !isContainer, !trimmedContainerId.isEmpty, UUID(uuidString: trimmedContainerId) == nil {
            throw InventoryDraftError.invalidContainerId
        }
        let trimmedURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedCategory = category.trimmingCharacters(in: .whitespacesAndNewlines)
        return InventoryEntryDTO(
            id: id,
            name: trimmedName,
            quantity: quantityValue,
            value: parsedValue,
            weight: parsedWeight,
            url: trimmedURL.isEmpty ? nil : trimmedURL,
            category: trimmedCategory.isEmpty ? nil : trimmedCategory,
            containerId: isContainer ? nil : (trimmedContainerId.isEmpty ? nil : UUID(uuidString: trimmedContainerId)),
            isContainer: isContainer
        )
    }

    func toDTOOrNil() -> InventoryEntryDTO? {
        try? toDTO()
    }

    func fallbackTransferDTO() -> InventoryEntryDTO {
        InventoryEntryDTO(
            id: id,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            quantity: Int(quantity.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 1,
            value: Double(value.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0,
            weight: Double(weight.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0,
            url: {
                let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }(),
            category: {
                let trimmed = category.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }(),
            containerId: nil,
            isContainer: false
        )
    }
}

struct CurrencyAmountDraft: Identifiable, Equatable {
    var id: String
    var label: String
    var amount: String

    init(id: String, label: String, amount: String) {
        self.id = id
        self.label = label
        self.amount = amount
    }

    init(unit: CurrencyUnitDTO, amount: Int) {
        self.init(id: unit.id, label: unit.label, amount: String(amount))
    }

    func toDTO() throws -> CurrencyAmountDTO {
        let trimmedAmount = amount.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parsedAmount = Int(trimmedAmount) else {
            throw InventoryDraftError.invalidCurrencyAmount(label)
        }
        return CurrencyAmountDTO(unitId: id, amount: parsedAmount)
    }

    static func buildDrafts(from amounts: [CurrencyAmountDTO], currencySystem: CurrencySystemDTO?) -> [CurrencyAmountDraft] {
        if let currencySystem {
            return currencySystem.units.map { unit in
                CurrencyAmountDraft(
                    unit: unit,
                    amount: amounts.first(where: { $0.unitId == unit.id })?.amount ?? 0
                )
            }
        }
        return amounts.map { amount in
            CurrencyAmountDraft(id: amount.unitId, label: amount.unitId, amount: String(amount.amount))
        }
    }
}

private enum InventoryDraftError: LocalizedError {
    case missingName
    case invalidQuantity
    case invalidValue(String)
    case invalidContainerId
    case invalidCurrencyAmount(String)

    var errorDescription: String? {
        switch self {
        case .missingName:
            return "Item name is required."
        case .invalidQuantity:
            return "Quantity must be a whole number."
        case .invalidValue(let field):
            return "\(field.capitalized) must be a valid number."
        case .invalidContainerId:
            return "Container ID must be a valid UUID."
        case .invalidCurrencyAmount(let label):
            return "Amount for \(label) must be a whole number."
        }
    }
}

private func formatNumber(_ value: Double) -> String {
    if value.rounded(.towardZero) == value {
        return String(Int(value))
    }
    return String(format: "%.2f", value)
}
