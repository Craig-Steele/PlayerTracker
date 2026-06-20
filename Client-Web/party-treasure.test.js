const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CATEGORY_FALLBACK_GLYPH,
  CONTAINER_GLYPH,
  collectPartyTreasureDraftFromForm,
  applyCurrencyDelta,
  calculatePartyTreasureVendorProceeds,
  convertCommonCurrencyToLowestUnitAmount,
  convertLowestUnitAmountToCurrencyBreakdown,
  getLowestCurrencyUnitLabel,
  populatePartyTreasureAddForm,
  resolveEquipmentOverflowGlyph,
  normalizeInventoryEntry,
  removePartyTreasureEntry,
  setPartyTreasureAddFormOpen,
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
  assert.equal(entry.category, null);
  assert.equal(entry.isContainer, false);
});

test('normalizeInventoryEntry preserves category for manual items', () => {
  const entry = normalizeInventoryEntry({
    name: 'Lantern Oil',
    category: 'Adventuring Gear'
  });

  assert.equal(entry.category, 'Adventuring Gear');
});

test('shared PT form helpers populate and collect editor state', () => {
  const inputs = {
    nameInput: { value: '' },
    categoryInput: { value: '' },
    quantityInput: { value: '' },
    valueInput: { value: '' },
    weightInput: { value: '' },
    urlInput: { value: '' }
  };

  const populated = populatePartyTreasureAddForm(inputs, {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Potion',
    quantity: 2,
    value: 5,
    weight: 1,
    url: 'https://example.test/potion',
    category: 'Potions'
  });

  assert.equal(populated.name, 'Potion');
  assert.equal(inputs.nameInput.value, 'Potion');
  assert.equal(inputs.quantityInput.value, '2');
  assert.equal(inputs.valueInput.value, '5');
  assert.equal(inputs.weightInput.value, '1');
  assert.equal(inputs.urlInput.value, 'https://example.test/potion');
  assert.equal(inputs.categoryInput.value, 'Potions');

  assert.deepEqual(
    collectPartyTreasureDraftFromForm(inputs, '11111111-1111-4111-8111-111111111111'),
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Potion',
      quantity: 2,
      value: 5,
      weight: 1,
      url: 'https://example.test/potion',
      category: 'Potions',
      containerId: null,
      isContainer: false
    }
  );
});

test('setPartyTreasureAddFormOpen wires shared form open and close behavior', () => {
  const classes = new Set(['hidden']);
  const formEl = {
    classList: {
      toggle(className, force) {
        const shouldAdd = force === undefined ? !classes.has(className) : Boolean(force);
        if (shouldAdd) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
        return shouldAdd;
      },
      contains(className) {
        return classes.has(className);
      }
    },
    setAttribute() {}
  };
  const titleEl = { textContent: '' };
  const saveButtonEl = { textContent: '' };
  const inputs = {
    nameInput: { value: '' },
    categoryInput: { value: '' },
    quantityInput: { value: '' },
    valueInput: { value: '' },
    weightInput: { value: '' },
    urlInput: { value: '' }
  };
  let refreshCalls = 0;
  let updateCalls = 0;

  const editingEntryId = setPartyTreasureAddFormOpen({
    open: true,
    entry: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Potion',
      quantity: 3,
      value: 5,
      weight: 1,
      url: 'https://example.test/potion',
      category: 'Potions'
    },
    formEl,
    titleEl,
    saveButtonEl,
    inputs,
    equipmentLibraryItems: [
      {
        name: 'Potion',
        value: 10,
        weight: 0.5,
        url: 'https://example.test/preset',
        category: 'Potions'
      }
    ],
    refreshSelectedRowIcon: () => {
      refreshCalls += 1;
    },
    updateActionButtons: () => {
      updateCalls += 1;
    }
  });

  assert.equal(editingEntryId, '22222222-2222-4222-8222-222222222222');
  assert.equal(classes.has('hidden'), false);
  assert.equal(titleEl.textContent, 'Edit Item');
  assert.equal(saveButtonEl.textContent, 'Save Changes');
  assert.equal(inputs.nameInput.value, 'Potion');
  assert.equal(inputs.valueInput.value, '10');
  assert.equal(inputs.weightInput.value, '0.5');
  assert.equal(inputs.urlInput.value, 'https://example.test/preset');
  assert.equal(inputs.categoryInput.value, 'Potions');
  assert.equal(refreshCalls, 1);
  assert.equal(updateCalls, 1);

  const closedEntryId = setPartyTreasureAddFormOpen({
    open: false,
    formEl,
    titleEl,
    saveButtonEl,
    inputs,
    updateActionButtons: () => {
      updateCalls += 1;
    }
  });

  assert.equal(closedEntryId, null);
  assert.equal(classes.has('hidden'), true);
  assert.equal(titleEl.textContent, 'Add Item');
  assert.equal(saveButtonEl.textContent, 'Add Item');
  assert.equal(inputs.nameInput.value, '');
  assert.equal(inputs.quantityInput.value, '1');
  assert.equal(inputs.valueInput.value, '0');
  assert.equal(inputs.weightInput.value, '0');
});

test('upsertPartyTreasureEntry replaces an existing item by id', () => {
  const items = upsertPartyTreasureEntry([
    { id: '11111111-1111-4111-8111-111111111111', name: 'Rope', quantity: 1, value: 1, weight: 5, category: 'Adventuring Gear' }
  ], {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Silk Rope',
    quantity: 2,
    value: 10,
    weight: 3,
    category: 'Adventuring Gear'
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Silk Rope');
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].value, 10);
  assert.equal(items[0].weight, 3);
  assert.equal(items[0].category, 'Adventuring Gear');
});

test('removePartyTreasureEntry removes a matching item id', () => {
  const items = removePartyTreasureEntry([
    { id: '11111111-1111-4111-8111-111111111111', name: 'Rope' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Gem' }
  ], '11111111-1111-4111-8111-111111111111');

  assert.deepEqual(items.map((item) => item.id), ['22222222-2222-4222-8222-222222222222']);
});

test('vendor helpers calculate proceeds and normalize currency into highest denominations', () => {
  const currencySystem = {
    commonCurrencyId: 'gp',
    units: [
      { id: 'cp', label: 'Copper', symbol: 'cp', valueInCommonCurrency: 0.01 },
      { id: 'sp', label: 'Silver', symbol: 'sp', valueInCommonCurrency: 0.1 },
      { id: 'gp', label: 'Gold', symbol: 'gp', valueInCommonCurrency: 1 }
    ]
  };

  assert.equal(
    calculatePartyTreasureVendorProceeds({ quantity: 2, value: 12.5 }, 0.5),
    12.5
  );
  assert.equal(getLowestCurrencyUnitLabel(currencySystem), 'copper');
  assert.equal(convertCommonCurrencyToLowestUnitAmount(12.5, currencySystem), 1250);
  assert.deepEqual(
    convertLowestUnitAmountToCurrencyBreakdown(1355, currencySystem),
    [
      { unitId: 'gp', amount: 13 },
      { unitId: 'sp', amount: 5 },
      { unitId: 'cp', amount: 5 }
    ]
  );
  assert.deepEqual(
    applyCurrencyDelta(
      [
        { unitId: 'sp', amount: 10 },
        { unitId: 'cp', amount: 5 }
      ],
      currencySystem,
      12.5
    ),
    [
      { unitId: 'gp', amount: 13 },
      { unitId: 'sp', amount: 5 },
      { unitId: 'cp', amount: 5 }
    ]
  );
});

test('resolveEquipmentOverflowGlyph uses Pathfinder category icons and falls back to the shared glyph', () => {
  const glyph = resolveEquipmentOverflowGlyph({
    entry: { name: 'Abacus', category: 'Food and Drink' },
    categoryIcons: {
      'Food and Drink': '🍗',
      'Goods and Services': '📃',
      Coins: '🪙',
      'Magic Item': '🪄'
    }
  });

  assert.equal(glyph, '🍗');
  assert.equal(resolveEquipmentOverflowGlyph({ entry: { name: 'Unknown Widget' } }), CATEGORY_FALLBACK_GLYPH);
  assert.equal(resolveEquipmentOverflowGlyph({ entry: { name: 'Cart', isContainer: true } }), CONTAINER_GLYPH);
});

test('resolveEquipmentOverflowGlyph resolves potion items from the saved category', () => {
  const categoryIcons = {
    Potions: '🧪',
    Scrolls: '📜',
    Coins: '🪙',
    'Magic Item': '🪄'
  };

  assert.equal(resolveEquipmentOverflowGlyph({
    entry: { name: 'Potion: Cure Light Wounds', category: 'Potions' },
    categoryIcons
  }), '🧪');

  assert.equal(resolveEquipmentOverflowGlyph({
    entry: { name: 'Potion: Cure Light Wounds', category: 'potions' },
    categoryIcons
  }), '🧪');

  assert.equal(resolveEquipmentOverflowGlyph({
    entry: { name: 'Gold Coins', category: 'Coins' },
    categoryIcons
  }), '🪙');

  assert.equal(resolveEquipmentOverflowGlyph({
    entry: { name: 'Wand of Magic Missile', category: 'magic item' },
    categoryIcons
  }), '🪄');
});
