(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerRefereeVisibility = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function getInitiativeGroupMembers(currentPlayers, player) {
    if (!player || !player.initiativeGroupId) return [];
    return Array.isArray(currentPlayers)
      ? currentPlayers.filter(
          (candidate) =>
            candidate &&
            candidate.initiativeGroupId &&
            candidate.initiativeGroupId === player.initiativeGroupId
        )
      : [];
  }

  function getCharacterVisibilityMenuItems(isHidden) {
    return isHidden
      ? [
          { label: 'Reveal Now', isHidden: false, revealOnTurn: false },
          { label: 'Reveal on Turn', isHidden: true, revealOnTurn: true }
        ]
      : [
          { label: 'Hide Character', isHidden: true, revealOnTurn: false }
        ];
  }

  function getInitiativeGroupVisibilityMenuItems(groupMembers, isHidden) {
    if (!Array.isArray(groupMembers) || groupMembers.length <= 1) return [];
    return isHidden
      ? [
          { label: 'Group: Reveal Now', isHidden: false, revealOnTurn: false },
          { label: 'Group: Reveal On Turn', isHidden: true, revealOnTurn: true }
        ]
      : [
          { label: 'Group: Hide', isHidden: true, revealOnTurn: false }
        ];
  }

  function buildInitiativeGroupVisibilityUpdates(groupMembers, isHidden, revealOnTurn) {
    if (!Array.isArray(groupMembers) || groupMembers.length === 0) return [];
    return groupMembers
      .filter((member) => Boolean(member && member.id))
      .map((member) => ({
        id: member.id,
        isHidden,
        revealOnTurn
      }));
  }

  return {
    getInitiativeGroupMembers,
    getCharacterVisibilityMenuItems,
    getInitiativeGroupVisibilityMenuItems,
    buildInitiativeGroupVisibilityUpdates
  };
});
