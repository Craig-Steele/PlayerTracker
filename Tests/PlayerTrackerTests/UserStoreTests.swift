import Foundation
import Testing
@testable import PlayerTracker

@Suite("User Store")
struct UserStoreTests {
    @Test("active state skips auto-skip characters")
    func activeStateSkipsAutoSkipCharacters() async {
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
        #expect(initialState.round == 1)
        #expect(initialState.currentTurnId == first.id)
        #expect(initialState.currentTurnName == "First")

        let nextState = await store.nextTurn(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        #expect(nextState.round == 1)
        #expect(nextState.currentTurnId == second.id)
        #expect(nextState.currentTurnName == "Second")

        let wrappedState = await store.nextTurn(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        #expect(wrappedState.round == 2)
        #expect(wrappedState.currentTurnId == first.id)
        #expect(wrappedState.currentTurnId != skipped.id)
    }

    @Test("active state reveals hidden character when turn starts")
    func activeStateRevealsHiddenCharacterWhenTurnStarts() async throws {
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

        #expect(state.currentTurnId == ambusher.id)
        #expect(state.currentTurnName == "Ambusher")
        let revealed = try #require(state.players.first { $0.id == ambusher.id })
        #expect(!revealed.isHidden)
        #expect(!revealed.revealOnTurn)
    }

    @Test("player characters sort ahead of referees on equal initiative")
    func playerCharactersSortAheadOfRefereesOnEqualInitiative() async throws {
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

        #expect(state.players.first?.id == player.id)
        #expect(state.players.last?.id == referee.id)
        #expect(state.currentTurnId == player.id)
        #expect(state.currentTurnName == "Hero")
    }

    @Test("grouped referee characters keep numeric order on equal initiative")
    func groupedRefereeCharactersKeepNumericOrderOnEqualInitiative() async throws {
        let store = UserStore()
        let campaignName = "Grouped Order"
        let ownerId = UUID()
        let groupId = UUID()
        let third = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: "Referee",
            characterName: "Goblin (10)",
            initiative: 15,
            initiativeGroupId: groupId,
            initiativeGroupIndex: 10
        )
        let first = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: "Referee",
            characterName: "Goblin (1)",
            initiative: 15,
            initiativeGroupId: groupId,
            initiativeGroupIndex: 1
        )
        let second = await addCharacter(
            to: store,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: "Referee",
            characterName: "Goblin (2)",
            initiative: 15,
            initiativeGroupId: groupId,
            initiativeGroupIndex: 2
        )

        await store.setCampaignRefereeSessionIDs(
            campaignName: campaignName,
            refereeSessionIDs: [ownerId]
        )

        let state = await store.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )

        #expect(state.players.map(\.id) == [first.id, second.id, third.id])
        #expect(state.players.map(\.initiativeGroupId) == [groupId, groupId, groupId])
    }

    @Test("grouped referee characters roll initiative once")
    func groupedRefereeCharactersRollInitiativeOnce() async throws {
        let store = UserStore()
        let campaignName = "Grouped Roll"
        let ownerId = UUID()
        let groupId = UUID()
        let first = await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: "Referee",
            characterName: "Skeleton (1)",
            initiative: nil,
            initiativeGroupId: groupId,
            initiativeGroupIndex: 1,
            stats: [],
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 2,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )
        let second = await store.upsertCharacter(
            id: nil,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: "Referee",
            characterName: "Skeleton (2)",
            initiative: nil,
            initiativeGroupId: groupId,
            initiativeGroupIndex: 2,
            stats: [],
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 2,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        _ = await store.rollInitiativeForCharacter(id: first.id, standardDie: "1d20")

        let rolledFirst = await store.characterState(for: first.id)
        let rolledSecond = await store.characterState(for: second.id)
        #expect(rolledFirst?.initiative != nil)
        #expect(rolledFirst?.initiative == rolledSecond?.initiative)
    }

    @Test("new character rolls initiative when encounter is active")
    func newCharacterRollsInitiativeWhenEncounterIsActive() async throws {
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

        #expect(player.initiative == nil)

        let rolled = await store.rollInitiativeForCharacter(id: player.id, standardDie: "1d20")
        #expect(rolled?.initiative != nil)
        let stored = await store.characterState(for: player.id)
        #expect(stored?.initiative != nil)
    }

    @Test("character currency is included in player view")
    func characterCurrencyIsIncludedInPlayerView() async throws {
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
        let view = try #require(state.players.first { $0.id == character.id })
        #expect(view.currency.count == 2)
        #expect(view.currency.first(where: { $0.unitId == "gp" })?.amount == 42)
        #expect(view.currency.first(where: { $0.unitId == "sp" })?.amount == 7)
    }

    @Test("character inventory is included in player view")
    func characterInventoryIsIncludedInPlayerView() async throws {
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
        let view = try #require(state.players.first { $0.id == character.id })
        #expect(view.inventory.count == 2)
        #expect(view.inventory.first(where: { $0.name == "Backpack" })?.quantity == 1)
        #expect(view.inventory.first(where: { $0.name == "Rations" })?.url == "https://example.com/rations")
    }

    @Test("character inventory preserves nested container references")
    func characterInventoryPreservesNestedContainerReferences() async throws {
        let store = UserStore()
        let campaignName = "Nested Inventory"
        let backpackID = UUID()
        let inventory = [
            InventoryEntry(
                id: backpackID,
                name: "Backpack",
                quantity: 1,
                value: 2,
                weight: 5,
                url: nil,
                containerId: nil,
                isContainer: true
            ),
            InventoryEntry(
                name: "Rations",
                quantity: 3,
                value: 0.5,
                weight: 1.5,
                url: "https://example.com/rations",
                containerId: backpackID,
                isContainer: false
            )
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
        let view = try #require(state.players.first { $0.id == character.id })
        #expect(view.inventory.count == 2)
        let backpack = try #require(view.inventory.first(where: { $0.id == backpackID }))
        #expect(backpack.isContainer)
        let rations = try #require(view.inventory.first(where: { $0.name == "Rations" }))
        #expect(rations.containerId == backpackID)
    }

    @Test("stale claim expires after claim timeout")
    func staleClaimExpiresAfterClaimTimeout() async throws {
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
        #expect(updated?.claimedSessionId == nil)
        #expect(updated?.claimedDisplayName == nil)
        #expect(updated?.claimedAt == nil)
    }

    @Test("zero claim timeout uses disconnect lease")
    func zeroClaimTimeoutUsesDisconnectLease() async throws {
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
        #expect(refreshed?.claimedSessionId == claimed.ownerId)

        await store.debugSetClaimTimestamp(
            id: claimed.id,
            claimedAt: Date().addingTimeInterval(-10)
        )
        await store.expireStaleClaims(campaignName: campaignName, claimTimeoutMinutes: 0)

        let expired = await store.characterState(for: claimed.id)
        #expect(expired?.claimedSessionId == nil)
        #expect(expired?.claimedDisplayName == nil)
        #expect(expired?.claimedAt == nil)
    }

    @discardableResult
    private func addCharacter(
        to store: UserStore,
        campaignName: String,
        ownerId: UUID = UUID(),
        ownerName: String,
        characterName: String,
        initiative: Double,
        initiativeGroupId: UUID? = nil,
        initiativeGroupIndex: Int? = nil,
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
            initiativeGroupId: initiativeGroupId,
            initiativeGroupIndex: initiativeGroupIndex,
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
