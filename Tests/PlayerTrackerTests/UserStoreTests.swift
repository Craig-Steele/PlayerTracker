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

    func testPlayerCharactersSortAheadOfRefereesOnEqualInitiative() async throws {
        let store = UserStore()
        let campaignName = "Tie Break"
        let playerOwnerId = UUID()
        let refereeOwnerId = UUID()
        let player = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerId: playerOwnerId,
            ownerName: "Player",
            characterName: "Hero",
            initiative: 12
        )
        let referee = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerId: refereeOwnerId,
            ownerName: "Referee",
            characterName: "Mage",
            initiative: 12
        )
        await store.setCampaignRefereeSessionIDs(
            campaignName: campaignName,
            refereeSessionIDs: [refereeOwnerId]
        )

        let state = await store.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )

        XCTAssertEqual(state.players.first?.id, player.id)
        XCTAssertEqual(state.players.last?.id, referee.id)
        XCTAssertEqual(state.currentTurnId, player.id)
        XCTAssertEqual(state.currentTurnName, "Hero")
    }

    func testNewCharacterRollsInitiativeWhenEncounterIsActive() async throws {
        let store = UserStore()
        let campaignName = "Active Add"

        _ = await store.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )

        let player = await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: UUID(),
            ownerName: "Referee",
            characterName: "Incoming",
            initiative: nil,
            stats: [],
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 2,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        XCTAssertNil(player.initiative)

        let rolled = await store.rollInitiativeForCharacter(id: player.id, standardDie: "1d20")
        XCTAssertNotNil(rolled?.initiative)
        let stored = await store.characterState(for: player.id)
        XCTAssertNotNil(stored?.initiative)
    }

    func testCharacterCurrencyIsIncludedInPlayerView() async throws {
        let store = UserStore()
        let campaignName = "Currency"
        let currency = [
            CurrencyAmount(unitId: "gp", amount: 42),
            CurrencyAmount(unitId: "sp", amount: 7)
        ]

        let character = await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: UUID(),
            ownerName: "Player",
            characterName: "Treasure Keeper",
            initiative: nil,
            stats: [],
            currency: currency,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let state = await store.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .new
        )
        let view = try XCTUnwrap(state.players.first { $0.id == character.id })
        XCTAssertEqual(view.currency.count, 2)
        XCTAssertEqual(view.currency.first(where: { $0.unitId == "gp" })?.amount, 42)
        XCTAssertEqual(view.currency.first(where: { $0.unitId == "sp" })?.amount, 7)
    }

    func testCharacterInventoryIsIncludedInPlayerView() async throws {
        let store = UserStore()
        let campaignName = "Inventory"
        let inventory = [
            InventoryEntry(name: "Backpack", quantity: 1, value: 2, weight: 5, url: nil),
            InventoryEntry(name: "Rations", quantity: 3, value: 0.5, weight: 1.5, url: "https://example.com/rations")
        ]

        let character = await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: UUID(),
            ownerName: "Player",
            characterName: "Pack Mule",
            initiative: nil,
            stats: [],
            currency: [],
            inventory: inventory,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let state = await store.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .new
        )
        let view = try XCTUnwrap(state.players.first { $0.id == character.id })
        XCTAssertEqual(view.inventory.count, 2)
        XCTAssertEqual(view.inventory.first(where: { $0.name == "Backpack" })?.quantity, 1)
        XCTAssertEqual(view.inventory.first(where: { $0.name == "Rations" })?.url, "https://example.com/rations")
    }

    func testStaleClaimExpiresAfterClaimTimeout() async throws {
        let store = UserStore()
        let campaignName = "Timeout"
        let claimed = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Player",
            characterName: "Scout",
            initiative: 12
        )

        await store.debugSetClaimTimestamp(
            id: claimed.id,
            claimedAt: Date().addingTimeInterval(-10 * 60)
        )
        await store.expireStaleClaims(campaignName: campaignName, claimTimeoutMinutes: 5)

        let updated = await store.characterState(for: claimed.id)
        XCTAssertNil(updated?.claimedSessionId)
        XCTAssertNil(updated?.claimedDisplayName)
        XCTAssertNil(updated?.claimedAt)
    }

    func testZeroClaimTimeoutUsesDisconnectLease() async throws {
        let store = UserStore()
        let campaignName = "Disconnect"
        let claimed = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerName: "Player",
            characterName: "Scout",
            initiative: 12
        )

        await store.touchClaims(
            for: claimed.ownerId,
            campaignName: campaignName,
            claimTimeoutMinutes: 0
        )
        await store.expireStaleClaims(campaignName: campaignName, claimTimeoutMinutes: 0)

        let refreshed = await store.characterState(for: claimed.id)
        XCTAssertEqual(refreshed?.claimedSessionId, claimed.ownerId)

        await store.debugSetClaimTimestamp(
            id: claimed.id,
            claimedAt: Date().addingTimeInterval(-10)
        )
        await store.expireStaleClaims(campaignName: campaignName, claimTimeoutMinutes: 0)

        let expired = await store.characterState(for: claimed.id)
        XCTAssertNil(expired?.claimedSessionId)
        XCTAssertNil(expired?.claimedDisplayName)
        XCTAssertNil(expired?.claimedAt)
    }

    @discardableResult
    private func addCharacter(
        to store: UserStore,
        campaignName: String,
        ownerId: UUID = UUID(),
        ownerName: String,
        characterName: String,
        initiative: Double,
        autoSkipTurn: Bool = false,
        isHidden: Bool = false,
        revealOnTurn: Bool = false,
        currency: [CurrencyAmount]? = nil
    ) async -> PlayerView {
        await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: ownerName,
            characterName: characterName,
            initiative: initiative,
            stats: [],
            currency: currency,
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
