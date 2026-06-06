(function () {
  function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      (value || '').trim()
    );
  }

  function normalizePlayerName(value) {
    return (value || '').trim().toLowerCase();
  }

  function sanitizePlayerDisplayName(value) {
    const trimmed = (value || '').trim();
    if (!trimmed || isUuidLike(trimmed)) {
      return '';
    }
    return trimmed;
  }

  function hasRealPlayerName(value) {
    const trimmed = sanitizePlayerDisplayName(value);
    if (!trimmed) return false;
    return normalizePlayerName(trimmed) !== 'player';
  }

  function resolvePlayerDisplayName(player, fallbackName = '') {
    const loginName = sanitizePlayerDisplayName(player?.loginName);
    const displayName = sanitizePlayerDisplayName(player?.displayName);
    if (hasRealPlayerName(displayName)) {
      return displayName;
    }
    if (hasRealPlayerName(loginName)) {
      return loginName;
    }
    const fallback = sanitizePlayerDisplayName(fallbackName);
    if (hasRealPlayerName(fallback)) {
      return fallback;
    }
    return '';
  }

  const api = {
    isUuidLike,
    normalizePlayerName,
    sanitizePlayerDisplayName,
    hasRealPlayerName,
    resolvePlayerDisplayName
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.PlayerTrackerPlayerName = api;
  }
})();
