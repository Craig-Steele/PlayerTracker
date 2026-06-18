const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyEquipmentPresetToInputs,
  findEquipmentPreset
} = require('./equipment-preset.js');

test('findEquipmentPreset matches names case-insensitively', () => {
  const preset = findEquipmentPreset('  Rope  ', [
    { name: 'Lantern' },
    { name: 'rope', value: 1 }
  ]);

  assert.deepEqual(preset, { name: 'rope', value: 1 });
});

test('applyEquipmentPresetToInputs fills value weight and url inputs', () => {
  const valueInput = { value: '' };
  const weightInput = { value: '' };
  const urlInput = { value: '' };

  const applied = applyEquipmentPresetToInputs(
    { valueInput, weightInput, urlInput },
    'Potion',
    [
      { name: 'Potion', value: 25, weight: 0.5, url: 'https://example.test/potion' }
    ]
  );

  assert.equal(applied, true);
  assert.equal(valueInput.value, '25');
  assert.equal(weightInput.value, '0.5');
  assert.equal(urlInput.value, 'https://example.test/potion');
});

test('applyEquipmentPresetToInputs leaves fields untouched when no preset exists', () => {
  const valueInput = { value: '10' };
  const weightInput = { value: '2' };
  const urlInput = { value: 'https://example.test/original' };

  const applied = applyEquipmentPresetToInputs(
    { valueInput, weightInput, urlInput },
    'Unknown Item',
    [{ name: 'Potion', value: 25, weight: 0.5, url: 'https://example.test/potion' }]
  );

  assert.equal(applied, false);
  assert.equal(valueInput.value, '10');
  assert.equal(weightInput.value, '2');
  assert.equal(urlInput.value, 'https://example.test/original');
});
