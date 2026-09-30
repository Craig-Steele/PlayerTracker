(() => {
  const $ = (selector) => document.querySelector(selector);
  const userAgent = navigator.userAgent || '';
  const emojiVerticalOffset = /iPhone|iPod/i.test(userAgent) && /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent) ? 0 : 0.12;
  function isPlainStickerText(symbol) {
    const text = String(symbol).replace(/(?:[#*0-9]\uFE0F?\u20E3)/gu, '').replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\p{Cf}\uFE0E\uFE0F]/gu, '').trim();
    return text.length > 0;
  }
  function drawStickerSymbol(context, symbol, x, y, fontSize) {
    if (isPlainStickerText(symbol)) {
      context.lineJoin = 'round';
      context.lineWidth = Math.max(2, fontSize * 0.12);
      context.strokeStyle = '#fff';
      context.strokeText(symbol, x, y);
      context.fillStyle = '#000';
    }
    context.fillText(symbol, x, y);
  }
  const fileInput = $('[data-authoring-file]');
  const archiveInput = $('[data-authoring-archive]');
  const status = $('[data-authoring-status]');
  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };
  const canvas = $('[data-map-canvas]');
  const mapViewport = canvas.parentElement;
  const validateButton = $('[data-validate]');
  const exportButton = $('[data-export]');
  const undoButton = $('[data-undo]');
  const zoneClearButton = $('[data-zone-clear]');
  const ctx = canvas.getContext('2d');
  let imageBlob = null;
  let map = null;
  let mapImage = null;
  let blankMapRaster = null;
  let blankMapRasterGrid = null;
  let mapEdgeColor = '#f5f8fb';
  let tool = 'pan';
  let spacePan = false;
  let history = [];
  let strokeSnapshot = null;
  let strokeImageBefore = null;
  let strokeImageChanged = false;
  let lastPainted = '';
  let pointerMode = '';
  const activePointers = new Map();
  let pinchStart = null;
  let strokeEdgeAxis = '';
  let strokeClearing = false;
  let lastPointer = null;
  let lastPaintPoint = null;
  let placementDragStart = null;
  let placementDragEnd = null;
  let calibrationDragStart = null;
  let calibrationDragEnd = null;
  let selectedStickerIndex = null;
  let stickerDragStart = null;
  let stickerDragEnd = null;
  let stickerDragOrigin = null;
  let stickerDragMoved = false;
  let view = { scale: 1, x: 0, y: 0 };
  const layerOpacity = { terrain: 25, obstacles: 25, elevation: 25, edges: 25, startingZone: 25, stickers: 25, grid: 100 };
  let saveTimer = null;
  let draftAvailable = false;
  let blankImageUpdateID = 0;
  let blankImageResizePending = false;

  function syncCanvasCursor() {
    canvas.style.cursor = pointerMode === 'pan' || pointerMode === 'pinch' ? 'grabbing' :
      (spacePan || tool === 'pan' ? 'grab' : (tool === 'sticker-select' ? 'pointer' : 'crosshair'));
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
  const blankBackgroundPreset = $('[data-blank-background-preset]');
  const blankBackgroundColor = $('[data-blank-background-color]');
  const blankMapPaintingSection = $('[data-blank-map-painting]');
  const blankPaintColors = {
    'blank-map-dirt': '#8b5a2b', 'blank-map-grass': '#74a94e', 'blank-map-stone': '#92979b',
    'blank-map-water': '#4299d1', 'blank-map-swamp': '#697a43', 'blank-map-wood': '#c8a878'
  };
  const blankPaintColorInput = $('[data-blank-paint-color]');
  blankPaintColorInput.addEventListener('input', () => {
    $('[data-custom-paint-swatch]').style.setProperty('--blank-paint-color', blankPaintColorInput.value);
  });

  function syncBlankPaintingVisibility() {
    const visible = Boolean(map?.mapPresentation?.blankBackgroundColor);
    blankMapPaintingSection.hidden = !visible;
    if (!visible && tool.startsWith('blank-map-')) $('[data-tool="pan"]').click();
  }

  function blankPixelsPerSquare(columns, rows) {
    return Math.max(1, Math.min(64, Math.floor(2048 / Math.max(columns, rows))));
  }

  async function rebuildBlankMapImage(color, columns, rows) {
    const targetMap = map;
    const updateID = ++blankImageUpdateID;
    blankImageResizePending = true;
    refreshValidation();
    const pixelsPerSquare = blankPixelsPerSquare(columns, rows);
    const width = columns * pixelsPerSquare;
    const height = rows * pixelsPerSquare;
    const background = document.createElement('canvas');
    background.width = width;
    background.height = height;
    const backgroundContext = background.getContext('2d');
    backgroundContext.fillStyle = color;
    backgroundContext.fillRect(0, 0, width, height);
    const previousColor = targetMap?.mapPresentation?.blankBackgroundColor;
    const previousRaster = blankMapRaster || mapImage;
    if (previousRaster) {
      const sourceColumns = blankMapRasterGrid?.columns || targetMap?.grid?.eastWestSquareCount || columns;
      const sourceRows = blankMapRasterGrid?.rows || targetMap?.grid?.northSouthSquareCount || rows;
      const preservedWidth = Math.min(width, Math.round(sourceColumns * pixelsPerSquare));
      const preservedHeight = Math.min(height, Math.round(sourceRows * pixelsPerSquare));
      backgroundContext.imageSmoothingEnabled = false;
      backgroundContext.drawImage(previousRaster, 0, 0, preservedWidth, preservedHeight);
      if (/^#[0-9a-f]{6}$/i.test(previousColor || '') && previousColor.toLowerCase() !== color.toLowerCase()) {
        const pixels = backgroundContext.getImageData(0, 0, preservedWidth, preservedHeight);
        const old = [1, 3, 5].map((index) => parseInt(previousColor.slice(index, index + 2), 16));
        const next = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
        for (let i = 0; i < pixels.data.length; i += 4) {
          if (pixels.data[i] === old[0] && pixels.data[i + 1] === old[1] && pixels.data[i + 2] === old[2]) {
            pixels.data[i] = next[0]; pixels.data[i + 1] = next[1]; pixels.data[i + 2] = next[2];
          }
        }
        backgroundContext.putImageData(pixels, 0, 0);
      }
    }
    try {
      const blob = await new Promise((resolve, reject) => background.toBlob((result) => result ? resolve(result) : reject(new Error('Could not update the blank map image.')), 'image/png'));
      const image = await loadImage(blob);
      if (updateID !== blankImageUpdateID || map !== targetMap) return;
      imageBlob = blob;
      mapImage = image;
      blankMapRaster = background;
      blankMapRasterGrid = { columns, rows };
      mapEdgeColor = color;
      map.mapPresentation.blankBackgroundColor = color;
      syncBlankPaintingVisibility();
      blankBackgroundColor.value = color;
      blankBackgroundPreset.value = [...blankBackgroundPreset.options].some((option) => option.value === color) ? color : 'custom';
      fitMap();
      scheduleSave();
    } finally {
      if (updateID === blankImageUpdateID) {
        blankImageResizePending = false;
        refreshValidation();
      }
    }
  }

  async function applyBlankBackground(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color) || !map?.mapPresentation?.blankBackgroundColor) return;
    return rebuildBlankMapImage(color, map.grid.eastWestSquareCount, map.grid.northSouthSquareCount);
  }

  function syncBlankBackgroundControls() {
    const color = map?.mapPresentation?.blankBackgroundColor;
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    blankBackgroundColor.value = color;
    blankBackgroundPreset.value = [...blankBackgroundPreset.options].some((option) => option.value === color) ? color : 'custom';
  }

  blankBackgroundPreset.addEventListener('change', () => {
    if (blankBackgroundPreset.value === 'custom') return;
    blankBackgroundColor.value = blankBackgroundPreset.value;
    applyBlankBackground(blankBackgroundColor.value).catch((error) => { setStatus(error.message, true); });
  });
  blankBackgroundColor.addEventListener('input', () => {
    const isPreset = [...blankBackgroundPreset.options].some((option) => option.value === blankBackgroundColor.value);
    blankBackgroundPreset.value = isPreset ? blankBackgroundColor.value : 'custom';
  });
  blankBackgroundColor.addEventListener('change', () => {
    applyBlankBackground(blankBackgroundColor.value).catch((error) => { setStatus(error.message, true); });
  });

  const layerOpacityInputs = [...document.querySelectorAll('[data-layer-opacity]')];
  const layerOpacityOutputs = [...document.querySelectorAll('[data-layer-opacity-value]')];
  const gridOpacityInput = $('[data-grid-opacity]');
  const gridOpacityValue = $('[data-grid-opacity-value]');
  const calibratedGridControls = $('[data-calibration-controls]');
  function syncGridControls() {
    const blankMap = Boolean(map?.mapPresentation?.blankBackgroundColor);
    const hasMap = Boolean(map && mapImage);
    const countsAreCalculated = hasMap && !blankMap;
    $('[data-grid-width]').readOnly = countsAreCalculated;
    $('[data-grid-height]').readOnly = countsAreCalculated;
    calibratedGridControls.hidden = !hasMap || blankMap;
  }
  syncGridControls();
  const updateGridOpacity = () => {
    layerOpacity.grid = Number(gridOpacityInput.value);
    gridOpacityValue.value = `${layerOpacity.grid}%`;
    gridOpacityValue.textContent = `${layerOpacity.grid}%`;
    try { localStorage.setItem(layerOpacityKey, JSON.stringify(layerOpacity)); } catch (_) {}
    draw();
  };
  gridOpacityInput.value = String(layerOpacity.grid);
  gridOpacityValue.value = `${layerOpacity.grid}%`;
  function wireOpacitySlider(input, onInput) {
    let pointerStart = null;
    let lastGestureWasDrag = false;
    const snapToQuarter = () => {
      const snappedValue = Math.round(Number(input.value) / 25) * 25;
      if (Number(input.value) === snappedValue) return;
      input.value = String(snappedValue);
      onInput();
    };
    input.addEventListener('pointerdown', (event) => {
      pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      lastGestureWasDrag = false;
    });
    input.addEventListener('pointermove', (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) pointerStart.dragged = true;
    });
    input.addEventListener('pointerup', (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      lastGestureWasDrag = pointerStart.dragged;
      if (!pointerStart.dragged) snapToQuarter();
      pointerStart = null;
    });
    input.addEventListener('pointercancel', (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      lastGestureWasDrag = pointerStart.dragged;
      if (!pointerStart.dragged) snapToQuarter();
      pointerStart = null;
    });
    input.addEventListener('click', (event) => {
      if (event.detail === 0) return;
      const wasDrag = pointerStart?.dragged ?? lastGestureWasDrag;
      if (!wasDrag) snapToQuarter();
      pointerStart = null;
      lastGestureWasDrag = false;
    });
    input.addEventListener('input', onInput);
  }
  wireOpacitySlider(gridOpacityInput, updateGridOpacity);
  const stickerEmojiInput = $('[data-sticker-emoji]');
  const stickerOpacityInput = $('[data-layer-opacity="stickers"]');
  const stickerOpacityOutput = $('[data-layer-opacity-value="stickers"]');
  const stickerEditState = $('[data-sticker-edit-state]');
  const stickerDeleteButton = $('[data-sticker-delete]');
  const stickerRotationInput = $('[data-sticker-rotation]');
  const stickerRotationOutput = $('[data-sticker-rotation-value]');
  const stickerMirrorInputs = [...document.querySelectorAll('[data-sticker-mirror]')];
  const newStickerMirrorModes = { horizontal: 'normal', vertical: 'normal' };
  let stickerRotationBefore = null;
  function selectedSticker() {
    return Number.isInteger(selectedStickerIndex) ? map?.stickers?.[selectedStickerIndex] || null : null;
  }
  function syncStickerTransformControls() {
    const sticker = selectedSticker();
    const enabled = Boolean(tool === 'sticker-select' && sticker);
    stickerRotationInput.disabled = !enabled;
    stickerRotationInput.value = String(sticker?.rotationDegrees ?? 0);
    stickerRotationOutput.value = `${stickerRotationInput.value}°`;
    stickerRotationOutput.textContent = `${stickerRotationInput.value}°`;
    stickerMirrorInputs.forEach((input) => {
      const isHorizontal = input.dataset.axis === 'horizontal';
      const mirrored = isHorizontal ? sticker?.flipHorizontal : sticker?.flipVertical;
      input.checked = enabled
        ? input.value === (mirrored ? 'mirror' : 'normal')
        : input.value === newStickerMirrorModes[input.dataset.axis];
      input.disabled = enabled && input.value === 'random';
    });
  }
  function syncStickerEditor() {
    const sticker = selectedSticker();
    stickerDeleteButton.disabled = !sticker;
    const editingSelection = tool === 'sticker-select' && sticker;
    stickerEditState.textContent = editingSelection ? 'Editing selected sticker' : 'New sticker settings';
    syncStickerTransformControls();
    if (!editingSelection) return;
    stickerEmojiInput.value = sticker.emoji;
    layerOpacity.stickers = sticker.opacityPercent ?? 100;
    stickerOpacityInput.value = String(layerOpacity.stickers);
    stickerOpacityOutput.value = `${layerOpacity.stickers}%`;
    stickerOpacityOutput.textContent = `${layerOpacity.stickers}%`;
  }
  function selectSticker(index) {
    selectedStickerIndex = Number.isInteger(index) && map?.stickers?.[index] ? index : null;
    syncStickerEditor();
    draw();
  }
  function editSelectedSticker(patch) {
    const sticker = selectedSticker();
    if (!sticker) return;
    const previous = snapshot();
    Object.assign(sticker, patch);
    syncStickerTransformControls();
    if (previous !== snapshot()) pushUndo(previous);
    draw();
    refreshValidation();
    scheduleSave();
  }
  stickerEmojiInput.addEventListener('input', () => {
    if (tool === 'sticker-select') editSelectedSticker({ emoji: stickerEmojiInput.value.trim() });
  });
  stickerRotationInput.addEventListener('input', () => {
    const degrees = Number(stickerRotationInput.value);
    stickerRotationOutput.value = `${degrees}°`;
    stickerRotationOutput.textContent = `${degrees}°`;
    const sticker = tool === 'sticker-select' ? selectedSticker() : null;
    if (!sticker) return;
    if (stickerRotationBefore === null) stickerRotationBefore = snapshot();
    sticker.rotationDegrees = degrees;
    draw();
    refreshValidation();
  });
  stickerRotationInput.addEventListener('change', () => {
    if (stickerRotationBefore !== null) {
      if (stickerRotationBefore !== snapshot()) pushUndo(stickerRotationBefore);
      stickerRotationBefore = null;
      scheduleSave();
    }
  });
  stickerMirrorInputs.forEach((input) => input.addEventListener('change', () => {
    const isHorizontal = input.dataset.axis === 'horizontal';
    const property = isHorizontal ? 'flipHorizontal' : 'flipVertical';
    if (tool === 'sticker-select' && selectedSticker()) {
      if (input.value !== 'random') editSelectedSticker({ [property]: input.value === 'mirror' });
      else syncStickerTransformControls();
    } else newStickerMirrorModes[input.dataset.axis] = input.value;
  }));
  function stickerPlacementTransform() {
    const transform = {};
    Object.entries(newStickerMirrorModes).forEach(([axis, mode]) => {
      const mirror = mode === 'mirror' || (mode === 'random' && Math.random() < 0.5);
      if (mirror) transform[axis === 'horizontal' ? 'flipHorizontal' : 'flipVertical'] = true;
    });
    return transform;
  }
  function deleteSelectedSticker() {
    if (!selectedSticker()) return;
    beginStroke();
    map.stickers.splice(selectedStickerIndex, 1);
    selectSticker(null);
    endStroke();
  }
  stickerDeleteButton.addEventListener('click', deleteSelectedSticker);
  document.querySelectorAll('[data-sticker-picker]').forEach((picker) => {
    const syncStickerEmoji = () => {
      if (picker.value) {
        stickerEmojiInput.value = picker.value;
        stickerEmojiInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    picker.addEventListener('pointerdown', syncStickerEmoji);
    picker.addEventListener('focus', syncStickerEmoji);
    picker.addEventListener('change', syncStickerEmoji);
  });
  $('[data-load-map-image]').addEventListener('click', () => fileInput.click());
  $('[data-load-map-package]').addEventListener('click', () => archiveInput.click());
  $('[data-new-blank-map]').addEventListener('click', async (event) => {
    const { columns, rows, squareFt } = gridValues();
    if (!Number.isInteger(columns) || columns < 1 || columns > 200 || !Number.isInteger(rows) || rows < 1 || rows > 200 || !Number.isFinite(squareFt) || squareFt <= 0) {
      const message = 'Set valid grid dimensions (1–200 squares) and a positive square size before creating a blank map.';
      setStatus(message, true);
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const pixelsPerSquare = blankPixelsPerSquare(columns, rows);
      const blankCanvas = document.createElement('canvas');
      blankCanvas.width = columns * pixelsPerSquare;
      blankCanvas.height = rows * pixelsPerSquare;
      const blankContext = blankCanvas.getContext('2d');
      const backgroundColor = blankBackgroundColor.value;
      blankContext.fillStyle = backgroundColor;
      blankContext.fillRect(0, 0, blankCanvas.width, blankCanvas.height);
      blankMapRaster = blankCanvas;
      blankMapRasterGrid = { columns, rows };
      imageBlob = await new Promise((resolve, reject) => blankCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the blank map image.')), 'image/png'));
      mapImage = await loadImage(imageBlob);
      mapEdgeColor = backgroundColor;
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
        mapPresentation: { sideWallColor: { r: 0, g: 0, b: 0, a: 1 }, blankBackgroundColor: backgroundColor }
      };
      selectedStickerIndex = null;
      syncStickerEditor();
      syncGridControls();
      syncBlankPaintingVisibility();
      mapViewport.hidden = false;
      history = [];
      undoButton.disabled = true;
      fitMap();
      refreshValidation();
      scheduleSave();
      setStatus('Created a new blank map.');
    } catch (error) {
      setStatus(`Could not create a blank map: ${error.message || error}`, true);
    } finally {
      button.disabled = false;
    }
  });
  const layerOpacityKey = 'roll4-map-authoring-layer-opacity';
  try {
    const savedOpacity = JSON.parse(localStorage.getItem(layerOpacityKey) || '{}');
    Object.keys(layerOpacity).forEach((layer) => {
      const savedValue = Number(savedOpacity[layer]);
      if (layer === 'grid') {
        if (Number.isInteger(savedValue) && savedValue >= 0 && savedValue <= 100) layerOpacity.grid = savedValue;
      } else if (Number.isInteger(savedValue) && savedValue >= 0 && savedValue <= 100) {
        layerOpacity[layer] = savedValue;
      }
    });
  } catch (_) {}
  gridOpacityInput.value = String(layerOpacity.grid);
  gridOpacityValue.value = `${layerOpacity.grid}%`;
  gridOpacityValue.textContent = `${layerOpacity.grid}%`;
  layerOpacityInputs.forEach((input) => {
    input.value = String(layerOpacity[input.dataset.layerOpacity]);
    const layer = input.dataset.layerOpacity;
    const output = layerOpacityOutputs.find((candidate) => candidate.dataset.layerOpacityValue === layer);
    if (output) {
      output.value = `${layerOpacity[layer]}%`;
      output.textContent = `${layerOpacity[layer]}%`;
    }
    wireOpacitySlider(input, () => {
      const editsSelection = layer === 'stickers' && tool === 'sticker-select' && selectedSticker();
      const previous = editsSelection ? snapshot() : null;
      layerOpacity[layer] = Number(input.value);
      if (editsSelection) {
        selectedSticker().opacityPercent = layerOpacity.stickers;
        if (previous !== snapshot()) pushUndo(previous);
        scheduleSave();
        refreshValidation();
      }
      if (output) {
        output.value = `${layerOpacity[layer]}%`;
        output.textContent = `${layerOpacity[layer]}%`;
      }
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
    const imageBytes = await imageBlob.arrayBuffer();
    const db = await openDraftDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const write = tx.objectStore('drafts').put({ map, imageBytes, name: $('[data-map-name]').value }, 'active');
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        db.close();
        reject(error || new Error('The browser aborted saving the map draft.'));
      };
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        db.close();
        draftAvailable = true;
        $('[data-authoring-restore]').hidden = false;
        resolve();
      };
      write.onerror = () => fail(write.error || tx.error);
      tx.onerror = () => fail(tx.error || write.error);
      tx.onabort = () => fail(tx.error || write.error);
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft().catch((error) => {
      setStatus('This browser could not save the draft locally. Export your map to keep a copy.', true);
      console.error('Map draft save failed:', error);
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

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.png') || (file.type && file.type !== 'image/png') || file.size > 20 * 1024 * 1024) {
    setStatus('Choose a PNG image no larger than 20 MB.', true);
      return;
    }
    try {
      mapImage = await loadImage(file);
      imageBlob = file;
      blankMapRaster = null;
      blankMapRasterGrid = null;
      mapEdgeColor = averageImageEdgeColor(mapImage);
      const name = file.name.replace(/\.png$/i, '');
      $('[data-map-name]').value = name;
      map = {
        format: TacticalMapPackage.FORMAT_IDENTIFIER,
        version: TacticalMapPackage.FORMAT_VERSION,
        imagePath: `${safeStem(name)}.png`,
        grid: { eastWestSquareCount: 20, northSouthSquareCount: 20, squareSizeFt: 5, coordinateConvention: { origin: 'southwest' }, boundaryBehavior: 'bounded' },
        blockedTiles: [], stickers: [], terrain: { defaultType: 'normal', overrides: [] },
        elevation: { defaultHeightFt: 0, overrides: [] }, edges: [],
        mapPresentation: { sideWallColor: { r: 0, g: 0, b: 0, a: 1 } }
      };
      selectedStickerIndex = null;
      syncStickerEditor();
      syncGridControls();
      syncBlankPaintingVisibility();
      $('[data-grid-width]').value = 20;
      $('[data-grid-height]').value = 20;
      $('[data-square-size]').value = 5;
      mapViewport.hidden = false;
      history = [];
      undoButton.disabled = true;
      $('[data-tool="grid-calibrate"]').click();
      fitMap();
      refreshValidation();
      scheduleSave();
      setStatus(`${mapImage.naturalWidth} × ${mapImage.naturalHeight} px. Drag a 5 × 5 or 10 × 10 calibration patch on the map.`);
    } catch (error) {
      setStatus(`Unable to load map image: ${error.message || error}`, true);
    }
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
    setStatus('Opening map package…');
    try {
      const loaded = await readMapArchive(file);
      map = loaded.map;
      selectedStickerIndex = null;
      imageBlob = loaded.imageBlob;
      mapImage = loaded.image;
      blankMapRaster = null;
      blankMapRasterGrid = null;
      if (map.mapPresentation?.blankBackgroundColor) {
        blankMapRaster = document.createElement('canvas');
        blankMapRaster.width = mapImage.naturalWidth; blankMapRaster.height = mapImage.naturalHeight;
        blankMapRaster.getContext('2d').drawImage(mapImage, 0, 0);
        blankMapRasterGrid = { columns: map.grid.eastWestSquareCount, rows: map.grid.northSouthSquareCount };
      }
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
      syncStickerEditor();
      delete map.grid.imageCalibration;
      syncGridControls();
      syncBlankBackgroundControls();
      syncBlankPaintingVisibility();
      if (map.mapPresentation.blankBackgroundColor) mapEdgeColor = map.mapPresentation.blankBackgroundColor;
      $('[data-grid-width]').value = map.grid.eastWestSquareCount;
      $('[data-grid-height]').value = map.grid.northSouthSquareCount;
      $('[data-square-size]').value = map.grid.squareSizeFt;
      $('[data-infinite-canvas]').checked = map.grid.boundaryBehavior === 'infinite';
      history = [];
      undoButton.disabled = true;
      mapViewport.hidden = false;
      fitMap();
      refreshValidation();
      scheduleSave();
      setStatus('Map package opened. Edit the map and export a new package when ready.');
      archiveInput.value = '';
    } catch (error) {
      setStatus(`Unable to open map package: ${error.message || error}`, true);
    }
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
      setStatus('Grid dimensions must be 1–200 squares and square size must be positive.', true);
      exportButton.disabled = true;
      return;
    }
    const previousColumns = map.grid.eastWestSquareCount;
    const previousRows = map.grid.northSouthSquareCount;
    const dimensionsChanged = previousColumns !== columns || previousRows !== rows;
    map.grid.eastWestSquareCount = columns;
    map.grid.northSouthSquareCount = rows;
    map.grid.squareSizeFt = squareFt;
    const keepTile = ({ x, y }) => x >= 0 && x < columns && y >= 0 && y < rows;
    map.blockedTiles = map.blockedTiles.filter(keepTile);
    map.stickers = (map.stickers || []).filter((sticker) =>
      Number.isFinite(sticker.x) && Number.isFinite(sticker.y) &&
      sticker.x >= 0 && sticker.x <= columns && sticker.y >= 0 && sticker.y <= rows);
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
    if (dimensionsChanged && map.mapPresentation?.blankBackgroundColor) {
      rebuildBlankMapImage(map.mapPresentation.blankBackgroundColor, columns, rows).catch((error) => setStatus(error.message, true));
    } else {
      draw();
      refreshValidation();
      scheduleSave();
    }
  }
  ['[data-grid-width]', '[data-grid-height]', '[data-square-size]'].forEach((selector) => {
    $(selector).addEventListener('change', syncGrid);
  });

  function snapshot() {
    return JSON.stringify({ blockedTiles: map.blockedTiles, stickers: map.stickers || [], terrain: map.terrain, elevation: map.elevation, edges: map.edges, boundaryBehavior: map.grid.boundaryBehavior, playerPlacement: map.playerPlacement || null });
  }
  function beginStroke() {
    if (!strokeSnapshot) {
      strokeSnapshot = snapshot();
      strokeImageBefore = null;
      strokeImageChanged = false;
      if (tool.startsWith('blank-map-') && blankMapRaster) strokeImageBefore = imageBlob;
    }
  }
  function pushUndo(state, beforeImageBlob = null) {
    if (!state) return;
    history.push(beforeImageBlob ? { mapState: state, imageBlob: beforeImageBlob } : state);
    if (history.length > 50) history.shift();
    undoButton.disabled = false;
  }
  function endStroke() {
    if (strokeSnapshot && (strokeSnapshot !== snapshot() || strokeImageChanged)) {
      pushUndo(strokeSnapshot, strokeImageChanged ? strokeImageBefore : null);
      scheduleSave();
      refreshValidation();
    }
    strokeSnapshot = null;
    strokeImageBefore = null;
    strokeImageChanged = false;
    lastPainted = '';
  }
  undoButton.addEventListener('click', async () => {
    const entry = history.pop();
    if (!entry) return;
    const state = typeof entry === 'string' ? entry : entry.mapState;
    const restored = JSON.parse(state);
    const { boundaryBehavior, ...restoredMapState } = restored;
    Object.assign(map, restoredMapState);
    selectedStickerIndex = null;
    syncStickerEditor();
    if (boundaryBehavior) map.grid.boundaryBehavior = boundaryBehavior;
    $('[data-infinite-canvas]').checked = map.grid.boundaryBehavior === 'infinite';
    if (restored.playerPlacement) map.playerPlacement = restored.playerPlacement;
    else delete map.playerPlacement;
    if (typeof entry !== 'string' && entry.imageBlob) {
      imageBlob = entry.imageBlob;
      mapImage = await loadImage(imageBlob);
      blankMapRaster = document.createElement('canvas');
      blankMapRaster.width = mapImage.naturalWidth; blankMapRaster.height = mapImage.naturalHeight;
      blankMapRaster.getContext('2d').drawImage(mapImage, 0, 0);
      blankMapRasterGrid = { columns: map.grid.eastWestSquareCount, rows: map.grid.northSouthSquareCount };
    }
    if (!selectedSticker()) selectedStickerIndex = null;
    syncStickerEditor();
    undoButton.disabled = history.length === 0;
    draw();
    scheduleSave();
    refreshValidation();
  });

  function hasPaintedFeatures() {
    return Boolean(map && (
      (map.blockedTiles || []).length || (map.stickers || []).length ||
      (map.terrain?.overrides || []).length || (map.elevation?.overrides || []).length ||
      (map.edges || []).length || map.playerPlacement?.defaultBounds
    ));
  }
  document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
    const nextTool = button.dataset.tool;
    if (nextTool === 'grid-calibrate' && hasPaintedFeatures() && !window.confirm('Recalibrating changes the grid and image alignment. Painted terrain, obstacles, elevation, edges, stickers, and the starting zone may no longer line up. Continue?')) return;
    tool = nextTool;
    document.querySelectorAll('[data-tool]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    if (tool === 'grid-calibrate') setStatus('Drag a 5 × 5 or 10 × 10 calibration patch over the map image.');
    syncStickerEditor();
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

  async function bakeImageCalibration(calibration) {
    if (!calibration || !mapImage) return false;
    const size = imageSize();
    const cellW = calibration.cellWidthPx;
    const cellH = calibration.cellHeightPx;
    const phaseX = calibration.offsetXPx || 0;
    const phaseY = calibration.offsetYPx || 0;
    const padLeft = phaseX > 0.01 ? cellW - phaseX : 0;
    const padTop = phaseY > 0.01 ? cellH - phaseY : 0;
    const columns = Math.ceil((size.width + padLeft) / cellW);
    const rows = Math.ceil((size.height + padTop) / cellH);
    if (columns < 1 || rows < 1 || columns > 200 || rows > 200) throw new Error('The calibrated grid must contain 1–200 squares per side.');
    const width = Math.ceil(columns * cellW);
    const height = Math.ceil(rows * cellH);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outputContext = output.getContext('2d');
    outputContext.fillStyle = mapEdgeColor;
    outputContext.fillRect(0, 0, width, height);
    const left = Math.round(padLeft);
    const top = Math.round(padTop);
    outputContext.drawImage(mapImage, left, top);
    const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 20 * 1024 * 1024) throw new Error('The calibrated map image could not be created or exceeds the 20 MB limit.');
    const image = await loadImage(blob);

    imageBlob = blob;
    mapImage = image;
    map.grid.eastWestSquareCount = columns;
    map.grid.northSouthSquareCount = rows;
    $('[data-grid-width]').value = columns;
    $('[data-grid-height]').value = rows;
    mapEdgeColor = averageImageEdgeColor(mapImage);
    fitMap();
    return true;
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
    return { size, cellW: size.width / grid.eastWestSquareCount,
      cellH: size.height / grid.northSouthSquareCount, offsetX: 0, offsetY: 0 };
  }
  function imagePointAt(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    return { x: (clientX - bounds.left - view.x) / view.scale, y: (clientY - bounds.top - view.y) / view.scale };
  }
  function cellAt(clientX, clientY) {
    const point = imagePointAt(clientX, clientY);
    const { cellW, cellH, offsetX, offsetY } = gridMetrics();
    const mapX = point.x - offsetX;
    const mapY = point.y - offsetY;
    const x = Math.floor(mapX / cellW);
    const row = Math.floor(mapY / cellH);
    const y = map.grid.northSouthSquareCount - 1 - row;
    if (x < 0 || x >= map.grid.eastWestSquareCount || row < 0 || row >= map.grid.northSouthSquareCount) return null;
    return { x, y, row, mapX, mapY };
  }
  function stickerPositionAt(clientX, clientY) {
    const point = imagePointAt(clientX, clientY);
    const { size, cellW, cellH } = gridMetrics();
    return {
      x: point.x / cellW,
      y: map.grid.northSouthSquareCount - point.y / cellH,
      imageX: point.x,
      imageY: point.y,
      inside: point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height
    };
  }
  function stickerAtPosition(point) {
    const { cellW, cellH } = gridMetrics();
    for (let index = (map.stickers || []).length - 1; index >= 0; index -= 1) {
      const sticker = map.stickers[index];
      const centerX = sticker.x * cellW;
      const centerY = (map.grid.northSouthSquareCount - sticker.y) * cellH;
      const width = sticker.shape === 'circle' ? (sticker.radius || 0) * 2 : Math.abs((sticker.x2 ?? sticker.x) - (sticker.x1 ?? sticker.x));
      const height = sticker.shape === 'circle' ? (sticker.radius || 0) * 2 : Math.abs((sticker.y2 ?? sticker.y) - (sticker.y1 ?? sticker.y));
      const halfW = width ? width * cellW / 2 : Math.min(cellW, cellH) * .3;
      const halfH = height ? height * cellH / 2 : Math.min(cellW, cellH) * .3;
      if (Math.abs(point.imageX - centerX) <= halfW && Math.abs(point.imageY - centerY) <= halfH) return index;
    }
    return null;
  }

  zoneClearButton.addEventListener('click', () => {
    if (!map) return;
    delete map.playerPlacement;
    draw(); scheduleSave(); refreshValidation();
  });
  function paintCell(cell) {
    const id = `${cell.x},${cell.y}`;
    if (id === lastPainted) return;
    lastPainted = id;
    if (tool.startsWith('blank-map-') && blankMapRaster) {
      const rasterContext = blankMapRaster.getContext('2d');
      const { cellW, cellH } = gridMetrics();
      const x = Math.round(cell.x * cellW); const y = Math.round(cell.row * cellH);
      const right = Math.round((cell.x + 1) * cellW); const bottom = Math.round((cell.row + 1) * cellH);
      rasterContext.fillStyle = tool === 'blank-map-erase' ? map.mapPresentation.blankBackgroundColor :
        (tool === 'blank-map-custom' ? blankPaintColorInput.value : blankPaintColors[tool]);
      rasterContext.fillRect(x, y, right - x, bottom - y);
      strokeImageChanged = true;
    } else if (tool === 'obstacle') {
      if (strokeClearing) {
        map.blockedTiles = map.blockedTiles.filter((tile) => tile.x !== cell.x || tile.y !== cell.y);
      } else {
        const blocked = new Set(map.blockedTiles.map((tile) => `${tile.x},${tile.y}`));
        blocked.add(id);
        map.blockedTiles = [...blocked].map((key) => { const [x, y] = key.split(',').map(Number); return { x, y }; });
      }
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
    const { size, cellW, cellH, offsetX, offsetY } = gridMetrics();
    const tolerance = Math.min(cellW, cellH) * 0.55;
    const gx = mapX - offsetX; const gy = mapY - offsetY;
    if (gx < -tolerance || gx > map.grid.eastWestSquareCount * cellW + tolerance || gy < -tolerance || gy > map.grid.northSouthSquareCount * cellH + tolerance) return null;
    const verticalLine = Math.max(0, Math.min(map.grid.eastWestSquareCount, Math.round(gx / cellW)));
    const verticalDistance = Math.abs(gx - verticalLine * cellW);
    const horizontalLineFromTop = Math.max(0, Math.min(map.grid.northSouthSquareCount, Math.round(gy / cellH)));
    const horizontalDistance = Math.abs(gy - horizontalLineFromTop * cellH);
    const chosenAxis = axis || (verticalDistance <= horizontalDistance ? 'vertical' : 'horizontal');
    if ((chosenAxis === 'vertical' ? verticalDistance : horizontalDistance) > tolerance) return null;
    if (chosenAxis === 'vertical') {
      const row = Math.max(0, Math.min(map.grid.northSouthSquareCount - 1, Math.floor(gy / cellH)));
      return { axis: chosenAxis, x: verticalLine, y: map.grid.northSouthSquareCount - 1 - row };
    }
    const column = Math.max(0, Math.min(map.grid.eastWestSquareCount - 1, Math.floor(gx / cellW)));
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
      if (tool === 'door' || tool === 'window') item.widthFt = Number($('[data-door-window-width]').value) || map.grid.squareSizeFt;
      if (tool === 'door') {
        const doorState = $('[data-door-state]').value;
        item.initialState = doorState === 'open' ? 'open' : 'closed';
        item.locked = doorState === 'closed-locked';
      }
      if (tool === 'window') item.initialState = $('[data-window-state]').value;
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

  function startPinch() {
    const [first, second] = [...activePointers.values()].slice(0, 2);
    if (!first || !second) return;
    const rect = canvas.getBoundingClientRect();
    const center = { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top };
    pinchStart = {
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      scale: view.scale,
      worldX: (center.x - view.x) / view.scale,
      worldY: (center.y - view.y) / view.scale
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!mapImage) return;
    canvas.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size >= 2) {
      if (pointerMode === 'paint' || pointerMode === 'edge' || pointerMode === 'zone' || (pointerMode === 'sticker-select' && strokeSnapshot)) endStroke();
      placementDragStart = null;
      placementDragEnd = null;
      stickerDragStart = null;
      stickerDragEnd = null;
      stickerDragOrigin = null;
      pointerMode = 'pinch';
      lastPaintPoint = null;
      startPinch();
      syncCanvasCursor();
      draw();
      return;
    }
    strokeClearing = event.shiftKey;
    lastPointer = { x: event.clientX, y: event.clientY };
    if (spacePan || tool === 'pan') { pointerMode = 'pan'; syncCanvasCursor(); return; }
    if (tool === 'grid-calibrate') {
      const point = imagePointAt(event.clientX, event.clientY);
      calibrationDragStart = point; calibrationDragEnd = point;
      pointerMode = 'calibrate'; draw(); return;
    }
    if (tool === 'sticker-select') {
      const point = stickerPositionAt(event.clientX, event.clientY);
      const index = stickerAtPosition(point);
      selectSticker(index);
      pointerMode = 'sticker-select';
      stickerDragMoved = false;
      if (index !== null) {
        stickerDragStart = point;
        stickerDragOrigin = { x: map.stickers[index].x, y: map.stickers[index].y, clientX: event.clientX, clientY: event.clientY };
      } else {
        stickerDragStart = null;
        stickerDragOrigin = null;
      }
      return;
    }
    if (tool === 'sticker-square') {
      const cell = cellAt(event.clientX, event.clientY);
      const emoji = stickerEmojiInput.value.trim();
      if (!cell) return;
      if (!emoji) {
        setStatus('Enter a symbol before placing a sticker.', true);
        return;
      }
      beginStroke();
      map.stickers ||= [];
      map.stickers.push({
        x: cell.x + 0.5, y: cell.y + 0.5, sizePercent: 100,
        emoji, opacityPercent: layerOpacity.stickers, ...stickerPlacementTransform()
      });
      selectSticker(map.stickers.length - 1);
      pointerMode = 'sticker-object';
      draw();
      return;
    }
    if (tool === 'sticker-circle' || tool === 'sticker-rectangle' || tool === 'erase-stickers') {
      const point = stickerPositionAt(event.clientX, event.clientY);
      const hitIndex = stickerAtPosition(point);
      if (!point.inside) return;
      if (tool === 'erase-stickers' || strokeClearing) {
        if (hitIndex === null) return;
        beginStroke();
        map.stickers.splice(hitIndex, 1);
        if (selectedStickerIndex === hitIndex) selectSticker(null);
        else {
          if (selectedStickerIndex !== null && selectedStickerIndex > hitIndex) selectedStickerIndex -= 1;
          syncStickerEditor();
        }
      } else {
        const emoji = stickerEmojiInput.value.trim();
        if (!emoji) {
          setStatus('Enter an emoji before placing a sticker.', true);
          return;
        }
        stickerDragStart = point;
        stickerDragEnd = point;
        stickerDragOrigin = { emoji, opacityPercent: layerOpacity.stickers, ...stickerPlacementTransform() };
        pointerMode = tool === 'sticker-circle' ? 'sticker-place-circle' : 'sticker-place-rectangle';
        draw();
        return;
      }
      pointerMode = 'sticker-object';
      draw();
      return;
    }
    if (tool === 'starting-zone') {
      const cell = cellAt(event.clientX, event.clientY);
      if (!cell) return;
      beginStroke();
      pointerMode = 'zone'; placementDragStart = cell; placementDragEnd = cell; draw(); return;
    }
    if (['wall', 'fence', 'door', 'secretDoor', 'window', 'erase-edges'].includes(tool)) {
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
    if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMode === 'pinch') {
      const [first, second] = [...activePointers.values()].slice(0, 2);
      if (!first || !second || !pinchStart) return;
      const rect = canvas.getBoundingClientRect();
      const center = { x: (first.x + second.x) / 2 - rect.left, y: (first.y + second.y) / 2 - rect.top };
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      view.scale = Math.min(8, Math.max(.15, pinchStart.scale * distance / pinchStart.distance));
      view.x = center.x - pinchStart.worldX * view.scale;
      view.y = center.y - pinchStart.worldY * view.scale;
      draw();
      return;
    }
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
    if (pointerMode === 'sticker-select') {
      if (selectedSticker() && stickerDragStart && stickerDragOrigin) {
        if (Math.hypot(event.clientX - stickerDragOrigin.clientX, event.clientY - stickerDragOrigin.clientY) > 3) {
          const sticker = selectedSticker();
          const point = stickerPositionAt(event.clientX, event.clientY);
          if (!stickerDragMoved) {
            beginStroke();
            stickerDragMoved = true;
          }
          sticker.x = Math.max(0, Math.min(map.grid.eastWestSquareCount, stickerDragOrigin.x + point.x - stickerDragStart.x));
          sticker.y = Math.max(0, Math.min(map.grid.northSouthSquareCount, stickerDragOrigin.y + point.y - stickerDragStart.y));
          draw();
        }
      }
      return;
    }
    if (pointerMode === 'sticker-place-circle' || pointerMode === 'sticker-place-rectangle') {
      stickerDragEnd = stickerPositionAt(event.clientX, event.clientY);
      draw();
      return;
    }
    if (pointerMode === 'calibrate') {
      calibrationDragEnd = imagePointAt(event.clientX, event.clientY);
      draw(); return;
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
  async function finishPointer(event) {
    activePointers.delete(event.pointerId);
    if (pointerMode === 'pinch') {
      if (activePointers.size >= 2) {
        startPinch();
      } else if (activePointers.size === 1) {
        pinchStart = null;
        pointerMode = 'pan';
        lastPointer = [...activePointers.values()][0];
      } else {
        pinchStart = null;
        pointerMode = '';
        lastPointer = null;
      }
      syncCanvasCursor();
      draw();
      return;
    }
    if (pointerMode === 'pan' && activePointers.size > 0) {
      lastPointer = [...activePointers.values()][0];
      return;
    }
    if (pointerMode === 'paint' && strokeImageChanged) {
      try {
        const blob = await new Promise((resolve, reject) => blankMapRaster.toBlob((result) => result ? resolve(result) : reject(new Error('Could not bake blank-map painting into its PNG.')), 'image/png'));
        imageBlob = blob;
        mapImage = await loadImage(blob);
        draw();
      } catch (error) {
        setStatus(`Could not update the blank map PNG: ${error.message || error}`, true);
      }
    }
    if (pointerMode === 'paint' || pointerMode === 'edge' || pointerMode === 'sticker-object' || (pointerMode === 'sticker-select' && strokeSnapshot)) endStroke();
    if ((pointerMode === 'sticker-place-circle' || pointerMode === 'sticker-place-rectangle') && stickerDragStart && stickerDragEnd) {
      const start = stickerDragStart;
      const end = stickerDragEnd;
      const emoji = stickerDragOrigin?.emoji;
      if (emoji && Math.hypot(end.x - start.x, end.y - start.y) > 0.02) {
        beginStroke();
        map.stickers ||= [];
        const sticker = pointerMode === 'sticker-place-circle'
          ? { shape: 'circle', x: start.x, y: start.y, radius: Math.hypot(end.x - start.x, end.y - start.y), ...stickerDragOrigin }
          : { shape: 'rectangle', x1: start.x, y1: start.y, x2: end.x, y2: end.y, x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, ...stickerDragOrigin };
        map.stickers.push(sticker);
        selectSticker(map.stickers.length - 1);
        endStroke(); scheduleSave(); refreshValidation();
      }
    }
    if (pointerMode === 'zone' && placementDragStart && placementDragEnd) {
      map.playerPlacement = { defaultBounds: {
        west: Math.min(placementDragStart.x, placementDragEnd.x), east: Math.max(placementDragStart.x, placementDragEnd.x),
        south: Math.min(placementDragStart.y, placementDragEnd.y), north: Math.max(placementDragStart.y, placementDragEnd.y)
      } };
      endStroke(); scheduleSave(); refreshValidation();
    }
    if (pointerMode === 'calibrate' && calibrationDragStart && calibrationDragEnd) {
      const squares = Number($('[data-calibration-size]').value);
      const left = Math.min(calibrationDragStart.x, calibrationDragEnd.x);
      const top = Math.min(calibrationDragStart.y, calibrationDragEnd.y);
      const width = Math.abs(calibrationDragEnd.x - calibrationDragStart.x);
      const height = Math.abs(calibrationDragEnd.y - calibrationDragStart.y);
      const cellWidthPx = width / squares; const cellHeightPx = height / squares;
      const offsetXPx = ((left % cellWidthPx) + cellWidthPx) % cellWidthPx;
      const offsetYPx = ((top % cellHeightPx) + cellHeightPx) % cellHeightPx;
      const size = imageSize();
      const padLeft = offsetXPx > 0.01 ? cellWidthPx - offsetXPx : 0;
      const padTop = offsetYPx > 0.01 ? cellHeightPx - offsetYPx : 0;
      const calibratedColumns = Math.ceil((size.width + padLeft) / cellWidthPx);
      const calibratedRows = Math.ceil((size.height + padTop) / cellHeightPx);
      if (width >= squares * 2 && height >= squares * 2 && left >= 0 && top >= 0 && left + width <= size.width && top + height <= size.height && calibratedColumns >= 1 && calibratedRows >= 1 && calibratedColumns <= 200 && calibratedRows <= 200) {
        try {
          await bakeImageCalibration({ cellWidthPx, cellHeightPx, offsetXPx, offsetYPx });
          syncGridControls();
          $('[data-tool="pan"]').click();
          history = [];
          undoButton.disabled = true;
          scheduleSave(); refreshValidation();
          setStatus(`Grid calibrated. The image was padded to ${calibratedColumns} × ${calibratedRows} image-aligned squares.`);
        } catch (error) {
          setStatus(`Could not finish grid calibration: ${error.message || error}`, true);
        }
      } else setStatus('The calibration patch must be inside the image and produce a grid of 1–200 squares per side.', true);
    }
    placementDragStart = null; placementDragEnd = null;
    stickerDragStart = null; stickerDragEnd = null; stickerDragOrigin = null; stickerDragMoved = false;
    calibrationDragStart = null; calibrationDragEnd = null;
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
    zoneClearButton.disabled = !map?.playerPlacement?.defaultBounds;
    if (!map || !mapImage || !canvas.clientWidth) return;
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    const { size, cellW, cellH, offsetX, offsetY } = gridMetrics();
    if (map.grid.boundaryBehavior === 'infinite') {
      const left = Math.min(0, -view.x / view.scale);
      const right = Math.max(size.width, (canvas.width - view.x) / view.scale);
      const top = Math.min(0, -view.y / view.scale);
      const bottom = Math.max(size.height, (canvas.height - view.y) / view.scale);
      ctx.fillStyle = mapEdgeColor;
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    syncBlankPaintingVisibility();
    ctx.drawImage(blankMapRaster || mapImage, 0, 0);
    const bounds = map.playerPlacement?.defaultBounds;
    const zone = placementDragStart && placementDragEnd ? {
      west: Math.min(placementDragStart.x, placementDragEnd.x), east: Math.max(placementDragStart.x, placementDragEnd.x),
      south: Math.min(placementDragStart.y, placementDragEnd.y), north: Math.max(placementDragStart.y, placementDragEnd.y)
    } : bounds;
    ctx.globalAlpha = layerOpacity.startingZone / 100;
    if (zone) {
      const left = offsetX + zone.west * cellW;
      const top = offsetY + (map.grid.northSouthSquareCount - 1 - zone.north) * cellH;
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
        ctx.fillRect(offsetX + tile.x * cellW, offsetY + row * cellH, tile.width * cellW, tile.height * cellH);
      } else {
        for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
          drawTileIcon(icon, offsetX + (tile.x + dx) * cellW, offsetY + (row + tile.height - dy - 1) * cellH, cellW, cellH);
        }
      }
    }
    ctx.globalAlpha = layerOpacity.elevation / 100;
    const detailedElevation = tool === 'elevation' || tool === 'erase-elevation';
    for (const tile of map.elevation.overrides) {
      const row = map.grid.northSouthSquareCount - tile.y - tile.height;
      for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
        const x = offsetX + (tile.x + dx) * cellW;
        const y = offsetY + (row + tile.height - dy - 1) * cellH;
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
      const x = offsetX + tile.x * cellW;
      const y = offsetY + (map.grid.northSouthSquareCount - 1 - tile.y) * cellH;
      if (detailedObstacles) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
        ctx.fillRect(x, y, cellW, cellH);
      } else {
        drawTileIcon(tileIcons.obstacle, x, y, cellW, cellH);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalAlpha = layerOpacity.grid / 100;
    ctx.strokeStyle = 'rgba(40, 112, 172, .7)';
    ctx.lineWidth = Math.max(.7, 1 / view.scale);
    ctx.beginPath();
    for (let x = 0; x <= map.grid.eastWestSquareCount; x += 1) { ctx.moveTo(offsetX + x * cellW, offsetY); ctx.lineTo(offsetX + x * cellW, offsetY + map.grid.northSouthSquareCount * cellH); }
    for (let row = 0; row <= map.grid.northSouthSquareCount; row += 1) { ctx.moveTo(offsetX, offsetY + row * cellH); ctx.lineTo(offsetX + map.grid.eastWestSquareCount * cellW, offsetY + row * cellH); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalAlpha = layerOpacity.edges / 100;
    for (const edge of map.edges) {
      const x1 = offsetX + edge.x * cellW;
      const y1 = offsetY + (map.grid.northSouthSquareCount - edge.y) * cellH;
      ctx.beginPath();
      const baseEdgeWidth = Math.max(4 / view.scale, Math.min(cellW, cellH) * .085);
      const editingEdges = ['wall', 'fence', 'door', 'secretDoor', 'window', 'erase-edges'].includes(tool);
      ctx.lineWidth = baseEdgeWidth * (editingEdges ? 3 : 1);
      ctx.lineCap = 'round';
      if (edge.type === 'wall') ctx.strokeStyle = '#28201d';
      else if (edge.type === 'fence') ctx.strokeStyle = '#65574b';
      else if (edge.type === 'secretDoor') ctx.strokeStyle = '#ff00ff';
      else if (edge.type === 'door') ctx.strokeStyle = edge.initialState === 'open' ? '#a37735' : '#6b3e22';
      else if (edge.type === 'window') ctx.strokeStyle = edge.initialState === 'open' ? '#24a148' : edge.initialState === 'inspected' ? '#2584c7' : '#d49b16';
      else { ctx.strokeStyle = '#34a0a4'; ctx.setLineDash([5 / view.scale, 4 / view.scale]); }
      if (edge.axis === 'vertical') { ctx.moveTo(x1, y1 - cellH); ctx.lineTo(x1, y1); }
      else { ctx.moveTo(x1, y1); ctx.lineTo(x1 + cellW, y1); }
      ctx.stroke(); ctx.setLineDash([]);
      if (edge.type === 'fence') {
        ctx.save();
        ctx.translate(edge.axis === 'vertical' ? x1 : x1 + cellW / 2, edge.axis === 'vertical' ? y1 - cellH / 2 : y1);
        if (edge.axis === 'horizontal') ctx.rotate(Math.PI / 2);
        const markSize = Math.min(cellW, cellH) * (editingEdges ? .82 : .58);
        ctx.font = `bold ${markSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = markSize * .12; ctx.strokeStyle = '#f5f1e8';
        ctx.strokeText('⦙', 0, 0); ctx.fillStyle = '#443a32'; ctx.fillText('⦙', 0, 0);
        ctx.restore();
      }
      if (edge.type === 'door') {
        ctx.fillStyle = '#f4dfb6'; ctx.font = `bold ${Math.min(cellW, cellH) * .18}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(edge.initialState === 'open' ? '↗' : edge.locked ? '🔒' : 'D', edge.axis === 'vertical' ? x1 : x1 + cellW / 2, edge.axis === 'vertical' ? y1 - cellH / 2 : y1);
      }
      if (edge.type === 'window') {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(2 / view.scale, cellW * .025);
        ctx.font = `bold ${Math.min(cellW, cellH) * .16}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = edge.initialState === 'open' ? 'O' : edge.initialState === 'inspected' ? 'I' : '?';
        const labelX = edge.axis === 'vertical' ? x1 : x1 + cellW / 2;
        const labelY = edge.axis === 'vertical' ? y1 - cellH / 2 : y1;
        ctx.strokeText(label, labelX, labelY); ctx.fillText(label, labelX, labelY);
      }
    }
    for (const sticker of map.stickers || []) {
      if (!sticker.emoji) continue;
      ctx.save();
      ctx.globalAlpha = (sticker.opacityPercent ?? 100) / 100;
      const centerX = offsetX + sticker.x * cellW;
      const centerY = offsetY + (map.grid.northSouthSquareCount - sticker.y) * cellH;
      const width = sticker.shape === 'circle' ? sticker.radius * 2 : Math.abs((sticker.x2 ?? sticker.x) - (sticker.x1 ?? sticker.x));
      const height = sticker.shape === 'circle' ? sticker.radius * 2 : Math.abs((sticker.y2 ?? sticker.y) - (sticker.y1 ?? sticker.y));
      const fontSize = width && height ? Math.min(width * cellW, height * cellH) * .9 : Math.min(cellW, cellH) * .9 * (sticker.sizePercent ?? 100) / 100;
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(centerX, centerY);
      ctx.rotate((sticker.rotationDegrees || 0) * Math.PI / 180);
      ctx.scale(sticker.flipHorizontal ? -1 : 1, sticker.flipVertical ? -1 : 1);
      if (sticker.shape === 'rectangle' && width > 0 && height > 0) {
        ctx.save();
        ctx.scale(width * cellW * .9 / fontSize, height * cellH * .9 / fontSize);
        drawStickerSymbol(ctx, sticker.emoji, 0, fontSize * emojiVerticalOffset, fontSize);
        ctx.restore();
      } else drawStickerSymbol(ctx, sticker.emoji, 0, fontSize * emojiVerticalOffset, fontSize);
      if ((map.stickers || [])[selectedStickerIndex] === sticker) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#48a8ff';
        ctx.lineWidth = Math.max(2 / view.scale, Math.min(cellW, cellH) * .025);
        ctx.setLineDash([Math.max(3 / view.scale, 5), Math.max(2 / view.scale, 3)]);
        const boxWidth = width ? width * cellW : fontSize * 1.1;
        const boxHeight = height ? height * cellH : fontSize * 1.1;
        ctx.strokeRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    if ((pointerMode === 'sticker-place-circle' || pointerMode === 'sticker-place-rectangle') && stickerDragStart && stickerDragEnd) {
      const a = stickerDragStart, b = stickerDragEnd;
      const circle = pointerMode === 'sticker-place-circle';
      const radius = Math.hypot(b.x - a.x, b.y - a.y);
      const cx = (circle ? a.x : (a.x + b.x) / 2) * cellW;
      const cy = (map.grid.northSouthSquareCount - (circle ? a.y : (a.y + b.y) / 2)) * cellH;
      const rx = circle ? radius * cellW : Math.abs(b.x - a.x) * cellW / 2;
      const ry = circle ? radius * cellH : Math.abs(b.y - a.y) * cellH / 2;
      ctx.save(); ctx.globalAlpha = (stickerDragOrigin?.opacityPercent ?? 100) / 100;
      const fontSize = Math.max(1, Math.min(rx * 2, ry * 2) * .9);
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(cx, cy);
      ctx.scale(stickerDragOrigin?.flipHorizontal ? -1 : 1, stickerDragOrigin?.flipVertical ? -1 : 1);
      if (!circle && fontSize > 0) {
        ctx.save(); ctx.scale(rx * 2 * .9 / fontSize, ry * 2 * .9 / fontSize);
        drawStickerSymbol(ctx, stickerDragOrigin?.emoji || '', 0, fontSize * emojiVerticalOffset, fontSize); ctx.restore();
      } else drawStickerSymbol(ctx, stickerDragOrigin?.emoji || '', 0, fontSize * emojiVerticalOffset, fontSize);
      ctx.globalAlpha = .8; ctx.strokeStyle = '#48a8ff'; ctx.lineWidth = Math.max(2 / view.scale, 2);
      if (circle) ctx.beginPath(), ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2), ctx.stroke();
      else ctx.strokeRect(-rx, -ry, rx * 2, ry * 2);
      ctx.restore();
    }
    if (pointerMode === 'calibrate' && calibrationDragStart && calibrationDragEnd) {
      const count = Number($('[data-calibration-size]').value);
      const left = Math.min(calibrationDragStart.x, calibrationDragEnd.x);
      const top = Math.min(calibrationDragStart.y, calibrationDragEnd.y);
      const width = Math.abs(calibrationDragEnd.x - calibrationDragStart.x);
      const height = Math.abs(calibrationDragEnd.y - calibrationDragStart.y);
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0, 210, 255, .12)'; ctx.fillRect(left, top, width, height);
      ctx.strokeStyle = '#00d2ff'; ctx.lineWidth = Math.max(2 / view.scale, 1);
      ctx.beginPath();
      for (let index = 0; index <= count; index += 1) {
        const x = left + width * index / count; const y = top + height * index / count;
        ctx.moveTo(x, top); ctx.lineTo(x, top + height);
        ctx.moveTo(left, y); ctx.lineTo(left + width, y);
      }
      ctx.stroke(); ctx.restore();
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
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
      const validType = ['wall', 'fence', 'doorway', 'door', 'secretDoor', 'window'].includes(edge.type);
      const validPosition = edge.axis === 'vertical'
        ? edge.x >= 0 && edge.x <= cols && edge.y >= 0 && edge.y < rows
        : edge.x >= 0 && edge.x < cols && edge.y >= 0 && edge.y <= rows;
      const id = `${edge.axis}:${edge.x}:${edge.y}`;
      if (!validAxis || !validType || !validPosition) errors.push(`Invalid edge feature at ${id}.`);
      if (seen.has(id)) errors.push(`More than one feature is defined at ${id}.`);
      seen.add(id);
      if (edge.widthFt !== undefined && (!Number.isFinite(edge.widthFt) || edge.widthFt <= 0)) errors.push(`Opening at ${id} needs a positive width.`);
      if (['door', 'window'].includes(edge.type) && !Number.isFinite(edge.widthFt)) errors.push(`Door or window at ${id} needs a positive width.`);
      if (edge.type === 'window' && !['uninspected', 'inspected', 'open'].includes(edge.initialState)) errors.push(`Window at ${id} needs an initial state of uninspected, inspected, or open.`);
    }
    for (const tile of map.blockedTiles) {
      if (tile.x < 0 || tile.x >= cols || tile.y < 0 || tile.y >= rows) errors.push(`Obstacle at ${tile.x}, ${tile.y} is outside the grid.`);
    }
    for (const sticker of map.stickers || []) {
      if (!Number.isFinite(sticker.x) || !Number.isFinite(sticker.y) || sticker.x < 0 || sticker.x > cols || sticker.y < 0 || sticker.y > rows) errors.push(`Sticker at ${sticker.x}, ${sticker.y} is outside the grid.`);
      if (typeof sticker.emoji !== 'string' || !sticker.emoji.trim() || sticker.emoji.length > 32) errors.push(`Sticker at ${sticker.x}, ${sticker.y} needs an emoji.`);
      const validShape = sticker.shape === 'circle' ? Number.isFinite(sticker.radius) && sticker.radius > 0 : sticker.shape === 'rectangle' ? Number.isFinite(sticker.x1) && Number.isFinite(sticker.y1) && Number.isFinite(sticker.x2) && Number.isFinite(sticker.y2) && sticker.x1 !== sticker.x2 && sticker.y1 !== sticker.y2 : Number.isInteger(sticker.sizePercent) && sticker.sizePercent >= 33 && sticker.sizePercent <= 500;
      if (!validShape) errors.push(`Sticker at ${sticker.x}, ${sticker.y} needs a valid placement shape.`);
      if (sticker.opacityPercent !== undefined && (!Number.isInteger(sticker.opacityPercent) || sticker.opacityPercent < 0 || sticker.opacityPercent > 100)) errors.push(`Sticker at ${sticker.x}, ${sticker.y} must have opacity from 0% to 100%.`);
      if (sticker.rotationDegrees !== undefined && (!Number.isInteger(sticker.rotationDegrees) || sticker.rotationDegrees < 0 || sticker.rotationDegrees > 360)) errors.push(`Sticker at ${sticker.x}, ${sticker.y} must have rotation from 0° to 360°.`);
    }
    if (map.playerPlacement?.defaultBounds) {
      const b = map.playerPlacement.defaultBounds;
      if (b.west < 0 || b.south < 0 || b.east >= cols || b.north >= rows || b.west > b.east || b.south > b.north) errors.push('Starting-zone bounds are invalid for the current grid.');
    }
    if (!imageBlob || !map.imagePath) errors.push('A PNG map image is required.');
    if (blankImageResizePending) errors.push('The blank map image is still resizing.');
    return errors;
  }
  function refreshValidation() {
    if (!map) return [];
    const errors = validateMap();
    if (imageBlob?.size > 20 * 1024 * 1024) errors.push('The map PNG exceeds the 20 MB import limit.');
    setStatus(errors.length ? errors[0] : 'Map data is valid and ready to export.', errors.length > 0);
    exportButton.disabled = errors.length > 0;
    return errors;
  }

  validateButton.addEventListener('click', () => {
    try {
      const errors = refreshValidation();
      const message = errors.length ? `Map is not valid: ${errors.join(' ')}` : 'Map data is valid and ready to export.';
      setStatus(message, errors.length > 0);
    } catch (error) {
      setStatus('Validation could not complete. Check that the restored draft has valid map data.', true);
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
        setStatus(`Export blocked: ${errors.join(' ')}`, true);
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
        setStatus(`Saved ${saveHandle.name}.`);
      } else {
        stage = 'starting the download';
        // Safari may append .zip based on application/zip even when downloadName ends in .tttm.
        const downloadBlob = new Blob([zip], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(downloadBlob);
        const link = document.createElement('a');
        link.href = url; link.download = downloadName;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setStatus(`Downloading ${downloadName}.`);
      }
    } catch (error) {
      if (error?.name === 'AbortError' && ['opening the save dialog', 'writing the selected file'].includes(stage)) {
      setStatus('Save canceled.');
        return;
      }
      setStatus(`Export failed while ${stage}: ${error?.message || error}`, true);
      console.error(`Map export failed while ${stage}:`, error);
    }
  });

  async function restoreDraft() {
    const draft = await readDraft();
    if (!draft) return;
    map = draft.map;
    selectedStickerIndex = null;
    imageBlob = draft.imageBlob instanceof Blob
      ? draft.imageBlob
      : draft.imageBytes ? new Blob([draft.imageBytes], { type: 'image/png' }) : null;
    if (!imageBlob) throw new Error('The saved map image is unavailable.');
    TacticalMapPackage.normalizeMetadata(map);
    map.grid ||= { eastWestSquareCount: 20, northSouthSquareCount: 20, squareSizeFt: 5 };
    map.grid.eastWestSquareCount ||= 20;
    map.grid.northSouthSquareCount ||= 20;
    map.grid.squareSizeFt ||= 5;
    map.grid.boundaryBehavior ||= 'bounded';
    delete map.grid.imageCalibration;
    syncGridControls();
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
    syncBlankBackgroundControls();
    if (map.mapPresentation.blankBackgroundColor) mapEdgeColor = map.mapPresentation.blankBackgroundColor;
    if (map.playerPlacement && !Object.keys(map.playerPlacement).length) delete map.playerPlacement;
    $('[data-map-name]').value = draft.name || 'Untitled map';
    $('[data-grid-width]').value = map.grid.eastWestSquareCount;
    $('[data-grid-height]').value = map.grid.northSouthSquareCount;
    $('[data-square-size]').value = map.grid.squareSizeFt;
    map.edges ||= [];
    syncStickerEditor();
    $('[data-infinite-canvas]').checked = map.grid.boundaryBehavior === 'infinite';
    syncBlankPaintingVisibility();
    mapImage = await loadImage(imageBlob);
    blankMapRaster = null;
    blankMapRasterGrid = null;
    if (map.mapPresentation.blankBackgroundColor) {
      blankMapRaster = document.createElement('canvas');
      blankMapRaster.width = mapImage.naturalWidth; blankMapRaster.height = mapImage.naturalHeight;
      blankMapRaster.getContext('2d').drawImage(mapImage, 0, 0);
      blankMapRasterGrid = { columns: map.grid.eastWestSquareCount, rows: map.grid.northSouthSquareCount };
    }
    mapEdgeColor = averageImageEdgeColor(mapImage);
    syncGridControls();
    syncBlankPaintingVisibility();
    mapViewport.hidden = false;
    history = []; undoButton.disabled = true;
    fitMap(); refreshValidation();
    setStatus('Restored your browser-local draft.');
  }
  $('[data-authoring-restore]').addEventListener('click', () => restoreDraft().catch(() => {
    setStatus('Unable to restore the saved draft in this browser.', true);
  }));
  readDraft().then((draft) => {
    draftAvailable = Boolean(draft);
    $('[data-authoring-restore]').hidden = !draftAvailable;
  }).catch(() => {});

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isFormField = target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');
    if (isFormField) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedSticker()) {
      event.preventDefault();
      deleteSelectedSticker();
      return;
    }
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
    if (!mapViewport.hidden && mapImage) fitMap();
    else draw();
  };
  if ('ResizeObserver' in window) {
    const viewportObserver = new ResizeObserver(resizeAuthoringViewports);
    viewportObserver.observe(canvas.parentElement);
  } else {
    window.addEventListener('resize', resizeAuthoringViewports);
  }
})();
