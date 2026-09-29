window.TacticalRender = (() => {
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

  function render({ canvas, map, image, status, tokens = [], viewerId, viewerIsReferee = false, playerPlacement = null, hideEnemyTokens = false, allowPlacementEdit = false, indicatorOpacity = 0.25, gridOpacity = 0.6, onPlayerPlacementSelect, tooltip, onTap, onTokenSelect }) {
    const context = canvas.getContext('2d');
    let currentMap = map;
    let currentImage = image;
    const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;
    const view = { scale: 1, x: 0, y: 0 };
    let dragging = false;
    let lastPoint = null;
    const pointers = new Map();
    let averageEdgeColorCache = null;
    let pinchStart = null;
    let tapStart = null;
    let tapMoved = false;
    let suppressNextClick = false;
    let ignoreNextClick = false;
    let selectedTokenId = null;
    let currentPlayerPlacement = playerPlacement;
    let currentHideEnemyTokens = hideEnemyTokens;
    let currentIndicatorOpacity = clampOpacity(indicatorOpacity, 0.25);
    let currentGridOpacity = clampOpacity(gridOpacity, 0.6);

    function clampOpacity(value, fallback) {
      const opacity = Number(value);
      return Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : fallback));
    }
    let placementDrawMode = false;
    let placementDragStart = null;
    let placementDragEnd = null;

    function centeredTextOrigin(textContext, text, centerX, centerY) {
      const metrics = textContext.measureText(text);
      const left = metrics.actualBoundingBoxLeft || 0;
      const right = metrics.actualBoundingBoxRight || metrics.width;
      const ascent = metrics.actualBoundingBoxAscent || metrics.fontBoundingBoxAscent || 0;
      const descent = metrics.actualBoundingBoxDescent || metrics.fontBoundingBoxDescent || 0;
      return {
        x: centerX + (left - right) / 2,
        y: centerY + (ascent - descent) / 2
      };
    }

    function mapSize() {
      return { width: currentImage.naturalWidth, height: currentImage.naturalHeight };
    }

    function gridMetrics(size = mapSize()) {
      return {
        squareWidth: size.width / currentMap.grid.eastWestSquareCount,
        squareHeight: size.height / currentMap.grid.northSouthSquareCount,
        offsetX: 0,
        offsetY: 0
      };
    }

    function isInfiniteTerrain() {
      return currentMap.grid.boundaryBehavior === 'infinite' ||
        currentMap.mapPresentation?.terrainBoundary === 'infinite';
    }

    function averageEdgeColor() {
      if (averageEdgeColorCache) return averageEdgeColorCache;
      try {
        const sampleCanvas = document.createElement('canvas');
        const sampleSize = 64;
        sampleCanvas.width = sampleSize;
        sampleCanvas.height = sampleSize;
        const sampleContext = sampleCanvas.getContext('2d');
        sampleContext.drawImage(currentImage, 0, 0, sampleSize, sampleSize);
        const pixels = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        let alpha = 0;
        let count = 0;
        for (let y = 0; y < sampleSize; y += 1) {
          for (let x = 0; x < sampleSize; x += 1) {
            if (x !== 0 && x !== sampleSize - 1 && y !== 0 && y !== sampleSize - 1) continue;
            const offset = (y * sampleSize + x) * 4;
            red += pixels[offset];
            green += pixels[offset + 1];
            blue += pixels[offset + 2];
            alpha += pixels[offset + 3];
            count += 1;
          }
        }
        averageEdgeColorCache = `rgba(${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)}, ${alpha / count / 255})`;
        return averageEdgeColorCache;
      } catch (_) {
        return getComputedStyle(canvas).getPropertyValue('--tactical-viewport').trim() || '#f5f8fb';
      }
    }

    function drawInfiniteBackground(size) {
      if (!isInfiniteTerrain()) return;
      const left = Math.min(0, (-view.x) / view.scale);
      const right = Math.max(size.width, (canvas.clientWidth - view.x) / view.scale);
      const top = Math.min(0, (-view.y) / view.scale);
      const bottom = Math.max(size.height, (canvas.clientHeight - view.y) / view.scale);

      context.fillStyle = averageEdgeColor();
      context.fillRect(left, top, right - left, bottom - top);
    }

    function tokenAt(screenX, screenY) {
      const size = mapSize();
      const mapX = (screenX - view.x) / view.scale;
      const mapY = (screenY - view.y) / view.scale;
      const grid = currentMap.grid;
      const { squareWidth, squareHeight, offsetX, offsetY } = gridMetrics(size);
      return tokens.find((token) => {
        if (!viewerIsReferee && (token.isHidden || (currentHideEnemyTokens && token.team === 'enemy'))) return false;
        const row = grid.northSouthSquareCount - 1 - token.y;
        const centerX = offsetX + (token.x + 0.5) * squareWidth;
        const centerY = offsetY + (row + 0.5) * squareHeight;
        const radius = Math.min(squareWidth, squareHeight) * 0.5;
        return Math.hypot(mapX - centerX, mapY - centerY) <= radius;
      });
    }

    function updateTooltip(clientX, clientY) {
      if (!tooltip) return;
      const rect = canvas.getBoundingClientRect();
      const token = tokenAt(clientX - rect.left, clientY - rect.top);
      if (!token) {
        tooltip.hidden = true;
        return;
      }
      const characterLine = tooltip.querySelector('[data-tactical-tooltip-character]');
      const conditionsSection = tooltip.querySelector('[data-tactical-tooltip-conditions-section]');
      const conditionsLine = tooltip.querySelector('[data-tactical-tooltip-conditions]');
      characterLine.textContent = `${token.displayName}${token.ownerName ? ` · ${token.ownerName}` : ''}`;
      const conditions = (token.conditions || []).filter(Boolean);
      conditionsLine.textContent = `🩸 ${conditions.join(' · ')}`;
      conditionsSection.hidden = conditions.length === 0;
      tooltip.style.left = `${clientX + 14}px`;
      tooltip.style.top = `${clientY + 14}px`;
      tooltip.hidden = false;
    }

    function handleTap(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const tappedToken = tokenAt(clientX - rect.left, clientY - rect.top);
      if (tappedToken && onTokenSelect) {
        onTokenSelect(tappedToken);
      } else if (onTap) {
        onTap(clientX, clientY);
      }
    }

    function fit() {
      const size = mapSize();
      if (size.width <= 0 || size.height <= 0) return;
      view.scale = Math.min(canvas.clientWidth / size.width, canvas.clientHeight / size.height) * 0.92;
      view.x = (canvas.clientWidth - size.width * view.scale) / 2;
      view.y = (canvas.clientHeight - size.height * view.scale) / 2;
      draw();
    }

    function zoomToToken(token) {
      if (!token) return false;
      const size = mapSize();
      if (size.width <= 0 || size.height <= 0) return false;
      const grid = currentMap.grid;
      const { squareWidth, squareHeight, offsetX, offsetY } = gridMetrics(size);
      const row = grid.northSouthSquareCount - 1 - token.y;
      const centerX = offsetX + (token.x + 0.5) * squareWidth;
      const centerY = offsetY + (row + 0.5) * squareHeight;
      const squareSpan = 12;
      view.scale = Math.min(
        8,
        Math.max(
          0.15,
          Math.min(
            canvas.clientWidth / (squareSpan * squareWidth),
            canvas.clientHeight / (squareSpan * squareHeight)
          )
        )
      );
      view.x = canvas.clientWidth / 2 - centerX * view.scale;
      view.y = canvas.clientHeight / 2 - centerY * view.scale;
      draw();
      return true;
    }

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      const size = mapSize();
      if (size.width <= 0 || size.height <= 0) return;
      context.save();
      context.translate(view.x, view.y);
      context.scale(view.scale, view.scale);

      const grid = currentMap.grid;
      const { squareWidth, squareHeight, offsetX, offsetY } = gridMetrics(size);
      drawInfiniteBackground(size);
      context.drawImage(currentImage, 0, 0);

      context.globalAlpha = currentIndicatorOpacity;
      const tileIcons = {
        difficult: '⚠️',
        water: '💧',
        lava: '♨️',
        impassible: '❌'
      };
      for (const tile of currentMap.terrain?.overrides || []) {
        const row = grid.northSouthSquareCount - tile.y - tile.height;
        const icon = tileIcons[tile.type];
        if (!icon) continue;
        for (let dx = 0; dx < tile.width; dx += 1) for (let dy = 0; dy < tile.height; dy += 1) {
          drawTileIcon(context, icon, offsetX + (tile.x + dx) * squareWidth, offsetY + (row + tile.height - dy - 1) * squareHeight, squareWidth, squareHeight);
        }
      }
      for (const tile of currentMap.elevation?.overrides || []) {
        const row = grid.northSouthSquareCount - tile.y - tile.height;
        context.fillStyle = '#9259be';
        context.fillRect(offsetX + tile.x * squareWidth, offsetY + row * squareHeight, tile.width * squareWidth, tile.height * squareHeight);
        context.fillStyle = '#28143b';
        context.font = `bold ${Math.min(squareWidth, squareHeight) * 0.27}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${tile.heightFt}′`, offsetX + (tile.x + tile.width / 2) * squareWidth, offsetY + (row + tile.height / 2) * squareHeight);
      }
      for (const sticker of currentMap.stickers || []) {
        if (!sticker.emoji) continue;
        context.save();
        context.globalAlpha = (sticker.opacityPercent ?? 100) / 100;
        const centerX = offsetX + sticker.x * squareWidth;
        const centerY = offsetY + (grid.northSouthSquareCount - sticker.y) * squareHeight;
        const width = sticker.shape === 'circle' ? (sticker.radius || 0) * 2 : sticker.shape === 'rectangle' ? Math.abs((sticker.x2 ?? sticker.x) - (sticker.x1 ?? sticker.x)) : (sticker.sizePercent ?? 100) / 100;
        const height = sticker.shape === 'circle' ? (sticker.radius || 0) * 2 : sticker.shape === 'rectangle' ? Math.abs((sticker.y2 ?? sticker.y) - (sticker.y1 ?? sticker.y)) : (sticker.sizePercent ?? 100) / 100;
        const fontSize = Math.min(squareWidth * width, squareHeight * height) * 0.9;
        context.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        // Emoji fonts often include extra vertical whitespace above the visible glyph.
        if (sticker.shape === 'rectangle' && width > 0 && height > 0) {
          context.translate(centerX, centerY);
          context.scale(width * squareWidth * 0.9 / fontSize, height * squareHeight * 0.9 / fontSize);
          drawStickerSymbol(context, sticker.emoji, 0, fontSize * emojiVerticalOffset, fontSize);
        } else drawStickerSymbol(context, sticker.emoji, centerX, centerY + fontSize * emojiVerticalOffset, fontSize);
        context.restore();
      }

      context.strokeStyle = getComputedStyle(canvas).getPropertyValue('--tactical-grid').trim();
      context.lineWidth = Math.max(1 / view.scale, 0.7);
      context.beginPath();
      const visibleLeft = isInfiniteTerrain() ? Math.floor(((-view.x) / view.scale - offsetX) / squareWidth) - 1 : 0;
      const visibleRight = isInfiniteTerrain() ? Math.ceil((canvas.clientWidth - view.x) / view.scale / squareWidth) + 1 : grid.eastWestSquareCount;
      const visibleTop = isInfiniteTerrain() ? Math.floor(((-view.y) / view.scale - offsetY) / squareHeight) - 1 : 0;
      const visibleBottom = isInfiniteTerrain() ? Math.ceil((canvas.clientHeight - view.y) / view.scale / squareHeight) + 1 : grid.northSouthSquareCount;
      for (let x = visibleLeft; x <= visibleRight; x += 1) {
        context.moveTo(offsetX + x * squareWidth, isInfiniteTerrain() ? offsetY + visibleTop * squareHeight : offsetY);
        context.lineTo(offsetX + x * squareWidth, isInfiniteTerrain() ? offsetY + visibleBottom * squareHeight : offsetY + grid.northSouthSquareCount * squareHeight);
      }
      for (let y = visibleTop; y <= visibleBottom; y += 1) {
        context.moveTo(isInfiniteTerrain() ? offsetX + visibleLeft * squareWidth : offsetX, offsetY + y * squareHeight);
        context.lineTo(isInfiniteTerrain() ? offsetX + visibleRight * squareWidth : offsetX + grid.eastWestSquareCount * squareWidth, offsetY + y * squareHeight);
      }
      context.globalAlpha = currentGridOpacity;
      context.stroke();
      context.globalAlpha = 1;

      context.globalAlpha = currentIndicatorOpacity;
      if (currentMap.playerPlacement?.defaultBounds) {
        const bounds = currentMap.playerPlacement.defaultBounds;
        const left = offsetX + bounds.west * squareWidth;
        const top = offsetY + (grid.northSouthSquareCount - 1 - bounds.north) * squareHeight;
        const zoneWidth = (bounds.east - bounds.west + 1) * squareWidth;
        const zoneHeight = (bounds.north - bounds.south + 1) * squareHeight;
        context.fillStyle = '#1976d2';
        context.fillRect(left, top, zoneWidth, zoneHeight);
        context.strokeStyle = '#1976d2';
        context.lineWidth = Math.max(2 / view.scale, 1);
        context.strokeRect(left, top, zoneWidth, zoneHeight);
      }

      if (!viewerIsReferee && currentPlayerPlacement) {
        const left = isInfiniteTerrain() ? offsetX + visibleLeft * squareWidth : offsetX;
        const right = isInfiniteTerrain() ? offsetX + visibleRight * squareWidth : offsetX + grid.eastWestSquareCount * squareWidth;
        const top = isInfiniteTerrain() ? offsetY + visibleTop * squareHeight : offsetY;
        const bottom = isInfiniteTerrain() ? offsetY + visibleBottom * squareHeight : offsetY + grid.northSouthSquareCount * squareHeight;
        const placementTop = offsetY + (grid.northSouthSquareCount - 1 - currentPlayerPlacement.north) * squareHeight;
        const placementBottom = offsetY + (grid.northSouthSquareCount - currentPlayerPlacement.south) * squareHeight;
        context.save();
        context.globalAlpha = 1;
        context.fillStyle = '#000';
        context.beginPath();
        context.rect(left, top, right - left, bottom - top);
        context.rect(
          offsetX + currentPlayerPlacement.west * squareWidth,
          placementTop,
          (currentPlayerPlacement.east - currentPlayerPlacement.west + 1) * squareWidth,
          placementBottom - placementTop
        );
        context.fill('evenodd');
        context.restore();
      }

      if (viewerIsReferee && currentPlayerPlacement) {
        const placementTop = offsetY + (grid.northSouthSquareCount - 1 - currentPlayerPlacement.north) * squareHeight;
        const placementBottom = offsetY + (grid.northSouthSquareCount - currentPlayerPlacement.south) * squareHeight;
        const placementLeft = offsetX + currentPlayerPlacement.west * squareWidth;
        const placementRight = offsetX + (currentPlayerPlacement.east + 1) * squareWidth;
        context.fillStyle = '#1976d2';
        context.fillRect(placementLeft, placementTop, placementRight - placementLeft, placementBottom - placementTop);
        context.strokeStyle = '#1976d2';
        context.lineWidth = Math.max(3 / view.scale, 1.5);
        context.strokeRect(placementLeft, placementTop, placementRight - placementLeft, placementBottom - placementTop);
      }

      const draft = placementDragStart && placementDragEnd
        ? placementBounds(placementDragStart, placementDragEnd)
        : null;
      if ((viewerIsReferee || allowPlacementEdit) && draft) {
        const draftTop = offsetY + (grid.northSouthSquareCount - 1 - draft.north) * squareHeight;
        const draftBottom = offsetY + (grid.northSouthSquareCount - draft.south) * squareHeight;
        context.fillStyle = '#1976d2';
        context.fillRect(
          offsetX + draft.west * squareWidth,
          draftTop,
          (draft.east - draft.west + 1) * squareWidth,
          draftBottom - draftTop
        );
        context.strokeStyle = '#1976d2';
        context.lineWidth = Math.max(3 / view.scale, 1.5);
        context.strokeRect(
          offsetX + draft.west * squareWidth,
          draftTop,
          (draft.east - draft.west + 1) * squareWidth,
          draftBottom - draftTop
        );
      }

      context.fillStyle = 'rgba(255, 255, 255, 0.62)';
      for (const tile of currentMap.blockedTiles || []) {
        const row = grid.northSouthSquareCount - 1 - tile.y;
        drawTileIcon(context, '🪨', offsetX + tile.x * squareWidth, offsetY + row * squareHeight, squareWidth, squareHeight);
      }

      // Wall and door edge markings are structural map features, not indicators.
      context.globalAlpha = 1;
      for (const edge of currentMap.edges || []) {
        if (!viewerIsReferee && currentPlayerPlacement && !edgeTouchesPlacementArea(edge, currentPlayerPlacement)) continue;
        const edgeX = offsetX + edge.x * squareWidth;
        const edgeY = offsetY + (grid.northSouthSquareCount - edge.y) * squareHeight;
        context.beginPath();
        context.lineWidth = Math.max(4 / view.scale, Math.min(squareWidth, squareHeight) * 0.085);
        context.lineCap = 'round';
        if (edge.type === 'wall') context.strokeStyle = '#28201d';
        else if (edge.type === 'secretDoor') context.strokeStyle = viewerIsReferee ? '#ff00ff' : '#28201d';
        else if (edge.type === 'door') context.strokeStyle = edge.initialState === 'open' ? '#a37735' : '#6b3e22';
        else if (edge.type === 'doorway') {
          context.strokeStyle = '#34a0a4';
          context.setLineDash([5 / view.scale, 4 / view.scale]);
        } else continue;
        if (edge.axis === 'vertical') {
          context.moveTo(edgeX, edgeY - squareHeight);
          context.lineTo(edgeX, edgeY);
        } else if (edge.axis === 'horizontal') {
          context.moveTo(edgeX, edgeY);
          context.lineTo(edgeX + squareWidth, edgeY);
        } else continue;
        context.stroke();
        context.setLineDash([]);
        if (edge.type === 'door') {
          context.fillStyle = '#f4dfb6';
          context.font = `bold ${Math.min(squareWidth, squareHeight) * 0.18}px sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(edge.initialState === 'open' ? '↗' : 'D', edge.axis === 'vertical' ? edgeX : edgeX + squareWidth / 2, edge.axis === 'vertical' ? edgeY - squareHeight / 2 : edgeY);
        }
      }

      context.globalAlpha = 1;
      for (const token of tokens) {
        if (!viewerIsReferee && (token.isHidden || (currentHideEnemyTokens && token.team === 'enemy'))) continue;
        const row = grid.northSouthSquareCount - 1 - token.y;
        const centerX = offsetX + (token.x + 0.5) * squareWidth;
        const centerY = offsetY + (row + 0.5) * squareHeight;
        const tokenColor = token.ownerId
          ? token.ownerId === viewerId
            ? '#1976d2'
            : '#2e8b57'
          : token.team === 'enemy'
            ? '#c62828'
            : token.team === 'player' || token.team === 'party'
              ? '#2e8b57'
              : '#555';
        if (token.id === selectedTokenId) {
          context.beginPath();
          context.strokeStyle = '#d4af37';
          context.lineWidth = Math.max(2 / view.scale, 1);
          context.arc(
            centerX,
            centerY,
            Math.min(squareWidth, squareHeight) * 0.52,
            0,
            Math.PI * 2
          );
          context.stroke();
        }
        const tokenLabel = token.tokenDescription || token.displayName;
        const firstGrapheme = (value) => graphemeSegmenter
          ? graphemeSegmenter.segment(value.trim())[Symbol.iterator]().next().value?.segment || ''
          : Array.from(value.trim())[0] || '';
        const initialsForName = (value) => value
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map(firstGrapheme)
          .join('');
        const numberedName = tokenLabel.match(/^(.+?)\s*\((\d+)\)$/);
        const initials = numberedName
          ? `${firstGrapheme(numberedName[1])}${numberedName[2]}`.toUpperCase()
          : initialsForName(tokenLabel).toUpperCase();
        const trimmedTokenLabel = tokenLabel.trim();
        const isKeycapEmoji = /^[0-9#*]\uFE0F?\u20E3$/u.test(trimmedTokenLabel);
        const isSingleEmoji = trimmedTokenLabel &&
          [...(graphemeSegmenter ? graphemeSegmenter.segment(trimmedTokenLabel) : trimmedTokenLabel)].length === 1 &&
          (isKeycapEmoji || /\p{Extended_Pictographic}/u.test(trimmedTokenLabel));
        if (isSingleEmoji) {
          const emojiBackgroundRadius = Math.min(squareWidth, squareHeight) * 0.46;
          context.save();
          context.beginPath();
          context.globalAlpha = 0.25;
          context.fillStyle = tokenColor;
          context.arc(centerX, centerY, emojiBackgroundRadius, 0, Math.PI * 2);
          context.fill();
          context.restore();
          context.beginPath();
          context.strokeStyle = tokenColor;
          context.lineWidth = Math.max(1.5 / view.scale, 0.75);
          context.arc(centerX, centerY, emojiBackgroundRadius, 0, Math.PI * 2);
          context.stroke();
          const emojiSize = Math.min(squareWidth, squareHeight) * 0.576;
          context.save();
          context.font = `${emojiSize}px system-ui, "Apple Color Emoji", sans-serif`;
          context.textAlign = 'left';
          context.textBaseline = 'alphabetic';
          const emojiOrigin = centeredTextOrigin(context, trimmedTokenLabel, centerX, centerY + emojiSize * emojiVerticalOffset);
          context.fillText(trimmedTokenLabel, emojiOrigin.x, emojiOrigin.y);
          context.restore();
        } else {
          const tokenBackgroundRadius = Math.min(squareWidth, squareHeight) * 0.46;
          context.save();
          context.beginPath();
          context.globalAlpha = 0.25;
          context.fillStyle = tokenColor;
          context.arc(centerX, centerY, tokenBackgroundRadius, 0, Math.PI * 2);
          context.fill();
          context.restore();
          context.beginPath();
          context.strokeStyle = tokenColor;
          context.lineWidth = Math.max(1.5 / view.scale, 0.75);
          context.arc(centerX, centerY, tokenBackgroundRadius, 0, Math.PI * 2);
          context.stroke();

          const initialFontSize = Math.min(squareWidth, squareHeight) * 0.544;
          context.font = `bold ${initialFontSize}px sans-serif`;
          const initialWidth = context.measureText(initials).width;
          const fittedFontSize = initialWidth > initialFontSize * 1.35
            ? initialFontSize * (initialFontSize * 1.35 / initialWidth)
            : initialFontSize;
          context.font = `bold ${fittedFontSize}px sans-serif`;
          context.fillStyle = '#000';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(initials, centerX, centerY + fittedFontSize * 0.12);
        }
      }
      context.restore();
    }

    function resize() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      fit();
    }

    function drawTileIcon(targetContext, icon, x, y, tileWidth, tileHeight) {
      const size = Math.min(tileWidth, tileHeight);
      const centered = icon === '🪨' || icon === '❌';
      const centerX = x + tileWidth * (centered ? 0.5 : 0.82);
      const centerY = y + tileHeight * (centered ? 0.5 : 0.82);
      targetContext.save();
      if (icon === '🪨') {
        targetContext.beginPath();
        targetContext.arc(centerX, centerY, size * 0.235, 0, Math.PI * 2);
        targetContext.fillStyle = 'rgba(255, 255, 255, 0.62)';
        targetContext.fill();
        targetContext.strokeStyle = 'rgba(255, 255, 255, .96)';
        targetContext.lineWidth = size * 0.035;
        targetContext.stroke();
      }
      targetContext.font = `${size * 0.31}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      targetContext.textAlign = 'center';
      targetContext.textBaseline = 'middle';
      targetContext.fillText(icon, centerX, centerY);
      targetContext.restore();
    }

    function mapPointAt(screenX, screenY) {
      const size = mapSize();
      const mapX = (screenX - view.x) / view.scale;
      const mapY = (screenY - view.y) / view.scale;
      const grid = currentMap.grid;
      const { squareWidth, squareHeight, offsetX, offsetY } = gridMetrics(size);
      const column = Math.floor((mapX - offsetX) / squareWidth);
      const row = Math.floor((mapY - offsetY) / squareHeight);
      if (!isInfiniteTerrain() && (column < 0 || column >= grid.eastWestSquareCount || row < 0 || row >= grid.northSouthSquareCount)) {
        return null;
      }
      return {
        x: column,
        y: grid.northSouthSquareCount - 1 - row
      };
    }

    function placementBounds(first, second) {
      return {
        west: Math.min(first.x, second.x),
        east: Math.max(first.x, second.x),
        south: Math.min(first.y, second.y),
        north: Math.max(first.y, second.y)
      };
    }

    function edgeTouchesPlacementArea(edge, bounds) {
      if (edge.axis === 'vertical') {
        return (edge.x - 1 >= bounds.west && edge.x - 1 <= bounds.east && edge.y >= bounds.south && edge.y <= bounds.north) ||
          (edge.x >= bounds.west && edge.x <= bounds.east && edge.y >= bounds.south && edge.y <= bounds.north);
      }
      if (edge.axis === 'horizontal') {
        return (edge.x >= bounds.west && edge.x <= bounds.east && edge.y - 1 >= bounds.south && edge.y - 1 <= bounds.north) ||
          (edge.x >= bounds.west && edge.x <= bounds.east && edge.y >= bounds.south && edge.y <= bounds.north);
      }
      return false;
    }

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      view.x = pointerX - (pointerX - view.x) * factor;
      view.y = pointerY - (pointerY - view.y) * factor;
      view.scale = Math.min(8, Math.max(0.15, view.scale * factor));
      draw();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (event) => {
      if (placementDrawMode && allowPlacementEdit) {
        const rect = canvas.getBoundingClientRect();
        placementDragStart = mapPointAt(event.clientX - rect.left, event.clientY - rect.top);
        placementDragEnd = placementDragStart;
        canvas.setPointerCapture(event.pointerId);
        draw();
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      tapStart = { x: event.clientX, y: event.clientY };
      tapMoved = false;

      if (pointers.size === 1) {
        dragging = true;
        lastPoint = { x: event.clientX, y: event.clientY };
      } else if (pointers.size === 2) {
        dragging = false;
        const [first, second] = [...pointers.values()];
        const center = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2
        };
        pinchStart = {
          distance: Math.hypot(first.x - second.x, first.y - second.y),
          scale: view.scale,
          worldX: (center.x - view.x) / view.scale,
          worldY: (center.y - view.y) / view.scale
        };
      }
    });
    canvas.addEventListener('pointermove', (event) => {
      if (placementDrawMode && placementDragStart && allowPlacementEdit) {
        const rect = canvas.getBoundingClientRect();
        placementDragEnd = mapPointAt(event.clientX - rect.left, event.clientY - rect.top) || placementDragEnd;
        draw();
        return;
      }
      if (!pointers.has(event.pointerId)) {
        if (!dragging) updateTooltip(event.clientX, event.clientY);
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (tapStart && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 16) {
        tapMoved = true;
        suppressNextClick = true;
      }

      if (pointers.size === 2 && pinchStart) {
        const [first, second] = [...pointers.values()];
        const center = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2
        };
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        view.scale = Math.min(8, Math.max(0.15, pinchStart.scale * distance / pinchStart.distance));
        view.x = center.x - pinchStart.worldX * view.scale;
        view.y = center.y - pinchStart.worldY * view.scale;
        draw();
      } else if (dragging) {
        view.x += event.clientX - lastPoint.x;
        view.y += event.clientY - lastPoint.y;
        lastPoint = { x: event.clientX, y: event.clientY };
        draw();
      }
    });
    function endPointer(event) {
      if (placementDrawMode && placementDragStart && allowPlacementEdit) {
        const bounds = placementBounds(placementDragStart, placementDragEnd || placementDragStart);
        placementDrawMode = false;
        placementDragStart = null;
        placementDragEnd = null;
        if (onPlayerPlacementSelect) onPlayerPlacementSelect(bounds);
        draw();
        return;
      }
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;
      dragging = pointers.size === 1;
      if (dragging) lastPoint = [...pointers.values()][0];
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('click', (event) => {
      if (ignoreNextClick) {
        ignoreNextClick = false;
        return;
      }
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      handleTap(event.clientX, event.clientY);
    });
    document.addEventListener('touchend', (event) => {
      if (!canvas.contains(event.target) || event.changedTouches.length !== 1 || tapMoved || !tapStart) return;
      const touch = event.changedTouches[0];
      ignoreNextClick = true;
      event.preventDefault();
      handleTap(touch.clientX, touch.clientY);
    }, { capture: true, passive: false });
    canvas.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      tapStart = { x: touch.clientX, y: touch.clientY };
      tapMoved = false;
    }, { passive: true });
    canvas.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 1 || !tapStart) return;
      const touch = event.touches[0];
      if (Math.hypot(touch.clientX - tapStart.x, touch.clientY - tapStart.y) > 16) {
        tapMoved = true;
        suppressNextClick = true;
      }
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => {
      if (tooltip) tooltip.hidden = true;
    });
    window.addEventListener('resize', resize);

    currentImage.addEventListener('load', () => {
      status.textContent = `${currentMap.grid.eastWestSquareCount} east-west × ${currentMap.grid.northSouthSquareCount} north-south squares`;
      resize();
    });
    if (currentImage.complete) resize();

    return {
      fit,
      zoomToToken,
      draw,
      mapPointAt,
      setSelectedToken(token) {
        selectedTokenId = token ? token.id : null;
        draw();
      },
      setPlayerPlacement(bounds) {
        currentPlayerPlacement = bounds || null;
        draw();
      },
      setHideEnemyTokens(hidden) {
        currentHideEnemyTokens = Boolean(hidden);
        draw();
      },
      setIndicatorOpacity(opacity) {
        currentIndicatorOpacity = clampOpacity(opacity, 0.25);
        draw();
      },
      setGridOpacity(opacity) {
        currentGridOpacity = clampOpacity(opacity, 0.6);
        draw();
      },
      setPlacementDrawMode(enabled) {
        placementDrawMode = Boolean(enabled && allowPlacementEdit);
        placementDragStart = null;
        placementDragEnd = null;
        canvas.style.cursor = placementDrawMode ? 'crosshair' : '';
        draw();
      },
      updateMap(newMap, newImage) {
        currentMap = newMap;
        currentImage = newImage;
        averageEdgeColorCache = null;
        selectedTokenId = null;
        currentImage.addEventListener('load', () => {
          status.textContent = `${currentMap.grid.eastWestSquareCount} east-west × ${currentMap.grid.northSouthSquareCount} north-south squares`;
          fit();
        }, { once: true });
        if (currentImage.complete) fit();
      }
    };
  }

  return { render };
})();
