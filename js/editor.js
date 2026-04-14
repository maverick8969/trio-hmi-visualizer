// ============================================================
// editor.js — Editor mode: select, drag, resize, property panel
// ============================================================

class Editor {
  constructor() {
    this.canvas = null;
    this.page = null;
    this.selectedIndex = -1;
    this.selectedComp = null;
    this.selectionOverlay = null;
    this.handles = [];
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = null;
    this.resizeHandle = null;
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  attach(canvas, page) {
    this.detach();
    this.canvas = canvas;
    this.page = page;
    canvas.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);
  }

  detach() {
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
    }
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);
    this.clearSelection();
    this.canvas = null;
    this.page = null;
  }

  selectComponent(index) {
    this.clearSelection();
    if (!this.page || index < 0 || index >= this.page.components.length) return;

    this.selectedIndex = index;
    this.selectedComp = this.page.components[index];

    // Highlight in component list
    document.querySelectorAll('#comp-list-items .comp-item').forEach((item, i) => {
      item.classList.toggle('selected', parseInt(item.dataset.compIndex) === index);
    });

    // Find the DOM element
    const el = this.canvas.querySelector(`[data-comp-name="${this.selectedComp.name}"]`);
    if (!el) return;

    // Create selection overlay
    this.selectionOverlay = document.createElement('div');
    this.selectionOverlay.className = 'editor-selection';
    this._updateOverlayPosition(el);
    this.canvas.appendChild(this.selectionOverlay);

    // Create resize handles
    const positions = [
      { cursor: 'nw-resize', x: -4, y: -4 },
      { cursor: 'n-resize',  x: 'center', y: -4 },
      { cursor: 'ne-resize', x: 'right', y: -4 },
      { cursor: 'w-resize',  x: -4, y: 'center' },
      { cursor: 'e-resize',  x: 'right', y: 'center' },
      { cursor: 'sw-resize', x: -4, y: 'bottom' },
      { cursor: 's-resize',  x: 'center', y: 'bottom' },
      { cursor: 'se-resize', x: 'right', y: 'bottom' },
    ];

    const rect = { l: parseInt(el.style.left), t: parseInt(el.style.top), w: parseInt(el.style.width), h: parseInt(el.style.height) };

    positions.forEach((pos, i) => {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.style.cursor = pos.cursor;
      handle.dataset.handleIndex = i;

      let hx = pos.x === 'center' ? rect.l + rect.w / 2 - 4 : pos.x === 'right' ? rect.l + rect.w - 4 : rect.l + pos.x;
      let hy = pos.y === 'center' ? rect.t + rect.h / 2 - 4 : pos.y === 'bottom' ? rect.t + rect.h - 4 : rect.t + pos.y;
      handle.style.left = hx + 'px';
      handle.style.top = hy + 'px';

      this.handles.push(handle);
      this.canvas.appendChild(handle);
    });

    // Update property panel
    this.updatePropertyPanel();
  }

  clearSelection() {
    if (this.selectionOverlay && this.selectionOverlay.parentNode) {
      this.selectionOverlay.parentNode.removeChild(this.selectionOverlay);
    }
    this.selectionOverlay = null;
    this.handles.forEach(h => { if (h.parentNode) h.parentNode.removeChild(h); });
    this.handles = [];
    this.selectedIndex = -1;
    this.selectedComp = null;

    document.querySelectorAll('#comp-list-items .comp-item').forEach(item => {
      item.classList.remove('selected');
    });
  }

  _updateOverlayPosition(el) {
    if (!this.selectionOverlay) return;
    this.selectionOverlay.style.left = (parseInt(el.style.left) - 2) + 'px';
    this.selectionOverlay.style.top = (parseInt(el.style.top) - 2) + 'px';
    this.selectionOverlay.style.width = (parseInt(el.style.width) + 4) + 'px';
    this.selectionOverlay.style.height = (parseInt(el.style.height) + 4) + 'px';
  }

  _onMouseDown(e) {
    if (!this.canvas || app.mode !== 'edit') return;

    // Check if clicking on a resize handle
    if (e.target.classList.contains('resize-handle')) {
      this.isResizing = true;
      this.resizeHandle = parseInt(e.target.dataset.handleIndex);
      this.dragStart = { x: e.clientX, y: e.clientY, comp: { ...this._getCompRect() } };
      e.preventDefault();
      return;
    }

    // Find clicked component
    const target = e.target.closest('.hmi-component');
    if (target && target.dataset.compName) {
      const idx = this.page.components.findIndex(c => c.name === target.dataset.compName);
      if (idx >= 0) {
        this.selectComponent(idx);
        // Start drag
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY, comp: { ...this._getCompRect() } };
        e.preventDefault();
      }
    } else {
      this.clearSelection();
    }
  }

  _onMouseMove(e) {
    if (!this.dragStart) return;

    // Get scale from canvas wrapper
    const wrapper = document.getElementById('canvas-wrapper');
    const transform = wrapper.style.transform;
    const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

    const dx = (e.clientX - this.dragStart.x) / scale;
    const dy = (e.clientY - this.dragStart.y) / scale;

    if (this.isDragging && this.selectedComp) {
      const newLeft = Math.round(this.dragStart.comp.left + dx);
      const newTop = Math.round(this.dragStart.comp.top + dy);
      this._setCompProp('Left', Math.max(0, newLeft));
      this._setCompProp('Top', Math.max(0, newTop));
      this._refreshSelectedElement();
    }

    if (this.isResizing && this.selectedComp) {
      const r = this.dragStart.comp;
      let newLeft = r.left, newTop = r.top, newWidth = r.width, newHeight = r.height;

      // Handle index: 0=NW, 1=N, 2=NE, 3=W, 4=E, 5=SW, 6=S, 7=SE
      switch (this.resizeHandle) {
        case 0: newLeft = r.left + dx; newTop = r.top + dy; newWidth = r.width - dx; newHeight = r.height - dy; break;
        case 1: newTop = r.top + dy; newHeight = r.height - dy; break;
        case 2: newTop = r.top + dy; newWidth = r.width + dx; newHeight = r.height - dy; break;
        case 3: newLeft = r.left + dx; newWidth = r.width - dx; break;
        case 4: newWidth = r.width + dx; break;
        case 5: newLeft = r.left + dx; newWidth = r.width - dx; newHeight = r.height + dy; break;
        case 6: newHeight = r.height + dy; break;
        case 7: newWidth = r.width + dx; newHeight = r.height + dy; break;
      }

      newWidth = Math.max(10, Math.round(newWidth));
      newHeight = Math.max(10, Math.round(newHeight));
      newLeft = Math.max(0, Math.round(newLeft));
      newTop = Math.max(0, Math.round(newTop));

      this._setCompProp('Left', newLeft);
      this._setCompProp('Top', newTop);
      this._setCompProp('Width', newWidth);
      this._setCompProp('Height', newHeight);
      this._refreshSelectedElement();
    }
  }

  _onMouseUp(e) {
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = null;
    this.resizeHandle = null;
    if (this.selectedComp) this.updatePropertyPanel();
  }

  _onKeyDown(e) {
    if (app.mode !== 'edit' || !this.selectedComp) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (confirm('Delete component "' + this.selectedComp.name + '"?')) {
        this.page.components.splice(this.selectedIndex, 1);
        this.clearSelection();
        app.navigateToPage(this.page.pageName); // Re-render
      }
    }
  }

  _getCompRect() {
    if (!this.selectedComp) return { left: 0, top: 0, width: 100, height: 28 };
    return {
      left: getProp(this.selectedComp, 'Left', 0),
      top: getProp(this.selectedComp, 'Top', 0),
      width: getProp(this.selectedComp, 'Width', 100),
      height: getProp(this.selectedComp, 'Height', 28)
    };
  }

  _setCompProp(name, value) {
    if (!this.selectedComp) return;
    if (this.selectedComp.properties[name]) {
      this.selectedComp.properties[name].value = value;
    } else {
      this.selectedComp.properties[name] = { name, typeName: 'System.Int32', value, rawValue: String(value), binding: null };
    }
  }

  _refreshSelectedElement() {
    if (!this.selectedComp || !this.canvas) return;
    const el = this.canvas.querySelector(`[data-comp-name="${this.selectedComp.name}"]`);
    if (el) {
      el.style.left = getProp(this.selectedComp, 'Left', 0) + 'px';
      el.style.top = getProp(this.selectedComp, 'Top', 0) + 'px';
      el.style.width = getProp(this.selectedComp, 'Width', 100) + 'px';
      el.style.height = getProp(this.selectedComp, 'Height', 28) + 'px';
      this._updateOverlayPosition(el);
      // Update handles too
      this._updateHandles();
    }
  }

  _updateHandles() {
    if (!this.selectedComp) return;
    const r = this._getCompRect();
    const positions = [
      { x: r.left - 4, y: r.top - 4 },
      { x: r.left + r.width / 2 - 4, y: r.top - 4 },
      { x: r.left + r.width - 4, y: r.top - 4 },
      { x: r.left - 4, y: r.top + r.height / 2 - 4 },
      { x: r.left + r.width - 4, y: r.top + r.height / 2 - 4 },
      { x: r.left - 4, y: r.top + r.height - 4 },
      { x: r.left + r.width / 2 - 4, y: r.top + r.height - 4 },
      { x: r.left + r.width - 4, y: r.top + r.height - 4 },
    ];
    this.handles.forEach((h, i) => {
      h.style.left = positions[i].x + 'px';
      h.style.top = positions[i].y + 'px';
    });
  }

  // --- Property Panel ---
  updatePropertyPanel() {
    const panel = document.getElementById('prop-panel');
    panel.innerHTML = '';
    if (!this.selectedComp) {
      panel.innerHTML = '<div style="padding:12px;color:#585b70;font-size:12px;">Select a component to edit properties</div>';
      return;
    }

    const comp = this.selectedComp;

    // Component info header
    const header = document.createElement('div');
    header.style.padding = '8px';
    header.style.borderBottom = '1px solid #313244';
    header.style.fontSize = '13px';
    header.innerHTML = `<strong>${comp.name}</strong> <span style="color:#a6adc8">(${comp.type.replace('TVB','')})</span>`;
    panel.appendChild(header);

    // Editable properties
    const editableProps = ['Name', 'Left', 'Top', 'Width', 'Height', 'Text', 'BackColor', 'ForeColor', 'Font', 'TextAlign', 'FormatType', 'FormatNumDP', 'MaxVal', 'MinVal', 'Visible', 'Checked', 'Thickness', 'Image', 'BorderStyle'];

    editableProps.forEach(propName => {
      const prop = comp.properties[propName];
      if (!prop) return;

      const row = document.createElement('div');
      row.className = 'prop-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'prop-name';
      nameEl.textContent = propName;

      const valueEl = document.createElement('span');
      valueEl.className = 'prop-value';

      let input;
      if (prop.typeName === 'System.Boolean') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = prop.value;
        input.addEventListener('change', () => {
          prop.value = input.checked;
          app.navigateToPage(this.page.pageName);
          setTimeout(() => this.selectComponent(this.selectedIndex), 50);
        });
      } else if (propName === 'TextAlign') {
        input = document.createElement('select');
        Object.keys(ALIGNMENT_MAP).forEach(a => {
          const opt = document.createElement('option');
          opt.value = a; opt.textContent = a;
          if (prop.value === a) opt.selected = true;
          input.appendChild(opt);
        });
        input.addEventListener('change', () => {
          prop.value = input.value;
          app.navigateToPage(this.page.pageName);
          setTimeout(() => this.selectComponent(this.selectedIndex), 50);
        });
      } else if (propName === 'FormatType') {
        input = document.createElement('select');
        ['FORMAT_TEXT', 'FORMAT_REAL', 'FORMAT_INTEGER'].forEach(f => {
          const opt = document.createElement('option');
          opt.value = f; opt.textContent = f;
          if (prop.value === f) opt.selected = true;
          input.appendChild(opt);
        });
        input.addEventListener('change', () => {
          prop.value = input.value;
          app.navigateToPage(this.page.pageName);
          setTimeout(() => this.selectComponent(this.selectedIndex), 50);
        });
      } else if (prop.typeName === 'System.Int32' || prop.typeName === 'System.Double') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = prop.value;
        input.addEventListener('change', () => {
          prop.value = prop.typeName === 'System.Int32' ? parseInt(input.value) || 0 : parseFloat(input.value) || 0;
          prop.rawValue = String(prop.value);
          this._refreshSelectedElement();
          this.updatePropertyPanel();
        });
      } else if (propName === 'BackColor' || propName === 'ForeColor') {
        input = document.createElement('input');
        input.type = 'text';
        input.value = prop.value;
        input.style.fontFamily = 'monospace';
        input.addEventListener('change', () => {
          prop.value = input.value;
          prop.rawValue = input.value;
          app.navigateToPage(this.page.pageName);
          setTimeout(() => this.selectComponent(this.selectedIndex), 50);
        });
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = prop.value;
        input.addEventListener('change', () => {
          prop.value = input.value;
          prop.rawValue = input.value;
          app.navigateToPage(this.page.pageName);
          setTimeout(() => this.selectComponent(this.selectedIndex), 50);
        });
      }

      valueEl.appendChild(input);
      row.appendChild(nameEl);
      row.appendChild(valueEl);

      // Show binding info
      if (prop.binding) {
        const bindEl = document.createElement('div');
        bindEl.className = 'prop-binding';
        bindEl.textContent = prop.binding.mcsource + ' (' + prop.binding.mode + ')';
        row.appendChild(bindEl);
      }

      panel.appendChild(row);
    });
  }
}

// --- Component Palette: create new component on drop ---
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#palette .palette-item').forEach(item => {
    item.addEventListener('click', () => {
      if (app.mode !== 'edit' || !app.currentPage) return;

      const type = item.dataset.type;
      const existing = app.currentPage.components.filter(c => c.type === type);
      const name = type.replace('TVB', '') + (existing.length + 1);

      const comp = {
        assembly: 'HMIClient',
        type: type,
        fullType: 'Trio.HMI.Controls.' + type,
        name: name,
        isPopup: false,
        properties: {
          'Name': { name: 'Name', typeName: 'System.String', value: name, rawValue: name, binding: null },
          'Left': { name: 'Left', typeName: 'System.Int32', value: 50, rawValue: '50', binding: null },
          'Top': { name: 'Top', typeName: 'System.Int32', value: 50, rawValue: '50', binding: null },
          'Width': { name: 'Width', typeName: 'System.Int32', value: 120, rawValue: '120', binding: null },
          'Height': { name: 'Height', typeName: 'System.Int32', value: 30, rawValue: '30', binding: null },
          'BackColor': { name: 'BackColor', typeName: 'System.Drawing.Color', value: '#FFF0F0F0', rawValue: '#FFF0F0F0', binding: null },
          'ForeColor': { name: 'ForeColor', typeName: 'System.Drawing.Color', value: '#FF000000', rawValue: '#FF000000', binding: null },
          'Font': { name: 'Font', typeName: 'System.Drawing.Font', value: 'DejaVu Sans:20:0', rawValue: 'DejaVu Sans:20:0', preserveSpace: true, binding: null },
        },
        events: [],
        _zIndex: app.currentPage.components.length
      };

      // Type-specific defaults
      if (type === 'TVBLabel' || type === 'TVBButton') {
        comp.properties['Text'] = { name: 'Text', typeName: 'System.String', value: name, rawValue: name, binding: null };
      }
      if (type === 'TVBTextBox') {
        comp.properties['Text'] = { name: 'Text', typeName: 'System.String', value: '', rawValue: '', binding: null };
        comp.properties['BorderStyle'] = { name: 'BorderStyle', typeName: 'System.Windows.Forms.BorderStyle', value: 'FixedSingle', rawValue: 'FixedSingle', binding: null };
        comp.properties['BackColor'].value = '#FFFFFFFF';
        comp.properties['BackColor'].rawValue = '#FFFFFFFF';
      }
      if (type === 'TVBCheckBox') {
        comp.properties['Text'] = { name: 'Text', typeName: 'System.String', value: 'CheckBox', rawValue: 'CheckBox', binding: null };
        comp.properties['Checked'] = { name: 'Checked', typeName: 'System.Boolean', value: false, rawValue: 'False', binding: null };
      }
      if (type === 'TVBButton') {
        comp.properties['Height'].value = 40;
        comp.properties['Height'].rawValue = '40';
      }
      if (type === 'TVBLine') {
        comp.properties['Thickness'] = { name: 'Thickness', typeName: 'System.Int32', value: 2, rawValue: '2', binding: null };
        comp.properties['Height'].value = 4;
        comp.properties['Height'].rawValue = '4';
        comp.properties['Width'].value = 200;
        comp.properties['Width'].rawValue = '200';
      }

      app.currentPage.components.push(comp);
      app.navigateToPage(app.currentPage.pageName);

      if (app.editor) {
        setTimeout(() => app.editor.selectComponent(app.currentPage.components.length - 1), 50);
      }
    });
  });
});
