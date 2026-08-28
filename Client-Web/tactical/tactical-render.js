window.TacticalRender = (() => {
  function render({ canvas, map, image, status, tokens = [], viewerId, viewerIsReferee = false, tooltip, onTap, onTokenSelect }) {
    const context = canvas.getContext('2d');
    let currentMap = map;
    let currentImage = image;
    const emojiTokenCache = new Map();
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
      const squareWidth = size.width / grid.eastWestSquareCount;
      const squareHeight = size.height / grid.northSouthSquareCount;
      return tokens.find((token) => {
        if (token.isHidden && !viewerIsReferee) return false;
        const row = grid.northSouthSquareCount - 1 - token.y;
        const centerX = (token.x + 0.5) * squareWidth;
        const centerY = (row + 0.5) * squareHeight;
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
      const squareWidth = size.width / grid.eastWestSquareCount;
      const squareHeight = size.height / grid.northSouthSquareCount;
      const row = grid.northSouthSquareCount - 1 - token.y;
      const centerX = (token.x + 0.5) * squareWidth;
      const centerY = (row + 0.5) * squareHeight;
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
      const squareWidth = size.width / grid.eastWestSquareCount;
      const squareHeight = size.height / grid.northSouthSquareCount;
      drawInfiniteBackground(size);
      context.drawImage(currentImage, 0, 0);

      context.strokeStyle = getComputedStyle(canvas).getPropertyValue('--tactical-grid').trim();
      context.lineWidth = Math.max(1 / view.scale, 0.7);
      context.beginPath();
      const visibleLeft = isInfiniteTerrain() ? Math.floor((-view.x) / view.scale / squareWidth) - 1 : 0;
      const visibleRight = isInfiniteTerrain() ? Math.ceil((canvas.clientWidth - view.x) / view.scale / squareWidth) + 1 : grid.eastWestSquareCount;
      const visibleTop = isInfiniteTerrain() ? Math.floor((-view.y) / view.scale / squareHeight) - 1 : 0;
      const visibleBottom = isInfiniteTerrain() ? Math.ceil((canvas.clientHeight - view.y) / view.scale / squareHeight) + 1 : grid.northSouthSquareCount;
      for (let x = visibleLeft; x <= visibleRight; x += 1) {
        context.moveTo(x * squareWidth, isInfiniteTerrain() ? visibleTop * squareHeight : 0);
        context.lineTo(x * squareWidth, isInfiniteTerrain() ? visibleBottom * squareHeight : size.height);
      }
      for (let y = visibleTop; y <= visibleBottom; y += 1) {
        context.moveTo(isInfiniteTerrain() ? visibleLeft * squareWidth : 0, y * squareHeight);
        context.lineTo(isInfiniteTerrain() ? visibleRight * squareWidth : size.width, y * squareHeight);
      }
      context.stroke();

      context.fillStyle = 'rgba(0, 0, 0, 0.62)';
      for (const tile of currentMap.blockedTiles || []) {
        const row = grid.northSouthSquareCount - 1 - tile.y;
        context.fillRect(tile.x * squareWidth, row * squareHeight, squareWidth, squareHeight);
      }

      for (const token of tokens) {
        if (token.isHidden && !viewerIsReferee) continue;
        const row = grid.northSouthSquareCount - 1 - token.y;
        const centerX = (token.x + 0.5) * squareWidth;
        const centerY = (row + 0.5) * squareHeight;
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
          context.lineWidth = Math.max(4 / view.scale, 2);
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
          context.beginPath();
          context.fillStyle = 'rgba(0, 0, 0, 0.5)';
          context.arc(centerX, centerY, emojiBackgroundRadius, 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.strokeStyle = tokenColor;
          context.lineWidth = Math.max(3 / view.scale, 1.5);
          context.arc(centerX, centerY, emojiBackgroundRadius, 0, Math.PI * 2);
          context.stroke();
          const emojiSize = Math.min(squareWidth, squareHeight) * 0.72;
          if (isKeycapEmoji) {
            context.save();
            context.font = `${emojiSize}px system-ui, "Apple Color Emoji", sans-serif`;
            context.textAlign = 'left';
            context.textBaseline = 'alphabetic';
            const emojiOrigin = centeredTextOrigin(context, trimmedTokenLabel, centerX, centerY);
            context.fillText(trimmedTokenLabel, emojiOrigin.x, emojiOrigin.y);
            context.restore();
            continue;
          }
          const cacheKey = `${tokenLabel}:${tokenColor}`;
          let emojiImage = emojiTokenCache.get(cacheKey);
          if (!emojiImage) {
            const emojiCanvas = document.createElement('canvas');
            emojiCanvas.width = 128;
            emojiCanvas.height = 128;
            const emojiContext = emojiCanvas.getContext('2d');
            emojiContext.font = '96px system-ui, "Apple Color Emoji", sans-serif';
            emojiContext.textAlign = 'left';
            emojiContext.textBaseline = 'alphabetic';
            const emojiOrigin = centeredTextOrigin(emojiContext, trimmedTokenLabel, 64, 64);
            emojiContext.fillText(trimmedTokenLabel, emojiOrigin.x, emojiOrigin.y);
            emojiContext.globalCompositeOperation = 'source-in';
            emojiContext.fillStyle = tokenColor;
            emojiContext.fillRect(0, 0, 128, 128);
            emojiImage = emojiCanvas;
            emojiTokenCache.set(cacheKey, emojiImage);
          }
          context.drawImage(emojiImage, centerX - emojiSize / 2, centerY - emojiSize / 2, emojiSize, emojiSize);
        } else {
          const tokenBackgroundRadius = Math.min(squareWidth, squareHeight) * 0.46;
          context.beginPath();
          context.fillStyle = 'rgba(0, 0, 0, 0.5)';
          context.arc(centerX, centerY, tokenBackgroundRadius, 0, Math.PI * 2);
          context.fill();
          context.beginPath();
          context.strokeStyle = tokenColor;
          context.lineWidth = Math.max(3 / view.scale, 1.5);
          context.arc(centerX, centerY, tokenBackgroundRadius, 0, Math.PI * 2);
          context.stroke();

          const initialFontSize = Math.min(squareWidth, squareHeight) * 0.68;
          context.font = `bold ${initialFontSize}px sans-serif`;
          const initialWidth = context.measureText(initials).width;
          const fittedFontSize = initialWidth > initialFontSize * 1.35
            ? initialFontSize * (initialFontSize * 1.35 / initialWidth)
            : initialFontSize;
          context.font = `bold ${fittedFontSize}px sans-serif`;
          context.fillStyle = tokenColor;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(initials, centerX, centerY);
        }
      }
      context.restore();
    }

    function resize() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      fit();
    }

    function mapPointAt(screenX, screenY) {
      const size = mapSize();
      const mapX = (screenX - view.x) / view.scale;
      const mapY = (screenY - view.y) / view.scale;
      const grid = currentMap.grid;
      const squareWidth = size.width / grid.eastWestSquareCount;
      const squareHeight = size.height / grid.northSouthSquareCount;
      const column = Math.floor(mapX / squareWidth);
      const row = Math.floor(mapY / squareHeight);
      if (!isInfiniteTerrain() && (column < 0 || column >= grid.eastWestSquareCount || row < 0 || row >= grid.northSouthSquareCount)) {
        return null;
      }
      return {
        x: column,
        y: grid.northSouthSquareCount - 1 - row
      };
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
