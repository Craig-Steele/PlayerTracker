const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SESSION_EXPIRED_MESSAGE,
  resolvePlayerNameSaveOutcome
} = require('./player-name-save.js');

test('returns session-expired outcome on 401 without attempting a rejoin', () => {
  const outcome = resolvePlayerNameSaveOutcome({
    status: 401,
    responsePayload: null,
    enteredName: 'Ally'
  });

  assert.equal(outcome.kind, 'session-expired');
  assert.equal(outcome.message, SESSION_EXPIRED_MESSAGE);
  assert.ok(!('playerId' in outcome));
  assert.ok(!('displayName' in outcome));
});

test('returns saved outcome for a successful rename', () => {
  const outcome = resolvePlayerNameSaveOutcome({
    status: 200,
    responsePayload: {
      player: {
        id: 'player-123',
        displayName: 'Ally'
      }
    },
    enteredName: 'Ally'
  });

  assert.equal(outcome.kind, 'saved');
  assert.equal(outcome.playerId, 'player-123');
  assert.equal(outcome.displayName, 'Ally');
  assert.equal(outcome.message, '');
});
