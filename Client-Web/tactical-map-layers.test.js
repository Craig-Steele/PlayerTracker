const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function loadLayers() {
  const source = fs.readFileSync(new URL('./tactical/tactical-map-layers.js', `file://${__dirname}/`).pathname, 'utf8');
  const context = { window: {}, navigator: { userAgent: '' } };
  vm.runInNewContext(source, context);
  return context.window.TacticalMapLayers;
}

function recordingContext() {
  const calls = [];
  return {
    calls,
    save() {}, restore() {}, beginPath() {}, moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); }, stroke() {}, translate() {}, rotate() {},
    strokeText(...args) { calls.push(['strokeText', ...args]); },
    fillText(...args) { calls.push(['fillText', ...args]); }
  };
}

test('shared edge renderer draws window states at the canonical edge coordinates', () => {
  const layers = loadLayers();
  const context = recordingContext();
  const map = {
    grid: { eastWestSquareCount: 2, northSouthSquareCount: 2 },
    edges: [
      { axis: 'vertical', x: 1, y: 0, type: 'window', widthFt: 5, initialState: 'uninspected' },
      { axis: 'horizontal', x: 0, y: 1, type: 'window', widthFt: 5, initialState: 'inspected' },
      { axis: 'vertical', x: 2, y: 1, type: 'window', widthFt: 5, initialState: 'open' }
    ]
  };

  layers.drawEdges(context, map, { cellW: 100, cellH: 80, offsetX: 0, offsetY: 0, rows: 2 }, {
    showWindowLabels: true,
    viewerIsReferee: true
  });

  assert.deepEqual(context.calls.filter(([name]) => name === 'fillText').map(([, text]) => text), ['?', 'I', 'O']);
  assert.deepEqual(context.calls.filter(([name]) => name === 'moveTo'), [
    ['moveTo', 100, 80], ['moveTo', 0, 80], ['moveTo', 200, 0]
  ]);
});
