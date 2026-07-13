import XCTest
@testable import Tactical_Table_Top__Initiative

final class PlayerTrackeriOSTests: XCTestCase {
    @MainActor
    func testCurrentPlayerIDPrefersSessionPlayerIDOverLegacyFallback() {
        let model = PlayerAppModel()
        let legacyFallbackID = model.currentPlayerID
        let sessionPlayerID = UUID()
        let campaignID = UUID()
        let sessionCampaign = CampaignStateDTO(
            id: campaignID,
            name: "Campaign",
            rulesetId: "ruleset",
            rulesetLabel: "Ruleset",
            encounterState: .new,
            currency: nil,
            partyTreasure: nil
        )
        model.playerSession = PlayerSessionDTO(
            player: PlayerIdentityDTO(
                id: sessionPlayerID,
                campaignID: campaignID,
                displayName: "Referee",
                isReferee: true
            ),
            campaign: sessionCampaign
        )

        XCTAssertEqual(model.currentPlayerID, sessionPlayerID)
        XCTAssertNotEqual(legacyFallbackID, sessionPlayerID)
    }

    func testEffectiveEncounterStateFallsBackToCampaignState() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: .suspended,
            gameEncounterState: nil
        )

        XCTAssertEqual(presentation.effectiveEncounterState, .suspended)
        XCTAssertEqual(presentation.roundIndicatorTone(), .suspended)
        XCTAssertEqual(presentation.roundIndicatorText(round: 3), "Round: 3")
    }

    func testNewEncounterStillDisplaysSetInitiativeAndHidesRollPrompt() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: .new,
            gameEncounterState: nil
        )

        XCTAssertEqual(presentation.displayedInitiative(17), 17)
        XCTAssertFalse(presentation.needsInitiativeRoll(nil))
        XCTAssertEqual(presentation.roundIndicatorTone(), .new)
        XCTAssertEqual(
            presentation.currentTurnSubtitle(
                isMyTurn: false,
                currentTurnName: "Testing",
                rulesetLabel: "Pathfinder"
            ),
            "New Encounter"
        )
    }

    func testActiveEncounterShowsInitiativeAndPromptsOnlyWhenUnset() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: .new,
            gameEncounterState: .active
        )

        XCTAssertEqual(presentation.displayedInitiative(12.5), 12.5)
        XCTAssertTrue(presentation.needsInitiativeRoll(nil))
        XCTAssertFalse(presentation.needsInitiativeRoll(12.5))
        XCTAssertEqual(presentation.roundIndicatorTone(), .active)
        XCTAssertEqual(
            presentation.currentTurnSubtitle(
                isMyTurn: true,
                currentTurnName: "Testing",
                rulesetLabel: "Pathfinder"
            ),
            "Your turn: Testing"
        )
    }

    func testTurnCompleteButtonIsHiddenWhileCompletionIsInFlight() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertTrue(
            presentation.shouldShowTurnCompleteButton(
                isMyTurn: true,
                isCompletingTurn: false
            )
        )
        XCTAssertFalse(
            presentation.shouldShowTurnCompleteButton(
                isMyTurn: true,
                isCompletingTurn: true
            )
        )
        XCTAssertFalse(
            presentation.shouldShowTurnCompleteButton(
                isMyTurn: false,
                isCompletingTurn: false
            )
        )
    }

    func testNameBadgeTonePrefersPlayerRefereeAndOtherColors() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertEqual(
            presentation.nameBadgeTone(isMine: true, isRefereeOwned: false, isClaimable: false),
            .mine
        )
        XCTAssertEqual(
            presentation.nameBadgeTone(isMine: false, isRefereeOwned: true, isClaimable: false),
            .referee
        )
        XCTAssertEqual(
            presentation.nameBadgeTone(isMine: false, isRefereeOwned: false, isClaimable: false),
            .other
        )
    }

    func testClaimableCharactersArePurpleEvenIfRefereeOwned() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertEqual(
            presentation.nameBadgeTone(isMine: false, isRefereeOwned: true, isClaimable: true),
            .unclaimed
        )
    }

    func testCurrentTurnSubtitleFallsBackToRulesetLabelForActiveEncounter() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertEqual(
            presentation.currentTurnSubtitle(
                isMyTurn: false,
                currentTurnName: nil,
                rulesetLabel: "Pathfinder"
            ),
            "Pathfinder"
        )
    }

    func testNextTurnIsOnlyShownForActiveEncounterWithPlayersAndCurrentTurn() {
        let players = [
            PlayerViewDTO(
                id: UUID(),
                ownerId: UUID(),
                ownerName: "Player",
                claimedSessionId: UUID(),
                claimedDisplayName: "Controller",
                name: "Alpha",
                initiative: nil,
                stats: [],
                currency: nil,
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 0,
                isHidden: false,
                revealOnTurn: false,
                conditions: [],
                isReferee: false,
                isClaimable: false
            )
        ]
        let currentTurnId = players[0].id

        let activePresentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )
        let newPresentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .new
        )

        XCTAssertTrue(activePresentation.shouldShowNextTurn(players: players, currentTurnId: currentTurnId))
        XCTAssertFalse(newPresentation.shouldShowNextTurn(players: players, currentTurnId: currentTurnId))
        XCTAssertFalse(activePresentation.shouldShowNextTurn(players: [], currentTurnId: currentTurnId))
        XCTAssertFalse(activePresentation.shouldShowNextTurn(players: players, currentTurnId: nil))
    }

    func testControllerDisplayNamePrefersClaimedDisplayName() {
        let controller = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Creator",
            claimedSessionId: UUID(),
            claimedDisplayName: "Chrome",
            name: "Scout",
            initiative: nil,
            stats: [],
            currency: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: [],
            isReferee: false,
            isClaimable: false
        )

        let fallback = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Creator",
            claimedSessionId: nil,
            claimedDisplayName: nil,
            name: "Scout",
            initiative: nil,
            stats: [],
            currency: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: [],
            isReferee: false,
            isClaimable: false
        )

        XCTAssertEqual(controller.controllerDisplayName, "Chrome")
        XCTAssertEqual(fallback.controllerDisplayName, "Creator")
    }

    func testControllerDisplayNameUsesRefereeForRefereeOwnedCharacters() {
        let refereeOwned = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Chrome",
            claimedSessionId: nil,
            claimedDisplayName: nil,
            name: "Scout",
            initiative: nil,
            stats: [],
            currency: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: [],
            isReferee: true,
            isClaimable: false
        )

        XCTAssertEqual(refereeOwned.controllerDisplayName, "Referee")
    }

    func testRefereeToneShouldFollowDisplayedControllerName() {
        let playerControlledRefereeFlag = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Chrome",
            claimedSessionId: UUID(),
            claimedDisplayName: "Chrome",
            name: "Scout",
            initiative: nil,
            stats: [],
            currency: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: [],
            isReferee: true,
            isClaimable: false
        )

        let tone = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        ).nameBadgeTone(
            isMine: false,
            isRefereeOwned: playerControlledRefereeFlag.controllerDisplayName.caseInsensitiveCompare("Referee") == .orderedSame,
            isClaimable: false
        )

        XCTAssertEqual(tone, .other)
    }

    func testNameBadgeToneUsesUnclaimedPurpleState() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertEqual(
            presentation.nameBadgeTone(
                isMine: false,
                isRefereeOwned: false,
                isClaimable: true
            ),
            .unclaimed
        )
    }

    func testClaimabilityHelpersReflectClaimState() {
        let claimedSessionID = UUID()
        let claimed = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Creator",
            claimedSessionId: claimedSessionID,
            claimedDisplayName: "Alex",
            name: "Scout",
            initiative: nil,
            stats: [],
            currency: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: [],
            isReferee: false,
            isClaimable: false
        )

        let unclaimed = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Referee",
            claimedSessionId: nil,
            claimedDisplayName: nil,
            name: "Goblin",
            initiative: nil,
            stats: [],
            currency: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: [],
            isReferee: true,
            isClaimable: true
        )

        XCTAssertTrue(claimed.isClaimed(by: claimedSessionID))
        XCTAssertFalse(claimed.isUnclaimed)
        XCTAssertFalse(claimed.canBeClaimed)
        XCTAssertTrue(unclaimed.isUnclaimed)
        XCTAssertTrue(unclaimed.canBeClaimed)
    }

    func testControllerNameVisibilityFollowsSettingAndOwnership() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertFalse(presentation.shouldShowControllerName(isMine: true, showPlayerNames: true))
        XCTAssertTrue(presentation.shouldShowControllerName(isMine: false, showPlayerNames: true))
        XCTAssertFalse(presentation.shouldShowControllerName(isMine: false, showPlayerNames: false))
    }

    func testConditionsVisibilityAlwaysShowsMineAndRespectsSettingForOthers() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertTrue(
            presentation.shouldShowConditions(
                isMine: true,
                hasConditions: false,
                showCharacterConditions: false
            )
        )
        XCTAssertTrue(
            presentation.shouldShowConditions(
                isMine: false,
                hasConditions: true,
                showCharacterConditions: true
            )
        )
        XCTAssertFalse(
            presentation.shouldShowConditions(
                isMine: false,
                hasConditions: true,
                showCharacterConditions: false
            )
        )
    }

    func testInitiativeTextUsesDiceEmojiWhenUnset() {
        let presentation = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        )

        XCTAssertEqual(presentation.initiativeText(nil), "🎲")
        XCTAssertEqual(presentation.initiativeText(17), "17")
        XCTAssertEqual(presentation.initiativeText(12.5), "12.5")
    }

    func testCampaignEventStreamParsesEventLineNames() {
        XCTAssertEqual(CampaignEventStreamClient.eventName(from: "event: snapshot"), "snapshot")
        XCTAssertEqual(CampaignEventStreamClient.eventName(from: " event: campaign-updated "), "campaign-updated")
        XCTAssertNil(CampaignEventStreamClient.eventName(from: "data: {\"campaign\":true}"))
    }

    func testRemovedPlayerSessionErrorsAreDetectedBy403Status() {
        XCTAssertTrue(isRemovedPlayerSessionError(APIClientError.serverError(403)))
        XCTAssertFalse(isRemovedPlayerSessionError(APIClientError.serverError(401)))
        XCTAssertFalse(isRemovedPlayerSessionError(APIClientError.invalidResponse))
    }

    func testDecodesInventoryAndPartyTreasurePayloads() throws {
        let decoder = JSONDecoder()

        let campaignData = """
        {
          "id":"11111111-1111-1111-1111-111111111111",
          "name":"Campaign",
          "rulesetId":"pathfinder",
          "rulesetLabel":"Pathfinder",
          "encounterState":"active",
          "currency":[{"unitId":"cp","amount":12}],
          "partyTreasure":[{"name":"Rope","quantity":1,"value":1.5,"weight":10.0,"url":null,"category":"Adventuring Gear","containerId":null,"isContainer":false}]
        }
        """.data(using: .utf8)!

        let playerData = """
        {
          "id":"22222222-2222-2222-2222-222222222222",
          "ownerId":"33333333-3333-3333-3333-333333333333",
          "ownerName":"Player",
          "claimedSessionId":null,
          "claimedDisplayName":null,
          "name":"Scout",
          "initiative":null,
          "stats":[],
          "currency":[{"unitId":"cp","amount":7}],
          "inventory":[{"name":"Dagger","quantity":1,"value":2.0,"weight":1.0,"url":null,"category":"Weapons","containerId":null,"isContainer":false}],
          "revealStats":false,
          "autoSkipTurn":false,
          "useAppInitiativeRoll":true,
          "initiativeBonus":0,
          "isHidden":false,
          "revealOnTurn":false,
          "conditions":[],
          "isReferee":false,
          "isClaimable":false
        }
        """.data(using: .utf8)!

        let campaign = try decoder.decode(CampaignStateDTO.self, from: campaignData)
        let player = try decoder.decode(PlayerViewDTO.self, from: playerData)

        XCTAssertEqual(campaign.currency?.first?.amount, 12)
        XCTAssertEqual(campaign.partyTreasure?.first?.name, "Rope")
        XCTAssertEqual(player.currency?.first?.amount, 7)
        XCTAssertEqual(player.inventory?.first?.name, "Dagger")
    }

    func testEquipmentPresetMatchesExactItemName() {
        let items = [
            EquipmentLibraryItemDTO(
                id: "backpack",
                name: "Backpack",
                category: "Adventuring Gear",
                value: 2,
                weight: 2,
                url: "https://example.com/backpack",
                source: "Core",
                notes: nil
            ),
            EquipmentLibraryItemDTO(
                id: "rope",
                name: "Rope",
                category: "Adventuring Gear",
                value: 1,
                weight: 10,
                url: nil,
                source: nil,
                notes: nil
            )
        ]

        let preset = EquipmentPreset.findEquipmentPreset(itemName: "  Backpack  ", equipmentLibraryItems: items)

        XCTAssertEqual(preset?.name, "Backpack")
        XCTAssertEqual(preset?.category, "Adventuring Gear")
        XCTAssertEqual(preset?.value, 2)
        XCTAssertEqual(preset?.weight, 2)
        XCTAssertEqual(preset?.url, "https://example.com/backpack")
    }

    func testEquipmentLibraryMatchesFilterBySubstring() {
        let items = [
            EquipmentLibraryItemDTO(
                id: "iron-chest",
                name: "Iron Chest",
                category: "Containers",
                value: nil,
                weight: nil,
                url: nil,
                source: nil,
                notes: nil
            ),
            EquipmentLibraryItemDTO(
                id: "wood-chest",
                name: "Wood Chest",
                category: "Containers",
                value: nil,
                weight: nil,
                url: nil,
                source: nil,
                notes: nil
            ),
            EquipmentLibraryItemDTO(
                id: "rope",
                name: "Rope",
                category: "Adventuring Gear",
                value: nil,
                weight: nil,
                url: nil,
                source: nil,
                notes: nil
            )
        ]

        let matches = InventoryDraftOperations.equipmentLibraryMatches(query: "chest", in: items)

        XCTAssertEqual(matches.map(\.name), ["Iron Chest", "Wood Chest"])
        XCTAssertTrue(InventoryDraftOperations.equipmentLibraryMatches(query: " ", in: items).isEmpty)
    }

    func testInventoryDraftToDTOOrNilRejectsInvalidDrafts() {
        let invalid = InventoryEntryDraft(name: " ", quantity: "not-a-number")

        XCTAssertNil(invalid.toDTOOrNil())
    }

    func testInventoryContainerDraftsIgnoreContainerPlacement() throws {
        let containerID = UUID()
        let entry = InventoryEntryDTO(
            id: UUID(),
            name: "Chest",
            quantity: 1,
            value: 0,
            weight: 0,
            url: nil,
            category: nil,
            containerId: containerID,
            isContainer: true
        )

        let draft = InventoryEntryDraft(entry: entry)
        let dto = try draft.toDTO()

        XCTAssertEqual(draft.containerId, "")
        XCTAssertNil(dto.containerId)
        XCTAssertTrue(dto.isContainer)
    }

    func testInventoryDraftFallbackTransferDTONormalizesLooseValues() {
        let draft = InventoryEntryDraft(
            name: "  Rope  ",
            category: " Gear ",
            quantity: " 3 ",
            value: " 12.5 ",
            weight: " 10 ",
            url: " https://example.com/rope ",
            containerId: UUID().uuidString,
            isContainer: true
        )

        let dto = draft.fallbackTransferDTO()

        XCTAssertEqual(dto.name, "Rope")
        XCTAssertEqual(dto.quantity, 3)
        XCTAssertEqual(dto.value, 12.5)
        XCTAssertEqual(dto.weight, 10)
        XCTAssertEqual(dto.url, "https://example.com/rope")
        XCTAssertEqual(dto.category, "Gear")
        XCTAssertNil(dto.containerId)
        XCTAssertFalse(dto.isContainer)
    }

    func testInventoryTransferOperationsStacksMatchingDestinationItemsAndSplitsQuantity() {
        let ropeID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let source = [
            InventoryEntryDTO(
                id: ropeID,
                name: "Rope",
                quantity: 5,
                value: 1,
                weight: 10,
                url: nil,
                category: "Adventuring Gear",
                containerId: nil,
                isContainer: false
            )
        ]
        let destination = [
            InventoryEntryDTO(
                id: UUID(uuidString: "22222222-2222-2222-2222-222222222222"),
                name: "Rope",
                quantity: 2,
                value: 1,
                weight: 10,
                url: nil,
                category: "Adventuring Gear",
                containerId: nil,
                isContainer: false
            )
        ]

        let result = InventoryTransferOperations.transferEntry(
            sourceItems: source,
            destinationItems: destination,
            entryID: ropeID,
            quantity: 3
        )

        XCTAssertEqual(result?.sourceItems.first?.quantity, 2)
        XCTAssertEqual(result?.destinationItems.count, 1)
        XCTAssertEqual(result?.destinationItems.first?.quantity, 5)
        XCTAssertEqual(result?.destinationItems.first?.id, destination.first?.id)
        XCTAssertEqual(result?.transferredEntry.quantity, 3)
        XCTAssertNotEqual(result?.transferredEntry.id, ropeID)
    }

    func testInventoryEntryDraftsAreRebuiltFromUpdatedInventory() {
        let originalInventory = [
            InventoryEntryDTO(
                id: UUID(uuidString: "11111111-1111-1111-1111-111111111111"),
                name: "Dagger",
                quantity: 1,
                value: 2,
                weight: 1,
                url: nil,
                category: "Weapons",
                containerId: nil,
                isContainer: false
            )
        ]
        let updatedInventory = [
            InventoryEntryDTO(
                id: UUID(uuidString: "22222222-2222-2222-2222-222222222222"),
                name: "Rope",
                quantity: 1,
                value: 1.5,
                weight: 10,
                url: nil,
                category: "Adventuring Gear",
                containerId: nil,
                isContainer: false
            )
        ]

        let originalDrafts = InventoryEntryDraft.drafts(from: originalInventory)
        let updatedDrafts = InventoryEntryDraft.drafts(from: updatedInventory)

        XCTAssertEqual(originalDrafts.map(\.name), ["Dagger"])
        XCTAssertEqual(updatedDrafts.map(\.name), ["Rope"])
        XCTAssertNotEqual(originalDrafts, updatedDrafts)
    }

    func testInventoryMoveTargetsExcludeTheCurrentContainerAndUseNumberedLabels() {
        let backpackID = UUID()
        let pouchID = UUID()
        let potionID = UUID()
        let drafts = [
            InventoryEntryDraft(
                id: backpackID,
                name: "Backpack",
                isContainer: true
            ),
            InventoryEntryDraft(
                id: pouchID,
                name: "Backpack",
                isContainer: true
            ),
            InventoryEntryDraft(
                id: potionID,
                name: "Potion",
                containerId: backpackID.uuidString
            )
        ]

        let targets = InventoryDraftOperations.containerMoveTargets(for: drafts[2], in: drafts)
        let labels = InventoryDraftOperations.containerDisplayLabels(in: drafts)
        let options = InventoryDraftOperations.containerSelectionOptions(for: drafts[2], in: drafts)

        XCTAssertEqual(targets.map(\.id), [pouchID])
        XCTAssertEqual(targets.map(\.label), ["Backpack #2"])
        XCTAssertEqual(labels[backpackID], "Backpack #1")
        XCTAssertEqual(labels[pouchID], "Backpack #2")
        XCTAssertEqual(options.map(\.label), ["Backpack #1", "Backpack #2"])
    }

    func testInventoryMoveEntryUpdatesContainerAndRejectsContainers() {
        let backpackID = UUID()
        let potionID = UUID()
        let drafts = [
            InventoryEntryDraft(
                id: backpackID,
                name: "Backpack",
                isContainer: true
            ),
            InventoryEntryDraft(
                id: potionID,
                name: "Potion"
            )
        ]

        let moved = InventoryDraftOperations.movedDrafts(drafts, entryID: potionID, to: backpackID)
        XCTAssertEqual(moved?[1].containerId, backpackID.uuidString)
        XCTAssertNil(InventoryDraftOperations.movedDrafts(drafts, entryID: backpackID, to: nil))
    }

    func testInventoryRemovalCanKeepContainerContentsOrDeleteDescendants() {
        let backpackID = UUID()
        let satchelID = UUID()
        let torchID = UUID()
        let gemID = UUID()
        let drafts = [
            InventoryEntryDraft(
                id: backpackID,
                name: "Backpack",
                isContainer: true
            ),
            InventoryEntryDraft(
                id: satchelID,
                name: "Satchel",
                containerId: backpackID.uuidString,
                isContainer: true
            ),
            InventoryEntryDraft(
                id: torchID,
                name: "Torch",
                containerId: backpackID.uuidString
            ),
            InventoryEntryDraft(
                id: gemID,
                name: "Gem",
                containerId: satchelID.uuidString
            )
        ]

        let keepContents = InventoryDraftOperations.removedDrafts(
            drafts,
            entryID: backpackID,
            moveContainedItems: true
        )
        XCTAssertEqual(keepContents?.count, 3)
        XCTAssertNil(keepContents?.first { $0.id == backpackID })
        XCTAssertEqual(keepContents?.first { $0.id == satchelID }?.containerId, "")
        XCTAssertEqual(keepContents?.first { $0.id == torchID }?.containerId, "")
        XCTAssertEqual(keepContents?.first { $0.id == gemID }?.containerId, satchelID.uuidString)

        let discardContents = InventoryDraftOperations.removedDrafts(
            drafts,
            entryID: backpackID,
            moveContainedItems: false
        )
        XCTAssertEqual(discardContents?.map(\.id) ?? [], [])
    }

    func testInventoryCategoryIconsResolveContainerAndNormalizedCategoryMatches() {
        let container = InventoryEntryDraft(
            name: "Backpack",
            isContainer: true
        )
        let weapon = InventoryEntryDraft(
            name: "Short Sword",
            category: " weapons "
        )
        let fallback = InventoryEntryDraft(
            name: "Unknown Item"
        )
        let icons = [
            "Containers": "🧳",
            "Weapons": "⚔️"
        ]

        XCTAssertEqual(InventoryCategoryIcons.glyph(for: container, categoryIcons: icons), "🧳")
        XCTAssertEqual(InventoryCategoryIcons.glyph(for: weapon, categoryIcons: icons), "⚔️")
        XCTAssertEqual(InventoryCategoryIcons.glyph(for: fallback, categoryIcons: icons), "🗡")
    }

    func testInventoryTotalWeightIncludesAllDraftWeights() {
        let containerID = UUID()
        let nestedID = UUID()
        let drafts = [
            InventoryEntryDraft(
                id: containerID,
                name: "Backpack",
                weight: "2",
                isContainer: true
            ),
            InventoryEntryDraft(
                id: nestedID,
                name: "Torch",
                quantity: "3",
                weight: "1",
                containerId: containerID.uuidString
            ),
            InventoryEntryDraft(
                name: "Rope",
                quantity: "2",
                weight: "5"
            )
        ]

        XCTAssertEqual(InventoryDraftOperations.totalWeight(for: drafts), 15)
    }

    func testInventoryDisplayFormattingUsesCurrencyAndWeightUnits() {
        let currencySystem = CurrencySystemDTO(
            commonCurrencyId: "gp",
            units: [
                CurrencyUnitDTO(id: "cp", label: "Copper", symbol: "cp", valueInCommonCurrency: 0.01),
                CurrencyUnitDTO(id: "gp", label: "Gold", symbol: "gp", valueInCommonCurrency: 1)
            ]
        )

        XCTAssertEqual(
            InventoryDisplayFormatting.formattedValue("2", currencySystem: currencySystem),
            "2 gp"
        )
        XCTAssertEqual(
            InventoryDisplayFormatting.formattedWeight("1", commonWeightUnits: ["lb.", "lbs."]),
            "1 lb."
        )
        XCTAssertEqual(
            InventoryDisplayFormatting.formattedWeight("2", commonWeightUnits: ["lb.", "lbs."]),
            "2 lbs."
        )
        XCTAssertEqual(
            InventoryDisplayFormatting.formattedWeight("2", commonWeightUnits: ["kg"]),
            "2 kgs"
        )
    }

    func testPartyTreasureDisplayTextOmitsCategoryAndAppendsQuantity() {
        let draft = InventoryEntryDraft(
            name: "Potion",
            category: "Consumable",
            quantity: "3"
        )

        XCTAssertEqual(
            partyTreasureEntryDisplayText(
                for: draft,
                containerLabels: [:]
            ),
            "Potion x3"
        )
    }

    func testCurrencyDraftsUseCurrencySystemLabelsWhenPresent() {
        let currencySystem = CurrencySystemDTO(
            commonCurrencyId: "gp",
            units: [
                CurrencyUnitDTO(id: "cp", label: "Copper", symbol: "cp", valueInCommonCurrency: 0.01),
                CurrencyUnitDTO(id: "gp", label: "Gold", symbol: "gp", valueInCommonCurrency: 1)
            ]
        )
        let drafts = CurrencyAmountDraft.buildDrafts(
            from: [
                CurrencyAmountDTO(unitId: "cp", amount: 12),
                CurrencyAmountDTO(unitId: "gp", amount: 7)
            ],
            currencySystem: currencySystem
        )

        XCTAssertEqual(drafts.map(\.label), ["Copper", "Gold"])
        XCTAssertEqual(drafts.map(\.amount), ["12", "7"])
    }
}
