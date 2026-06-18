const assert = require('node:assert/strict');
const test = require('node:test');

const { transferEntry } = require('./inventory-transfer.js');

test('transferEntry moves an item between collections', () => {
  const result = transferEntry({
    sourceItems: [
      { id: 'rope', name: 'Rope', quantity: 1, value: 2, weight: 5, isContainer: false }
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
