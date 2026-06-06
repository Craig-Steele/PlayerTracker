const assert = require('node:assert/strict');
const test = require('node:test');

const { removeInventoryEntry } = require('./inventory-removal.js');

test('removing a container deletes the container and all descendants', () => {
  const backpackId = 'backpack';
  const pouchId = 'pouch';
  const items = [
    { id: backpackId, name: 'Backpack', isContainer: true },
    { id: pouchId, name: 'Pouch', isContainer: true, containerId: backpackId },
    { id: 'gem', name: 'Gem', containerId: pouchId },
    { id: 'rope', name: 'Rope', containerId: backpackId },
    { id: 'torch', name: 'Torch' }
  ];

  const remaining = removeInventoryEntry(items, backpackId);

  assert.deepEqual(
    remaining.map((entry) => entry.id),
    ['torch']
  );
});

test('removing a container can move its direct children to top level', () => {
  const backpackId = 'backpack';
  const pouchId = 'pouch';
  const items = [
    { id: backpackId, name: 'Backpack', isContainer: true },
    { id: pouchId, name: 'Pouch', isContainer: true, containerId: backpackId },
    { id: 'gem', name: 'Gem', containerId: pouchId },
    { id: 'rope', name: 'Rope', containerId: backpackId },
    { id: 'torch', name: 'Torch' }
  ];

  const remaining = removeInventoryEntry(items, backpackId, { moveContainedItems: true });

  assert.deepEqual(
    remaining.map((entry) => [entry.id, entry.containerId]),
    [
      ['pouch', null],
      ['gem', pouchId],
      ['rope', null],
      ['torch', null]
    ]
  );
});
