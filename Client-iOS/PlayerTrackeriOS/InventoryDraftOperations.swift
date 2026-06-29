import Foundation

enum InventoryDraftOperations {
    struct ContainerSelectionOption: Identifiable, Equatable {
        let id: UUID
        let label: String
    }

    struct MoveTarget: Identifiable, Equatable {
        let id: UUID
        let label: String
    }

    static func containerID(for draft: InventoryEntryDraft) -> UUID? {
        let trimmed = draft.containerId.trimmingCharacters(in: .whitespacesAndNewlines)
        return UUID(uuidString: trimmed)
    }

    static func containerMoveTargets(
        for draft: InventoryEntryDraft,
        in drafts: [InventoryEntryDraft]
    ) -> [MoveTarget] {
        guard !draft.isContainer else { return [] }
        let currentContainerID = containerID(for: draft)
        let labels = containerDisplayLabels(in: drafts)

        return drafts.compactMap { candidate in
            guard candidate.isContainer, candidate.id != draft.id else { return nil }
            guard candidate.id != currentContainerID else { return nil }
            return MoveTarget(id: candidate.id, label: labels[candidate.id] ?? containerBaseLabel(for: candidate))
        }
    }

    static func containerSelectionOptions(
        in drafts: [InventoryEntryDraft]
    ) -> [ContainerSelectionOption] {
        let labels = containerDisplayLabels(in: drafts)
        return drafts.compactMap { candidate in
            guard candidate.isContainer else { return nil }
            return ContainerSelectionOption(
                id: candidate.id,
                label: labels[candidate.id] ?? containerBaseLabel(for: candidate)
            )
        }
    }

    static func containerSelectionOptions(
        for draft: InventoryEntryDraft,
        in drafts: [InventoryEntryDraft]
    ) -> [ContainerSelectionOption] {
        containerSelectionOptions(in: drafts).filter { $0.id != draft.id }
    }

    static func containerDisplayLabel(
        for draft: InventoryEntryDraft,
        in drafts: [InventoryEntryDraft]
    ) -> String {
        let labels = containerDisplayLabels(in: drafts)
        return labels[draft.id] ?? containerBaseLabel(for: draft)
    }

    static func containerDisplayLabels(in drafts: [InventoryEntryDraft]) -> [UUID: String] {
        let counts = containerLabelCounts(in: drafts)
        var seen: [String: Int] = [:]
        var labels: [UUID: String] = [:]

        for draft in drafts where draft.isContainer {
            let baseLabel = containerBaseLabel(for: draft)
            let nextCount = (seen[baseLabel] ?? 0) + 1
            seen[baseLabel] = nextCount
            let totalCount = counts[baseLabel] ?? 0
            labels[draft.id] = totalCount > 1 ? "\(baseLabel) #\(nextCount)" : baseLabel
        }

        return labels
    }

    static func equipmentLibraryMatches(
        query: String,
        in items: [EquipmentLibraryItemDTO]
    ) -> [EquipmentLibraryItemDTO] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else { return [] }

        return items
            .filter { item in
                item.name.range(of: trimmedQuery, options: [.caseInsensitive, .diacriticInsensitive]) != nil
            }
            .sorted { lhs, rhs in
                let lhsName = lhs.name.trimmingCharacters(in: .whitespacesAndNewlines)
                let rhsName = rhs.name.trimmingCharacters(in: .whitespacesAndNewlines)
                let lhsPrefix = lhsName.range(of: trimmedQuery, options: [.caseInsensitive, .diacriticInsensitive])?.lowerBound == lhsName.startIndex
                let rhsPrefix = rhsName.range(of: trimmedQuery, options: [.caseInsensitive, .diacriticInsensitive])?.lowerBound == rhsName.startIndex
                if lhsPrefix != rhsPrefix { return lhsPrefix && !rhsPrefix }
                return lhsName.localizedCaseInsensitiveCompare(rhsName) == .orderedAscending
            }
    }

    static func movedDrafts(
        _ drafts: [InventoryEntryDraft],
        entryID: UUID,
        to containerID: UUID?
    ) -> [InventoryEntryDraft]? {
        guard let index = drafts.firstIndex(where: { $0.id == entryID }) else { return nil }
        guard !drafts[index].isContainer else { return nil }

        let nextContainerID = containerID?.uuidString ?? ""
        let currentContainerID = drafts[index].containerId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard currentContainerID != nextContainerID else { return nil }

        if let containerID, !drafts.contains(where: { $0.id == containerID && $0.isContainer }) {
            return nil
        }

        var updated = drafts
        updated[index].containerId = nextContainerID
        return updated
    }

    static func removedDrafts(
        _ drafts: [InventoryEntryDraft],
        entryID: UUID,
        moveContainedItems: Bool
    ) -> [InventoryEntryDraft]? {
        guard drafts.contains(where: { $0.id == entryID }) else { return nil }

        if moveContainedItems {
            return drafts
                .filter { $0.id != entryID }
                .map { draft in
                    guard let containerID = containerID(for: draft),
                          containerID == entryID else {
                        return draft
                    }
                    var movedDraft = draft
                    movedDraft.containerId = ""
                    return movedDraft
                }
        }

        var removedIDs = Set([entryID])
        var changed = true
        while changed {
            changed = false
            for draft in drafts {
                guard let containerID = containerID(for: draft),
                      removedIDs.contains(containerID),
                      !removedIDs.contains(draft.id) else {
                    continue
                }
                removedIDs.insert(draft.id)
                changed = true
            }
        }
        return drafts.filter { !removedIDs.contains($0.id) }
    }

    private static func containerLabelCounts(in drafts: [InventoryEntryDraft]) -> [String: Int] {
        var counts: [String: Int] = [:]
        for draft in drafts where draft.isContainer {
            counts[containerBaseLabel(for: draft), default: 0] += 1
        }
        return counts
    }

    private static func containerBaseLabel(for draft: InventoryEntryDraft) -> String {
        let baseName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return baseName.isEmpty ? "Container" : baseName
    }

    static func totalWeight(for drafts: [InventoryEntryDraft]) -> Double {
        drafts.reduce(0) { partialResult, draft in
            if draft.isContainer || containerID(for: draft) != nil {
                return partialResult
            }
            let quantity = Double(draft.quantity.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            let weight = Double(draft.weight.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            return partialResult + (quantity * weight)
        }
    }
}

enum InventoryCategoryIcons {
    static func glyph(
        for draft: InventoryEntryDraft,
        categoryIcons: [String: String]
    ) -> String {
        if draft.isContainer {
            return resolveGlyph(categoryIcons["Containers"], fallback: "🧳")
        }
        let category = draft.category.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !category.isEmpty else { return "🗡" }
        if let glyph = categoryIcons[category]?.trimmingCharacters(in: .whitespacesAndNewlines), !glyph.isEmpty {
            return glyph
        }
        let normalizedCategory = normalize(category)
        if let match = categoryIcons.first(where: { normalize($0.key) == normalizedCategory }) {
            return resolveGlyph(match.value, fallback: "🗡")
        }
        return "🗡"
    }

    private static func resolveGlyph(_ value: String?, fallback: String?) -> String {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty {
            return trimmed
        }
        return fallback ?? "🗡"
    }

    private static func normalize(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

enum InventoryDisplayFormatting {
    static func formattedValue(_ rawValue: String, currencySystem: CurrencySystemDTO?) -> String {
        let number = formattedNumber(rawValue)
        guard let unit = defaultCurrencyUnit(for: currencySystem) else {
            return number
        }
        return "\(number) \(unit)"
    }

    static func formattedWeight(_ rawValue: String, commonWeightUnits: [String]?) -> String {
        let number = formattedNumber(rawValue)
        guard let unit = formattedWeightUnit(for: rawValue, commonWeightUnits: commonWeightUnits) else {
            return number
        }
        return "\(number) \(unit)"
    }

    static func formattedWeight(_ value: Double, commonWeightUnits: [String]?) -> String {
        let number = formattedNumber(value)
        guard let unit = formattedWeightUnit(for: value, commonWeightUnits: commonWeightUnits) else {
            return number
        }
        return "\(number) \(unit)"
    }

    static func formattedNumber(_ rawValue: String) -> String {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let number = Double(trimmed) else {
            return "0"
        }
        return formattedNumber(number)
    }

    static func formattedNumber(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        if rounded.rounded(.towardZero) == rounded {
            return String(Int(rounded))
        }
        return String(format: "%.2f", rounded)
    }

    private static func defaultCurrencyUnit(for currencySystem: CurrencySystemDTO?) -> String? {
        guard let currencySystem else { return nil }
        let unit = currencySystem.units.first(where: { $0.id == currencySystem.commonCurrencyId }) ?? currencySystem.units.first
        let label = unit?.symbol?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? unit?.id.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? unit?.label.trimmingCharacters(in: .whitespacesAndNewlines)
        return label?.isEmpty == false ? label : nil
    }

    private static func formattedWeightUnit(for rawValue: String, commonWeightUnits: [String]?) -> String? {
        let singular = normalizedWeightUnit(commonWeightUnits?.first, fallback: "lb.")
        let plural = commonWeightUnits?.dropFirst().first.flatMap { normalizedWeightUnit($0, fallback: "") }
        guard let parsedValue = Double(rawValue.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return singular
        }
        let rounded = (parsedValue * 100).rounded() / 100
        if rounded == 1 {
            return singular
        }
        return plural?.isEmpty == false ? plural! : pluralizedWeightUnit(from: singular)
    }

    private static func formattedWeightUnit(for value: Double, commonWeightUnits: [String]?) -> String? {
        let singular = normalizedWeightUnit(commonWeightUnits?.first, fallback: "lb.")
        let plural = commonWeightUnits?.dropFirst().first.flatMap { normalizedWeightUnit($0, fallback: "") }
        let rounded = (value * 100).rounded() / 100
        if rounded == 1 {
            return singular
        }
        return plural?.isEmpty == false ? plural! : pluralizedWeightUnit(from: singular)
    }

    private static func normalizedWeightUnit(_ value: String?, fallback: String) -> String {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? fallback : trimmed
    }

    private static func pluralizedWeightUnit(from singular: String) -> String {
        if singular.caseInsensitiveCompare("lb.") == .orderedSame || singular.caseInsensitiveCompare("lb") == .orderedSame {
            return "lbs."
        }
        if singular.lowercased().hasSuffix("s") {
            return singular
        }
        if singular.hasSuffix(".") {
            return String(singular.dropLast()) + "s."
        }
        return singular + "s"
    }
}
