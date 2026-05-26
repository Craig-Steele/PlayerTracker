import Foundation

enum InitiativeRules {
    static func bonus(
        from stats: [StatEntry]?,
        rule: InitiativeRule?,
        aliases: [String: String]? = nil
    ) -> Int? {
        guard let rule else {
            return nil
        }

        let statKeys = normalizedStatKeys(from: rule.stats, aliases: aliases)
        guard !statKeys.isEmpty else {
            return nil
        }

        let indexedStats = (stats ?? []).reduce(into: [String: Int]()) { partialResult, stat in
            let key = normalizeStatKey(stat.key, aliases: aliases)
            guard !key.isEmpty else {
                return
            }
            partialResult[key] = stat.current
        }

        let bonuses = statKeys.compactMap { key -> Int? in
            guard let value = indexedStats[key] else {
                return nil
            }
            return chartBonus(for: value, chart: rule.chart)
        }

        guard let mode = rule.mode?.lowercased(), !mode.isEmpty else {
            return bonuses.max()
        }

        switch mode {
        case "first":
            return bonuses.first
        case "lowest":
            return bonuses.min()
        case "highest":
            return bonuses.max()
        case "ability-modifier":
            return bonuses.max()
        case "highest-dm":
            return bonuses.max()
        default:
            return bonuses.max()
        }
    }

    private static func normalizedStatKeys(from values: [String]?, aliases: [String: String]?) -> [String] {
        (values ?? [])
            .map { normalizeStatKey($0, aliases: aliases) }
            .filter { !$0.isEmpty }
    }

    private static func normalizeStatKey(_ value: String, aliases: [String: String]?) -> String {
        let token = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else {
            return ""
        }
        let normalizedToken = token
            .uppercased()
            .replacingOccurrences(of: #"[^A-Z0-9]+"#, with: "", options: .regularExpression)
        guard !normalizedToken.isEmpty else {
            return ""
        }

        let normalizedAliases = normalizedAliasMap(from: aliases)
        if let alias = normalizedAliases[normalizedToken] {
            return alias == "TEMPHP" ? "TempHP" : alias
        }
        return normalizedToken == "TEMPHP" ? "TempHP" : normalizedToken
    }

    private static func normalizedAliasMap(from aliases: [String: String]?) -> [String: String] {
        guard let aliases else {
            return [:]
        }
        var normalized: [String: String] = [:]
        for (key, value) in aliases {
            let normalizedKey = key
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased()
                .replacingOccurrences(of: #"[^A-Z0-9]+"#, with: "", options: .regularExpression)
            let normalizedValue = value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased()
                .replacingOccurrences(of: #"[^A-Z0-9]+"#, with: "", options: .regularExpression)
            guard !normalizedKey.isEmpty, !normalizedValue.isEmpty else {
                continue
            }
            normalized[normalizedKey] = normalizedValue
        }
        return normalized
    }

    private static func chartBonus(for score: Int, chart: [InitiativeChartEntry]?) -> Int? {
        guard let chart, !chart.isEmpty else {
            return nil
        }
        let ordered = chart.sorted {
            if $0.min == $1.min {
                return ($0.max ?? Int.max) < ($1.max ?? Int.max)
            }
            return $0.min < $1.min
        }
        if let match = ordered.first(where: { entry in
            guard score >= entry.min else { return false }
            if let max = entry.max {
                return score <= max
            }
            return true
        }) {
            return match.bonus
        }
        return ordered.first?.bonus
    }
}
