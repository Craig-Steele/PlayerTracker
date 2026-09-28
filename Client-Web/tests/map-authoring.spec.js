const { test, expect } = require('@playwright/test');

function readStoredZip(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

async function createBlankMap(page, presetColor = '#ffffff') {
  await page.locator('[data-blank-background-preset]').selectOption(presetColor);
  await page.locator('[data-grid-width]').fill('8');
  await page.locator('[data-grid-height]').fill('8');
  await page.locator('[data-new-blank-map]').click();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  await expect(page.locator('[data-export]')).toBeEnabled();
}

async function exportPackage(page, name) {
  page.once('dialog', (dialog) => dialog.accept(name));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-export]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(name.replaceAll(' ', '-'));
  const buffer = await require('node:fs/promises').readFile(await download.path());
  return { buffer, entries: readStoredZip(buffer) };
}

async function clickGridCell(page, x, topRow, columns = 8, rows = 8) {
  const canvas = page.locator('[data-map-canvas]');
  const box = await canvas.boundingBox();
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  const pixelsPerSquare = Math.min(64, Math.floor(2048 / Math.max(columns, rows)));
  const mapWidth = columns * pixelsPerSquare;
  const mapHeight = rows * pixelsPerSquare;
  const scale = Math.min(dimensions.width / mapWidth, dimensions.height / mapHeight) * 0.94;
  const offsetX = (dimensions.width - mapWidth * scale) / 2;
  const offsetY = (dimensions.height - mapHeight * scale) / 2;
  await canvas.click({
    position: {
      x: offsetX + (x + 0.5) * pixelsPerSquare * scale,
      y: offsetY + (topRow + 0.5) * pixelsPerSquare * scale
    }
  });
  expect(box).not.toBeNull();
}

async function clickGridEdge(page, lineX, topRow, columns = 8, rows = 8) {
  const canvas = page.locator('[data-map-canvas]');
  const box = await canvas.boundingBox();
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  const pixelsPerSquare = Math.min(64, Math.floor(2048 / Math.max(columns, rows)));
  const mapWidth = columns * pixelsPerSquare;
  const mapHeight = rows * pixelsPerSquare;
  const scale = Math.min(dimensions.width / mapWidth, dimensions.height / mapHeight) * 0.94;
  const offsetX = (dimensions.width - mapWidth * scale) / 2;
  const offsetY = (dimensions.height - mapHeight * scale) / 2;
  await canvas.click({
    position: {
      x: offsetX + lineX * pixelsPerSquare * scale,
      y: offsetY + (topRow + 0.5) * pixelsPerSquare * scale
    }
  });
  expect(box).not.toBeNull();
}

async function sidecarFrom(entries) {
  const sidecarName = [...entries.keys()].find((name) => name.endsWith('.map.json'));
  expect(sidecarName).toBeTruthy();
  return JSON.parse(entries.get(sidecarName).toString('utf8'));
}

test.beforeEach(async ({ page }) => {
  page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
  await page.goto('/map-authoring.html');
});

test('common sticker emoji pickers populate the emoji field', async ({ page }) => {
  await page.locator('summary').filter({ hasText: 'Stickers' }).click();
  const emojiInput = page.locator('[data-sticker-emoji]');
  const pickers = page.locator('[data-sticker-picker]');
  await expect(pickers).toHaveCount(4);

  for (const [index, emoji] of ['🟦', '🌳', '🪑', '🌈'].entries()) {
    await pickers.nth(index).selectOption(emoji);
    await expect(emojiInput).toHaveValue(emoji);
  }

  await pickers.nth(0).selectOption('🟦');
  await pickers.nth(1).selectOption('🌳');
  await expect(emojiInput).toHaveValue('🌳');
  await pickers.nth(0).dispatchEvent('pointerdown');
  await expect(emojiInput).toHaveValue('🟦');
});

test('grid opacity slider updates its value and persists across reloads', async ({ page }) => {
  const slider = page.locator('[data-grid-opacity]');
  const value = page.locator('[data-grid-opacity-value]');
  await expect(slider).toHaveValue('100');
  await slider.evaluate((element) => {
    element.value = '37';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(value).toHaveText('37%');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('roll4-map-authoring-layer-opacity')).grid)).toBe(37);
  await page.reload();
  await expect(slider).toHaveValue('37');
  await expect(value).toHaveText('37%');
});

test('opacity sliders snap clicks to quarter steps but preserve dragged values', async ({ page }) => {
  await page.locator('summary').filter({ hasText: 'Terrain' }).click();
  const slider = page.locator('[data-layer-opacity="terrain"]');
  const value = page.locator('[data-layer-opacity-value="terrain"]');
  await expect(page.locator('[data-layer-opacity]')).toHaveCount(6);
  await expect(slider).toHaveAttribute('type', 'range');

  await slider.evaluate((element) => {
    element.value = '37';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }));
  });
  await expect(slider).toHaveValue('25');
  await expect(value).toHaveText('25%');

  await slider.evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: 10, clientY: 10 }));
    element.value = '42';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientX: 20, clientY: 10 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: 20, clientY: 10 }));
  });
  await expect(slider).toHaveValue('42');
  await expect(value).toHaveText('42%');
});

test('tactical player placement blackout is opaque and only attached edges remain visible', async ({ page }) => {
  await page.addScriptTag({ url: '/tactical/tactical-render.js' });
  const pixel = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:200px';
    document.body.append(canvas);
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = 100;
    imageCanvas.height = 100;
    const imageContext = imageCanvas.getContext('2d');
    imageContext.fillStyle = '#fff';
    imageContext.fillRect(0, 0, 100, 100);
    const image = new Image();
    image.src = imageCanvas.toDataURL();
    await image.decode();
    window.TacticalRender.render({
      canvas,
      image,
      map: {
        grid: { eastWestSquareCount: 2, northSouthSquareCount: 2 },
        edges: [
          { axis: 'vertical', x: 1, y: 0, type: 'wall' },
          { axis: 'vertical', x: 1, y: 1, type: 'wall' }
        ]
      },
      status: document.createElement('div'),
      playerPlacement: { west: 0, east: 0, south: 0, north: 0 },
      viewerIsReferee: false,
      indicatorOpacity: 0.25,
      gridOpacity: 0
    });
    const context = canvas.getContext('2d');
    return {
      blackout: [...context.getImageData(77, 31, 1, 1).data],
      attachedEdge: [...context.getImageData(100, 75, 1, 1).data],
      remoteEdgeArea: [...context.getImageData(100, 31, 1, 1).data]
    };
  });
  expect(pixel.blackout).toEqual([0, 0, 0, 255]);
  expect(pixel.attachedEdge[0]).toBeLessThan(100);
  expect(pixel.remoteEdgeArea).toEqual([0, 0, 0, 255]);
});

test('secret doors paint and export as secret wall edges', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('summary').filter({ hasText: 'Edges' }).click();
  await page.locator('[data-tool="secretDoor"]').click();
  await clickGridEdge(page, 3, 3);

  const exported = await exportPackage(page, 'Secret-Door.tttm');
  const sidecar = await sidecarFrom(exported.entries);
  expect(sidecar.edges).toContainEqual({ axis: 'vertical', x: 3, y: 4, type: 'secretDoor' });
});

test('window edges export all supported initial states', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('summary').filter({ hasText: 'Edges' }).click();
  const states = ['uninspected', 'inspected', 'open'];
  for (const [index, state] of states.entries()) {
    await page.locator('[data-window-state]').selectOption(state);
    await page.locator('[data-tool="window"]').click();
    await clickGridEdge(page, index + 2, 3);
  }

  const exported = await exportPackage(page, 'Windows.tttm');
  const sidecar = await sidecarFrom(exported.entries);
  for (const [index, initialState] of states.entries()) {
    expect(sidecar.edges).toContainEqual({ axis: 'vertical', x: index + 2, y: 4, type: 'window', widthFt: 5, initialState });
  }
});

test('door and window width control exports widths and door state choices', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('summary').filter({ hasText: 'Edges' }).click();
  const width = page.locator('[data-door-window-width]');
  await expect(width).toHaveValue('5');
  await width.fill('3');
  const doorStates = [
    ['closed', 'closed', false],
    ['closed-locked', 'closed', true],
    ['open', 'open', false]
  ];
  for (const [index, [choice, initialState, locked]] of doorStates.entries()) {
    await page.locator('[data-door-state]').selectOption(choice);
    await page.locator('[data-tool="door"]').click();
    await clickGridEdge(page, index + 2, 2);
  }

  await width.fill('4');
  await page.locator('[data-window-state]').selectOption('inspected');
  await page.locator('[data-tool="window"]').click();
  await clickGridEdge(page, 2, 3);

  const exported = await exportPackage(page, 'Door-Window-Widths.tttm');
  const sidecar = await sidecarFrom(exported.entries);
  for (const [index, [, initialState, locked]] of doorStates.entries()) {
    expect(sidecar.edges).toContainEqual({ axis: 'vertical', x: index + 2, y: 5, type: 'door', widthFt: 3, initialState, locked });
  }
  expect(sidecar.edges).toContainEqual({ axis: 'vertical', x: 2, y: 4, type: 'window', widthFt: 4, initialState: 'inspected' });
});

test('blank-map preset and custom colors survive draft restore and package export/reopen', async ({ page }) => {
  const preset = page.locator('[data-blank-background-preset]');
  await expect(preset).toHaveValue('#ffffff');
  expect(await preset.locator('option').allTextContents()).toEqual(['White', 'Light gray', 'Grassy green', 'Dirt brown', 'Custom']);
  await createBlankMap(page, '#7cba5b');
  await expect(page.locator('[data-blank-background-color]')).toHaveValue('#7cba5b');

  await page.locator('[data-blank-background-color]').fill('#a1b2c3');
  await page.locator('[data-blank-background-color]').dispatchEvent('change');
  await expect(page.locator('[data-blank-background-preset]')).toHaveValue('custom');
  await page.locator('[data-map-name]').fill('Color Test');
  await expect(page.locator('[data-authoring-restore]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('roll4-map-authoring', 1);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('drafts').objectStore('drafts').get('active');
      read.onsuccess = () => {
        const draft = read.result;
        db.close();
        resolve({ color: draft?.map?.mapPresentation?.blankBackgroundColor ?? null, name: draft?.name ?? null });
      };
      read.onerror = () => { db.close(); resolve(false); };
    };
    request.onerror = () => resolve(false);
  }))).toEqual({ color: '#a1b2c3', name: 'Color Test' });

  await page.reload();
  const restore = page.locator('[data-authoring-restore]');
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  await expect(page.locator('[data-blank-background-color]')).toHaveValue('#a1b2c3');

  const { buffer, entries } = await exportPackage(page, 'Color Test.tttm');
  const sidecar = await sidecarFrom(entries);
  expect(sidecar.mapPresentation.blankBackgroundColor).toBe('#a1b2c3');
  const imageName = sidecar.imagePath;
  const pixel = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const sample = document.createElement('canvas');
    sample.width = 1;
    sample.height = 1;
    const sampleContext = sample.getContext('2d');
    sampleContext.drawImage(image, 0, 0, 1, 1);
    return [...sampleContext.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, entries.get(imageName).toString('base64'));
  expect(pixel).toEqual([0xa1, 0xb2, 0xc3]);

  await page.locator('[data-authoring-archive]').setInputFiles({
    name: 'Color-Test.tttm',
    mimeType: 'application/octet-stream',
    buffer
  });
  await expect(page.locator('[data-authoring-status]')).toContainText('Map package opened');
  await expect(page.locator('[data-blank-background-color]')).toHaveValue('#a1b2c3');
});

test('terrain painting, erase, undo, and sticker erasing round-trip through export', async ({ page }) => {
  await createBlankMap(page);
  const terrainGroup = page.locator('[data-tool-category]').nth(2);
  await terrainGroup.locator('summary').click();
  const canvas = page.locator('[data-map-canvas]');
  const undo = page.locator('[data-undo]');

  await page.locator('[data-tool="difficult"]').click();
  await clickGridCell(page, 2, 3);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();

  await page.locator('[data-tool="difficult"]').click();
  await clickGridCell(page, 2, 3);
  await page.locator('[data-tool="erase-terrain"]').click();
  await clickGridCell(page, 2, 3);
  await undo.click();
  let exported = await exportPackage(page, 'Terrain.tttm');
  let sidecar = await sidecarFrom(exported.entries);
  expect(sidecar.terrain.overrides).toContainEqual({ x: 2, y: 4, width: 1, height: 1, type: 'difficult' });

  await undo.click();
  exported = await exportPackage(page, 'Terrain.tttm');
  sidecar = await sidecarFrom(exported.entries);
  expect(sidecar.terrain.overrides).toEqual([]);

  const stickersGroup = page.locator('[data-tool-category]').nth(4);
  await stickersGroup.locator('summary').click();
  await page.locator('[data-sticker-emoji]').fill('🟫');
  await page.locator('[data-layer-opacity="stickers"]').evaluate((element) => {
    element.value = '50';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tool="sticker"]').click();
  await clickGridCell(page, 4, 2);
  await page.locator('[data-tool="erase-stickers"]').click();
  await clickGridCell(page, 4, 2);
  await undo.click();
  exported = await exportPackage(page, 'Terrain.tttm');
  sidecar = await sidecarFrom(exported.entries);
  expect(sidecar.stickers).toContainEqual({ x: 4, y: 5, emoji: '🟫', sizePercent: 100, opacityPercent: 50 });
  expect(canvas).toBeVisible();
});

test('two touch pointers pinch-zoom and the remaining pointer pans', async ({ page }) => {
  await createBlankMap(page);
  const canvas = page.locator('[data-map-canvas]');
  await expect(canvas).toHaveCSS('touch-action', 'none');
  const before = await canvas.evaluate((element) => element.toDataURL());
  const box = await canvas.boundingBox();
  const start = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.5 };
  const second = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 };

  await page.evaluate(({ start, second }) => {
    HTMLCanvasElement.prototype.setPointerCapture = () => {};
    const target = document.querySelector('[data-map-canvas]');
    const send = (type, pointerId, point) => target.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'touch', isPrimary: pointerId === 1,
      clientX: point.x, clientY: point.y, bubbles: true
    }));
    send('pointerdown', 1, start);
    send('pointerdown', 2, second);
    send('pointermove', 2, { x: second.x + 70, y: second.y });
    window.__mapAuthoringGestureSend = send;
  }, { start, second });
  const zoomed = await canvas.evaluate((element) => element.toDataURL());
  expect(zoomed).not.toBe(before);

  await page.evaluate(({ start, second }) => {
    const send = window.__mapAuthoringGestureSend;
    send('pointerup', 1, start);
    send('pointermove', 2, { x: second.x + 90, y: second.y + 20 });
    send('pointerup', 2, { x: second.x + 90, y: second.y + 20 });
  }, { start, second });
  const panned = await canvas.evaluate((element) => element.toDataURL());
  expect(panned).not.toBe(zoomed);
});
