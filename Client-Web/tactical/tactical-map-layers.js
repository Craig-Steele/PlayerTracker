window.TacticalMapLayers = (() => {
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

  function drawTileIcon(context, icon, x, y, cellW, cellH) {
    const size = Math.min(cellW, cellH);
    const centered = icon === tileIcons.obstacle || icon === tileIcons.impassible;
    const centerX = x + cellW * (centered ? 0.5 : 0.82);
    const centerY = y + cellH * (centered ? 0.5 : 0.82);
    context.save();
    if (icon === tileIcons.obstacle) {
      context.beginPath();
      context.arc(centerX, centerY, size * 0.235, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 255, 255, 0.62)';
      context.fill();
      context.strokeStyle = 'rgba(255, 255, 255, .96)';
      context.lineWidth = size * 0.035;
      context.stroke();
    }
    context.font = `${size * 0.31}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, centerX, centerY);
    context.restore();
  }

  function drawTerrain(context, map, metrics, { opacity = 1, detailed = false } = {}) {
    const { cellW, cellH, offsetX, offsetY, rows } = metrics;
    context.save();
    context.globalAlpha = opacity;
    for (const tile of map.terrain?.overrides || []) {
      const icon = tileIcons[tile.type];
      if (!icon) continue;
      const row = rows - tile.y - tile.height;
      if (detailed) {
        context.fillStyle = terrainTints[tile.type];
        context.fillRect(offsetX + tile.x * cellW, offsetY + row * cellH, tile.width * cellW, tile.height * cellH);
      } else {
        for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
          drawTileIcon(context, icon, offsetX + (tile.x + dx) * cellW, offsetY + (row + tile.height - dy - 1) * cellH, cellW, cellH);
        }
      }
    }
    context.restore();
  }

  function drawElevation(context, map, metrics, { opacity = 1, detailed = false, viewScale = 1 } = {}) {
    const { cellW, cellH, offsetX, offsetY, rows } = metrics;
    context.save();
    context.globalAlpha = opacity;
    for (const tile of map.elevation?.overrides || []) {
      const row = rows - tile.y - tile.height;
      for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
        const x = offsetX + (tile.x + dx) * cellW;
        const y = offsetY + (row + tile.height - dy - 1) * cellH;
        if (detailed) {
          context.fillStyle = '#9259be';
          context.fillRect(x, y, cellW, cellH);
          context.fillStyle = '#fff';
          context.strokeStyle = 'rgba(24, 20, 29, .96)';
          context.lineWidth = 2.5 / viewScale;
          context.lineJoin = 'round';
          context.font = `bold ${Math.min(cellW, cellH) * .27}px sans-serif`;
          context.textAlign = 'center'; context.textBaseline = 'middle';
          context.strokeText(`${tile.heightFt}′`, x + cellW / 2, y + cellH / 2);
          context.fillText(`${tile.heightFt}′`, x + cellW / 2, y + cellH / 2);
        } else {
          context.fillStyle = '#9259be';
          context.fillRect(x, y, cellW, cellH);
          context.fillStyle = '#28143b';
          context.font = `bold ${Math.min(cellW, cellH) * 0.27}px sans-serif`;
          context.textAlign = 'center'; context.textBaseline = 'middle';
          context.fillText(`${tile.heightFt}′`, x + cellW / 2, y + cellH / 2);
        }
      }
    }
    context.restore();
  }

  function drawStickers(context, map, metrics, { opacity = 1 } = {}) {
    const { cellW, cellH, offsetX, offsetY, rows } = metrics;
    context.save();
    context.globalAlpha = opacity;
    for (const sticker of map.stickers || []) {
      if (!sticker.emoji) continue;
      context.save();
      context.globalAlpha = opacity * (sticker.opacityPercent ?? 100) / 100;
      const centerX = offsetX + sticker.x * cellW;
      const centerY = offsetY + (rows - sticker.y) * cellH;
      const width = sticker.shape === 'circle' ? (sticker.radius || 0) * 2 : sticker.shape === 'rectangle' ? Math.abs((sticker.x2 ?? sticker.x) - (sticker.x1 ?? sticker.x)) : (sticker.sizePercent ?? 100) / 100;
      const height = sticker.shape === 'circle' ? (sticker.radius || 0) * 2 : sticker.shape === 'rectangle' ? Math.abs((sticker.y2 ?? sticker.y) - (sticker.y1 ?? sticker.y)) : (sticker.sizePercent ?? 100) / 100;
      const fontSize = Math.min(cellW * width, cellH * height) * 0.9;
      context.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.translate(centerX, centerY);
      context.rotate((sticker.rotationDegrees || 0) * Math.PI / 180);
      context.scale(sticker.flipHorizontal ? -1 : 1, sticker.flipVertical ? -1 : 1);
      if (sticker.shape === 'rectangle' && width > 0 && height > 0) {
        context.save();
        context.scale(width * cellW * 0.9 / fontSize, height * cellH * 0.9 / fontSize);
        drawStickerSymbol(context, sticker.emoji, 0, fontSize * emojiVerticalOffset, fontSize);
        context.restore();
      } else drawStickerSymbol(context, sticker.emoji, 0, fontSize * emojiVerticalOffset, fontSize);
      context.restore();
    }
    context.restore();
  }

  function drawObstacles(context, map, metrics, { opacity = 1, detailed = false } = {}) {
    const { cellW, cellH, offsetX, offsetY, rows } = metrics;
    context.save();
    context.globalAlpha = opacity;
    for (const tile of map.blockedTiles || []) {
      const x = offsetX + tile.x * cellW;
      const y = offsetY + (rows - 1 - tile.y) * cellH;
      if (detailed) {
        context.fillStyle = 'rgba(255, 255, 255, 0.62)';
        context.fillRect(x, y, cellW, cellH);
      } else drawTileIcon(context, tileIcons.obstacle, x, y, cellW, cellH);
    }
    context.restore();
  }

  function drawEdges(context, map, metrics, { opacity = 1, viewScale = 1, editing = false, viewerIsReferee = true, includeWindows = true, showWindowLabels = false, edgeFilter = null } = {}) {
    const { cellW, cellH, offsetX, offsetY, rows } = metrics;
    context.save();
    context.globalAlpha = opacity;
    for (const edge of map.edges || []) {
      if (!includeWindows && edge.type === 'window') continue;
      if (edgeFilter && !edgeFilter(edge)) continue;
      const x = offsetX + edge.x * cellW;
      const y = offsetY + (rows - edge.y) * cellH;
      context.beginPath();
      const baseEdgeWidth = Math.max(4 / viewScale, Math.min(cellW, cellH) * .085);
      context.lineWidth = baseEdgeWidth * (editing ? 3 : 1);
      context.lineCap = 'round';
      if (edge.type === 'wall') context.strokeStyle = '#28201d';
      else if (edge.type === 'fence') context.strokeStyle = '#65574b';
      else if (edge.type === 'secretDoor') context.strokeStyle = viewerIsReferee ? '#ff00ff' : '#28201d';
      else if (edge.type === 'door') context.strokeStyle = edge.initialState === 'open' ? '#a37735' : '#6b3e22';
      else if (edge.type === 'window') context.strokeStyle = edge.initialState === 'open' ? '#24a148' : edge.initialState === 'inspected' ? '#2584c7' : '#d49b16';
      else continue;
      if (edge.axis === 'vertical') { context.moveTo(x, y - cellH); context.lineTo(x, y); }
      else if (edge.axis === 'horizontal') { context.moveTo(x, y); context.lineTo(x + cellW, y); }
      else continue;
      context.stroke();
      if (edge.type === 'fence') {
        context.save();
        context.translate(edge.axis === 'vertical' ? x : x + cellW / 2, edge.axis === 'vertical' ? y - cellH / 2 : y);
        if (edge.axis === 'horizontal') context.rotate(Math.PI / 2);
        const markSize = Math.min(cellW, cellH) * (editing ? .82 : .58);
        context.font = `bold ${markSize}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineJoin = 'round';
        context.lineWidth = markSize * .12; context.strokeStyle = '#f5f1e8';
        context.strokeText('⦙', 0, 0); context.fillStyle = '#443a32'; context.fillText('⦙', 0, 0);
        context.restore();
      }
      if (edge.type === 'door') {
        context.fillStyle = '#f4dfb6'; context.font = `bold ${Math.min(cellW, cellH) * .18}px sans-serif`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(edge.initialState === 'open' ? '↗' : editing && edge.locked ? '🔒' : 'D', edge.axis === 'vertical' ? x : x + cellW / 2, edge.axis === 'vertical' ? y - cellH / 2 : y);
      }
      if (edge.type === 'window' && (editing || showWindowLabels)) {
        context.fillStyle = '#fff'; context.strokeStyle = '#222'; context.lineWidth = Math.max(2 / viewScale, cellW * .025);
        context.font = `bold ${Math.min(cellW, cellH) * .16}px sans-serif`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        const label = edge.initialState === 'open' ? 'O' : edge.initialState === 'inspected' ? 'I' : '?';
        const labelX = edge.axis === 'vertical' ? x : x + cellW / 2;
        const labelY = edge.axis === 'vertical' ? y - cellH / 2 : y;
        context.strokeText(label, labelX, labelY); context.fillText(label, labelX, labelY);
      }
    }
    context.restore();
  }

  return { drawTerrain, drawElevation, drawStickers, drawObstacles, drawEdges, drawStickerSymbol, drawTileIcon, emojiVerticalOffset, tileIcons };
})();
