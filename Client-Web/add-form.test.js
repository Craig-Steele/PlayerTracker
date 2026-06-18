const assert = require('node:assert/strict');
const test = require('node:test');

const { buildAddFormConfig } = require('./add-form.js');

test('party treasure form config omits the container selector', () => {
  const config = buildAddFormConfig('party-treasure');

  assert.equal(config.id, 'party-treasure-add-form');
  assert.equal(config.fields.some((field) => field.id === 'party-treasure-add-container-row'), false);
  assert.equal(config.fields.some((field) => field.id === 'party-treasure-add-name'), true);
});

test('inventory form config includes the container selector', () => {
  const config = buildAddFormConfig('inventory');

  assert.equal(config.id, 'inventory-add-form');
  assert.equal(config.fields.some((field) => field.id === 'inventory-add-kind-row'), true);
  assert.equal(config.fields.some((field) => field.id === 'inventory-add-container-row'), true);
  assert.equal(config.fields.some((field) => field.id === 'inventory-add-name'), true);
});
