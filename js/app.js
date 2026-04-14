// ============================================================
// app.js — Main application controller
// ============================================================

const app = {
  pages: {},          // pageName -> page model
  currentPage: null,  // current page model
  mode: 'view',       // 'view' or 'edit'
  project: null,      // TGM project data
  editor: null,       // Editor instance
  keypadTarget: null, // Current keypad target info

  // --- File Loading ---
  async loadFiles(fileList) {
    const tgdFiles = [];
    const tgmFiles = [];
    const imageFiles = [];

    for (const file of fileList) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.tgd')) tgdFiles.push(file);
      else if (name.endsWith('.tgm')) tgmFiles.push(file);
      else if (name.match(/\.(png|jpg|jpeg|gif|bmp)$/)) imageFiles.push(file);
    }

    // Load images first
    if (imageFiles.length > 0) {
      await imageStore.loadFromFiles(imageFiles);
      console.log('Loaded', imageStore.getLoadedCount(), 'images');
    }

    // Load TGM if present
    for (const file of tgmFiles) {
      const text = await this.readFileText(file);
      this.project = parseTGM(text);
      console.log('Loaded TGM:', this.project);
    }

    // Load TGD files
    for (const file of tgdFiles) {
      const text = await this.readFileText(file);
      const page = parseTGD(text, file.name);
      if (page) {
        this.pages[page.pageName] = page;
        this.registerPageVRs(page);
        console.log('Loaded page:', page.pageName, '(' + page.components.length + ' components)');
      }
    }

    this.rebuildTabs();
    this.updateVRPanel();

    // Navigate to startup page or first loaded page
    const startupPage = this.project ? this.project.startupPage : null;
    const firstPage = startupPage && this.pages[startupPage]
      ? startupPage
      : Object.keys(this.pages)[0];
    if (firstPage) this.navigateToPage(firstPage);
  },

  readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  // --- Page Navigation ---
  navigateToPage(pageName) {
    const page = this.pages[pageName];
    if (!page) {
      console.warn('Page not found:', pageName);
      return;
    }
    this.currentPage = page;
    const canvas = document.getElementById('hmi-canvas');
    renderPage(page, canvas);

    // Update tabs
    document.querySelectorAll('#tabbar .tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.page === pageName);
    });

    // Update status
    document.getElementById('status-page').textContent = page.pageName;
    document.getElementById('status-components').textContent = 'Components: ' + page.components.length;

    // Update component list
    this.updateCompList();

    // Re-attach editor if in edit mode
    if (this.editor && this.mode === 'edit') {
      this.editor.attach(canvas, page);
    }

    this.updateCanvasScale();
  },

  rebuildTabs() {
    const tabbar = document.getElementById('tabbar');
    tabbar.innerHTML = '';

    // Use project page order if available, otherwise sorted keys
    let pageNames;
    if (this.project && this.project.pages.length > 0) {
      pageNames = this.project.pages
        .map(f => f.replace(/\.TGD$/i, ''))
        .filter(n => this.pages[n]);
      // Add any pages not in project
      Object.keys(this.pages).forEach(n => {
        if (!pageNames.includes(n)) pageNames.push(n);
      });
    } else {
      pageNames = Object.keys(this.pages);
    }

    pageNames.forEach(name => {
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.textContent = name;
      tab.dataset.page = name;
      tab.addEventListener('click', () => this.navigateToPage(name));
      tabbar.appendChild(tab);
    });
  },

  // --- Mode Switching ---
  setMode(mode) {
    this.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const compList = document.getElementById('comp-list');
    const propPanel = document.getElementById('prop-panel');
    const palette = document.getElementById('palette');

    if (mode === 'edit') {
      compList.classList.add('visible');
      propPanel.classList.add('visible');
      palette.classList.add('visible');
      if (!this.editor) this.editor = new Editor();
      if (this.currentPage) {
        this.editor.attach(document.getElementById('hmi-canvas'), this.currentPage);
      }
    } else {
      compList.classList.remove('visible');
      propPanel.classList.remove('visible');
      palette.classList.remove('visible');
      if (this.editor) this.editor.detach();
    }
    this.updateCanvasScale();
  },

  // --- VR Registration ---
  registerPageVRs(page) {
    page.components.forEach(comp => {
      for (const [propName, prop] of Object.entries(comp.properties)) {
        if (prop.binding && prop.binding.mcsource) {
          const src = prop.binding.mcsource;
          // Register VR references
          const vrMatches = src.matchAll(/VR[:(](\d+)\)?/g);
          for (const m of vrMatches) {
            vrStore.registerVRUsage(parseInt(m[1]), comp.name + '.' + propName, page.pageName);
          }
        }
      }
    });
  },

  // --- VR Simulation Panel ---
  updateVRPanel() {
    const list = document.getElementById('vr-list');
    list.innerHTML = '';

    const indices = vrStore.getAllVRIndices();
    indices.forEach(idx => {
      const meta = vrStore.getVRMeta()[idx];
      const row = document.createElement('div');
      row.className = 'vr-row';
      row.dataset.vrIndex = idx;

      const label = document.createElement('span');
      label.className = 'vr-label';
      label.textContent = 'VR:' + idx;

      const input = document.createElement('input');
      input.className = 'vr-input';
      input.type = 'number';
      input.value = vrStore.getVR(idx);
      input.addEventListener('change', () => {
        vrStore.setVR(idx, parseFloat(input.value) || 0);
      });

      // Keep input updated when VR changes externally
      vrStore.subscribe('VR:' + idx, () => {
        input.value = vrStore.getVR(idx);
      });

      const desc = document.createElement('span');
      desc.className = 'vr-desc';
      desc.textContent = meta ? meta.desc : '';
      desc.title = meta ? [...meta.pages].join(', ') : '';

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(desc);
      list.appendChild(row);
    });
  },

  // --- Component List ---
  updateCompList() {
    const items = document.getElementById('comp-list-items');
    items.innerHTML = '';
    if (!this.currentPage) return;

    this.currentPage.components.forEach((comp, idx) => {
      if (comp.isPopup) return;
      const item = document.createElement('div');
      item.className = 'comp-item';
      item.dataset.compIndex = idx;

      const name = document.createElement('span');
      name.textContent = comp.name;
      const type = document.createElement('span');
      type.className = 'comp-type';
      type.textContent = comp.type.replace('TVB', '');

      item.appendChild(name);
      item.appendChild(type);

      item.addEventListener('click', () => {
        if (this.editor) {
          this.editor.selectComponent(idx);
        }
      });

      items.appendChild(item);
    });
  },

  // --- Canvas Scaling ---
  _zoomLevel: null,  // null = auto-fit, otherwise manual scale

  zoomIn() {
    const current = this._getCurrentScale();
    this._zoomLevel = Math.min(current + 0.1, 2.0);
    this.updateCanvasScale();
  },

  zoomOut() {
    const current = this._getCurrentScale();
    this._zoomLevel = Math.max(current - 0.1, 0.2);
    this.updateCanvasScale();
  },

  zoomFit() {
    this._zoomLevel = null;
    this.updateCanvasScale();
  },

  zoom100() {
    this._zoomLevel = 1.0;
    this.updateCanvasScale();
  },

  _getCurrentScale() {
    if (this._zoomLevel !== null) return this._zoomLevel;
    const area = document.getElementById('canvas-area');
    const aw = area.clientWidth - 20;
    const ah = area.clientHeight - 20;
    return Math.min(aw / 1024, ah / 600, 1.5);
  },

  updateCanvasScale() {
    const area = document.getElementById('canvas-area');
    const wrapper = document.getElementById('canvas-wrapper');
    const aw = area.clientWidth - 20;
    const ah = area.clientHeight - 20;

    let scale;
    if (this._zoomLevel !== null) {
      scale = this._zoomLevel;
    } else {
      scale = Math.min(aw / 1024, ah / 600, 1.5);
    }

    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = 'center center';

    // Set the wrapper's actual layout size to the scaled size so
    // flexbox centering works correctly in the overflow:auto container
    wrapper.style.width = 1024 + 'px';
    wrapper.style.height = 600 + 'px';
    wrapper.style.margin = 'auto';

    const pctStr = Math.round(scale * 100) + '%';
    document.getElementById('status-zoom').textContent = 'Zoom: ' + pctStr;
    document.getElementById('zoom-label').textContent = 'Zoom: ' + pctStr;
  },

  // --- Action Handling ---
  handleAction(actionStr, comp) {
    executeAction(actionStr, comp, this);
  },

  // --- Virtual Keypad ---
  showKeypad(type, targetName, sourceComp) {
    const overlay = document.getElementById('keypad-overlay');
    const display = document.getElementById('keypad-display');

    // Find the target component's binding
    let targetComp = sourceComp;
    if (targetName && this.currentPage) {
      targetComp = this.currentPage.components.find(c => c.name === targetName) || sourceComp;
    }

    const textBinding = targetComp ? getBinding(targetComp, 'Text') : null;
    const evaluator = textBinding ? parseBinding(textBinding.mcsource) : null;

    this.keypadTarget = {
      type: type,
      evaluator: evaluator,
      targetComp: targetComp
    };

    display.value = evaluator ? evaluator.evaluate(vrStore) : '';
    overlay.classList.add('visible');
    display.focus();
    display.select();
  },

  hideKeypad() {
    document.getElementById('keypad-overlay').classList.remove('visible');
    this.keypadTarget = null;
  },

  keypadInput(key) {
    const display = document.getElementById('keypad-display');
    switch (key) {
      case 'enter':
        if (this.keypadTarget && this.keypadTarget.evaluator && this.keypadTarget.evaluator.write) {
          const val = parseFloat(display.value) || 0;
          this.keypadTarget.evaluator.write(vrStore, val);
        }
        this.hideKeypad();
        break;
      case 'cancel':
        this.hideKeypad();
        break;
      case 'bksp':
        display.value = display.value.slice(0, -1);
        break;
      case 'clear':
        display.value = '';
        break;
      case 'sign':
        if (display.value.startsWith('-')) display.value = display.value.substring(1);
        else display.value = '-' + display.value;
        break;
      default:
        display.value += key;
    }
  },

  // --- Export ---
  exportCurrentPage() {
    if (!this.currentPage) return;
    const xml = serializePage(this.currentPage);
    this.downloadFile(this.currentPage.fileName, xml, 'text/xml');
  },

  exportAllPages() {
    Object.values(this.pages).forEach(page => {
      const xml = serializePage(page);
      this.downloadFile(page.fileName, xml, 'text/xml');
    });
  },

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};

// ============================================================
// Initialization — wire up all events
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // File input
  document.getElementById('file-input').addEventListener('change', (e) => {
    app.loadFiles(e.target.files);
  });
  document.getElementById('folder-input').addEventListener('change', (e) => {
    app.loadFiles(e.target.files);
  });

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => app.setMode(btn.dataset.mode));
  });

  // Export buttons
  document.getElementById('btn-export').addEventListener('click', () => app.exportCurrentPage());
  document.getElementById('btn-export-all').addEventListener('click', () => app.exportAllPages());

  // Zoom buttons
  document.getElementById('btn-zoom-in').addEventListener('click', () => app.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click', () => app.zoomOut());
  document.getElementById('btn-zoom-fit').addEventListener('click', () => app.zoomFit());
  document.getElementById('btn-zoom-100').addEventListener('click', () => app.zoom100());

  // Mouse wheel zoom on canvas
  document.getElementById('canvas-area').addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) app.zoomIn();
      else app.zoomOut();
    }
  }, { passive: false });

  // Keypad buttons
  document.querySelectorAll('#keypad .kp-btn').forEach(btn => {
    btn.addEventListener('click', () => app.keypadInput(btn.dataset.key));
  });

  // Keypad overlay click-to-close
  document.getElementById('keypad-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) app.hideKeypad();
  });

  // Keypad keyboard support
  document.getElementById('keypad-display').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') app.keypadInput('enter');
    else if (e.key === 'Escape') app.keypadInput('cancel');
  });

  // Panel header toggle
  document.querySelectorAll('.panel-header').forEach(header => {
    header.addEventListener('click', () => {
      const panel = document.getElementById(header.dataset.panel);
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
  });

  // VR filter
  document.getElementById('vr-filter').addEventListener('input', (e) => {
    const filter = e.target.value.toLowerCase();
    document.querySelectorAll('#vr-list .vr-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(filter) ? '' : 'none';
    });
  });

  // Drag and drop
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.getElementById('drop-zone').classList.add('visible');
  });
  document.body.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || !document.body.contains(e.relatedTarget)) {
      document.getElementById('drop-zone').classList.remove('visible');
    }
  });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('visible');
    if (e.dataTransfer.files.length > 0) {
      app.loadFiles(e.dataTransfer.files);
    }
  });

  // Window resize
  window.addEventListener('resize', () => app.updateCanvasScale());
  app.updateCanvasScale();
});
