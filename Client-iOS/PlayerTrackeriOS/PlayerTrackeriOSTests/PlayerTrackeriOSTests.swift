import XCTest
@testable import Tactical_Table_Top__Initiative

final class PlayerTrackeriOSTests: XCTestCase {
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
}
