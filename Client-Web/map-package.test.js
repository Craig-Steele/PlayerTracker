const assert = require('node:assert/strict');
const { test } = require('node:test');
const MapPackage = require('./map-package.js');

function storedZipEntries(bytes) {
  const entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = bytes.toString('utf8', nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    entries.set(name, bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

const map = {
  imagePath: 'old-name.png',
  grid: { eastWestSquareCount: 2, northSouthSquareCount: 1, squareSizeFt: 5 },
  blockedTiles: [],
  terrain: { defaultType: 'normal', overrides: [] },
  elevation: { defaultHeightFt: 0, overrides: [] },
  edges: [],
  mapPresentation: { sideWallColor: { r: 0, g: 0, b: 0, a: 1 } }
};

test('new map packages save as .tttm and preserve the image and JSON sidecar', async () => {
  const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const archive = MapPackage.createArchive('Hall.zmap', map, image);
  assert.equal(archive.filename, 'Hall.tttm');

  const entries = storedZipEntries(Buffer.from(await archive.blob.arrayBuffer()));
  assert.deepEqual([...entries.keys()], ['Hall.png', 'Hall.map.json']);
  assert.deepEqual(entries.get('Hall.png'), Buffer.from(image));
  const sidecar = JSON.parse(entries.get('Hall.map.json').toString('utf8'));
  assert.equal(sidecar.format, 'TacticalTableTop.Map');
  assert.equal(sidecar.version, 1);
  assert.equal(sidecar.imagePath, 'Hall.png');
  assert.deepEqual(sidecar.grid, { eastWestSquareCount: 2, northSouthSquareCount: 1, squareSizeFt: 5, coordinateConvention: { origin: 'southwest' } });
});

test('the package loader recognizes current and legacy map extensions only', () => {
  assert.equal(MapPackage.supportsPackageFilename('encounter.tttm'), true);
  assert.equal(MapPackage.supportsPackageFilename('encounter.zmap'), true);
  assert.equal(MapPackage.supportsPackageFilename('encounter.map.zip'), true);
  assert.equal(MapPackage.supportsPackageFilename('encounter.tttc'), false);
});

test('legacy map metadata without format or version defaults to the current map format', () => {
  const legacy = MapPackage.normalizeMetadata({ ...map });
  assert.equal(legacy.format, 'TacticalTableTop.Map');
  assert.equal(legacy.version, 1);
});

test('unknown map formats and unsupported future versions produce useful errors', () => {
  assert.throws(() => MapPackage.normalizeMetadata({ ...map, format: 'Other.Map' }), /Unsupported map format 'Other\.Map'/);
  assert.throws(() => MapPackage.normalizeMetadata({ ...map, version: 2 }), /Unsupported Tactical Table Top map version 2.*supports version 1/);
});
