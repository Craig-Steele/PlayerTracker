import Foundation

enum InventoryTransferOperations {
    struct TransferResult {
        let sourceItems: [InventoryEntryDTO]
        let destinationItems: [InventoryEntryDTO]
        let transferredEntry: InventoryEntryDTO
    }

    static func transferEntry(
        sourceItems: [InventoryEntryDTO],
        destinationItems: [InventoryEntryDTO],
        entryID: UUID,
        quantity: Int
    ) -> TransferResult? {
        let normalizedQuantity = max(1, quantity)
        let normalizedSourceItems = sourceItems.map(normalizeEntry)
        let normalizedDestinationItems = destinationItems.map(normalizeEntry)
        guard let sourceIndex = normalizedSourceItems.firstIndex(where: { $0.id == entryID }) else {
            return nil
        }

        let sourceEntry = normalizedSourceItems[sourceIndex]
        let availableQuantity = max(1, sourceEntry.quantity)
        guard normalizedQuantity <= availableQuantity else {
            return nil
        }

        let transferredQuantity = normalizedQuantity
        let transferredEntry = InventoryEntryDTO(
            id: transferredQuantity == availableQuantity ? sourceEntry.id : UUID(),
            name: sourceEntry.name,
            quantity: transferredQuantity,
            value: sourceEntry.value,
            weight: sourceEntry.weight,
            url: sourceEntry.url,
            category: sourceEntry.category,
            containerId: nil,
            isContainer: false
        )

        var nextSourceItems = normalizedSourceItems
        if transferredQuantity == availableQuantity {
            nextSourceItems.remove(at: sourceIndex)
        } else {
            nextSourceItems[sourceIndex] = InventoryEntryDTO(
                id: sourceEntry.id,
                name: sourceEntry.name,
                quantity: availableQuantity - transferredQuantity,
                value: sourceEntry.value,
                weight: sourceEntry.weight,
                url: sourceEntry.url,
                category: sourceEntry.category,
                containerId: sourceEntry.containerId,
                isContainer: sourceEntry.isContainer
            )
        }

        return TransferResult(
            sourceItems: nextSourceItems,
            destinationItems: stackedItems(normalizedDestinationItems, adding: transferredEntry),
            transferredEntry: transferredEntry
        )
    }

    static func stackedItems(
        _ items: [InventoryEntryDTO],
        adding entry: InventoryEntryDTO
    ) -> [InventoryEntryDTO] {
        let normalizedEntry = normalizeEntry(entry)
        var normalizedItems = items.map(normalizeEntry)
        if let index = normalizedItems.firstIndex(where: { itemsStackTogether($0, normalizedEntry) }) {
            let existing = normalizedItems[index]
            normalizedItems[index] = InventoryEntryDTO(
                id: existing.id ?? normalizedEntry.id,
                name: existing.name,
                quantity: existing.quantity + normalizedEntry.quantity,
                value: existing.value,
                weight: existing.weight,
                url: existing.url,
                category: existing.category,
                containerId: existing.containerId,
                isContainer: false
            )
        } else {
            normalizedItems.append(normalizedEntry)
        }
        return normalizedItems
    }

    private static func itemsStackTogether(_ lhs: InventoryEntryDTO, _ rhs: InventoryEntryDTO) -> Bool {
        guard !lhs.isContainer, !rhs.isContainer else { return false }
        guard lhs.containerId == rhs.containerId else { return false }
        return normalizedText(lhs.name) == normalizedText(rhs.name)
            && normalizedText(lhs.category) == normalizedText(rhs.category)
            && normalizedText(lhs.url) == normalizedText(rhs.url)
            && lhs.value == rhs.value
            && lhs.weight == rhs.weight
    }

    private static func normalizeEntry(_ entry: InventoryEntryDTO) -> InventoryEntryDTO {
        InventoryEntryDTO(
            id: entry.id ?? UUID(),
            name: entry.name.trimmingCharacters(in: .whitespacesAndNewlines),
            quantity: max(1, entry.quantity),
            value: entry.value,
            weight: entry.weight,
            url: normalizedText(entry.url),
            category: normalizedText(entry.category),
            containerId: entry.containerId,
            isContainer: entry.isContainer
        )
    }

    private static func normalizedText(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }
}
