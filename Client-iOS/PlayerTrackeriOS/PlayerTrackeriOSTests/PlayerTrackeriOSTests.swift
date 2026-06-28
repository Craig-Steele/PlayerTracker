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
            presentation.nameBadgeTone(isMine: true, isRefereeOwned: false),
            .mine
        )
        XCTAssertEqual(
            presentation.nameBadgeTone(isMine: false, isRefereeOwned: true),
            .referee
        )
        XCTAssertEqual(
            presentation.nameBadgeTone(isMine: false, isRefereeOwned: false),
            .other
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
                isReferee: false
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
            isReferee: false
        )

        let fallback = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Creator",
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
            isReferee: false
        )

        XCTAssertEqual(controller.controllerDisplayName, "Chrome")
        XCTAssertEqual(fallback.controllerDisplayName, "Creator")
    }

    func testControllerDisplayNameUsesRefereeForRefereeOwnedCharacters() {
        let refereeOwned = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Chrome",
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
            isReferee: true
        )

        XCTAssertEqual(refereeOwned.controllerDisplayName, "Referee")
    }

    func testRefereeToneShouldFollowDisplayedControllerName() {
        let playerControlledRefereeFlag = PlayerViewDTO(
            id: UUID(),
            ownerId: UUID(),
            ownerName: "Chrome",
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
            isReferee: true
        )

        let tone = EncounterPresentationState(
            campaignEncounterState: nil,
            gameEncounterState: .active
        ).nameBadgeTone(
            isMine: false,
            isRefereeOwned: playerControlledRefereeFlag.controllerDisplayName.caseInsensitiveCompare("Referee") == .orderedSame
        )

        XCTAssertEqual(tone, .other)
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
