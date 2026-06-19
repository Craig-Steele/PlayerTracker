const assert = require('node:assert/strict');
const test = require('node:test');

const { CONTAINER_GLYPH, resolveContainerGlyph } = require('./inventory-view.js');

test('resolveContainerGlyph uses the ruleset container icon when present', () => {
  assert.equal(resolveContainerGlyph({ Containers: '🎒' }), '🎒');
});

test('resolveContainerGlyph falls back to the bag glyph when missing', () => {
  assert.equal(resolveContainerGlyph({ Weapons: '⚔️' }), CONTAINER_GLYPH);
});
