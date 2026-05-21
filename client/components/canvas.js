export class CanvasEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.getElementById('whiteboard');
    this.ctx = this.canvas.getContext('2d');

    this.strokes = [];
    this.redoStack = [];

    this.currentTool = 'pencil';
    this.currentColor = '#6366f1';
    this.strokeWidth = 3;
    this.currentShape = null;
    this.isDrawing = false;
    this.lastPoint = null;

    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = null;
    this.panStartOffset = null;

    this.selectedStickyNote = null;
    this.stickyNotes = [];
    this.stickyNoteIdCounter = 0;

    this.selection = null;
    this.dragOffset = null;

    this.layers = [{ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, zIndex: 0 }];
    this.activeLayer = 'layer-1';

    this.undoStack = [];
    this.undoLimit = 50;

    this.onChange = null;
    this.onStickyNotesChange = null;

    this.setupCanvas();
    this.setupEvents();
    this.render();
  }

  setupCanvas() {
    const resize = () => {
      this.canvas.width = this.container.clientWidth;
      this.canvas.height = this.container.clientHeight;
      this.render();
    };
    window.addEventListener('resize', resize);
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(this.container);
    resize();
  }

  setupEvents() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panOffset.x) / this.zoom,
      y: (sy - this.panOffset.y) / this.zoom
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.panOffset.x,
      y: wy * this.zoom + this.panOffset.y
    };
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && this.currentTool === 'pan')) {
      this.isPanning = true;
      this.panStart = this.getPos(e);
      this.panStartOffset = { ...this.panOffset };
      this.canvas.classList.add('panning');
      return;
    }

    if (e.button !== 0) return;

    const pos = this.getPos(e);
    const world = this.screenToWorld(pos.x, pos.y);

    if (this.currentTool === 'select') {
      this.selection = { startX: world.x, startY: world.y, endX: world.x, endY: world.y };
      return;
    }

    if (this.currentTool === 'sticky') {
      const id = 'sn-' + (++this.stickyNoteIdCounter);
      const note = {
        id,
        x: world.x - 80,
        y: world.y - 80,
        text: '',
        color: '#fff9c4',
        width: 160,
        height: 160,
        zIndex: this.stickyNotes.length
      };
      this.stickyNotes.push(note);
      if (this.onStickyNotesChange) this.onStickyNotesChange(this.stickyNotes);
      return;
    }

    this.isDrawing = true;
    this.lastPoint = world;

    const stroke = {
      type: this.currentTool,
      points: [world],
      color: this.currentTool === 'eraser' ? 'rgba(0,0,0,0)' : this.currentColor,
      strokeWidth: this.currentTool === 'eraser' ? this.strokeWidth * 4 : this.strokeWidth,
      x: world.x,
      y: world.y,
      width: 0,
      height: 0,
      layer: this.activeLayer,
      timestamp: Date.now()
    };

    if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
      stroke.x = world.x;
      stroke.y = world.y;
      stroke.width = 0;
      stroke.height = 0;
    }

    this.currentShape = stroke;
  }

  onMouseMove(e) {
    const pos = this.getPos(e);
    const world = this.screenToWorld(pos.x, pos.y);

    if (this.isPanning) {
      this.panOffset.x = this.panStartOffset.x + (pos.x - this.panStart.x);
      this.panOffset.y = this.panStartOffset.y + (pos.y - this.panStart.y);
      this.render();
      return;
    }

    if (this.selection) {
      this.selection.endX = world.x;
      this.selection.endY = world.y;
      this.render();
      return;
    }

    if (!this.isDrawing || !this.currentShape) return;

    if (this.currentTool === 'pencil' || this.currentTool === 'eraser') {
      this.currentShape.points.push(world);
    } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
      this.currentShape.width = world.x - this.currentShape.x;
      this.currentShape.height = world.y - this.currentShape.y;
    }

    this.render();
    this.drawCurrentShape();
  }

  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.classList.remove('panning');
      return;
    }

    if (this.selection) {
      this.selection = null;
      return;
    }

    if (!this.isDrawing || !this.currentShape) return;

    this.isDrawing = false;

    if (this.currentTool === 'pencil' && this.currentShape.points.length < 2) {
      this.currentShape = null;
      return;
    }

    this.strokes.push(this.currentShape);
    this.undoStack.push(this.currentShape);
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    this.redoStack = [];

    const strokeData = { ...this.currentShape };
    this.currentShape = null;
    this.render();

    if (this.onChange) this.onChange(strokeData, 'draw');
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const me = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(me);
  }

  onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const me = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(me);
  }

  onTouchEnd(e) {
    e.preventDefault();
    const me = new MouseEvent('mouseup', {});
    this.canvas.dispatchEvent(me);
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const world = this.screenToWorld(mx, my);

      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(0.1, Math.min(5, this.zoom * (1 + delta)));

      this.panOffset.x = mx - world.x * newZoom;
      this.panOffset.y = my - world.y * newZoom;
      this.zoom = newZoom;

      this.updateZoomDisplay();
      this.render();
    } else {
      this.panOffset.x -= e.deltaX;
      this.panOffset.y -= e.deltaY;
      this.render();
    }
  }

  drawCurrentShape() {
    if (!this.currentShape) return;
    const ctx = this.ctx;

    if (this.currentShape.type === 'pencil' || this.currentShape.type === 'eraser') {
      if (this.currentShape.points.length < 2) return;
      ctx.beginPath();
      const p0 = this.currentShape.points[0];
      ctx.moveTo(
        p0.x * this.zoom + this.panOffset.x,
        p0.y * this.zoom + this.panOffset.y
      );
      for (let i = 1; i < this.currentShape.points.length; i++) {
        const p = this.currentShape.points[i];
        ctx.lineTo(
          p.x * this.zoom + this.panOffset.x,
          p.y * this.zoom + this.panOffset.y
        );
      }
      ctx.strokeStyle = this.currentShape.color;
      ctx.lineWidth = this.currentShape.strokeWidth * this.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (this.currentShape.type === 'rectangle') {
      ctx.strokeStyle = this.currentShape.color;
      ctx.lineWidth = this.currentShape.strokeWidth * this.zoom;
      ctx.strokeRect(
        this.currentShape.x * this.zoom + this.panOffset.x,
        this.currentShape.y * this.zoom + this.panOffset.y,
        this.currentShape.width * this.zoom,
        this.currentShape.height * this.zoom
      );
    } else if (this.currentShape.type === 'circle') {
      const cx = this.currentShape.x + this.currentShape.width / 2;
      const cy = this.currentShape.y + this.currentShape.height / 2;
      const rx = Math.abs(this.currentShape.width) / 2;
      const ry = Math.abs(this.currentShape.height) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx * this.zoom + this.panOffset.x,
        cy * this.zoom + this.panOffset.y,
        rx * this.zoom,
        ry * this.zoom,
        0, 0, Math.PI * 2
      );
      ctx.strokeStyle = this.currentShape.color;
      ctx.lineWidth = this.currentShape.strokeWidth * this.zoom;
      ctx.stroke();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.panOffset.x, this.panOffset.y);
    ctx.scale(this.zoom, this.zoom);

    this.drawGrid(ctx);

    for (const stroke of this.strokes) {
      this.drawStroke(ctx, stroke);
    }

    ctx.restore();

    this.drawCurrentShape();
  }

  drawGrid(ctx) {
    const gridSize = 40;
    const viewX = -this.panOffset.x / this.zoom;
    const viewY = -this.panOffset.y / this.zoom;
    const viewW = this.canvas.width / this.zoom;
    const viewH = this.canvas.height / this.zoom;

    const startX = Math.floor(viewX / gridSize) * gridSize;
    const startY = Math.floor(viewY / gridSize) * gridSize;
    const endX = viewX + viewW + gridSize;
    const endY = viewY + viewH + gridSize;

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1 / this.zoom;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, viewY);
      ctx.lineTo(x, viewY + viewH);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(viewX, y);
      ctx.lineTo(viewX + viewW, y);
    }
    ctx.stroke();
  }

  drawStroke(ctx, stroke) {
    if (!stroke) return;

    ctx.save();

    if (stroke.type === 'pencil' || stroke.type === 'eraser') {
      if (!stroke.points || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.strokeWidth || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (stroke.type === 'rectangle') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.strokeWidth || 3;
      ctx.strokeRect(stroke.x, stroke.y, stroke.width, stroke.height);
    } else if (stroke.type === 'circle') {
      const cx = stroke.x + stroke.width / 2;
      const cy = stroke.y + stroke.height / 2;
      const rx = Math.abs(stroke.width) / 2;
      const ry = Math.abs(stroke.height) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.strokeWidth || 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  addStroke(stroke) {
    this.strokes.push(stroke);
    this.undoStack.push(stroke);
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    this.redoStack = [];
    this.render();
  }

  addRemoteStroke(strokeData) {
    const stroke = { ...strokeData };
    this.strokes.push(stroke);
    this.render();
  }

  undo() {
    if (this.undoStack.length === 0) return null;
    const stroke = this.undoStack.pop();
    this.redoStack.push(stroke);

    this.strokes = this.strokes.filter(s => s !== stroke);
    this.render();
    return stroke;
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const stroke = this.redoStack.pop();
    this.undoStack.push(stroke);
    this.strokes.push(stroke);
    this.render();
    return stroke;
  }

  clear() {
    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.stickyNotes = [];
    this.render();
  }

  setStrokes(strokes) {
    this.strokes = strokes || [];
    this.undoStack = [...this.strokes];
    this.redoStack = [];
    this.render();
  }

  setStickyNotes(notes) {
    this.stickyNotes = notes || [];
  }

  setTool(tool) {
    this.currentTool = tool;
    this.canvas.classList.remove('eraser-mode');
    if (tool === 'eraser') this.canvas.classList.add('eraser-mode');
  }

  setColor(color) {
    this.currentColor = color;
  }

  setStrokeWidth(width) {
    this.strokeWidth = width;
  }

  setZoom(zoom) {
    this.zoom = Math.max(0.1, Math.min(5, zoom));
    this.updateZoomDisplay();
    this.render();
  }

  zoomIn() {
    this.setZoom(this.zoom * 1.2);
  }

  zoomOut() {
    this.setZoom(this.zoom / 1.2);
  }

  zoomReset() {
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.updateZoomDisplay();
    this.render();
  }

  updateZoomDisplay() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(this.zoom * 100) + '%';
  }

  getStrokesForExport() {
    if (this.strokes.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const s of this.strokes) {
      if (s.type === 'pencil' || s.type === 'eraser') {
        for (const p of s.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      } else {
        const x1 = Math.min(s.x, s.x + s.width);
        const x2 = Math.max(s.x, s.x + s.width);
        const y1 = Math.min(s.y, s.y + s.height);
        const y2 = Math.max(s.y, s.y + s.height);
        if (x1 < minX) minX = x1;
        if (y1 < minY) minY = y1;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
      }
    }

    const padding = 40;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    return { minX, minY, width, height };
  }

  exportPNG() {
    const bounds = this.getStrokesForExport();
    if (!bounds) return;

    const offscreen = document.createElement('canvas');
    const scale = 2;
    offscreen.width = bounds.width * scale;
    offscreen.height = bounds.height * scale;
    const offCtx = offscreen.getContext('2d');

    offCtx.fillStyle = '#0a0a1a';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    offCtx.scale(scale, scale);
    offCtx.translate(-bounds.minX, -bounds.minY);

    for (const stroke of this.strokes) {
      this.drawStroke(offCtx, stroke);
    }

    const link = document.createElement('a');
    link.download = 'holodraw-export.png';
    link.href = offscreen.toDataURL('image/png');
    link.click();
  }

  getCursorPosition() {
    return this.lastPoint;
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }
}
