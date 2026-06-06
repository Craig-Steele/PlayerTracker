const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveInventoryDraftContainerId } = require('./inventory-target.js');

test('defaults to the selected container row when no container is chosen explicitly', () => {
  assert.equal(
    resolveInventoryDraftContainerId({
      selectedRowData: { id: 'container-1', containerId: null, isContainer: true }
    }),
    'container-1'
  );
});

test('defaults to the selected item parent container when an item row is selected', () => {
  assert.equal(
    resolveInventoryDraftContainerId({
      selectedRowData: { id: 'item-1', containerId: 'container-1', isContainer: false }
    }),
    'container-1'
  );
});

test('uses the chosen container from the add form when provided', () => {
  assert.equal(
    resolveInventoryDraftContainerId({
      selectedRowData: { id: 'container-1', containerId: null, isContainer: true },
      chosenContainerId: 'container-2'
    }),
    'container-2'
  );
});

test('returns null for new containers regardless of the current selection', () => {
  assert.equal(
    resolveInventoryDraftContainerId({
      selectedRowData: { id: 'container-1', containerId: null, isContainer: true },
      chosenContainerId: 'container-2',
      isContainer: true
    }),
    null
  );
});
