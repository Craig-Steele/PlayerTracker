const assert = require('node:assert/strict');
const test = require('node:test');

const {
  resolveEquipmentOverflowGlyph,
  normalizeInventoryEntry,
  removePartyTreasureEntry,
  upsertPartyTreasureEntry
} = require('./party-treasure.js');

test('normalizeInventoryEntry fills defaults for treasure rows', () => {
  const entry = normalizeInventoryEntry({
    id: '12345678-1234-4234-8234-1234567890ab',
    name: 'Potion',
    quantity: 3,
    value: 25.5,
    weight: 0.5,
    url: ' https://example.test/potion '
  });

  assert.equal(entry.id, '12345678-1234-4234-8234-1234567890ab');
  assert.equal(entry.name, 'Potion');
  assert.equal(entry.quantity, 3);
  assert.equal(entry.value, 25.5);
  assert.equal(entry.weight, 0.5);
  assert.equal(entry.url, 'https://example.test/potion');
  assert.equal(entry.isContainer, false);
});

test('upsertPartyTreasureEntry replaces an existing item by id', () => {
  const items = upsertPartyTreasureEntry([
    { id: '11111111-1111-4111-8111-111111111111', name: 'Rope', quantity: 1, value: 1, weight: 5 }
  ], {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Silk Rope',
    quantity: 2,
    value: 10,
    weight: 3
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Silk Rope');
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].value, 10);
  assert.equal(items[0].weight, 3);
});

test('removePartyTreasureEntry removes a matching item id', () => {
  const items = removePartyTreasureEntry([
    { id: '11111111-1111-4111-8111-111111111111', name: 'Rope' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Gem' }
  ], '11111111-1111-4111-8111-111111111111');

  assert.deepEqual(items.map((item) => item.id), ['22222222-2222-4222-8222-222222222222']);
});

test('resolveEquipmentOverflowGlyph uses Pathfinder category icons and falls back to the sword glyph', () => {
  const glyph = resolveEquipmentOverflowGlyph({
    entry: { name: 'Abacus' },
    equipmentLibraryItems: [
      { name: 'Abacus', category: 'Food and Drink' }
    ],
    categoryIcons: {
      'Food and Drink': '🍗',
      'Goods and Services': '📜'
    }
  });

  assert.equal(glyph, '🍗');
  assert.equal(resolveEquipmentOverflowGlyph({ entry: { name: 'Unknown Widget' } }), '🗡');
  assert.equal(resolveEquipmentOverflowGlyph({ entry: { name: 'Cart', isContainer: true } }), '🧳');
});
