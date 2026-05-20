const test = require('node:test');
const assert = require('node:assert/strict');

const { filterClaimableCharacters } = require('./claimable-characters.js');

test('filters out claimed and referee-owned characters from the claimable list', () => {
  const result = filterClaimableCharacters([
    { id: 'a', name: 'Unclaimed', claimedSessionId: null, isReferee: false },
    { id: 'b', name: 'Claimed', claimedSessionId: 'session-1', isReferee: false },
    { id: 'c', name: 'Referee', claimedSessionId: null, isReferee: true }
  ]);

  assert.deepEqual(result.map((character) => character.id), ['a']);
});

test('returns an empty list for non-array input', () => {
  assert.deepEqual(filterClaimableCharacters(null), []);
  assert.deepEqual(filterClaimableCharacters(undefined), []);
});
