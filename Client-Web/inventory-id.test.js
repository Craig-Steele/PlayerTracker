const assert = require('node:assert/strict');
const test = require('node:test');

const { createInventoryEntryId } = require('./inventory-id');

test('inventory ids are UUID-shaped', () => {
  const id = createInventoryEntryId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
