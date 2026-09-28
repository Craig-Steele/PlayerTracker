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
  await page.locator('[data-layer-opacity="stickers"]').selectOption('50');
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
