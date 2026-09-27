(() => {
  const $ = (selector) => document.querySelector(selector);
  const fileInput = $('[data-authoring-file]');
  const archiveInput = $('[data-authoring-archive]');
  const status = $('[data-authoring-status]');
  const cropPanel = $('[data-authoring-crop]');
  const cropCanvas = $('[data-crop-canvas]');
  const canvas = $('[data-map-canvas]');
  const mapViewport = canvas.parentElement;
  const validation = $('[data-map-validation]');
  const validateButton = $('[data-validate]');
  const exportButton = $('[data-export]');
  const undoButton = $('[data-undo]');
  const ctx = canvas.getContext('2d');
  let sourceImage = null;
  let imageBlob = null;
  let map = null;
  let mapImage = null;
  let mapEdgeColor = '#f5f8fb';
  let tool = 'pan';
  let spacePan = false;
  let cropRect = null;
  let cropDrag = null;
  let history = [];
  let strokeSnapshot = null;
  let lastPainted = '';
  let pointerMode = '';
  let strokeEdgeAxis = '';
  let strokeClearing = false;
  let lastPointer = null;
  let lastPaintPoint = null;
  let placementDragStart = null;
  let placementDragEnd = null;
  let view = { scale: 1, x: 0, y: 0 };
  const layerOpacity = { terrain: 25, obstacles: 25, elevation: 25, edges: 25, startingZone: 25, stickers: 25 };
  let saveTimer = null;
  let draftAvailable = false;

  function syncCanvasCursor() {
    canvas.style.cursor = pointerMode === 'pan' ? 'grabbing' : (spacePan || tool === 'pan' ? 'grab' : 'crosshair');
  }

  const tileIcons = {
    obstacle: '🪨',
    difficult: '⚠️',
    water: '💧',
    lava: '♨️',
    impassible: '❌'
  };
  const terrainTints = {
    impassible: '#111111',
    difficult: '#ffd400',
    water: '#168bd2',
    lava: '#e53935'
  };

  const layerOpacityInputs = [...document.querySelectorAll('[data-layer-opacity]')];
  $('[data-load-map-image]').addEventListener('click', () => fileInput.click());
  $('[data-load-map-package]').addEventListener('click', () => archiveInput.click());
  $('[data-new-blank-map]').addEventListener('click', async (event) => {
    const { columns, rows, squareFt } = gridValues();
    if (!Number.isInteger(columns) || columns < 1 || columns > 200 || !Number.isInteger(rows) || rows < 1 || rows > 200 || !Number.isFinite(squareFt) || squareFt <= 0) {
      const message = 'Set valid grid dimensions (1–200 squares) and a positive square size before creating a blank map.';
      validation.classList.add('error');
      validation.textContent = message;
      status.textContent = message;
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const pixelsPerSquare = Math.min(64, Math.floor(2048 / Math.max(columns, rows)));
      const blankCanvas = document.createElement('canvas');
      blankCanvas.width = columns * pixelsPerSquare;
      blankCanvas.height = rows * pixelsPerSquare;
      const blankContext = blankCanvas.getContext('2d');
      blankContext.fillStyle = '#fff';
      blankContext.fillRect(0, 0, blankCanvas.width, blankCanvas.height);
      imageBlob = await new Promise((resolve, reject) => blankCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the blank map image.')), 'image/png'));
      mapImage = await loadImage(imageBlob);
      mapEdgeColor = '#fff';
      const name = $('[data-map-name]').value.trim() || 'Untitled map';
      map = {
        format: TacticalMapPackage.FORMAT_IDENTIFIER,
        version: TacticalMapPackage.FORMAT_VERSION,
        imagePath: `${safeStem(name)}.png`,
        grid: {
          eastWestSquareCount: columns,
          northSouthSquareCount: rows,
          squareSizeFt: squareFt,
          coordinateConvention: { origin: 'southwest' },
          boundaryBehavior: $('[data-infinite-canvas]').checked ? 'infinite' : 'bounded'
        },
        blockedTiles: [],
        stickers: [],
        terrain: { defaultType: 'normal', overrides: [] },
        elevation: { defaultHeightFt: 0, overrides: [] },
        edges: [],
        mapPresentation: { sideWallColor: { r: 0, g: 0, b: 0, a: 1 } }
      };
      sourceImage = null;
      cropRect = null;
      cropPanel.hidden = true;
      mapViewport.hidden = false;
      history = [];
      undoButton.disabled = true;
      fitMap();
      refreshValidation();
      scheduleSave();
      status.textContent = 'Created a new blank map.';
    } catch (error) {
      status.textContent = `Could not create a blank map: ${error.message || error}`;
    } finally {
      button.disabled = false;
    }
  });
  const layerOpacityKey = 'roll4-map-authoring-layer-opacity';
  try {
    const savedOpacity = JSON.parse(localStorage.getItem(layerOpacityKey) || '{}');
    Object.keys(layerOpacity).forEach((layer) => {
      if ([0, 25, 50, 75].includes(Number(savedOpacity[layer]))) layerOpacity[layer] = Number(savedOpacity[layer]);
    });
  } catch (_) {}
  layerOpacityInputs.forEach((input) => {
    input.value = String(layerOpacity[input.dataset.layerOpacity]);
    input.addEventListener('change', () => {
      layerOpacity[input.dataset.layerOpacity] = Number(input.value);
      try { localStorage.setItem(layerOpacityKey, JSON.stringify(layerOpacity)); } catch (_) {}
      draw();
    });
  });

  function openDraftDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('roll4-map-authoring', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readDraft() {
    const db = await openDraftDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get('active');
      request.onsuccess = () => { db.close(); resolve(request.result || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function saveDraft() {
    if (!map || !imageBlob) return;
    const db = await openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({ map, imageBlob, name: $('[data-map-name]').value }, 'active');
      tx.oncomplete = () => { db.close(); draftAvailable = true; $('[data-authoring-restore]').hidden = false; resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft().catch(() => {
      status.textContent = 'This browser could not save the draft locally. Export your map to keep a copy.';
    }), 250);
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(blob);
    });
  }

  function renderCrop() {
    const width = cropCanvas.clientWidth;
    const height = cropCanvas.clientHeight;
    if (!width || !height || !sourceImage) return;
    cropCanvas.width = width;
    cropCanvas.height = height;
    const context = cropCanvas.getContext('2d');
    const scale = Math.min(width / sourceImage.naturalWidth, height / sourceImage.naturalHeight);
    const drawWidth = sourceImage.naturalWidth * scale;
    const drawHeight = sourceImage.naturalHeight * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    cropCanvas.dataset.scale = scale;
    cropCanvas.dataset.offsetX = x;
    cropCanvas.dataset.offsetY = y;
    context.clearRect(0, 0, width, height);
    context.drawImage(sourceImage, x, y, drawWidth, drawHeight);
    const rect = cropRect || { x: 0, y: 0, width: sourceImage.naturalWidth, height: sourceImage.naturalHeight };
    const sx = x + rect.x * scale;
    const sy = y + rect.y * scale;
    const sw = rect.width * scale;
    const sh = rect.height * scale;
    context.fillStyle = 'rgba(0,0,0,.48)';
    context.fillRect(x, y, drawWidth, drawHeight);
    context.clearRect(sx, sy, sw, sh);
    context.drawImage(sourceImage, rect.x, rect.y, rect.width, rect.height, sx, sy, sw, sh);
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.setLineDash([7, 4]);
    context.strokeRect(sx, sy, sw, sh);
    context.setLineDash([]);
  }

  function cropPoint(event) {
    const scale = Number(cropCanvas.dataset.scale);
    const offsetX = Number(cropCanvas.dataset.offsetX);
    const offsetY = Number(cropCanvas.dataset.offsetY);
    const rect = cropCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(sourceImage.naturalWidth, (event.clientX - rect.left - offsetX) / scale)),
      y: Math.max(0, Math.min(sourceImage.naturalHeight, (event.clientY - rect.top - offsetY) / scale))
    };
  }

  cropCanvas.addEventListener('pointerdown', (event) => {
    if (!sourceImage) return;
    cropDrag = cropPoint(event);
    cropRect = { x: cropDrag.x, y: cropDrag.y, width: 1, height: 1 };
    cropCanvas.setPointerCapture(event.pointerId);
  });
  cropCanvas.addEventListener('pointermove', (event) => {
    if (!cropDrag) return;
    const point = cropPoint(event);
    cropRect = {
      x: Math.min(cropDrag.x, point.x), y: Math.min(cropDrag.y, point.y),
      width: Math.max(1, Math.abs(point.x - cropDrag.x)), height: Math.max(1, Math.abs(point.y - cropDrag.y))
    };
    renderCrop();
  });
  cropCanvas.addEventListener('pointerup', () => { cropDrag = null; });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png') || (file.type && file.type !== 'image/png') || file.size > 20 * 1024 * 1024) {
      status.textContent = 'Choose a PNG image no larger than 20 MB.';
      return;
    }
    sourceImage = await loadImage(file);
    cropRect = { x: 0, y: 0, width: sourceImage.naturalWidth, height: sourceImage.naturalHeight };
    $('[data-map-name]').value = file.name.replace(/\.png$/i, '');
    cropPanel.hidden = false;
    mapViewport.hidden = true;
    status.textContent = `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight} px. Select the map area, then apply the crop.`;
    requestAnimationFrame(renderCrop);
  });

  async function inflateZipEntry(compressedBytes, method) {
    if (method === 0) return compressedBytes;
    if (method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}.`);
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed ZIP entries. Try a store-only .tttm export.');
    try {
      const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      throw new Error(`Could not decompress the map package (${error.message || error}).`);
    }
  }

  async function readMapArchive(file) {
    if (!TacticalMapPackage.supportsPackageFilename(file.name)) throw new Error('Choose a .tttm map package. Legacy .zmap files can also be opened.');
    if (file.size > 35 * 1024 * 1024) throw new Error('The map package is too large (maximum 35 MB).');
    const bytes = new Uint8Array(await readBlobBytes(file));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minEocd = Math.max(0, bytes.length - 22 - 0xffff);
    let eocd = -1;
    for (let offset = bytes.length - 22; offset >= minEocd; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error('The selected file is not a readable ZIP package.');
    const entryCount = view.getUint16(eocd + 10, true);
    const centralOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries = [];
    let offset = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('The ZIP central directory is invalid.');
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    const images = entries.filter((entry) => entry.name.toLowerCase().endsWith('.png'));
    const sidecars = entries.filter((entry) => entry.name.toLowerCase().endsWith('.map.json'));
    if (images.length !== 1 || sidecars.length !== 1) throw new Error('The package must contain exactly one PNG image and one .map.json sidecar.');
    const extract = async (entry, maximumBytes) => {
      if (entry.flags & 1) throw new Error('Encrypted ZIP packages are not supported.');
      if (entry.uncompressedSize > maximumBytes) throw new Error(`Package entry ${entry.name} exceeds the allowed size.`);
      const local = entry.localOffset;
      if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error(`ZIP entry ${entry.name} is malformed.`);
      const dataOffset = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const dataEnd = dataOffset + entry.compressedSize;
      if (dataEnd > bytes.length) throw new Error(`ZIP entry ${entry.name} is truncated.`);
      const result = await inflateZipEntry(bytes.subarray(dataOffset, dataEnd), entry.method);
      if (result.length !== entry.uncompressedSize) throw new Error(`ZIP entry ${entry.name} has an invalid size.`);
      return result;
    };
    const [imageBytes, sidecarBytes] = await Promise.all([
      extract(images[0], 20 * 1024 * 1024), extract(sidecars[0], 2 * 1024 * 1024)
    ]);
    const imageBlob = new Blob([imageBytes], { type: 'image/png' });
    const image = await loadImage(imageBlob);
    let map;
    try { map = JSON.parse(decoder.decode(sidecarBytes)); }
    catch (_) { throw new Error('The map sidecar is not valid JSON.'); }
    TacticalMapPackage.normalizeMetadata(map);
    if (!map || typeof map !== 'object' || !map.grid || !Number.isInteger(map.grid.eastWestSquareCount) || !Number.isInteger(map.grid.northSouthSquareCount)) {
      throw new Error('The map sidecar is missing valid grid dimensions.');
    }
    map.imagePath = images[0].name.split('/').pop();
    return { map, imageBlob, image, name: sidecars[0].name.split('/').pop().replace(/\.map\.json$/i, '') };
  }

  archiveInput.addEventListener('change', async () => {
    const file = archiveInput.files?.[0];
    if (!file) return;
    status.textContent = 'Opening map package…';
    try {
      const loaded = await readMapArchive(file);
      map = loaded.map;
      imageBlob = loaded.imageBlob;
      mapImage = loaded.image;
      mapEdgeColor = averageImageEdgeColor(mapImage);
      $('[data-map-name]').value = loaded.name || file.name.replace(/\.(?:zmap|map\.zip)$/i, '');
      map.version ||= 1;
      map.grid.squareSizeFt ||= 5;
      map.grid.boundaryBehavior ||= 'bounded';
      map.blockedTiles ||= [];
      map.stickers ||= [];
      map.terrain ||= { defaultType: 'normal', overrides: [] };
      map.terrain.defaultType ||= 'normal';
      map.terrain.overrides ||= [];
      map.elevation ||= { defaultHeightFt: 0, overrides: [] };
      map.elevation.overrides ||= [];
      map.edges ||= [];
      map.mapPresentation ||= { sideWallColor: { r: 0, g: 0, b: 0, a: 1 } };
      map.mapPresentation.sideWallColor ||= { r: 0, g: 0, b: 0, a: 1 };
      $('[data-grid-width]').value = map.grid.eastWestSquareCount;
      $('[data-grid-height]').value = map.grid.northSouthSquareCount;
      $('[data-square-size]').value = map.grid.squareSizeFt;
      $('[data-infinite-canvas]').checked = map.grid.boundaryBehavior === 'infinite';
      history = [];
      undoButton.disabled = true;
      cropPanel.hidden = true;
      mapViewport.hidden = false;
      fitMap();
      refreshValidation();
      scheduleSave();
      status.textContent = 'Map package opened. Edit the map and export a new package when ready.';
      archiveInput.value = '';
    } catch (error) {
      status.textContent = `Unable to open map package: ${error.message || error}`;
    }
  });

  $('[data-crop-reset]').addEventListener('click', () => {
    if (!sourceImage) return;
    cropRect = { x: 0, y: 0, width: sourceImage.naturalWidth, height: sourceImage.naturalHeight };
    renderCrop();
  });

  $('[data-crop-apply]').addEventListener('click', async () => {
    if (!sourceImage || !cropRect) return;
    const x = Math.round(cropRect.x);
    const y = Math.round(cropRect.y);
    const width = Math.max(1, Math.round(cropRect.width));
    const height = Math.max(1, Math.round(cropRect.height));
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    output.getContext('2d').drawImage(sourceImage, x, y, width, height, 0, 0, width, height);
    imageBlob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    mapImage = await loadImage(imageBlob);
    mapEdgeColor = averageImageEdgeColor(mapImage);
    map = {
      format: TacticalMapPackage.FORMAT_IDENTIFIER,
      version: TacticalMapPackage.FORMAT_VERSION,
      imagePath: `${safeStem($('[data-map-name]').value)}.png`,
      grid: { eastWestSquareCount: 20, northSouthSquareCount: 20, squareSizeFt: 5, coordinateConvention: { origin: 'southwest' }, boundaryBehavior: 'bounded' },
      blockedTiles: [], stickers: [], terrain: { defaultType: 'normal', overrides: [] },
      elevation: { defaultHeightFt: 0, overrides: [] }, edges: [],
      mapPresentation: { sideWallColor: { r: 0, g: 0, b: 0, a: 1 } }
    };
    history = [];
    $('[data-grid-width]').value = 20;
    $('[data-grid-height]').value = 20;
    $('[data-square-size]').value = 5;
    cropPanel.hidden = true;
    mapViewport.hidden = false;
    syncGrid();
    fitMap();
    scheduleSave();
  });

  function safeStem(value) {
    return (value || 'map').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'map';
  }

  function gridValues() {
    return {
      columns: Number.parseInt($('[data-grid-width]').value, 10),
      rows: Number.parseInt($('[data-grid-height]').value, 10),
      squareFt: Number($('[data-square-size]').value)
    };
  }

  function syncGrid() {
    if (!map) return;
    const { columns, rows, squareFt } = gridValues();
    if (!Number.isInteger(columns) || columns < 1 || columns > 200 || !Number.isInteger(rows) || rows < 1 || rows > 200 || !Number.isFinite(squareFt) || squareFt <= 0) {
      validation.textContent = 'Grid dimensions must be 1–200 squares and square size must be positive.';
      validation.classList.add('error');
      exportButton.disabled = true;
      return;
    }
    map.grid.eastWestSquareCount = columns;
    map.grid.northSouthSquareCount = rows;
    map.grid.squareSizeFt = squareFt;
    const keepTile = ({ x, y }) => x >= 0 && x < columns && y >= 0 && y < rows;
    map.blockedTiles = map.blockedTiles.filter(keepTile);
    map.stickers = (map.stickers || []).filter(keepTile);
    map.terrain.overrides = map.terrain.overrides.filter((tile) => keepTile(tile));
    map.elevation.overrides = map.elevation.overrides.filter((tile) => keepTile(tile));
    map.edges = map.edges.filter((edge) => edge.axis === 'vertical'
      ? edge.x >= 0 && edge.x <= columns && edge.y >= 0 && edge.y < rows
      : edge.x >= 0 && edge.x < columns && edge.y >= 0 && edge.y <= rows);
    if (map.playerPlacement?.defaultBounds) {
      const bounds = map.playerPlacement.defaultBounds;
      bounds.west = Math.min(bounds.west, columns - 1);
      bounds.east = Math.min(bounds.east, columns - 1);
      bounds.south = Math.min(bounds.south, rows - 1);
      bounds.north = Math.min(bounds.north, rows - 1);
    }
    draw();
    refreshValidation();
    scheduleSave();
  }
  ['[data-grid-width]', '[data-grid-height]', '[data-square-size]'].forEach((selector) => {
    $(selector).addEventListener('change', syncGrid);
  });

  function snapshot() {
    return JSON.stringify({ blockedTiles: map.blockedTiles, stickers: map.stickers || [], terrain: map.terrain, elevation: map.elevation, edges: map.edges, boundaryBehavior: map.grid.boundaryBehavior, playerPlacement: map.playerPlacement || null });
  }
  function beginStroke() {
    if (!strokeSnapshot) strokeSnapshot = snapshot();
  }
  function endStroke() {
    if (strokeSnapshot && strokeSnapshot !== snapshot()) {
      history.push(strokeSnapshot);
      if (history.length > 50) history.shift();
      undoButton.disabled = false;
      scheduleSave();
      refreshValidation();
    }
    strokeSnapshot = null;
    lastPainted = '';
  }
  undoButton.addEventListener('click', () => {
    const state = history.pop();
    if (!state) return;
    const restored = JSON.parse(state);
    const { boundaryBehavior, ...restoredMapState } = restored;
    Object.assign(map, restoredMapState);
    if (boundaryBehavior) map.grid.boundaryBehavior = boundaryBehavior;
    $('[data-infinite-canvas]').checked = map.grid.boundaryBehavior === 'infinite';
    if (restored.playerPlacement) map.playerPlacement = restored.playerPlacement;
    else delete map.playerPlacement;
    undoButton.disabled = history.length === 0;
    draw();
    scheduleSave();
    refreshValidation();
  });

  document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
    tool = button.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    syncCanvasCursor();
    draw();
  }));
  $('[data-map-name]').addEventListener('input', () => {
    if (map) map.imagePath = `${safeStem($('[data-map-name]').value)}.png`;
    scheduleSave();
  });

  function imageSize() { return { width: mapImage?.naturalWidth || 0, height: mapImage?.naturalHeight || 0 }; }
  function averageImageEdgeColor(image) {
    try {
      const sample = document.createElement('canvas');
      sample.width = 32; sample.height = 32;
      const sampleContext = sample.getContext('2d');
      sampleContext.drawImage(image, 0, 0, 32, 32);
      const pixels = sampleContext.getImageData(0, 0, 32, 32).data;
      let red = 0; let green = 0; let blue = 0; let count = 0;
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
        if (x !== 0 && x !== 31 && y !== 0 && y !== 31) continue;
        const index = (y * 32 + x) * 4;
        red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1;
      }
      return `rgb(${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)})`;
    } catch (_) {
      return '#f5f8fb';
    }
  }
  function fitMap() {
    const size = imageSize();
    if (!size.width || !canvas.clientWidth || !canvas.clientHeight) return;
    view.scale = Math.min(canvas.clientWidth / size.width, canvas.clientHeight / size.height) * .94;
    view.x = (canvas.clientWidth - size.width * view.scale) / 2;
    view.y = (canvas.clientHeight - size.height * view.scale) / 2;
    draw();
  }
  $('[data-fit]').addEventListener('click', fitMap);

  function gridMetrics() {
    const size = imageSize();
    const grid = map.grid;
    return { size, cellW: size.width / grid.eastWestSquareCount, cellH: size.height / grid.northSouthSquareCount };
  }
  function cellAt(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    const mapX = (clientX - bounds.left - view.x) / view.scale;
    const mapY = (clientY - bounds.top - view.y) / view.scale;
    const { cellW, cellH } = gridMetrics();
    const x = Math.floor(mapX / cellW);
    const row = Math.floor(mapY / cellH);
    const y = map.grid.northSouthSquareCount - 1 - row;
    if (x < 0 || x >= map.grid.eastWestSquareCount || row < 0 || row >= map.grid.northSouthSquareCount) return null;
    return { x, y, row, mapX, mapY };
  }

  $('[data-zone-clear]').addEventListener('click', () => {
    if (!map) return;
    delete map.playerPlacement;
    draw(); scheduleSave(); refreshValidation();
  });

  function paintCell(cell) {
    const id = `${cell.x},${cell.y}`;
    if (id === lastPainted) return;
    lastPainted = id;
    if (tool === 'obstacle') {
      if (strokeClearing) {
        map.blockedTiles = map.blockedTiles.filter((tile) => tile.x !== cell.x || tile.y !== cell.y);
      } else {
        const blocked = new Set(map.blockedTiles.map((tile) => `${tile.x},${tile.y}`));
        blocked.add(id);
        map.blockedTiles = [...blocked].map((key) => { const [x, y] = key.split(',').map(Number); return { x, y }; });
      }
    } else if (tool === 'sticker') {
      const sticker = {
        x: cell.x,
        y: cell.y,
        emoji: $('[data-sticker-emoji]').value.trim(),
        sizePercent: Number($('[data-sticker-size]').value),
        opacityPercent: layerOpacity.stickers
      };
      map.stickers ||= [];
      if (strokeClearing) {
        map.stickers = map.stickers.filter((item) => item.x !== cell.x || item.y !== cell.y || item.emoji !== sticker.emoji);
      } else {
        map.stickers = map.stickers.filter((item) => item.x !== cell.x || item.y !== cell.y);
        map.stickers.push(sticker);
      }
    } else if (tool === 'erase-stickers') {
      map.stickers = (map.stickers || []).filter((item) => item.x !== cell.x || item.y !== cell.y);
    } else if (['difficult', 'water', 'lava', 'impassible'].includes(tool)) {
      map.terrain.overrides = rewriteOverridesAtCell(map.terrain.overrides, cell, (tile) => !strokeClearing || tile.type === tool);
      if (!strokeClearing) map.terrain.overrides.push({ x: cell.x, y: cell.y, width: 1, height: 1, type: tool });
    } else if (tool === 'elevation' || tool === 'erase-elevation') {
      const heightFt = Number($('[data-elevation-value]').value);
      map.elevation.overrides = rewriteOverridesAtCell(map.elevation.overrides, cell, () => true);
      if (tool === 'elevation' && !strokeClearing && heightFt !== map.elevation.defaultHeightFt) map.elevation.overrides.push({ x: cell.x, y: cell.y, width: 1, height: 1, heightFt });
    } else if (tool === 'erase-obstacles') {
      map.blockedTiles = map.blockedTiles.filter((tile) => tile.x !== cell.x || tile.y !== cell.y);
    } else if (tool === 'erase-terrain') {
      map.terrain.overrides = rewriteOverridesAtCell(map.terrain.overrides, cell, () => true);
    }
    draw();
  }

  function rewriteOverridesAtCell(overrides, cell, shouldRemove) {
    const result = [];
    for (const tile of overrides) {
      const coversCell = cell.x >= tile.x && cell.x < tile.x + tile.width && cell.y >= tile.y && cell.y < tile.y + tile.height;
      if (!coversCell || !shouldRemove(tile)) { result.push(tile); continue; }
      const right = tile.x + tile.width;
      const top = tile.y + tile.height;
      const add = (x, y, width, height) => { if (width > 0 && height > 0) result.push({ ...tile, x, y, width, height }); };
      add(tile.x, tile.y, tile.width, cell.y - tile.y);
      add(tile.x, cell.y + 1, tile.width, top - cell.y - 1);
      add(tile.x, cell.y, cell.x - tile.x, 1);
      add(cell.x + 1, cell.y, right - cell.x - 1, 1);
    }
    return result;
  }

  function nearestEdge(cell) {
    const { cellW, cellH } = gridMetrics();
    const distances = [
      { side: 'west', distance: cell.mapX - cell.x * cellW },
      { side: 'east', distance: (cell.x + 1) * cellW - cell.mapX },
      { side: 'north', distance: cell.mapY - cell.row * cellH },
      { side: 'south', distance: (cell.row + 1) * cellH - cell.mapY }
    ].sort((a, b) => a.distance - b.distance);
    const side = distances[0].side;
    if (side === 'west') return { axis: 'vertical', x: cell.x, y: cell.y };
    if (side === 'east') return { axis: 'vertical', x: cell.x + 1, y: cell.y };
    if (side === 'north') return { axis: 'horizontal', x: cell.x, y: cell.y + 1 };
    return { axis: 'horizontal', x: cell.x, y: cell.y };
  }

  function edgeAtPoint(clientX, clientY, axis = null) {
    const bounds = canvas.getBoundingClientRect();
    const mapX = (clientX - bounds.left - view.x) / view.scale;
    const mapY = (clientY - bounds.top - view.y) / view.scale;
    const { size, cellW, cellH } = gridMetrics();
    const tolerance = Math.min(cellW, cellH) * 0.55;
    if (mapX < -tolerance || mapX > size.width + tolerance || mapY < -tolerance || mapY > size.height + tolerance) return null;
    const verticalLine = Math.max(0, Math.min(map.grid.eastWestSquareCount, Math.round(mapX / cellW)));
    const verticalDistance = Math.abs(mapX - verticalLine * cellW);
    const horizontalLineFromTop = Math.max(0, Math.min(map.grid.northSouthSquareCount, Math.round(mapY / cellH)));
    const horizontalDistance = Math.abs(mapY - horizontalLineFromTop * cellH);
    const chosenAxis = axis || (verticalDistance <= horizontalDistance ? 'vertical' : 'horizontal');
    if ((chosenAxis === 'vertical' ? verticalDistance : horizontalDistance) > tolerance) return null;
    if (chosenAxis === 'vertical') {
      const row = Math.max(0, Math.min(map.grid.northSouthSquareCount - 1, Math.floor(mapY / cellH)));
      return { axis: chosenAxis, x: verticalLine, y: map.grid.northSouthSquareCount - 1 - row };
    }
    const column = Math.max(0, Math.min(map.grid.eastWestSquareCount - 1, Math.floor(mapX / cellW)));
    return { axis: chosenAxis, x: column, y: map.grid.northSouthSquareCount - horizontalLineFromTop };
  }

  function paintEdge(edge) {
    const id = `${edge.axis}:${edge.x}:${edge.y}`;
    if (id === lastPainted) return;
    lastPainted = id;
    if (tool === 'erase-edges') {
      map.edges = map.edges.filter((candidate) => `${candidate.axis}:${candidate.x}:${candidate.y}` !== id);
    } else if (strokeClearing) {
      map.edges = map.edges.filter((candidate) => `${candidate.axis}:${candidate.x}:${candidate.y}` !== id || candidate.type !== tool);
    } else {
      const item = { ...edge, type: tool };
      if (tool === 'door') item.widthFt = Number($('[data-door-width]').value) || map.grid.squareSizeFt;
      if (tool === 'door') {
        item.initialState = $('[data-door-state]').value;
        item.locked = $('[data-door-locked]').checked;
      }
      map.edges = map.edges.filter((candidate) => `${candidate.axis}:${candidate.x}:${candidate.y}` !== id);
      map.edges.push(item);
    }
    draw();
  }

  function paintEdgeStrokeTo(edge) {
    const [axis, fromX, fromY] = lastPainted.split(':');
    if (axis !== edge.axis) { paintEdge(edge); return; }
    let x = Number(fromX);
    let y = Number(fromY);
    const dx = Math.abs(edge.x - x);
    const dy = Math.abs(edge.y - y);
    const sx = x < edge.x ? 1 : -1;
    const sy = y < edge.y ? 1 : -1;
    let error = dx - dy;
    while (true) {
      paintEdge({ axis, x, y });
      if (x === edge.x && y === edge.y) break;
      const doubledError = 2 * error;
      if (doubledError > -dy) { error -= dy; x += sx; }
      if (doubledError < dx) { error += dx; y += sy; }
    }
  }

  $('[data-infinite-canvas]').addEventListener('change', (event) => {
    if (!map) return;
    const previous = snapshot();
    map.grid.boundaryBehavior = event.target.checked ? 'infinite' : 'bounded';
    history.push(previous);
    if (history.length > 50) history.shift();
    undoButton.disabled = false;
    draw(); scheduleSave(); refreshValidation();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!mapImage) return;
    canvas.setPointerCapture(event.pointerId);
    strokeClearing = event.shiftKey;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (spacePan || tool === 'pan') { pointerMode = 'pan'; syncCanvasCursor(); return; }
    if (tool === 'starting-zone') {
      const cell = cellAt(event.clientX, event.clientY);
      if (!cell) return;
      beginStroke();
      pointerMode = 'zone'; placementDragStart = cell; placementDragEnd = cell; draw(); return;
    }
    if (['wall', 'door', 'erase-edges'].includes(tool)) {
      const edge = edgeAtPoint(event.clientX, event.clientY);
      if (!edge) return;
      pointerMode = 'edge';
      strokeEdgeAxis = edge.axis;
      beginStroke();
      paintEdge(edge);
      return;
    }
    pointerMode = 'paint';
    beginStroke();
    const cell = cellAt(event.clientX, event.clientY);
    if (cell) { paintCell(cell); lastPaintPoint = { x: cell.mapX, y: cell.mapY }; }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerMode) return;
    if (pointerMode === 'edge') {
      const edge = edgeAtPoint(event.clientX, event.clientY, strokeEdgeAxis);
      if (edge) paintEdgeStrokeTo(edge);
      return;
    }
    if (pointerMode === 'zone') {
      placementDragEnd = cellAt(event.clientX, event.clientY) || placementDragEnd;
      draw();
      return;
    }
    if (pointerMode === 'pan') {
      view.x += event.clientX - lastPointer.x;
      view.y += event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      draw();
      return;
    }
    const cell = cellAt(event.clientX, event.clientY);
    if (!cell) return;
    const { cellW, cellH } = gridMetrics();
    const from = lastPaintPoint || { x: cell.mapX, y: cell.mapY };
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(cell.mapX - from.x) / cellW, Math.abs(cell.mapY - from.y) / cellH) * 2));
    for (let step = 1; step <= steps; step += 1) {
      const mapX = from.x + (cell.mapX - from.x) * step / steps;
      const mapY = from.y + (cell.mapY - from.y) * step / steps;
      const x = Math.floor(mapX / cellW);
      const row = Math.floor(mapY / cellH);
      const y = map.grid.northSouthSquareCount - 1 - row;
      if (x >= 0 && x < map.grid.eastWestSquareCount && row >= 0 && row < map.grid.northSouthSquareCount) paintCell({ x, y, row, mapX, mapY });
    }
    lastPaintPoint = { x: cell.mapX, y: cell.mapY };
  });
  function finishPointer() {
    if (pointerMode === 'paint' || pointerMode === 'edge') endStroke();
    if (pointerMode === 'zone' && placementDragStart && placementDragEnd) {
      map.playerPlacement = { defaultBounds: {
        west: Math.min(placementDragStart.x, placementDragEnd.x), east: Math.max(placementDragStart.x, placementDragEnd.x),
        south: Math.min(placementDragStart.y, placementDragEnd.y), north: Math.max(placementDragStart.y, placementDragEnd.y)
      } };
      endStroke(); scheduleSave(); refreshValidation();
    }
    placementDragStart = null; placementDragEnd = null;
    pointerMode = ''; strokeEdgeAxis = ''; strokeClearing = false; lastPointer = null; lastPaintPoint = null; syncCanvasCursor(); draw();
  }
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : .9;
    view.x = px - (px - view.x) * factor;
    view.y = py - (py - view.y) * factor;
    view.scale = Math.min(8, Math.max(.15, view.scale * factor));
    draw();
  }, { passive: false });

  function draw() {
    if (!map || !mapImage || !canvas.clientWidth) return;
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    const { size, cellW, cellH } = gridMetrics();
    if (map.grid.boundaryBehavior === 'infinite') {
      const left = Math.min(0, -view.x / view.scale);
      const right = Math.max(size.width, (canvas.width - view.x) / view.scale);
      const top = Math.min(0, -view.y / view.scale);
      const bottom = Math.max(size.height, (canvas.height - view.y) / view.scale);
      ctx.fillStyle = mapEdgeColor;
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    ctx.drawImage(mapImage, 0, 0);
    const bounds = map.playerPlacement?.defaultBounds;
    const zone = placementDragStart && placementDragEnd ? {
      west: Math.min(placementDragStart.x, placementDragEnd.x), east: Math.max(placementDragStart.x, placementDragEnd.x),
      south: Math.min(placementDragStart.y, placementDragEnd.y), north: Math.max(placementDragStart.y, placementDragEnd.y)
    } : bounds;
    ctx.globalAlpha = layerOpacity.startingZone / 100;
    if (zone) {
      const left = zone.west * cellW;
      const top = (map.grid.northSouthSquareCount - 1 - zone.north) * cellH;
      const width = (zone.east - zone.west + 1) * cellW;
      const height = (zone.north - zone.south + 1) * cellH;
      ctx.fillStyle = '#1976d2'; ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = '#1976d2'; ctx.lineWidth = Math.max(2 / view.scale, 1); ctx.strokeRect(left, top, width, height);
    }
    ctx.globalAlpha = layerOpacity.terrain / 100;
    const detailedTerrain = ['difficult', 'water', 'lava', 'impassible', 'erase-terrain'].includes(tool);
    for (const tile of map.terrain.overrides) {
      const icon = tileIcons[tile.type];
      if (!icon) continue;
      const row = map.grid.northSouthSquareCount - tile.y - tile.height;
      if (detailedTerrain) {
        ctx.fillStyle = terrainTints[tile.type];
        ctx.fillRect(tile.x * cellW, row * cellH, tile.width * cellW, tile.height * cellH);
      } else {
        for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
          drawTileIcon(icon, (tile.x + dx) * cellW, (row + tile.height - dy - 1) * cellH, cellW, cellH);
        }
      }
    }
    ctx.globalAlpha = layerOpacity.elevation / 100;
    const detailedElevation = tool === 'elevation' || tool === 'erase-elevation';
    for (const tile of map.elevation.overrides) {
      const row = map.grid.northSouthSquareCount - tile.y - tile.height;
      for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
        const x = (tile.x + dx) * cellW;
        const y = (row + tile.height - dy - 1) * cellH;
        if (detailedElevation) {
          ctx.fillStyle = '#9259be';
          ctx.fillRect(x, y, cellW, cellH);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(24, 20, 29, .96)';
          ctx.lineWidth = 2.5 / view.scale;
          ctx.lineJoin = 'round';
          ctx.font = `bold ${Math.min(cellW, cellH) * .27}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeText(`${tile.heightFt}′`, x + cellW / 2, y + cellH / 2);
          ctx.fillText(`${tile.heightFt}′`, x + cellW / 2, y + cellH / 2);
        } else {
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(24, 20, 29, .96)';
          ctx.lineWidth = 2.5 / view.scale;
          ctx.lineJoin = 'round';
          ctx.font = `bold ${Math.min(cellW, cellH) * .17}px sans-serif`;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.strokeText(`${tile.heightFt}′`, x + cellW * .06, y + cellH * .05);
          ctx.fillText(`${tile.heightFt}′`, x + cellW * .06, y + cellH * .05);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = layerOpacity.obstacles / 100;
    const detailedObstacles = tool === 'obstacle' || tool === 'erase-obstacles';
    for (const tile of map.blockedTiles) {
      const x = tile.x * cellW;
      const y = (map.grid.northSouthSquareCount - 1 - tile.y) * cellH;
      if (detailedObstacles) {
        ctx.fillStyle = '#85898d';
        ctx.fillRect(x, y, cellW, cellH);
      } else {
        drawTileIcon(tileIcons.obstacle, x, y, cellW, cellH);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(40, 112, 172, .7)';
    ctx.lineWidth = Math.max(.7, 1 / view.scale);
    ctx.beginPath();
    for (let x = 0; x <= map.grid.eastWestSquareCount; x += 1) { ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, size.height); }
    for (let row = 0; row <= map.grid.northSouthSquareCount; row += 1) { ctx.moveTo(0, row * cellH); ctx.lineTo(size.width, row * cellH); }
    ctx.stroke();
    ctx.globalAlpha = layerOpacity.edges / 100;
    for (const edge of map.edges) {
      const x1 = edge.axis === 'vertical' ? edge.x * cellW : edge.x * cellW;
      const y1 = edge.axis === 'vertical' ? (map.grid.northSouthSquareCount - edge.y) * cellH : (map.grid.northSouthSquareCount - edge.y) * cellH;
      ctx.beginPath();
      const baseEdgeWidth = Math.max(4 / view.scale, Math.min(cellW, cellH) * .085);
      const editingEdges = ['wall', 'door', 'erase-edges'].includes(tool);
      ctx.lineWidth = baseEdgeWidth * (editingEdges ? 3 : 1);
      ctx.lineCap = 'round';
      if (edge.type === 'wall') ctx.strokeStyle = '#28201d';
      else if (edge.type === 'door') ctx.strokeStyle = edge.initialState === 'open' ? '#a37735' : '#6b3e22';
      else { ctx.strokeStyle = '#34a0a4'; ctx.setLineDash([5 / view.scale, 4 / view.scale]); }
      if (edge.axis === 'vertical') { ctx.moveTo(x1, y1 - cellH); ctx.lineTo(x1, y1); }
      else { ctx.moveTo(x1, y1); ctx.lineTo(x1 + cellW, y1); }
      ctx.stroke(); ctx.setLineDash([]);
      if (edge.type === 'door') {
        ctx.fillStyle = '#f4dfb6'; ctx.font = `bold ${Math.min(cellW, cellH) * .18}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(edge.initialState === 'open' ? '↗' : edge.locked ? '🔒' : 'D', edge.axis === 'vertical' ? x1 : x1 + cellW / 2, edge.axis === 'vertical' ? y1 - cellH / 2 : y1);
      }
    }
    for (const sticker of map.stickers || []) {
      if (!sticker.emoji) continue;
      ctx.save();
      ctx.globalAlpha = (sticker.opacityPercent ?? 100) / 100;
      const centerX = (sticker.x + .5) * cellW;
      const centerY = (map.grid.northSouthSquareCount - sticker.y - .5) * cellH;
      const fontSize = Math.min(cellW, cellH) * .9 * sticker.sizePercent / 100;
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Emoji fonts often include extra vertical whitespace above the visible glyph.
      ctx.fillText(sticker.emoji, centerX, centerY + fontSize * .12);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawTileIcon(icon, x, y, cellW, cellH) {
    const size = Math.min(cellW, cellH);
    const centered = icon === tileIcons.obstacle || icon === tileIcons.impassible;
    const centerX = x + cellW * (centered ? 0.5 : 0.82);
    const centerY = y + cellH * (centered ? 0.5 : 0.82);
    ctx.save();
    if (icon === tileIcons.obstacle) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.235, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(24, 27, 30, .82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, .96)';
      ctx.lineWidth = size * 0.035;
      ctx.stroke();
    }
    ctx.font = `${size * 0.31}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, centerX, centerY);
    ctx.restore();
  }

  function validateMap() {
    const errors = [];
    const cols = map.grid.eastWestSquareCount;
    const rows = map.grid.northSouthSquareCount;
    if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) errors.push('Grid dimensions must be positive whole numbers.');
    if (!Number.isFinite(map.grid.squareSizeFt) || map.grid.squareSizeFt <= 0) errors.push('Square size must be positive.');
    const seen = new Set();
    for (const edge of map.edges) {
      const validAxis = edge.axis === 'vertical' || edge.axis === 'horizontal';
      const validType = ['wall', 'doorway', 'door'].includes(edge.type);
      const validPosition = edge.axis === 'vertical'
        ? edge.x >= 0 && edge.x <= cols && edge.y >= 0 && edge.y < rows
        : edge.x >= 0 && edge.x < cols && edge.y >= 0 && edge.y <= rows;
      const id = `${edge.axis}:${edge.x}:${edge.y}`;
      if (!validAxis || !validType || !validPosition) errors.push(`Invalid edge feature at ${id}.`);
      if (seen.has(id)) errors.push(`More than one feature is defined at ${id}.`);
      seen.add(id);
      if (edge.widthFt !== undefined && (!Number.isFinite(edge.widthFt) || edge.widthFt <= 0)) errors.push(`Opening at ${id} needs a positive width.`);
      if (edge.type === 'door' && !Number.isFinite(edge.widthFt)) errors.push(`Door at ${id} needs a positive width.`);
    }
    for (const tile of map.blockedTiles) {
      if (tile.x < 0 || tile.x >= cols || tile.y < 0 || tile.y >= rows) errors.push(`Obstacle at ${tile.x}, ${tile.y} is outside the grid.`);
    }
    for (const sticker of map.stickers || []) {
      if (sticker.x < 0 || sticker.x >= cols || sticker.y < 0 || sticker.y >= rows) errors.push(`Sticker at ${sticker.x}, ${sticker.y} is outside the grid.`);
      if (typeof sticker.emoji !== 'string' || !sticker.emoji.trim() || sticker.emoji.length > 32) errors.push(`Sticker at ${sticker.x}, ${sticker.y} needs an emoji.`);
      if (!Number.isInteger(sticker.sizePercent) || sticker.sizePercent < 33 || sticker.sizePercent > 500) errors.push(`Sticker at ${sticker.x}, ${sticker.y} must be sized from 33% to 500%.`);
      if (sticker.opacityPercent !== undefined && (!Number.isInteger(sticker.opacityPercent) || sticker.opacityPercent < 0 || sticker.opacityPercent > 100)) errors.push(`Sticker at ${sticker.x}, ${sticker.y} must have opacity from 0% to 100%.`);
    }
    if (map.playerPlacement?.defaultBounds) {
      const b = map.playerPlacement.defaultBounds;
      if (b.west < 0 || b.south < 0 || b.east >= cols || b.north >= rows || b.west > b.east || b.south > b.north) errors.push('Starting-zone bounds are invalid for the current grid.');
    }
    if (!imageBlob || !map.imagePath) errors.push('A cropped PNG image is required.');
    return errors;
  }
  function refreshValidation() {
    if (!map) return [];
    const errors = validateMap();
    if (imageBlob?.size > 20 * 1024 * 1024) errors.push('The cropped PNG exceeds the 20 MB import limit.');
    validation.classList.toggle('error', errors.length > 0);
    validation.textContent = errors.length ? errors[0] : 'Map data is valid and ready to export.';
    exportButton.disabled = errors.length > 0;
    return errors;
  }

  validateButton.addEventListener('click', () => {
    try {
      const errors = refreshValidation();
      const message = errors.length ? `Map is not valid: ${errors.join(' ')}` : 'Map data is valid and ready to export.';
      validation.textContent = message;
      status.textContent = message;
    } catch (error) {
      validation.classList.add('error');
      validation.textContent = 'Validation could not complete. Check that the restored draft has valid map data.';
      status.textContent = validation.textContent;
      console.error('Map validation failed:', error);
    }
  });

  async function readBlobBytes(blob) {
    if (!(blob instanceof Blob)) throw new Error('The saved map image is unavailable.');
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function readExportImageBytes() {
    try {
      return await readBlobBytes(imageBlob);
    } catch (error) {
      if (!mapImage?.naturalWidth || !mapImage?.naturalHeight) throw error;
      const raster = document.createElement('canvas');
      raster.width = mapImage.naturalWidth;
      raster.height = mapImage.naturalHeight;
      raster.getContext('2d').drawImage(mapImage, 0, 0);
      const recoveredBlob = await new Promise((resolve) => raster.toBlob(resolve, 'image/png'));
      if (!recoveredBlob) throw error;
      imageBlob = recoveredBlob;
      scheduleSave();
      return readBlobBytes(recoveredBlob);
    }
  }

  exportButton.addEventListener('click', async () => {
    let stage = 'validating the map';
    try {
      const errors = refreshValidation();
      if (errors.length) {
        status.textContent = `Export blocked: ${errors.join(' ')}`;
        return;
      }
      const suggestedName = TacticalMapPackage.packageFilename($('[data-map-name]').value);
      let saveHandle = null;
      let downloadName = suggestedName;
      if (typeof window.showSaveFilePicker === 'function') {
        stage = 'opening the save dialog';
        saveHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'Tactical Table Top Map', accept: { 'application/zip': ['.tttm'] } }]
        });
      } else {
        const chosenName = window.prompt('Save map package as:', suggestedName);
        if (chosenName === null) return;
        downloadName = TacticalMapPackage.packageFilename(chosenName);
      }
      const mapName = $('[data-map-name]').value;
      stage = 'reading the map image';
      const imageBytes = await readExportImageBytes();
      stage = 'building the zip package';
      const mapPackage = TacticalMapPackage.createArchive(mapName, map, imageBytes);
      const zip = mapPackage.blob;
      if (saveHandle) {
        stage = 'writing the selected file';
        const writable = await saveHandle.createWritable();
        await writable.write(zip);
        await writable.close();
        status.textContent = `Saved ${saveHandle.name}.`;
      } else {
        stage = 'starting the download';
        const url = URL.createObjectURL(zip);
        const link = document.createElement('a');
        link.href = url; link.download = downloadName;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        status.textContent = `Downloading ${downloadName}.`;
      }
    } catch (error) {
      if (error?.name === 'AbortError' && ['opening the save dialog', 'writing the selected file'].includes(stage)) {
        status.textContent = 'Save canceled.';
        return;
      }
      status.textContent = `Export failed while ${stage}: ${error?.message || error}`;
      console.error(`Map export failed while ${stage}:`, error);
    }
  });

  async function restoreDraft() {
    const draft = await readDraft();
    if (!draft) return;
    map = draft.map; imageBlob = draft.imageBlob;
    TacticalMapPackage.normalizeMetadata(map);
    map.grid ||= { eastWestSquareCount: 20, northSouthSquareCount: 20, squareSizeFt: 5 };
    map.grid.eastWestSquareCount ||= 20;
    map.grid.northSouthSquareCount ||= 20;
    map.grid.squareSizeFt ||= 5;
    map.grid.boundaryBehavior ||= 'bounded';
    map.imagePath ||= `${safeStem(draft.name || 'Untitled map')}.png`;
    map.blockedTiles ||= [];
    map.stickers ||= [];
    map.terrain ||= { defaultType: 'normal', overrides: [] };
    map.terrain.defaultType ||= 'normal';
    map.terrain.overrides ||= [];
    map.elevation ||= { defaultHeightFt: 0, overrides: [] };
    map.elevation.overrides ||= [];
    map.mapPresentation ||= { sideWallColor: { r: 0, g: 0, b: 0, a: 1 } };
    map.mapPresentation.sideWallColor ||= { r: 0, g: 0, b: 0, a: 1 };
    if (map.playerPlacement && !Object.keys(map.playerPlacement).length) delete map.playerPlacement;
    $('[data-map-name]').value = draft.name || 'Untitled map';
    $('[data-grid-width]').value = map.grid.eastWestSquareCount;
    $('[data-grid-height]').value = map.grid.northSouthSquareCount;
    $('[data-square-size]').value = map.grid.squareSizeFt;
    map.edges ||= [];
    $('[data-infinite-canvas]').checked = map.grid.boundaryBehavior === 'infinite';
    mapImage = await loadImage(imageBlob);
    mapEdgeColor = averageImageEdgeColor(mapImage);
    cropPanel.hidden = true; mapViewport.hidden = false;
    history = []; undoButton.disabled = true;
    fitMap(); refreshValidation();
    status.textContent = 'Restored your browser-local draft.';
  }
  $('[data-authoring-restore]').addEventListener('click', () => restoreDraft().catch(() => {
    status.textContent = 'Unable to restore the saved draft in this browser.';
  }));
  readDraft().then((draft) => {
    draftAvailable = Boolean(draft);
    $('[data-authoring-restore]').hidden = !draftAvailable;
  }).catch(() => {});

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isFormField = target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');
    if (isFormField) return;
    if (event.code === 'Space' && !mapViewport.hidden && mapImage) {
      event.preventDefault();
      if (!event.repeat) {
        spacePan = true;
        syncCanvasCursor();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !undoButton.disabled) {
      event.preventDefault();
      undoButton.click();
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || !spacePan) return;
    spacePan = false;
    syncCanvasCursor();
  });
  window.addEventListener('blur', () => {
    spacePan = false;
    syncCanvasCursor();
  });

  const resizeAuthoringViewports = () => {
    renderCrop();
    if (!mapViewport.hidden && mapImage) fitMap();
    else draw();
  };
  if ('ResizeObserver' in window) {
    const viewportObserver = new ResizeObserver(resizeAuthoringViewports);
    viewportObserver.observe(canvas.parentElement);
    viewportObserver.observe(cropCanvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAuthoringViewports);
  }
})();
