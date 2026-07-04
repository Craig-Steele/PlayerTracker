(function () {
  const SESSION_EXPIRED_MESSAGE = 'Player session expired. Please rejoin from the join page.';

  function resolvePlayerNameSaveOutcome({ status, responsePayload, enteredName }) {
    if (status === 401 || status === 403) {
      return {
        kind: 'session-expired',
        message: SESSION_EXPIRED_MESSAGE
      };
    }

    if (status < 200 || status >= 300) {
      return {
        kind: 'error',
        message: `Server returned ${status}`
      };
    }

    const player = responsePayload?.player || {};
    return {
      kind: 'saved',
      playerId: player.id || '',
      displayName: player.displayName || enteredName || '',
      message: ''
    };
  }

  const api = {
    SESSION_EXPIRED_MESSAGE,
    resolvePlayerNameSaveOutcome
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.TacticalTableTopInitiativePlayerNameSave = api;
  }
})();
