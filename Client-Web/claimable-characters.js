(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PlayerTrackerClaimableCharacters = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function filterClaimableCharacters(characters) {
    if (!Array.isArray(characters)) {
      return [];
    }
    return characters.filter(
      (character) =>
        !character?.claimedSessionId && (!character?.isReferee || Boolean(character?.isClaimable))
    );
  }

  return {
    filterClaimableCharacters
  };
});
