(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TacticalMapPackage = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const FORMAT_IDENTIFIER = 'TacticalTableTop.Map';
  const FORMAT_VERSION = 1;
  const encoder = new TextEncoder();

  function safeStem(value) {
    return (value || 'map').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'map';
  }

  function packageFilename(value) {
    const stem = (value || 'map').trim().replace(/\.(?:tttm|zmap|map\.zip|zip)$/i, '');
    return `${safeStem(stem)}.tttm`;
  }

  function supportsPackageFilename(filename) {
    return /\.(?:tttm|zmap|map\.zip)$/i.test(filename || '');
  }

  function normalizeMetadata(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('The map sidecar must be a JSON object.');
    if (map.format != null && map.format !== FORMAT_IDENTIFIER) {
      throw new Error(`Unsupported map format '${map.format}'. Expected ${FORMAT_IDENTIFIER}.`);
    }
    const version = map.version == null ? FORMAT_VERSION : map.version;
    if (!Number.isInteger(version) || version !== FORMAT_VERSION) {
      throw new Error(`Unsupported Tactical Table Top map version ${version}. This app supports version ${FORMAT_VERSION}.`);
    }
    map.format = FORMAT_IDENTIFIER;
    map.version = version;
    return map;
  }

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }

  function zipStore(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const write16 = (view, index, value) => view.setUint16(index, value, true);
    const write32 = (view, index, value) => view.setUint32(index, value >>> 0, true);
    for (const file of files) {
      const name = encoder.encode(file.name);
      const bytes = file.bytes;
      const crc = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      write32(lv, 0, 0x04034b50); write16(lv, 4, 20); write16(lv, 6, 0x0800);
      write16(lv, 8, 0); write32(lv, 14, crc); write32(lv, 18, bytes.length); write32(lv, 22, bytes.length);
      write16(lv, 26, name.length); local.set(name, 30);
      localParts.push(local, bytes);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      write32(cv, 0, 0x02014b50); write16(cv, 4, 20); write16(cv, 6, 20); write16(cv, 8, 0x0800);
      write16(cv, 10, 0); write32(cv, 16, crc); write32(cv, 20, bytes.length); write32(cv, 24, bytes.length);
      write16(cv, 28, name.length); write32(cv, 42, offset); central.set(name, 46);
      centralParts.push(central);
      offset += local.length + bytes.length;
    }
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    write32(ev, 0, 0x06054b50); write16(ev, 8, files.length); write16(ev, 10, files.length);
    write32(ev, 12, centralSize); write32(ev, 16, offset);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function createArchive(name, map, imageBytes) {
    const stem = packageFilename(name).replace(/\.tttm$/i, '');
    const imagePath = `${stem}.png`;
    const sidecar = normalizeMetadata({
      ...map,
      imagePath,
      grid: { ...map.grid, coordinateConvention: { origin: 'southwest' } }
    });
    const files = [
      { name: imagePath, bytes: imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes) },
      { name: `${stem}.map.json`, bytes: encoder.encode(JSON.stringify(sidecar, null, 2)) }
    ];
    return { filename: `${stem}.tttm`, blob: zipStore(files), sidecar };
  }

  return {
    FORMAT_IDENTIFIER,
    FORMAT_VERSION,
    createArchive,
    normalizeMetadata,
    packageFilename,
    supportsPackageFilename
  };
});
