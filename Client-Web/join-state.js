(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerJoinState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function hasCampaignAccess(memberships, campaignID) {
    if (!Array.isArray(memberships) || !campaignID) {
      return false;
    }
    return memberships.some((campaign) => campaign?.id === campaignID);
  }

  function resolveJoinOutcome({
    campaignLoaded,
    currentCampaign,
    currentPlayerName,
    editingPlayerName,
    memberships,
    hasRefereeAccess
  }) {
    if (!campaignLoaded || !currentCampaign || !currentPlayerName || editingPlayerName) {
      return {
        state: 'inactive'
      };
    }

    if (!hasCampaignAccess(memberships, currentCampaign.id)) {
      return {
        state: 'denied',
        message: 'You do not have access to the active campaign on this server. Contact the server admin or campaign referee for access.'
      };
    }

    return {
      state: 'forwarded',
      destination: hasRefereeAccess ? '/referee.html' : '/player.html'
    };
  }

  return {
    hasCampaignAccess,
    resolveJoinOutcome
  };
});
