export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.minimapEl = document.getElementById('minimap');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.ctx = this.minimapCanvas.getContext('2d');
    this.toggleBtn = document.getElementById('minimap-toggle');

    this.isVisible = false;
    this.scale = 0.05;
    this.updateTimer = null;

    this.setupEvents();
  }

  setupEvents() {
    this.toggleBtn.addEventListener('click', () => {
      this.isVisible = !this.isVisible;
      this.minimapEl.classList.toggle('collapsed', !this.isVisible);
      if (this.isVisible) this.update();
    });

    this.minimapEl.addEventListener('click', (e) => {
      const rect = this.minimapEl.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;

      const worldW = this.canvas.canvas.width / this.canvas.zoom;
      const worldH = this.canvas.canvas.height / this.canvas.zoom;

      this.canvas.panOffset.x = -mx * worldW * this.canvas.zoom + this.canvas.canvas.width / 2;
      this.canvas.panOffset.y = -my * worldH * this.canvas.zoom + this.canvas.canvas.height / 2;
      this.canvas.render();
      this.update();
    });
  }

  update() {
    if (!this.isVisible) return;
    if (this.updateTimer) cancelAnimationFrame(this.updateTimer);
    this.updateTimer = requestAnimationFrame(() => this.draw());
  }

  draw() {
    const canvas = this.minimapCanvas;
    const w = canvas.width = this.minimapEl.clientWidth;
    const h = canvas.height = this.minimapEl.clientHeight;
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(10,10,26,0.9)';
    ctx.fillRect(0, 0, w, h);

    const allPoints = [];
    for (const stroke of this.canvas.strokes) {
      if (stroke.type === 'pencil' || stroke.type === 'eraser') {
        for (const p of stroke.points) {
          allPoints.push(p);
        }
      } else {
        allPoints.push({ x: stroke.x, y: stroke.y });
        allPoints.push({ x: stroke.x + stroke.width, y: stroke.y + stroke.height });
      }
    }

    if (allPoints.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const scaleX = w / worldW;
    const scaleY = h / worldH;
    const s = Math.min(scaleX, scaleY) * 0.9;

    const offsetX = (w - worldW * s) / 2 - minX * s;
    const offsetY = (h - worldH * s) / 2 - minY * s;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(s, s);

    for (const stroke of this.canvas.strokes) {
      ctx.beginPath();
      if (stroke.type === 'pencil' || stroke.type === 'eraser') {
        if (!stroke.points || stroke.points.length < 2) continue;
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, (stroke.strokeWidth || 3) * 0.5);
      } else if (stroke.type === 'rectangle') {
        ctx.rect(stroke.x, stroke.y, stroke.width, stroke.height);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, (stroke.strokeWidth || 3) * 0.5);
      } else if (stroke.type === 'circle') {
        const cx = stroke.x + stroke.width / 2;
        const cy = stroke.y + stroke.height / 2;
        const rx = Math.abs(stroke.width) / 2;
        const ry = Math.abs(stroke.height) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, (stroke.strokeWidth || 3) * 0.5);
      }
      ctx.stroke();
    }

    ctx.restore();

    const viewX = -this.canvas.panOffset.x / this.canvas.zoom;
    const viewY = -this.canvas.panOffset.y / this.canvas.zoom;
    const viewW2 = this.canvas.canvas.width / this.canvas.zoom;
    const viewH2 = this.canvas.canvas.height / this.canvas.zoom;

    ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      (viewX + minX) * s + offsetX,
      (viewY + minY) * s + offsetY,
      viewW2 * s,
      viewH2 * s
    );
  }
}
