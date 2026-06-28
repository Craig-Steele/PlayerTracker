import Foundation

struct EncounterPresentationState {
    enum RoundIndicatorTone {
        case new
        case active
        case suspended
    }

    enum NameBadgeTone {
        case mine
        case referee
        case other
    }

    let campaignEncounterState: EncounterStateDTO?
    let gameEncounterState: EncounterStateDTO?

    var effectiveEncounterState: EncounterStateDTO {
        gameEncounterState ?? campaignEncounterState ?? .new
    }

    func displayedInitiative(_ initiative: Double?) -> Double? {
        initiative
    }

    func initiativeText(_ initiative: Double?) -> String {
        guard let initiative else { return "🎲" }
        if initiative.rounded(.towardZero) == initiative {
            return String(Int(initiative))
        }
        return String(initiative)
    }

    func roundIndicatorText(round: Int?) -> String {
        "Round: \(round ?? 1)"
    }

    func roundIndicatorTone() -> RoundIndicatorTone {
        switch effectiveEncounterState {
        case .new:
            return .new
        case .active:
            return .active
        case .suspended:
            return .suspended
        }
    }

    func needsInitiativeRoll(_ initiative: Double?) -> Bool {
        effectiveEncounterState == .active && initiative == nil
    }

    func shouldShowTurnCompleteButton(isMyTurn: Bool, isCompletingTurn: Bool) -> Bool {
        effectiveEncounterState == .active && isMyTurn && !isCompletingTurn
    }

    func nameBadgeTone(isMine: Bool, isRefereeOwned: Bool) -> NameBadgeTone {
        if isMine {
            return .mine
        }
        if isRefereeOwned {
            return .referee
        }
        return .other
    }

    func shouldShowControllerName(isMine: Bool, showPlayerNames: Bool) -> Bool {
        !isMine && showPlayerNames
    }

    func shouldShowConditions(
        isMine: Bool,
        hasConditions: Bool,
        showCharacterConditions: Bool
    ) -> Bool {
        isMine || (showCharacterConditions && hasConditions)
    }

    func currentTurnSubtitle(
        isMyTurn: Bool,
        currentTurnName: String?,
        rulesetLabel: String?
    ) -> String {
        switch effectiveEncounterState {
        case .new:
            return "New Encounter"
        case .suspended:
            return "Encounter Suspended"
        case .active:
            if isMyTurn, let currentTurnName, !currentTurnName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "Your turn: \(currentTurnName)"
            }
            if let currentTurnName, !currentTurnName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "Current turn: \(currentTurnName)"
            }
            if let rulesetLabel, !rulesetLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return rulesetLabel
            }
            return "Waiting for encounter state"
        }
    }

    func shouldShowNextTurn(players: [PlayerViewDTO], currentTurnId: UUID?) -> Bool {
        effectiveEncounterState == .active
            && !players.isEmpty
            && currentTurnId != nil
    }
}
