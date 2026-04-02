import Testing
@testable import InitiativeCore

@Test
func hiddenRefereeCharacterRevealsWhenItsTurnBegins() async throws {
    let ruleset = RuleSet(id: "dnd5e", label: "D&D 5e")
    let session = GameSession(campaignName: "Test", ruleset: ruleset, encounterState: .active)

    _ = await session.upsertCharacter(
        .init(ownerName: "Alice", name: "Cleric", initiative: 18)
    )
    let hidden = await session.upsertCharacter(
        .init(
            ownerName: "Referee",
            name: "Goblin",
            initiative: 12,
            isHidden: true,
            revealOnTurn: true
        )
    )

    let first = await session.state(for: .player)
    #expect(first.players.count == 1)
    #expect(first.currentTurnName == "Cleric")

    let second = await session.advanceTurn()
    #expect(second.currentTurnID == hidden.id)
    #expect(second.currentTurnName == "Goblin")
    #expect(second.players.count == 2)
}
