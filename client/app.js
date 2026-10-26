import { CanvasEngine } from './components/canvas.js';
import { ToolbarManager } from './components/toolbar.js';
import { SidebarManager } from './components/sidebar.js';
import { AuthManager } from './components/auth.js';
import { Minimap } from './components/minimap.js';
import { safeHexColor } from './utils/color.js';
import { normalizeRoomId } from './utils/room.js';

const SERVER_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:5000'
  : 'https://holodraw.onrender.com';

class HoloDrawApp {
  constructor() {
    this.canvas = null;
    this.toolbar = null;
    this.sidebar = null;
    this.auth = null;
    this.minimap = null;
    this.socket = null;

    this.roomId = null;
    this.username = 'Anonymous';
    this.userColor = '#666';

    this.cursorElements = new Map();
    this.cursorUpdateTimer = null;
    this.lastCursorEmit = 0;

    this.autoSaveTimer = null;
    this.roomModalBound = false;
    this.knownStickyIds = new Set();
    this.authRecoveryAttempted = false;
    this.pendingRoomId = null;

    this.init();
  }

  async init() {
    this.auth = new AuthManager();
    const roomParam = new URLSearchParams(window.location.search).get('room');
    this.pendingRoomId = roomParam ? roomParam.trim().toLowerCase() : null;

    this.auth.onAuthChange = () => {
      this.enterApp();
    };

    const signedIn = await this.auth.restoreSession();
    if (signedIn) this.enterApp();
    else this.auth.show();

    this.setupGlobalListeners();
  }

  enterApp() {
    this.username = this.auth.getUsername();
    this.userColor = this.auth.getUserColor();
    document.getElementById('app').classList.remove('hidden');
    if (this.pendingRoomId && this.auth.user) {
      const roomId = this.pendingRoomId;
      this.pendingRoomId = null;
      this.joinRoom(roomId);
      return;
    }
    this.showRoomModal();
  }

  ensureSignedIn() {
    if (this.auth.user) return true;
    this.showToast('Sign in to create or join a board');
    this.auth.show();
    return false;
  }

  showRoomModal() {
    const modal = document.getElementById('room-modal');
    modal.classList.remove('hidden');
    if (this.roomModalBound) return;
    this.roomModalBound = true;

    document.getElementById('create-room-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('board-name-input').value || 'Untitled Board';
      modal.classList.add('hidden');
      this.createRoom(name);
    });

    document.getElementById('join-room-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const roomId = document.getElementById('room-id-input').value.trim();
      if (roomId) {
        modal.classList.add('hidden');
        this.joinRoom(roomId);
      }
    });
  }

  async createRoom(name) {
    if (!this.ensureSignedIn()) {
      this.showRoomModal();
      return;
    }
    try {
      const res = await this.auth.api('/boards', {
        method: 'POST',
        body: JSON.stringify({ name: typeof name === 'string' ? name : 'Untitled Board' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.roomId !== 'string') {
        this.showToast(data.error || 'Could not create board');
        this.showRoomModal();
        return;
      }
      this.roomId = data.roomId;
      this.startApp();
      this.connectSocket();
    } catch (err) {
      this.showToast('Could not create board');
      this.showRoomModal();
    }
  }

  async joinRoom(roomId) {
    if (!this.ensureSignedIn()) {
      this.showRoomModal();
      return;
    }
    const id = normalizeRoomId(roomId);
    if (!id) {
      this.showToast('Room codes are 32-character ids');
      this.showRoomModal();
      return;
    }
    try {
      const res = await this.auth.api(`/boards/${id}/join`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.showToast(data.error || 'Could not join board');
        this.showRoomModal();
        return;
      }
      this.roomId = typeof data.roomId === 'string' ? data.roomId : id;
      this.startApp();
      this.connectSocket();
    } catch (err) {
      this.showToast('Could not join board');
      this.showRoomModal();
    }
  }

  connectSocket() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(SERVER_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.authRecoveryAttempted = false;
      this.socket.emit('join-room', { roomId: this.roomId });
    });

    this.socket.on('connect_error', (err) => {
      const message = err && typeof err.message === 'string' ? err.message : '';
      if (message.includes('Authentication')) this.recoverSocketAuth();
    });

    this.socket.on('join-error', (data) => {
      const message = data && typeof data.error === 'string' ? data.error : 'Unable to join room';
      this.showToast(message);
    });

    this.socket.on('action-error', (data) => {
      const message = data && typeof data.error === 'string' ? data.error : 'Action failed';
      this.showToast(message);
    });

    this.socket.on('board-state', (data) => {
      if (!this.canvas) return;
      if (data.strokes) this.canvas.setStrokes(data.strokes);
      if (data.stickyNotes) {
        this.canvas.setStickyNotes(data.stickyNotes);
        this.knownStickyIds = new Set(data.stickyNotes.map((note) => note && note.id).filter(Boolean));
        this.renderStickyNotes();
      }
      if (data.users) {
        this.sidebar.updateUsers(data.users.map(u => ({ ...u, isMe: u.id === this.socket.id })));
      }
      if (this.toolbar) this.toolbar.updateUndoRedo();
    });

    this.socket.on('user-joined', (data) => {
      this.sidebar.addUser({ ...data, isMe: false });
      this.showToast(`${data.username} joined`);
    });

    this.socket.on('user-left', (userId) => {
      this.sidebar.removeUser(userId);
      this.removeCursor(userId);
    });

    this.socket.on('room-users', (users) => {
      this.sidebar.updateUsers(users.map(u => ({ ...u, isMe: u.id === this.socket.id })));
    });

    this.socket.on('draw', (data) => {
      this.canvas.addRemoteStroke(data);
      if (this.minimap) this.minimap.update();
    });

    this.socket.on('cursor-move', (data) => {
      this.updateRemoteCursor(data);
    });

    this.socket.on('cursor-remove', (userId) => {
      this.removeCursor(userId);
    });

    this.socket.on('undo', (data) => {
      this.canvas.undo();
      if (this.toolbar) this.toolbar.updateUndoRedo();
      if (this.minimap) this.minimap.update();
    });

    this.socket.on('redo', (data) => {
      this.canvas.redo();
      if (this.toolbar) this.toolbar.updateUndoRedo();
      if (this.minimap) this.minimap.update();
    });

    this.socket.on('clear-board', () => {
      this.canvas.clear();
      if (this.toolbar) this.toolbar.updateUndoRedo();
      if (this.minimap) this.minimap.update();
    });

    this.socket.on('sticky-note-add', (data) => {
      this.canvas.stickyNotes.push(data);
      this.renderStickyNotes();
    });

    this.socket.on('sticky-note-update', (data) => {
      const idx = this.canvas.stickyNotes.findIndex(n => n.id === data.id);
      if (idx >= 0) {
        this.canvas.stickyNotes[idx] = { ...this.canvas.stickyNotes[idx], ...data };
        this.renderStickyNotes();
      }
    });

    this.socket.on('sticky-note-delete', (data) => {
      this.canvas.stickyNotes = this.canvas.stickyNotes.filter(n => n.id !== data.id);
      this.renderStickyNotes();
    });

    this.socket.on('disconnect', () => {
      this.showToast('Disconnected from server. Reconnecting...');
    });
  }

  async recoverSocketAuth() {
    if (this.authRecoveryAttempted) return;
    this.authRecoveryAttempted = true;
    const ok = await this.auth.refreshSession();
    if (ok && this.socket && !this.socket.connected) {
      this.authRecoveryAttempted = false;
      this.socket.connect();
      return;
    }
    this.showToast('Session expired. Sign in again.');
    if (this.socket) this.socket.disconnect();
  }

  startApp() {
    document.getElementById('room-id-display').textContent = this.roomId;
    if (this.appStarted) return;
    this.appStarted = true;

    this.canvas = new CanvasEngine('canvas-container');
    this.toolbar = new ToolbarManager(this.canvas);
    this.sidebar = new SidebarManager(this.canvas);
    this.minimap = new Minimap(this.canvas);

    this.canvas.onChange = (stroke, action) => {
      if (this.socket && this.socket.connected) {
        if (action === 'draw' && stroke) {
          this.socket.emit('draw', stroke);
        } else if (action === 'undo' && stroke) {
          this.socket.emit('undo', { strokeId: stroke.timestamp });
        } else if (action === 'redo' && stroke) {
          this.socket.emit('redo', { strokeId: stroke.timestamp });
        } else if (action === 'clear') {
          this.socket.emit('clear-board');
        }
      }
      if (this.minimap) this.minimap.update();
      this.toolbar.updateUndoRedo();
      this.scheduleAutoSave();
    };

    this.canvas.onStickyNotesChange = (notes) => {
      this.emitNewStickyNotes(notes);
      this.renderStickyNotes();
      if (this.minimap) this.minimap.update();
      this.scheduleAutoSave();
    };

    this.setupCanvasCursorTracking();
    this.setupShareButton();
    this.setupStickyNotesRendering();

    this.sidebar.renderLayers();

    this.showToast(`Joined room ${this.roomId}`);
  }

  setupCanvasCursorTracking() {
    const container = document.getElementById('canvas-container');

    container.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - this.lastCursorEmit > 50) {
        this.lastCursorEmit = now;
        const rect = container.getBoundingClientRect();
        this.socket.emit('cursor-move', {
          x: (e.clientX - rect.left),
          y: (e.clientY - rect.top),
          color: this.userColor
        });
      }
    });
  }

  updateRemoteCursor(data) {
    if (!data || typeof data !== 'object') return;
    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const color = safeHexColor(data.color, '#666666');
    const username = typeof data.username === 'string' ? data.username.slice(0, 30) : '';
    let el = this.cursorElements.get(data.id);

    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '20');
      svg.setAttribute('viewBox', '0 0 16 20');
      svg.setAttribute('fill', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M2 1L14 12H8.5L7 18L5 12H2L2 1Z');
      path.setAttribute('stroke', 'rgba(0,0,0,0.3)');
      path.setAttribute('stroke-width', '0.5');
      svg.appendChild(path);

      const label = document.createElement('span');
      label.className = 'remote-label';
      el.append(svg, label);
      document.getElementById('cursors-layer').appendChild(el);
      this.cursorElements.set(data.id, el);
    }

    const path = el.querySelector('path');
    if (path) path.setAttribute('fill', color);
    const label = el.querySelector('.remote-label');
    if (label) {
      label.textContent = username;
      label.style.background = color;
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  removeCursor(userId) {
    const el = this.cursorElements.get(userId);
    if (el) {
      el.remove();
      this.cursorElements.delete(userId);
    }
  }

  emitNewStickyNotes(notes) {
    if (!this.knownStickyIds) this.knownStickyIds = new Set();
    for (const note of notes || []) {
      if (!note || typeof note.id !== 'string' || this.knownStickyIds.has(note.id)) continue;
      this.knownStickyIds.add(note.id);
      if (this.socket && this.socket.connected) this.socket.emit('sticky-note-add', note);
    }
  }

  renderStickyNotes() {
    const container = document.getElementById('sticky-notes-container');
    container.replaceChildren();

    for (const note of this.canvas.stickyNotes) {
      if (!note || typeof note.id !== 'string') continue;
      const x = Number(note.x);
      const y = Number(note.y);
      const width = Number(note.width);
      const height = Number(note.height);
      const el = document.createElement('div');
      el.className = 'sticky-note' + (this.canvas.selectedStickyNote === note.id ? ' selected' : '');
      el.style.left = `${Number.isFinite(x) ? x : 0}px`;
      el.style.top = `${Number.isFinite(y) ? y : 0}px`;
      el.style.width = `${Number.isFinite(width) ? width : 160}px`;
      el.style.height = `${Number.isFinite(height) ? height : 160}px`;
      el.style.background = safeHexColor(note.color, '#fff9c4');
      if (Number.isFinite(Number(note.zIndex))) el.style.zIndex = String(Math.trunc(Number(note.zIndex)));
      el.dataset.noteId = note.id;

      const header = document.createElement('div');
      header.className = 'sticky-note-header';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'sticky-note-delete';
      deleteBtn.dataset.noteId = note.id;
      deleteBtn.type = 'button';
      deleteBtn.textContent = '\u00d7';
      header.appendChild(deleteBtn);

      const body = document.createElement('div');
      body.className = 'sticky-note-body';
      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Type here...';
      textarea.dataset.noteId = note.id;
      textarea.value = typeof note.text === 'string' ? note.text : '';
      body.appendChild(textarea);
      el.append(header, body);

      let isDragging = false;
      let dragStartX, dragStartY, noteStartX, noteStartY;

      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.sticky-note-delete')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        noteStartX = note.x;
        noteStartY = note.y;
        el.style.cursor = 'grabbing';
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        note.x = noteStartX + dx;
        note.y = noteStartY + dy;
        el.style.left = note.x + 'px';
        el.style.top = note.y + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          el.style.cursor = 'move';
          if (this.socket && this.socket.connected) {
            this.socket.emit('sticky-note-update', { id: note.id, x: note.x, y: note.y });
          }
          this.scheduleAutoSave();
        }
      });

      textarea.addEventListener('focus', () => {
        this.canvas.selectedStickyNote = note.id;
        container.querySelectorAll('.sticky-note').forEach(n => n.classList.remove('selected'));
        el.classList.add('selected');
      });

      textarea.addEventListener('input', () => {
        note.text = textarea.value;
        if (this.socket && this.socket.connected) {
          this.socket.emit('sticky-note-update', { id: note.id, text: note.text });
        }
        this.scheduleAutoSave();
      });

      deleteBtn.addEventListener('click', () => {
        this.canvas.stickyNotes = this.canvas.stickyNotes.filter(n => n.id !== note.id);
        if (this.canvas.selectedStickyNote === note.id) this.canvas.selectedStickyNote = null;
        el.remove();
        this.knownStickyIds.delete(note.id);
        if (this.socket && this.socket.connected) {
          this.socket.emit('sticky-note-delete', { id: note.id });
        }
        this.scheduleAutoSave();
      });

      el.addEventListener('click', () => {
        this.canvas.selectedStickyNote = note.id;
        container.querySelectorAll('.sticky-note').forEach(n => n.classList.remove('selected'));
        el.classList.add('selected');
      });

      container.appendChild(el);
    }
  }

  setupStickyNotesRendering() {
    this.canvas.render = (() => {
      const originalRender = this.canvas.render.bind(this.canvas);
      return () => {
        originalRender();
        this.renderStickyNotes();
      };
    })();
  }

  setupShareButton() {
    document.getElementById('share-board-btn').addEventListener('click', () => {
      const modal = document.getElementById('share-modal');
      document.getElementById('share-room-id').textContent = this.roomId;
      document.getElementById('share-link-input').value = `${window.location.origin}${window.location.pathname}?room=${this.roomId}`;
      modal.classList.remove('hidden');
    });

    document.getElementById('share-modal-close').addEventListener('click', () => {
      document.getElementById('share-modal').classList.add('hidden');
    });

    document.getElementById('share-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomId);
      this.showToast('Room ID copied!');
    });

    document.getElementById('share-link-copy-btn').addEventListener('click', () => {
      const input = document.getElementById('share-link-input');
      input.select();
      navigator.clipboard.writeText(input.value);
      this.showToast('Link copied!');
    });

    document.getElementById('copy-room-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomId);
      this.showToast('Room ID copied!');
    });

    document.getElementById('share-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        document.getElementById('share-modal').classList.add('hidden');
      }
    });
  }

  setupGlobalListeners() {
    document.getElementById('room-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) return;
    });

    document.getElementById('auth-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) return;
    });
  }

  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('save-board', { action: 'auto_save' });
      }
    }, 3000);
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

const app = new HoloDrawApp();
