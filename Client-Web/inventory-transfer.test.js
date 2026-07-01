const assert = require('node:assert/strict');
const test = require('node:test');

const { transferEntry } = require('./inventory-transfer.js');

test('transferEntry moves an item between collections', () => {
  const result = transferEntry({
    sourceItems: [
      { id: 'rope', name: 'Rope', quantity: 1, value: 2, weight: 5, category: 'Adventuring Gear', isContainer: false }
    ],
    destinationItems: [
      { id: 'gem', name: 'Gem', quantity: 1, value: 100, weight: 0 }
    ],
    entryId: 'rope',
    mapTransferredEntry: (entry) => ({ ...entry, containerId: null, isContainer: false }),
    removeFromSource: true
  });

  assert.deepEqual(result.sourceItems, []);
  assert.deepEqual(
    result.destinationItems.map((item) => item.id),
    ['gem', 'rope']
  );
  assert.equal(result.transferredEntry.name, 'Rope');
  assert.equal(result.transferredEntry.category, 'Adventuring Gear');
});

test('transferEntry can update an item in place', () => {
  const result = transferEntry({
    sourceItems: [
      { id: 'rope', name: 'Rope', containerId: null, isContainer: false }
    ],
    destinationItems: [
      { id: 'rope', name: 'Rope', containerId: null, isContainer: false }
    ],
    entryId: 'rope',
    mapTransferredEntry: (entry) => ({ ...entry, containerId: 'backpack', isContainer: false }),
    removeFromSource: false
  });

  assert.equal(result.sourceItems[0].containerId, 'backpack');
  assert.equal(result.destinationItems[0].containerId, 'backpack');
});

test('transferEntry can split a stack in place when moving between containers', () => {
  const result = transferEntry({
    sourceItems: [
      { id: 'rope', name: 'Rope', quantity: 10, containerId: null, isContainer: false },
      { id: 'bag', name: 'Bag', quantity: 1, containerId: null, isContainer: true }
    ],
    destinationItems: [
      { id: 'rope', name: 'Rope', quantity: 10, containerId: null, isContainer: false },
      { id: 'bag', name: 'Bag', quantity: 1, containerId: null, isContainer: true }
    ],
    entryId: 'rope',
    quantity: 3,
    mapTransferredEntry: (entry) => ({ ...entry, id: 'rope-split', containerId: 'bag', isContainer: false }),
    removeFromSource: false
  });

  assert.equal(result.sourceItems.find((item) => item.id === 'rope').quantity, 7);
  assert.equal(result.destinationItems.find((item) => item.id === 'rope').quantity, 7);
  assert.equal(result.destinationItems.find((item) => item.id === 'rope-split').quantity, 3);
  assert.equal(result.destinationItems.find((item) => item.id === 'rope-split').containerId, 'bag');
});

test('transferEntry can move part of a stack and merge into matching destination items', () => {
  const result = transferEntry({
    sourceItems: [
      { id: 'arrows-source', name: 'Arrow', quantity: 10, value: 1, weight: 0, category: 'Ammunition', isContainer: false }
    ],
    destinationItems: [
      { id: 'arrows-destination', name: 'Arrow', quantity: 4, value: 1, weight: 0, category: 'Ammunition', isContainer: false }
    ],
    entryId: 'arrows-source',
    quantity: 3,
    mapTransferredEntry: (entry) => ({ ...entry, id: 'arrows-party', containerId: null, isContainer: false }),
    removeFromSource: true
  });

  assert.equal(result.sourceItems[0].quantity, 7);
  assert.equal(result.destinationItems.length, 1);
  assert.equal(result.destinationItems[0].quantity, 7);
  assert.equal(result.transferredEntry.quantity, 3);
});

test('transferEntry defaults to the full source quantity when quantity is omitted', () => {
  const result = transferEntry({
    sourceItems: [
      { id: 'rope', name: 'Rope', quantity: 2, value: 2, weight: 5, category: 'Adventuring Gear', isContainer: false }
    ],
    destinationItems: [],
    entryId: 'rope',
    mapTransferredEntry: (entry) => ({ ...entry, containerId: null, isContainer: false }),
    removeFromSource: true
  });

  assert.deepEqual(result.sourceItems, []);
  assert.equal(result.destinationItems[0].quantity, 2);
  assert.equal(result.transferredEntry.quantity, 2);
});
