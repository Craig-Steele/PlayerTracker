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

  function isClaimablePoolCharacter(character) {
    return !character?.claimedSessionId && Boolean(character?.isClaimable);
  }

  function getCharacterControllerName(character) {
    if (!character) return '';
    const claimedDisplayName = typeof character.claimedDisplayName === 'string'
      ? character.claimedDisplayName.trim()
      : '';
    if (claimedDisplayName) return claimedDisplayName;
    if (character.isReferee && !isClaimablePoolCharacter(character)) return 'Referee';
    return '';
  }

  return {
    filterClaimableCharacters,
    getCharacterControllerName,
    isClaimablePoolCharacter
  };
});
