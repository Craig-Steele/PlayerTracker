const test = require('node:test');
const assert = require('node:assert/strict');

const { collectStatPayloadFromInputs } = require('./stat-inputs.js');

function makeEntry(current, max) {
  return {
    currentInput: { value: current },
    maxInput: { value: max }
  };
}

test('collects edited max values while preserving blank current inputs', () => {
  const stats = collectStatPayloadFromInputs(
    [
      ['HP', makeEntry('', '12')],
      ['TempHP', makeEntry('', '')]
    ],
    [
      { key: 'HP', current: 8, max: 10 },
      { key: 'TempHP', current: 2, max: 0 }
    ]
  );

  assert.deepEqual(stats, [
    { key: 'HP', current: 8, max: 12 },
    { key: 'TempHP', current: 2, max: 0 }
  ]);
});

test('rejects current values above the edited max', () => {
  assert.throws(
    () =>
      collectStatPayloadFromInputs(
        [['HP', makeEntry('13', '12')]],
        [{ key: 'HP', current: 8, max: 10 }]
      ),
    /current must be less than or equal to Max/
  );
});

test('supports adding a new stat payload from explicit values', () => {
  const stats = collectStatPayloadFromInputs([['HP', makeEntry('5', '8')]], []);

  assert.deepEqual(stats, [{ key: 'HP', current: 5, max: 8 }]);
});
