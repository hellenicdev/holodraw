export class SidebarManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.sidebar = document.getElementById('sidebar');
    this.sidebarToggle = document.getElementById('sidebar-toggle');
    this.userList = document.getElementById('user-list');
    this.userCount = document.getElementById('user-count');
    this.layersList = document.getElementById('layers-list');
    this.addLayerBtn = document.getElementById('add-layer-btn');
    this.exportPdfBtn = document.getElementById('export-pdf-btn');
    this.exportSvgBtn = document.getElementById('export-svg-btn');

    this.isCollapsed = false;
    this.users = [];

    this.setupEvents();
  }

  setupEvents() {
    this.sidebarToggle.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      this.sidebar.classList.toggle('collapsed', this.isCollapsed);
    });

    this.addLayerBtn.addEventListener('click', () => {
      const id = 'layer-' + Date.now();
      const name = `Layer ${this.canvas.layers.length + 1}`;
      const layer = { id, name, visible: true, locked: false, zIndex: this.canvas.layers.length };
      this.canvas.layers.push(layer);
      this.canvas.activeLayer = id;
      this.renderLayers();
    });

    this.exportPdfBtn.addEventListener('click', () => this.exportPDF());
    this.exportSvgBtn.addEventListener('click', () => this.exportSVG());
  }

  updateUsers(users) {
    this.users = users || [];
    this.userCount.textContent = this.users.length;

    this.userList.innerHTML = '';
    for (const user of this.users) {
      const li = document.createElement('li');
      li.className = 'user-list-item';
      li.innerHTML = `
        <span class="user-dot" style="background: ${user.color || '#666'}"></span>
        <span class="user-list-name">${user.username || 'Anonymous'}</span>
        ${user.isMe ? '<span class="user-list-me">You</span>' : ''}
      `;
      this.userList.appendChild(li);
    }
  }

  addUser(user) {
    this.users = this.users.filter(u => u.id !== user.id);
    this.users.push(user);
    this.updateUsers(this.users);
  }

  removeUser(userId) {
    this.users = this.users.filter(u => u.id !== userId);
    this.updateUsers(this.users);
  }

  renderLayers() {
    this.layersList.innerHTML = '';
    for (const layer of this.canvas.layers) {
      const li = document.createElement('li');
      li.className = 'layer-item' + (layer.id === this.canvas.activeLayer ? ' active' : '');
      li.innerHTML = `
        <button class="layer-visibility" data-layer-id="${layer.id}">
          ${layer.visible
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
          }
        </button>
        <span class="layer-name">${layer.name}</span>
        ${layer.locked ? '<span style="color:var(--text-muted)">🔒</span>' : ''}
      `;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.layer-visibility')) {
          layer.visible = !layer.visible;
          this.canvas.render();
          this.renderLayers();
          return;
        }
        this.canvas.activeLayer = layer.id;
        this.renderLayers();
      });
      this.layersList.appendChild(li);
    }
  }

  exportPDF() {
    const bounds = this.canvas.getStrokesForExport();
    if (!bounds) {
      this.showToast('Nothing to export');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = bounds.width * 2;
    canvas.height = bounds.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.translate(-bounds.minX, -bounds.minY);

    for (const stroke of this.canvas.strokes) {
      this.canvas.drawStroke(ctx, stroke);
    }

    const link = document.createElement('a');
    link.download = 'holodraw-export.pdf';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  exportSVG() {
    const bounds = this.canvas.getStrokesForExport();
    if (!bounds) {
      this.showToast('Nothing to export');
      return;
    }

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" width="${bounds.width}" height="${bounds.height}">`;

    for (const stroke of this.canvas.strokes) {
      if (stroke.type === 'pencil') {
        if (!stroke.points || stroke.points.length < 2) continue;
        const d = stroke.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        svgContent += `<path d="${d}" stroke="${stroke.color}" stroke-width="${stroke.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else if (stroke.type === 'rectangle') {
        svgContent += `<rect x="${stroke.x}" y="${stroke.y}" width="${stroke.width}" height="${stroke.height}" stroke="${stroke.color}" stroke-width="${stroke.strokeWidth}" fill="none"/>`;
      } else if (stroke.type === 'circle') {
        const cx = stroke.x + stroke.width / 2;
        const cy = stroke.y + stroke.height / 2;
        const rx = Math.abs(stroke.width) / 2;
        const ry = Math.abs(stroke.height) / 2;
        svgContent += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${stroke.color}" stroke-width="${stroke.strokeWidth}" fill="none"/>`;
      }
    }

    svgContent += '</svg>';

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'holodraw-export.svg';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}
