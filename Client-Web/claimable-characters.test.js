const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterClaimableCharacters,
  getCharacterControllerName,
  isClaimablePoolCharacter
} = require('./claimable-characters.js');

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

test('treats claimable referee characters as available instead of referee-owned', () => {
  assert.equal(
    getCharacterControllerName({
      claimedSessionId: null,
      claimedDisplayName: null,
      isReferee: true,
      isClaimable: true
    }),
    ''
  );
  assert.equal(
    getCharacterControllerName({
      claimedSessionId: null,
      claimedDisplayName: null,
      isReferee: true,
      isClaimable: false
    }),
    'Referee'
  );
  assert.equal(
    isClaimablePoolCharacter({
      claimedSessionId: null,
      isClaimable: true
    }),
    true
  );
});
