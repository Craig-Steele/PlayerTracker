window.TacticalRender = (() => {
  function render({ canvas, map, image, status }) {
    const context = canvas.getContext('2d');
    const grid = map.grid;
    const view = { scale: 1, x: 0, y: 0 };
    let dragging = false;
    let lastPoint = null;
    const pointers = new Map();
    let pinchStart = null;

    function mapSize() {
      return { width: image.naturalWidth, height: image.naturalHeight };
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
      context.restore();
    }

    function resize() {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      fit();
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
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

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
    window.addEventListener('resize', resize);

    image.addEventListener('load', () => {
      status.textContent = `${grid.eastWestSquareCount} east-west × ${grid.northSouthSquareCount} north-south squares`;
      resize();
    });
    if (image.complete) resize();

    return { fit, draw };
  }

  return { render };
})();
