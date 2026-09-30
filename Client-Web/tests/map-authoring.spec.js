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
  await page.locator('[data-grid-width]').fill('8');
  await page.locator('[data-grid-height]').fill('8');
  await page.locator('[data-new-blank-map]').click();
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  if (presetColor !== '#ffffff') await page.locator('[data-blank-background-preset]').selectOption(presetColor);
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

async function gridPointClientPosition(page, x, y, columns = 8, rows = 8) {
  const canvas = page.locator('[data-map-canvas]');
  const box = await canvas.boundingBox();
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  const pixelsPerSquare = Math.min(64, Math.floor(2048 / Math.max(columns, rows)));
  const mapWidth = columns * pixelsPerSquare;
  const mapHeight = rows * pixelsPerSquare;
  const scale = Math.min(dimensions.width / mapWidth, dimensions.height / mapHeight) * 0.94;
  return {
    x: box.x + (dimensions.width - mapWidth * scale) / 2 + x * pixelsPerSquare * scale,
    y: box.y + (dimensions.height - mapHeight * scale) / 2 + (rows - y) * pixelsPerSquare * scale
  };
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

test('Create Map info is tucked under the info icon and blank-map grid controls remain editable', async ({ page }) => {
  const createGroup = page.locator('.authoring-create-group');
  await expect(createGroup.locator('[data-grid-width]')).toHaveCount(0);
  await expect(createGroup.locator('[data-square-size]')).toHaveCount(0);
  await expect(page.locator('.authoring-info summary')).toHaveText('ⓘ Info');
  await expect(page.locator('.authoring-info .authoring-note')).toBeHidden();
  await page.locator('.authoring-info summary').click();
  await expect(page.locator('.authoring-info .authoring-note')).toBeVisible();
  await page.locator('.authoring-info summary').click();

  await expect(page.locator('[data-grid-count-controls]')).toBeVisible();
  await expect(page.locator('[data-grid-mode]')).toHaveCount(0);
  await expect(page.locator('[data-calibration-controls]')).toBeHidden();
  await expect(page.locator('[data-grid-width]')).toBeEditable();
  await expect(page.locator('[data-grid-height]')).toBeEditable();
  await expect(page.locator('[data-grid-opacity]')).toBeVisible();
});

test('Edit controls put Fit Map first and show Pan as a hand tool', async ({ page }) => {
  const editGroup = page.locator('.authoring-tool-group').filter({ has: page.locator('summary', { hasText: 'Edit' }) });
  expect(await editGroup.locator('.authoring-tool-items button').allTextContents()).toEqual(['Fit Map', '🖐️ Pan', 'Undo']);
  await expect(editGroup.locator('[data-tool="pan"]')).toHaveAttribute('aria-pressed', 'true');
});

test('blank-map grid counts resize the image proportionally and hide calibration', async ({ page }) => {
  await createBlankMap(page);
  await expect(page.locator('[data-grid-mode]')).toHaveCount(0);
  await expect(page.locator('[data-calibration-controls]')).toBeHidden();
  await expect(page.locator('[data-grid-width]')).toBeEditable();
  await page.locator('[data-grid-width]').fill('12');
  await page.locator('[data-grid-width]').press('Tab');
  await page.locator('[data-grid-height]').fill('6');
  await page.locator('[data-grid-height]').press('Tab');
  await expect(page.locator('[data-authoring-status]')).toHaveText('Map data is valid and ready to export.');

  const { entries } = await exportPackage(page, 'Proportional.tttm');
  const sidecar = await sidecarFrom(entries);
  expect(sidecar.grid).toMatchObject({ eastWestSquareCount: 12, northSouthSquareCount: 6 });
  expect(sidecar.grid.imageCalibration).toBeUndefined();
  const imageName = [...entries.keys()].find((name) => name.endsWith('.png'));
  const image = entries.get(imageName);
  expect(image.readUInt32BE(16) / image.readUInt32BE(20)).toBe(2);
});

test('blank-map dimension increases append default-colored cells without stretching the existing PNG', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('[data-tool="blank-map-water"]').click();
  await clickGridCell(page, 7, 7);

  await page.locator('[data-grid-width]').fill('10');
  await page.locator('[data-grid-width]').press('Tab');
  await page.locator('[data-grid-height]').fill('10');
  await page.locator('[data-grid-height]').press('Tab');

  const { entries } = await exportPackage(page, 'Expanded Blank.tttm');
  const sidecar = await sidecarFrom(entries);
  const pngBytes = entries.get(sidecar.imagePath);
  expect(pngBytes.readUInt32BE(16)).toBe(640);
  expect(pngBytes.readUInt32BE(20)).toBe(640);
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const sample = (column, row) => [...context.getImageData(column * 64 + 32, row * 64 + 32, 1, 1).data];
    return [sample(7, 7), sample(9, 7), sample(7, 9)];
  }, pngBytes.toString('base64'));
  expect(pixels).toEqual([[66, 153, 209, 255], [255, 255, 255, 255], [255, 255, 255, 255]]);
});

test('blank-map terrain brushes are baked into the exported PNG and undo restores the image', async ({ page }) => {
  await expect(page.locator('[data-blank-map-painting]')).toBeHidden();
  await createBlankMap(page);
  await expect(page.locator('[data-blank-map-painting]')).toBeVisible();

  await page.locator('[data-tool="blank-map-dirt"]').click();
  await clickGridCell(page, 1, 1);
  await page.locator('[data-tool="blank-map-swamp"]').click();
  await clickGridCell(page, 2, 1);
  await page.locator('[data-tool="blank-map-wood"]').click();
  await clickGridCell(page, 3, 1);
  await page.locator('[data-tool="blank-map-grass"]').click();
  await clickGridCell(page, 4, 1);
  await page.locator('[data-tool="blank-map-stone"]').click();
  await clickGridCell(page, 5, 1);
  await page.locator('[data-tool="blank-map-water"]').click();
  await clickGridCell(page, 6, 1);
  await page.locator('[data-blank-paint-color]').fill('#9b59b6');
  await page.locator('[data-tool="blank-map-custom"]').click();
  await clickGridCell(page, 7, 1);

  const { entries } = await exportPackage(page, 'Painted Blank.tttm');
  const sidecar = await sidecarFrom(entries);
  const png = entries.get(sidecar.imagePath).toString('base64');
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const context = document.createElement('canvas').getContext('2d');
    context.canvas.width = image.naturalWidth;
    context.canvas.height = image.naturalHeight;
    context.drawImage(image, 0, 0);
    return [1, 2, 3, 4, 5, 6, 7].map((column) => [...context.getImageData(column * 64 + 32, 1 * 64 + 32, 1, 1).data]);
  }, png);
  expect(pixels).toEqual([
    [139, 90, 43, 255], [105, 122, 67, 255], [200, 168, 120, 255],
    [116, 169, 78, 255], [146, 151, 155, 255], [66, 153, 209, 255], [155, 89, 182, 255]
  ]);
  expect(sidecar.terrain.overrides).toEqual([]);

  await page.locator('[data-undo]').click();
  const afterUndo = await exportPackage(page, 'Paint Undo.tttm');
  const undoneSidecar = await sidecarFrom(afterUndo.entries);
  const undonePng = afterUndo.entries.get(undoneSidecar.imagePath).toString('base64');
  const undonePixel = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return [...context.getImageData(7 * 64 + 32, 1 * 64 + 32, 1, 1).data];
  }, undonePng);
  expect(undonePixel).toEqual([255, 255, 255, 255]);
});

test('changing the blank-map default color preserves terrain colors already painted', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('[data-tool="blank-map-water"]').click();
  await clickGridCell(page, 4, 2);
  await page.locator('[data-blank-background-color]').fill('#d3d3d3');
  await page.locator('[data-blank-background-color]').dispatchEvent('change');
  await expect(page.locator('[data-blank-background-color]')).toHaveValue('#d3d3d3');
  const { entries } = await exportPackage(page, 'Recolored Blank.tttm');
  const sidecar = await sidecarFrom(entries);
  const png = entries.get(sidecar.imagePath).toString('base64');
  const colors = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return [
      [...context.getImageData(4 * 64 + 32, 2 * 64 + 32, 1, 1).data],
      [...context.getImageData(32, 32, 1, 1).data]
    ];
  }, png);
  expect(colors).toEqual([[66, 153, 209, 255], [211, 211, 211, 255]]);
});

test('validation and authoring messages use the single lower status area', async ({ page }) => {
  await createBlankMap(page);
  await expect(page.locator('[data-map-validation]')).toHaveCount(0);
  await expect(page.locator('[data-authoring-status]')).toHaveCount(1);
  await page.locator('[data-validate]').click();
  await expect(page.locator('[data-authoring-status]')).toHaveText('Map data is valid and ready to export.');
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

test('stickers can be placed at continuous coordinates, selected, dragged, and edited in place', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Stickers' }) }).locator('summary').click();
  await page.locator('[data-sticker-emoji]').fill('🌳');
  await page.locator('[data-layer-opacity="stickers"]').evaluate((element) => {
    element.value = '75';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tool="sticker-circle"]').click();
  const initial = await gridPointClientPosition(page, 1.5, 2.5);
  const radiusPoint = await gridPointClientPosition(page, 2.5, 2.5);
  await page.mouse.move(initial.x, initial.y); await page.mouse.down(); await page.mouse.move(radiusPoint.x, radiusPoint.y); await page.mouse.up();
  await expect(page.locator('[data-sticker-edit-state]')).toHaveText('New sticker settings');

  await page.locator('[data-tool="sticker-select"]').click();
  await page.locator('[data-map-canvas]').click({ position: { x: initial.x - (await page.locator('[data-map-canvas]').boundingBox()).x, y: initial.y - (await page.locator('[data-map-canvas]').boundingBox()).y } });
  await expect(page.locator('[data-sticker-edit-state]')).toHaveText('Editing selected sticker');
  await page.locator('[data-sticker-emoji]').fill('🪑');
  await page.locator('[data-layer-opacity="stickers"]').evaluate((element) => {
    element.value = '35';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const target = await gridPointClientPosition(page, 3.25, 4.75);
  await page.mouse.move(initial.x, initial.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.up();

  const { entries } = await exportPackage(page, 'Sticker-object.tttm');
  const sidecar = await sidecarFrom(entries);
  expect(sidecar.stickers).toHaveLength(1);
  expect(sidecar.stickers[0].x).toBeCloseTo(3.25, 1);
  expect(sidecar.stickers[0].y).toBeCloseTo(4.75, 1);
  expect(sidecar.stickers[0]).toMatchObject({ shape: 'circle', emoji: '🪑', opacityPercent: 35 });
  expect(sidecar.stickers[0].radius).toBeCloseTo(1, 1);

  await page.keyboard.press('Delete');
  const deleted = await exportPackage(page, 'Sticker-object.tttm');
  expect((await sidecarFrom(deleted.entries)).stickers).toEqual([]);
});

test('sticker controls set placement defaults outside Select Sticker mode', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Stickers' }) }).locator('summary').click();
  const start = await gridPointClientPosition(page, 1.5, 1.5);
  const edge = await gridPointClientPosition(page, 2, 1.5);
  await page.locator('[data-tool="sticker-circle"]').click();
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(edge.x, edge.y); await page.mouse.up();

  await page.locator('[data-tool="sticker-circle"]').click();
  await page.locator('[data-sticker-emoji]').fill('🔥');
  await page.locator('[data-layer-opacity="stickers"]').evaluate((element) => {
    element.value = '75'; element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const second = await gridPointClientPosition(page, 4.5, 4.5);
  const secondEdge = await gridPointClientPosition(page, 5, 4.5);
  await page.mouse.move(second.x, second.y); await page.mouse.down(); await page.mouse.move(secondEdge.x, secondEdge.y); await page.mouse.up();

  const { entries } = await exportPackage(page, 'Sticker-defaults.tttm');
  const sidecar = await sidecarFrom(entries);
  expect(sidecar.stickers).toHaveLength(2);
  expect(sidecar.stickers[0]).toMatchObject({ emoji: '✨', opacityPercent: 25 });
  expect(sidecar.stickers[1]).toMatchObject({ emoji: '🔥', opacityPercent: 75 });
});

test('Place in Square adds a centered sticker on a single click', async ({ page }) => {
  await createBlankMap(page);
  const stickersGroup = page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Stickers' }) });
  await stickersGroup.locator('summary').click();
  expect(await stickersGroup.locator('.authoring-tool-items button').allTextContents()).toEqual([
    '↖ Select and Modify Sticker', '⌖ Place in Square', '◯ Center and Radius', '□ Rectangular Region', '🧽 Erase Stickers',
    'Delete Selected Sticker'
  ]);
  await page.locator('[data-sticker-emoji]').fill('🌳');
  await page.locator('[data-layer-opacity="stickers"]').evaluate((element) => {
    element.value = '60'; element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tool="sticker-square"]').click();
  await clickGridCell(page, 3, 4);

  const { entries } = await exportPackage(page, 'Square Sticker.tttm');
  const sidecar = await sidecarFrom(entries);
  expect(sidecar.stickers).toEqual([{ x: 3.5, y: 3.5, sizePercent: 100, emoji: '🌳', opacityPercent: 60 }]);
});

test('selected stickers can be rotated and mirrored', async ({ page }) => {
  await createBlankMap(page);
  const stickersGroup = page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Stickers' }) });
  await stickersGroup.locator('summary').click();
  await page.locator('[data-sticker-emoji]').fill('🌳');
  await page.locator('[data-tool="sticker-square"]').click();
  await clickGridCell(page, 2, 2);

  await page.locator('[data-tool="sticker-select"]').click();
  await clickGridCell(page, 2, 2);
  await expect(page.locator('[data-sticker-rotation]')).toBeEnabled();
  await expect(page.locator('[data-sticker-mirror][value="random"]')).toHaveCount(2);
  await expect(page.locator('[data-sticker-mirror][value="random"]').nth(0)).toBeDisabled();
  await expect(page.locator('[data-sticker-mirror][value="random"]').nth(1)).toBeDisabled();
  await page.locator('[data-sticker-rotation]').evaluate((element) => {
    element.value = '135';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('[data-sticker-mirror][data-axis="horizontal"][value="mirror"]').check();
  await page.locator('[data-sticker-mirror][data-axis="vertical"][value="mirror"]').check();

  const { entries } = await exportPackage(page, 'Transformed Sticker.tttm');
  const sidecar = await sidecarFrom(entries);
  expect(sidecar.stickers[0]).toMatchObject({ rotationDegrees: 135, flipHorizontal: true, flipVertical: true });
});

test('random sticker mirroring is resolved independently per axis during placement', async ({ page }) => {
  await createBlankMap(page);
  const stickersGroup = page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Stickers' }) });
  await stickersGroup.locator('summary').click();
  await page.locator('[data-sticker-emoji]').fill('🌳');
  await page.locator('[data-sticker-mirror][data-axis="horizontal"][value="random"]').check();
  await page.locator('[data-sticker-mirror][data-axis="vertical"][value="random"]').check();
  await page.evaluate(() => {
    const values = [0.1, 0.9]; let index = 0;
    Math.random = () => values[index++ % values.length];
  });
  await page.locator('[data-tool="sticker-square"]').click();
  await clickGridCell(page, 2, 2);
  await page.locator('[data-tool="sticker-select"]').click();
  await clickGridCell(page, 2, 2);
  await expect(page.locator('[data-sticker-mirror][data-axis="horizontal"][value="mirror"]')).toBeChecked();
  await expect(page.locator('[data-sticker-mirror][data-axis="vertical"][value="normal"]')).toBeChecked();
  await expect(page.locator('[data-sticker-mirror][value="random"]').nth(0)).toBeDisabled();
  await expect(page.locator('[data-sticker-mirror][value="random"]').nth(1)).toBeDisabled();

  const { entries } = await exportPackage(page, 'Random Mirror Sticker.tttm');
  const sticker = (await sidecarFrom(entries)).stickers[0];
  expect(sticker.flipHorizontal).toBe(true);
  expect(sticker.flipVertical).toBeUndefined();
});

test('Clear Zone is enabled only while a starting zone exists', async ({ page }) => {
  await createBlankMap(page);
  const clearZone = page.locator('[data-zone-clear]');
  await expect(clearZone).toBeDisabled();
  await page.locator('summary').filter({ hasText: 'Starting Zone' }).click();
  await page.locator('[data-tool="starting-zone"]').click();
  const start = await gridPointClientPosition(page, 1.5, 1.5);
  const end = await gridPointClientPosition(page, 3.5, 3.5);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.mouse.up();
  await expect(clearZone).toBeEnabled();
  await clearZone.click();
  await expect(clearZone).toBeDisabled();
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
    element.value = '37';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: 10, clientY: 10 }));
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 16, clientY: 10 }));
    element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 3, clientX: 16, clientY: 10 }));
  });
  await expect(slider).toHaveValue('25');

  await slider.evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, clientX: 10, clientY: 10 }));
    element.value = '42';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 4, clientX: 20, clientY: 10 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 4, clientX: 20, clientY: 10 }));
  });
  await expect(slider).toHaveValue('42');
  await expect(value).toHaveText('42%');
});

test('tapping the opacity slider track snaps to a quarter step', async ({ page }) => {
  await page.locator('summary').filter({ hasText: 'Terrain' }).click();
  const slider = page.locator('[data-layer-opacity="terrain"]');
  const box = await slider.boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.56, box.y + box.height / 2);
  await expect(slider).toHaveValue('50');
});

test('clicking the opacity slider track with a mouse snaps to a quarter step', async ({ page }) => {
  await page.locator('summary').filter({ hasText: 'Terrain' }).click();
  const slider = page.locator('[data-layer-opacity="terrain"]');
  const box = await slider.boundingBox();
  await page.mouse.click(box.x + box.width * 0.56, box.y + box.height / 2);
  await expect(slider).toHaveValue('50');

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.63, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  const draggedValue = Number(await slider.inputValue());
  expect(draggedValue).toBeGreaterThan(50);
  expect(draggedValue).toBeLessThan(75);
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
  await page.locator('summary').filter({ hasText: 'Walls & Doors' }).click();
  await page.locator('[data-tool="secretDoor"]').click();
  await clickGridEdge(page, 3, 3);

  const exported = await exportPackage(page, 'Secret-Door.tttm');
  const sidecar = await sidecarFrom(exported.entries);
  expect(sidecar.edges).toContainEqual({ axis: 'vertical', x: 3, y: 4, type: 'secretDoor' });
});

test('fence edges paint and export with the fence type', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('summary').filter({ hasText: 'Walls & Doors' }).click();
  await expect(page.locator('[data-tool="fence"]')).toContainText('⦙ Fence');
  await page.locator('[data-tool="fence"]').click();
  await clickGridEdge(page, 3, 3);

  const exported = await exportPackage(page, 'Fence.tttm');
  const sidecar = await sidecarFrom(exported.entries);
  expect(sidecar.edges).toContainEqual({ axis: 'vertical', x: 3, y: 4, type: 'fence' });
});

test('window edges export all supported initial states', async ({ page }) => {
  await createBlankMap(page);
  await page.locator('summary').filter({ hasText: 'Walls & Doors' }).click();
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
  await page.locator('summary').filter({ hasText: 'Walls & Doors' }).click();
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

test('image upload opens calibration directly and pads the PNG to an image-aligned grid', async ({ page }) => {
  const base64 = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 512; image.height = 512;
    image.getContext('2d').fillStyle = '#345678';
    image.getContext('2d').fillRect(0, 0, image.width, image.height);
    return image.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-authoring-file]').setInputFiles({
    name: 'Calibration.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64')
  });
  await expect(page.locator('[data-map-canvas]')).toBeVisible();
  await expect(page.locator('[data-authoring-crop]')).toHaveCount(0);
  await expect(page.locator('[data-tool="grid-calibrate"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-calibration-controls]')).toBeVisible();
  await expect(page.locator('[data-grid-width]')).toHaveAttribute('readonly', '');
  await expect(page.locator('[data-grid-height]')).toHaveAttribute('readonly', '');
  await expect(page.locator('[data-tool="grid-calibrate"]')).toHaveText('Recalibrate');
  await page.locator('[data-map-name]').fill('Calibrated');
  await page.locator('[data-tool="grid-calibrate"]').click();
  const canvas = page.locator('[data-map-canvas]');
  const box = await canvas.boundingBox();
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  const scale = Math.min(dimensions.width / 512, dimensions.height / 512) * 0.94;
  const originX = (dimensions.width - 512 * scale) / 2;
  const originY = (dimensions.height - 512 * scale) / 2;
  const from = { x: box.x + originX + 10 * scale, y: box.y + originY + 10 * scale };
  const to = { x: box.x + originX + 310 * scale, y: box.y + originY + 310 * scale };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  const patchFill = await canvas.evaluate((element, point) => {
    const x = Math.round(point.x * element.width / element.clientWidth);
    const y = Math.round(point.y * element.height / element.clientHeight);
    return [...element.getContext('2d').getImageData(x, y, 1, 1).data];
  }, { x: originX + 40 * scale, y: originY + 40 * scale });
  expect(patchFill[0]).toBeLessThan(245);
  expect(patchFill[2]).toBeGreaterThan(120);
  await page.mouse.up();
  const { entries } = await exportPackage(page, 'Calibrated.tttm');
  const sidecar = JSON.parse(entries.get('Calibrated.map.json').toString('utf8'));
  expect(sidecar.grid.imageCalibration).toBeUndefined();
  expect(sidecar.grid.eastWestSquareCount).toBe(10);
  expect(sidecar.grid.northSouthSquareCount).toBe(10);
  const image = entries.get('Calibrated.png');
  expect(image.readUInt32BE(16)).toBe(600);
  expect(image.readUInt32BE(20)).toBe(600);
  const paddingPixel = await page.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    const decoded = new Image();
    decoded.src = URL.createObjectURL(blob);
    await decoded.decode();
    const sample = document.createElement('canvas');
    sample.width = decoded.naturalWidth;
    sample.height = decoded.naturalHeight;
    const context = sample.getContext('2d');
    context.drawImage(decoded, 0, 0);
    return [...context.getImageData(5, 5, 1, 1).data];
  }, [...image]);
  expect(paddingPixel).toEqual([52, 86, 120, 255]);
});

test('recalibrating a painted map requires confirmation', async ({ page }) => {
  const base64 = await page.evaluate(() => {
    const image = document.createElement('canvas'); image.width = 512; image.height = 512;
    image.getContext('2d').fillRect(0, 0, image.width, image.height);
    return image.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-authoring-file]').setInputFiles({ name: 'Recalibrate.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  await page.locator('summary').filter({ hasText: 'Terrain' }).click();
  await page.locator('[data-tool="difficult"]').click();
  await clickGridCell(page, 3, 3, 20, 20);
  await page.evaluate(() => {
    window.confirm = (message) => { window.__recalibrationPrompt = message; return false; };
  });
  await page.locator('[data-tool="grid-calibrate"]').click();
  await expect(page.locator('[data-tool="difficult"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__recalibrationPrompt)).toContain('Painted terrain');

  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('[data-tool="grid-calibrate"]').click();
  await expect(page.locator('[data-tool="grid-calibrate"]')).toHaveAttribute('aria-pressed', 'true');
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
  const terrainGroup = page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Terrain' }) });
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

  const stickersGroup = page.locator('[data-tool-category]').filter({ has: page.locator('summary', { hasText: 'Stickers' }) });
  await stickersGroup.locator('summary').click();
  await page.locator('[data-sticker-emoji]').fill('🟫');
  await page.locator('[data-layer-opacity="stickers"]').evaluate((element) => {
    element.value = '50';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tool="sticker-rectangle"]').click();
  const rectStart = await gridPointClientPosition(page, 4, 5);
  const rectEnd = await gridPointClientPosition(page, 5, 6);
  await page.mouse.move(rectStart.x, rectStart.y); await page.mouse.down(); await page.mouse.move(rectEnd.x, rectEnd.y); await page.mouse.up();
  await page.locator('[data-tool="erase-stickers"]').click();
  await clickGridCell(page, 4, 2);
  await undo.click();
  exported = await exportPackage(page, 'Terrain.tttm');
  sidecar = await sidecarFrom(exported.entries);
  const sticker = sidecar.stickers.find((item) => item.emoji === '🟫');
  expect(sticker).toMatchObject({ emoji: '🟫', shape: 'rectangle', opacityPercent: 50 });
  expect(sticker.x1).toBeCloseTo(4, 1);
  expect(sticker.y1).toBeCloseTo(5, 1);
  expect(sticker.x2).toBeCloseTo(5, 1);
  expect(sticker.y2).toBeCloseTo(6, 1);
  expect(sticker.x).toBeCloseTo(4.5, 1);
  expect(sticker.y).toBeCloseTo(5.5, 1);
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
