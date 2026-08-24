window.TacticalRender = (() => {
  function render({ canvas, map, image, status, tokens = [], viewerId, viewerIsReferee = false, tooltip, onTap }) {
    const context = canvas.getContext('2d');
    const grid = map.grid;
    const emojiTokenCache = new Map();
    const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;
    const view = { scale: 1, x: 0, y: 0 };
    let dragging = false;
    let lastPoint = null;
    const pointers = new Map();
    let pinchStart = null;
    let tapStart = null;
    let tapMoved = false;

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
      return { width: image.naturalWidth, height: image.naturalHeight };
    }

    function tokenAt(screenX, screenY) {
      const size = mapSize();
      const mapX = (screenX - view.x) / view.scale;
      const mapY = (screenY - view.y) / view.scale;
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

    function fit() {
      const size = mapSize();
      view.scale = Math.min(canvas.clientWidth / size.width, canvas.clientHeight / size.height) * 0.92;
      view.x = (canvas.clientWidth - size.width * view.scale) / 2;
      view.y = (canvas.clientHeight - size.height * view.scale) / 2;
      draw();
    }

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(view.x, view.y);
      context.scale(view.scale, view.scale);
      context.drawImage(image, 0, 0);

      const size = mapSize();
      const squareWidth = size.width / grid.eastWestSquareCount;
      const squareHeight = size.height / grid.northSouthSquareCount;

      context.strokeStyle = getComputedStyle(canvas).getPropertyValue('--tactical-grid').trim();
      context.lineWidth = Math.max(1 / view.scale, 0.7);
      context.beginPath();
      for (let x = 0; x <= grid.eastWestSquareCount; x += 1) {
        context.moveTo(x * squareWidth, 0);
        context.lineTo(x * squareWidth, size.height);
      }
      for (let y = 0; y <= grid.northSouthSquareCount; y += 1) {
        context.moveTo(0, y * squareHeight);
        context.lineTo(size.width, y * squareHeight);
      }
      context.stroke();

      context.fillStyle = 'rgba(0, 0, 0, 0.62)';
      for (const tile of map.blockedTiles || []) {
        const row = grid.northSouthSquareCount - 1 - tile.y;
        context.fillRect(tile.x * squareWidth, row * squareHeight, squareWidth, squareHeight);
      }

      for (const token of tokens) {
        if (token.isHidden && !viewerIsReferee) continue;
        const row = grid.northSouthSquareCount - 1 - token.y;
        const centerX = (token.x + 0.5) * squareWidth;
        const centerY = (row + 0.5) * squareHeight;
        const tokenColor = token.team === 'enemy'
          ? '#c62828'
          : token.ownerId === viewerId
            ? '#1976d2'
            : token.team === 'player' || token.team === 'party'
              ? '#2e8b57'
              : '#555';
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
      const squareWidth = size.width / grid.eastWestSquareCount;
      const squareHeight = size.height / grid.northSouthSquareCount;
      const column = Math.floor(mapX / squareWidth);
      const row = Math.floor(mapY / squareHeight);
      if (column < 0 || column >= grid.eastWestSquareCount || row < 0 || row >= grid.northSouthSquareCount) {
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
      if (tapStart && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 8) {
        tapMoved = true;
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
      if (pointers.size === 1 && !tapMoved && tapStart && onTap) {
        onTap(event.clientX, event.clientY);
      }
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;
      dragging = pointers.size === 1;
      if (dragging) lastPoint = [...pointers.values()][0];
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', () => {
      if (tooltip) tooltip.hidden = true;
    });
    window.addEventListener('resize', resize);

    image.addEventListener('load', () => {
      status.textContent = `${grid.eastWestSquareCount} east-west × ${grid.northSouthSquareCount} north-south squares`;
      resize();
    });
    if (image.complete) resize();

    return { fit, draw, mapPointAt };
  }

  return { render };
})();
