import { CanvasEngine } from './components/canvas.js';
import { ToolbarManager } from './components/toolbar.js';
import { SidebarManager } from './components/sidebar.js';
import { AuthManager } from './components/auth.js';
import { Minimap } from './components/minimap.js';

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

    this.init();
  }

  async init() {
    this.auth = new AuthManager();

    this.auth.onAuthChange = (user, isGuest) => {
      this.username = this.auth.getUsername();
      this.userColor = this.auth.getUserColor();
      document.getElementById('app').classList.remove('hidden');
      this.showRoomModal();
    };

    if (this.auth.isAuthenticated) {
      this.username = this.auth.getUsername();
      this.userColor = this.auth.getUserColor();
      document.getElementById('app').classList.remove('hidden');
      this.showRoomModal();
    } else {
      this.auth.show();
    }

    this.setupGlobalListeners();
  }

  showRoomModal() {
    const modal = document.getElementById('room-modal');
    modal.classList.remove('hidden');

    document.getElementById('create-room-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('board-name-input').value || 'Untitled Board';
      modal.classList.add('hidden');
      this.createRoom(name);
    });

    document.getElementById('join-room-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const roomId = document.getElementById('room-id-input').value.trim().toUpperCase();
      if (roomId) {
        modal.classList.add('hidden');
        this.joinRoom(roomId);
      }
    });
  }

  async createRoom(name) {
    this.roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.connectSocket();
    this.startApp();
  }

  async joinRoom(roomId) {
    this.roomId = roomId;
    this.connectSocket();
    this.startApp();
  }

  connectSocket() {
    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
      this.socket.emit('join-room', {
        roomId: this.roomId,
        username: this.username,
        userId: this.auth.getUserId(),
        color: this.userColor
      });
    });

    this.socket.on('board-state', (data) => {
      if (data.strokes) this.canvas.setStrokes(data.strokes);
      if (data.stickyNotes) {
        this.canvas.setStickyNotes(data.stickyNotes);
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

  startApp() {
    document.getElementById('room-id-display').textContent = this.roomId;

    this.canvas = new CanvasEngine('canvas-container');
    this.toolbar = new ToolbarManager(this.canvas);
    this.sidebar = new SidebarManager(this.canvas);
    this.minimap = new Minimap(this.canvas);

    this.canvas.onChange = (stroke, action) => {
      if (action === 'draw' && stroke) {
        this.socket.emit('draw', stroke);
      } else if (action === 'undo' && stroke) {
        this.socket.emit('undo', { strokeId: stroke.timestamp });
      } else if (action === 'redo' && stroke) {
        this.socket.emit('redo', { strokeId: stroke.timestamp });
      } else if (action === 'clear') {
        this.socket.emit('clear-board');
      }
      if (this.minimap) this.minimap.update();
      this.toolbar.updateUndoRedo();
      this.scheduleAutoSave();
    };

    this.canvas.onStickyNotesChange = (notes) => {
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
    let el = this.cursorElements.get(data.id);

    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';
      el.innerHTML = `
        <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
          <path d="M2 1L14 12H8.5L7 18L5 12H2L2 1Z" fill="${data.color || '#666'}" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/>
        </svg>
        <span class="remote-label">${data.username || ''}</span>
      `;
      document.getElementById('cursors-layer').appendChild(el);
      this.cursorElements.set(data.id, el);
    }

    el.style.transform = `translate(${data.x}px, ${data.y}px)`;

    const label = el.querySelector('.remote-label');
    if (label) {
      label.style.background = data.color || '#666';
    }
  }

  removeCursor(userId) {
    const el = this.cursorElements.get(userId);
    if (el) {
      el.remove();
      this.cursorElements.delete(userId);
    }
  }

  renderStickyNotes() {
    const container = document.getElementById('sticky-notes-container');
    container.innerHTML = '';

    for (const note of this.canvas.stickyNotes) {
      const el = document.createElement('div');
      el.className = 'sticky-note' + (this.canvas.selectedStickyNote === note.id ? ' selected' : '');
      el.style.left = note.x + 'px';
      el.style.top = note.y + 'px';
      el.style.width = note.width + 'px';
      el.style.height = note.height + 'px';
      el.style.background = note.color || '#fff9c4';
      el.style.zIndex = note.zIndex || 0;
      el.dataset.noteId = note.id;

      el.innerHTML = `
        <div class="sticky-note-header">
          <button class="sticky-note-delete" data-note-id="${note.id}">&times;</button>
        </div>
        <div class="sticky-note-body">
          <textarea placeholder="Type here..." data-note-id="${note.id}">${note.text || ''}</textarea>
        </div>
      `;

      const header = el.querySelector('.sticky-note-header');
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
          this.socket.emit('sticky-note-update', { id: note.id, x: note.x, y: note.y });
          this.scheduleAutoSave();
        }
      });

      const textarea = el.querySelector('textarea');
      textarea.addEventListener('focus', () => {
        this.canvas.selectedStickyNote = note.id;
        container.querySelectorAll('.sticky-note').forEach(n => n.classList.remove('selected'));
        el.classList.add('selected');
      });

      textarea.addEventListener('input', () => {
        note.text = textarea.value;
        this.socket.emit('sticky-note-update', { id: note.id, text: note.text });
        this.scheduleAutoSave();
      });

      const deleteBtn = el.querySelector('.sticky-note-delete');
      deleteBtn.addEventListener('click', () => {
        this.canvas.stickyNotes = this.canvas.stickyNotes.filter(n => n.id !== note.id);
        if (this.canvas.selectedStickyNote === note.id) this.canvas.selectedStickyNote = null;
        el.remove();
        this.socket.emit('sticky-note-delete', { id: note.id });
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
      this.socket.emit('save-board', {
        strokes: this.canvas.strokes,
        stickyNotes: this.canvas.stickyNotes,
        action: 'auto_save'
      });
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
