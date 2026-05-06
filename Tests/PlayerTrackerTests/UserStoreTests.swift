import XCTest
@testable import PlayerTracker

final class UserStoreTests: XCTestCase {
    func testActiveStateSkipsAutoSkipCharacters() async {
        let store = UserStore()
        let campaignName = "Auto Skip"
        let skipped = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Player",
            characterName: "Skipped",
            initiative: 20,
            autoSkipTurn: true
        )
        let first = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Player",
            characterName: "First",
            initiative: 15
        )
        let second = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Player",
            characterName: "Second",
            initiative: 10
        )

        let initialState = await store.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        XCTAssertEqual(initialState.round, 1)
        XCTAssertEqual(initialState.currentTurnId, first.id)
        XCTAssertEqual(initialState.currentTurnName, "First")

        let nextState = await store.nextTurn(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        XCTAssertEqual(nextState.round, 1)
        XCTAssertEqual(nextState.currentTurnId, second.id)
        XCTAssertEqual(nextState.currentTurnName, "Second")

        let wrappedState = await store.nextTurn(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        XCTAssertEqual(wrappedState.round, 2)
        XCTAssertEqual(wrappedState.currentTurnId, first.id)
        XCTAssertNotEqual(wrappedState.currentTurnId, skipped.id)
    }

    func testActiveStateRevealsHiddenCharacterWhenTurnStarts() async throws {
        let store = UserStore()
        let campaignName = "Reveal"
        let ambusher = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Referee",
            characterName: "Ambusher",
            initiative: 20,
            isHidden: true,
            revealOnTurn: true
        )
        _ = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Player",
            characterName: "Hero",
            initiative: 10
        )

        let state = await store.state(
            campaignName: campaignName,
            includeHidden: false,
            encounterState: .active
        )

        XCTAssertEqual(state.currentTurnId, ambusher.id)
        XCTAssertEqual(state.currentTurnName, "Ambusher")
        let revealed = try XCTUnwrap(state.players.first { $0.id == ambusher.id })
        XCTAssertFalse(revealed.isHidden)
        XCTAssertFalse(revealed.revealOnTurn)
    }

    @discardableResult
    private func addCharacter(
        to store: UserStore,
        campaignName: String,
        ownerName: String,
        characterName: String,
        initiative: Double,
        autoSkipTurn: Bool = false,
        isHidden: Bool = false,
        revealOnTurn: Bool = false
    ) async -> PlayerView {
        await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: UUID(),
            ownerName: ownerName,
            characterName: characterName,
            initiative: initiative,
            stats: [],
            revealStats: false,
            autoSkipTurn: autoSkipTurn,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: isHidden,
            revealOnTurn: revealOnTurn,
            conditions: []
        )
    }
}
