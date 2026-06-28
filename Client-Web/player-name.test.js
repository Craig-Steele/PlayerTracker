const assert = require('node:assert/strict');
const test = require('node:test');

const {
  hasRealPlayerName,
  normalizePlayerName,
  resolvePlayerDisplayName,
  sanitizePlayerDisplayName
} = require('./player-name');

test('placeholder player name is not treated as real', () => {
  assert.equal(hasRealPlayerName('Player'), false);
  assert.equal(hasRealPlayerName(' player '), false);
  assert.equal(hasRealPlayerName('Alice'), true);
});

test('real display names are preferred', () => {
  assert.equal(
    resolvePlayerDisplayName({ loginName: 'Alice', displayName: 'Player' }),
    ''
  );
  assert.equal(
    resolvePlayerDisplayName({ loginName: 'Alice', displayName: '' }),
    ''
  );
  assert.equal(
    resolvePlayerDisplayName({ loginName: '', displayName: 'Player' }, 'Bob'),
    'Bob'
  );
});

test('player name sanitization drops blanks and uuid-like values', () => {
  assert.equal(normalizePlayerName('  Alice  '), 'alice');
  assert.equal(sanitizePlayerDisplayName('  Alice  '), 'Alice');
  assert.equal(sanitizePlayerDisplayName(''), '');
  assert.equal(
    sanitizePlayerDisplayName('550e8400-e29b-41d4-a716-446655440000'),
    ''
  );
});
