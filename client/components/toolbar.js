export class ToolbarManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.toolBtns = document.querySelectorAll('.tool-btn');
    this.colorPicker = document.getElementById('color-picker');
    this.strokeWidth = document.getElementById('stroke-width');
    this.strokeWidthLabel = document.getElementById('stroke-width-label');
    this.undoBtn = document.getElementById('undo-btn');
    this.redoBtn = document.getElementById('redo-btn');
    this.clearBtn = document.getElementById('clear-board-btn');
    this.exportPngBtn = document.getElementById('export-png-btn');
    this.zoomInBtn = document.getElementById('zoom-in-btn');
    this.zoomOutBtn = document.getElementById('zoom-out-btn');
    this.zoomResetBtn = document.getElementById('zoom-reset-btn');

    this.setupEvents();
  }

  setupEvents() {
    this.toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        this.canvas.setTool(tool);
      });
    });

    this.colorPicker.addEventListener('input', (e) => {
      this.canvas.setColor(e.target.value);
    });

    this.strokeWidth.addEventListener('input', (e) => {
      const val = e.target.value;
      this.strokeWidthLabel.textContent = val;
      this.canvas.setStrokeWidth(parseInt(val));
    });

    this.undoBtn.addEventListener('click', () => {
      const stroke = this.canvas.undo();
      if (stroke && this.canvas.onChange) {
        this.canvas.onChange(stroke, 'undo');
      }
      this.updateUndoRedo();
    });

    this.redoBtn.addEventListener('click', () => {
      const stroke = this.canvas.redo();
      if (stroke && this.canvas.onChange) {
        this.canvas.onChange(stroke, 'redo');
      }
      this.updateUndoRedo();
    });

    this.clearBtn.addEventListener('click', () => {
      if (confirm('Clear the entire board?')) {
        this.canvas.clear();
        if (this.canvas.onChange) this.canvas.onChange(null, 'clear');
        this.updateUndoRedo();
      }
    });

    this.exportPngBtn.addEventListener('click', () => {
      this.canvas.exportPNG();
    });

    this.zoomInBtn.addEventListener('click', () => this.canvas.zoomIn());
    this.zoomOutBtn.addEventListener('click', () => this.canvas.zoomOut());
    this.zoomResetBtn.addEventListener('click', () => this.canvas.zoomReset());

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redoBtn.click();
        } else {
          this.undoBtn.click();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        this.redoBtn.click();
      }

      if (e.key === 'v' || e.key === 'V') this.activateTool('select');
      if (e.key === 'p' || e.key === 'P') this.activateTool('pencil');
      if (e.key === 'r' || e.key === 'R') this.activateTool('rectangle');
      if (e.key === 'c' || e.key === 'C') this.activateTool('circle');
      if (e.key === 'e' || e.key === 'E') this.activateTool('eraser');
      if (e.key === 's' || e.key === 'S') this.activateTool('sticky');
      if (e.key === ' ') {
        e.preventDefault();
        this.activateTool('pan');
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.canvas.selectedStickyNote) {
          this.canvas.stickyNotes = this.canvas.stickyNotes.filter(
            n => n.id !== this.canvas.selectedStickyNote
          );
          this.canvas.selectedStickyNote = null;
          if (this.canvas.onStickyNotesChange) {
            this.canvas.onStickyNotesChange(this.canvas.stickyNotes);
          }
        }
      }
    });
  }

  activateTool(tool) {
    this.toolBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    this.canvas.setTool(tool);
  }

  updateUndoRedo() {
    this.undoBtn.disabled = this.canvas.undoStack.length === 0;
    this.redoBtn.disabled = this.canvas.redoStack.length === 0;
  }
}
