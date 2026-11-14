// ============================================================
// renderers.js — Component rendering engine
// ============================================================

// Track active bindings for cleanup
let activeBindings = [];

function clearBindings() {
  activeBindings.forEach(b => { if (b && b.unsubscribe) b.unsubscribe(); });
  activeBindings = [];
}

/**
 * Render a full page onto the HMI canvas.
 *
 * Z-order uses type-based layering to handle the mixed ordering patterns
 * found across TGD files:
 *   Layer 0 (back):   TVBRectangle — background panels and indicators
 *   Layer 1 (middle): TVBLine — decorative separators
 *   Layer 2 (front):  Everything else — Labels, TextBoxes, Buttons, etc.
 *
 * Within each layer, first-in-file = highest z-index (frontmost).
 * This ensures background rectangles never cover content elements
 * regardless of where they appear in the XML document order.
 */
function renderPage(page, canvas) {
  clearBindings();
  canvas.innerHTML = '';
  canvas.style.backgroundColor = tgdColorToCSS(page.backColor);
  canvas.style.width = page.width + 'px';
  canvas.style.height = page.height + 'px';

  const total = page.components.length;
  page.components.forEach((comp, idx) => {
    if (comp.isPopup) return;
    // Type-based layer offsets ensure rectangles < lines < content
    let layerBase;
    if (comp.type === 'TVBRectangle') layerBase = 0;
    else if (comp.type === 'TVBLine') layerBase = 1000;
    else layerBase = 2000;
    const zIndex = layerBase + (total - idx);
    const el = renderComponent(comp, zIndex);
    if (el) canvas.appendChild(el);
  });
}

/**
 * Render a single component and return its DOM element.
 */
function renderComponent(comp, zIndex) {
  const type = comp.type;
  let el;

  switch (type) {
    case 'TVBLabel':      el = renderLabel(comp); break;
    case 'TVBTextBox':    el = renderTextBox(comp); break;
    case 'TVBButton':     el = renderButton(comp); break;
    case 'TVBCheckBox':   el = renderCheckBox(comp); break;
    case 'TVBPictureBox': el = renderPictureBox(comp); break;
    case 'TVBRectangle':  el = renderRectangle(comp); break;
    case 'TVBLine':       el = renderLine(comp); break;
    case 'TVBDataGrid':   el = renderDataGrid(comp); break;
    case 'TVBVirtKeyBoard': return null; // Rendered as popup
    default:
      el = document.createElement('div');
      el.textContent = '[' + type + ']';
      el.style.border = '1px dashed #888';
      el.style.fontSize = '10px';
      el.style.color = '#888';
  }

  // Apply common positioning
  applyCommonProps(el, comp, zIndex);
  el._comp = comp;
  el.dataset.compName = comp.name;
  el.dataset.compType = comp.type;

  return el;
}

/**
 * Apply common properties: position, size, visibility, z-index.
 */
function applyCommonProps(el, comp, zIndex) {
  el.className = 'hmi-component ' + (el.className || '');
  el.style.position = 'absolute';
  el.style.left = getProp(comp, 'Left', 0) + 'px';
  el.style.top = getProp(comp, 'Top', 0) + 'px';
  el.style.width = getProp(comp, 'Width', 100) + 'px';
  el.style.height = getProp(comp, 'Height', 28) + 'px';
  el.style.zIndex = zIndex || 0;

  // Visibility
  const visible = getProp(comp, 'Visible', true);
  const visBinding = getBinding(comp, 'Visible');
  if (!visible && !visBinding) {
    el.style.display = 'none';
  }
  if (visBinding) {
    const b = setupBinding(visBinding, vrStore, (val) => {
      el.style.display = val ? '' : 'none';
    });
    if (b) activeBindings.push(b);
  }

  // Left binding (for animated position)
  const leftBinding = getBinding(comp, 'Left');
  if (leftBinding) {
    const b = setupBinding(leftBinding, vrStore, (val) => {
      el.style.left = val + 'px';
    });
    if (b) activeBindings.push(b);
  }

  // Top binding
  const topBinding = getBinding(comp, 'Top');
  if (topBinding) {
    const b = setupBinding(topBinding, vrStore, (val) => {
      el.style.top = val + 'px';
    });
    if (b) activeBindings.push(b);
  }

  // Width binding
  const widthBinding = getBinding(comp, 'Width');
  if (widthBinding) {
    const b = setupBinding(widthBinding, vrStore, (val) => {
      el.style.width = val + 'px';
    });
    if (b) activeBindings.push(b);
  }

  // Height binding
  const heightBinding = getBinding(comp, 'Height');
  if (heightBinding) {
    const b = setupBinding(heightBinding, vrStore, (val) => {
      el.style.height = val + 'px';
    });
    if (b) activeBindings.push(b);
  }
}

// ---- Component Renderers ----

function renderLabel(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-label';

  const text = getProp(comp, 'Text', '');
  const backColor = getProp(comp, 'BackColor', '#00000000');
  const foreColor = getProp(comp, 'ForeColor', '#FF000000');
  const font = getProp(comp, 'Font', 'DejaVu Sans:20:0');
  const textAlign = getProp(comp, 'TextAlign', 'TopLeft');
  const formatType = getProp(comp, 'FormatType', 'FORMAT_TEXT');
  const formatNumDP = getProp(comp, 'FormatNumDP', 2);
  const formatWidth = getProp(comp, 'FormatWidth', 0);

  el.style.backgroundColor = tgdColorToCSS(backColor);
  el.style.color = tgdColorToCSS(foreColor);
  applyFont(el, font);
  applyAlignment(el, textAlign);

  // Display text
  const span = document.createElement('span');
  span.textContent = (formatType !== 'FORMAT_TEXT') ? formatValue(text, formatType, formatNumDP, formatWidth) : text;
  el.appendChild(span);

  // Text binding
  const textBinding = getBinding(comp, 'Text');
  if (textBinding) {
    const b = setupBinding(textBinding, vrStore, (val) => {
      span.textContent = (formatType !== 'FORMAT_TEXT') ? formatValue(val, formatType, formatNumDP, formatWidth) : String(val);
    });
    if (b) activeBindings.push(b);
  }

  // BackColor binding
  const bgBinding = getBinding(comp, 'BackColor');
  if (bgBinding) {
    const b = setupBinding(bgBinding, vrStore, (val) => {
      el.style.backgroundColor = typeof val === 'string' && val.startsWith('#') ? tgdColorToCSS(val) : tgdColorToCSS('#FF' + val);
    });
    if (b) activeBindings.push(b);
  }

  // ForeColor binding
  const fgBinding = getBinding(comp, 'ForeColor');
  if (fgBinding) {
    const b = setupBinding(fgBinding, vrStore, (val) => {
      el.style.color = typeof val === 'string' && val.startsWith('#') ? tgdColorToCSS(val) : val;
    });
    if (b) activeBindings.push(b);
  }

  return el;
}

function renderTextBox(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-textbox';

  const text = getProp(comp, 'Text', '');
  const backColor = getProp(comp, 'BackColor', '#FFFFFFFF');
  const foreColor = getProp(comp, 'ForeColor', '#FF000000');
  const font = getProp(comp, 'Font', 'DejaVu Sans:20:0');
  const hAlign = getProp(comp, 'TextAlign', 'Left');
  const formatType = getProp(comp, 'FormatType', 'FORMAT_TEXT');
  const formatNumDP = getProp(comp, 'FormatNumDP', 2);
  const formatWidth = getProp(comp, 'FormatWidth', 0);
  const borderStyle = getProp(comp, 'BorderStyle', 'FixedSingle');

  el.style.backgroundColor = tgdColorToCSS(backColor);
  el.style.color = tgdColorToCSS(foreColor);
  applyFont(el, font);
  applyHAlign(el, hAlign);

  if (borderStyle === 'None') el.style.border = 'none';

  const span = document.createElement('span');
  span.style.flex = '1';
  span.style.textAlign = el.style.textAlign;
  span.textContent = (formatType !== 'FORMAT_TEXT') ? formatValue(text, formatType, formatNumDP, formatWidth) : text;
  el.appendChild(span);

  // Text binding
  const textBinding = getBinding(comp, 'Text');
  if (textBinding) {
    const b = setupBinding(textBinding, vrStore, (val) => {
      span.textContent = (formatType !== 'FORMAT_TEXT') ? formatValue(val, formatType, formatNumDP, formatWidth) : String(val);
    });
    if (b) activeBindings.push(b);

    // If ReadWrite, make clickable for editing
    if (textBinding.mode === 'ReadWrite') {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (typeof app !== 'undefined' && app.mode === 'edit') return;
        // Check for OpenKeyPad events
        const kpAction = comp.events.find(e => e.name === 'Click' && e.actions.some(a => a.startsWith('OpenKeyPad')));
        if (kpAction && typeof app !== 'undefined') {
          const action = kpAction.actions.find(a => a.startsWith('OpenKeyPad'));
          app.handleAction(action, comp);
        } else if (typeof app !== 'undefined' && app.showKeypad && b.evaluator && b.evaluator.write) {
          app.showKeypad('Numeric', comp.name, comp);
        } else if (b.evaluator && b.evaluator.write) {
          const current = b.evaluator.evaluate(vrStore);
          const val = prompt('Enter value:', current);
          if (val !== null) b.evaluator.write(vrStore, parseFloat(val) || 0);
        }
      });
    }
  }

  return el;
}

function renderButton(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-button';

  const text = getProp(comp, 'Text', '');
  const backColor = getProp(comp, 'BackColor', '#FFF0F0F0');
  const foreColor = getProp(comp, 'ForeColor', '#FF000000');
  const font = getProp(comp, 'Font', 'DejaVu Sans:20:0');
  const image = getProp(comp, 'Image', null);
  const smartStretch = getProp(comp, 'ImageSmartStretch', true);

  el.style.backgroundColor = tgdColorToCSS(backColor);
  el.style.color = tgdColorToCSS(foreColor);
  applyFont(el, font);

  // Image inside button
  if (image && imageStore.hasImage(image)) {
    const img = document.createElement('img');
    img.src = imageStore.getImageUrl(image);
    if (smartStretch) {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
    }
    el.appendChild(img);
  }

  // Text
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
  }

  // Text binding
  const textBinding = getBinding(comp, 'Text');
  if (textBinding) {
    const b = setupBinding(textBinding, vrStore, (val) => {
      const span = el.querySelector('span') || document.createElement('span');
      span.textContent = String(val);
      if (!span.parentNode) el.appendChild(span);
    });
    if (b) activeBindings.push(b);
  }

  // BackColor binding
  const bgBinding = getBinding(comp, 'BackColor');
  if (bgBinding) {
    const b = setupBinding(bgBinding, vrStore, (val) => {
      if (typeof val === 'number') {
        // Color as integer — convert to hex
        const hex = (val >>> 0).toString(16).padStart(8, '0').toUpperCase();
        el.style.backgroundColor = tgdColorToCSS('#' + hex);
      } else if (typeof val === 'string' && val.startsWith('#')) {
        el.style.backgroundColor = tgdColorToCSS(val);
      }
    });
    if (b) activeBindings.push(b);
  }

  // Event handlers
  comp.events.forEach(evt => {
    const eventName = evt.name === 'Click' ? 'click' : evt.name === 'ButtonDown' ? 'mousedown' : evt.name === 'ButtonUp' ? 'mouseup' : null;
    if (eventName) {
      el.addEventListener(eventName, (e) => {
        if (typeof app !== 'undefined' && app.mode !== 'edit') {
          evt.actions.forEach(action => app.handleAction(action, comp));
        }
      });
    }
  });

  return el;
}

function renderCheckBox(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-checkbox';

  const checked = getProp(comp, 'Checked', false);
  const text = getProp(comp, 'Text', '');
  const backColor = getProp(comp, 'BackColor', '#00000000');
  const foreColor = getProp(comp, 'ForeColor', '#FF000000');
  const font = getProp(comp, 'Font', 'DejaVu Sans:20:0');

  el.style.backgroundColor = tgdColorToCSS(backColor);
  el.style.color = tgdColorToCSS(foreColor);
  applyFont(el, font);

  const box = document.createElement('div');
  box.className = 'cb-box' + (checked ? ' checked' : '');
  el.appendChild(box);

  const label = document.createElement('span');
  label.textContent = text;
  el.appendChild(label);

  // Checked binding
  const checkedBinding = getBinding(comp, 'Checked');
  if (checkedBinding) {
    const b = setupBinding(checkedBinding, vrStore, (val) => {
      box.className = 'cb-box' + (val ? ' checked' : '');
    });
    if (b) activeBindings.push(b);

    if (checkedBinding.mode === 'ReadWrite') {
      el.addEventListener('click', () => {
        if (typeof app !== 'undefined' && app.mode !== 'edit' && b.evaluator && b.evaluator.write) {
          const current = b.evaluator.evaluate(vrStore);
          b.evaluator.write(vrStore, current ? 0 : 1);
        }
      });
    }
  } else {
    el.addEventListener('click', () => {
      if (typeof app !== 'undefined' && app.mode !== 'edit') {
        box.classList.toggle('checked');
      }
    });
  }

  return el;
}

function renderPictureBox(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-picturebox';

  const imageName = getProp(comp, 'Image', '');
  const imageList = getProp(comp, 'ImageList', null);
  const status = getProp(comp, 'Status', 0);
  const backColor = getProp(comp, 'BackColor', '#00000000');
  const smartStretch = getProp(comp, 'ImageSmartStretch', true);

  el.style.backgroundColor = tgdColorToCSS(backColor);

  const img = document.createElement('img');
  img.className = smartStretch ? 'smart-stretch' : '';
  img.draggable = false;

  // Determine which image to show
  function updateImage(statusVal) {
    let src = null;
    if (imageList && Array.isArray(imageList) && imageList.length > 0) {
      const idx = Math.max(0, Math.min(statusVal || 0, imageList.length - 1));
      src = imageStore.getImageUrl(imageList[idx]);
    } else if (imageName) {
      src = imageStore.getImageUrl(imageName);
    }
    if (src) {
      img.src = src;
      img.style.display = '';
    } else {
      img.style.display = 'none';
      // Show placeholder
      el.style.border = '1px dashed #CCC';
      el.title = imageName || (imageList ? imageList.join(', ') : 'No image');
    }
  }

  updateImage(status);
  el.appendChild(img);

  // Status binding (selects image from ImageList)
  const statusBinding = getBinding(comp, 'Status');
  if (statusBinding) {
    const b = setupBinding(statusBinding, vrStore, (val) => {
      updateImage(val);
    });
    if (b) activeBindings.push(b);
  }

  // Event handlers
  comp.events.forEach(evt => {
    if (evt.name === 'Click') {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (typeof app !== 'undefined' && app.mode !== 'edit') {
          evt.actions.forEach(action => app.handleAction(action, comp));
        }
      });
    }
  });

  return el;
}

function renderRectangle(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-rectangle';

  const backColor = getProp(comp, 'BackColor', '#FFF0F0F0');
  const foreColor = getProp(comp, 'ForeColor', '#FF000000');
  const offBackColour = getProp(comp, 'OffBackColour', null);
  const externalBackColour = getProp(comp, 'ExternalBackColour', null);

  el.style.backgroundColor = tgdColorToCSS(backColor);
  if (foreColor && foreColor !== '#00000000') {
    el.style.border = '1px solid ' + tgdColorToCSS(foreColor);
  }

  // Status binding — toggles between BackColor and OffBackColour
  const statusBinding = getBinding(comp, 'Status');
  if (statusBinding) {
    const b = setupBinding(statusBinding, vrStore, (val) => {
      if (val) {
        el.style.backgroundColor = tgdColorToCSS(backColor);
      } else {
        el.style.backgroundColor = tgdColorToCSS(offBackColour || backColor);
      }
    });
    if (b) activeBindings.push(b);
  }

  // BackColor binding
  const bgBinding = getBinding(comp, 'BackColor');
  if (bgBinding) {
    const b = setupBinding(bgBinding, vrStore, (val) => {
      if (typeof val === 'number') {
        const hex = (val >>> 0).toString(16).padStart(8, '0').toUpperCase();
        el.style.backgroundColor = tgdColorToCSS('#' + hex);
      } else if (typeof val === 'string') {
        el.style.backgroundColor = tgdColorToCSS(val);
      }
    });
    if (b) activeBindings.push(b);
  }

  return el;
}

function renderLine(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-line';

  const thickness = getProp(comp, 'Thickness', 2);
  const foreColor = getProp(comp, 'ForeColor', '#FF000000');
  const orientation = getProp(comp, 'Orientation', null);
  const w = getProp(comp, 'Width', 100);
  const h = getProp(comp, 'Height', 2);

  el.style.backgroundColor = tgdColorToCSS(foreColor);

  // Determine orientation: explicit, or infer from dimensions
  if (orientation === 'Vertical' || (h > w * 2)) {
    el.style.width = thickness + 'px';
  } else {
    el.style.height = thickness + 'px';
  }

  return el;
}

function renderDataGrid(comp) {
  const el = document.createElement('div');
  el.className = 'hmi-datagrid';

  const columns = getProp(comp, 'Columns', []);
  const rowCount = getProp(comp, 'RowCount', 20);
  const rowHeight = getProp(comp, 'RowHeight', 36);
  const headerFont = getProp(comp, 'HeaderFont', 'DejaVu Sans:20:0');
  const bodyFont = getProp(comp, 'Font', 'DejaVu Sans:20:0');
  const headerBg = getProp(comp, 'HeaderBackColor', '#FFE3E3E3');
  const headerFg = getProp(comp, 'HeaderForeColor', '#FF000000');
  const bodyBg = getProp(comp, 'BodyBackColor', '#FFFFFFFF');
  const bodyFg = getProp(comp, 'BodyForeColor', '#FF000000');
  const bodyAltBg = getProp(comp, 'BodyBackAlterColor', '#FFF6F6F6');
  const gridLineColor = getProp(comp, 'GridLineColor', '#FFA0A0A0');
  const borderColor = getProp(comp, 'BorderColor', '#FFA0A0A0');
  const selectedRow = getProp(comp, 'SelectedRow', -1);

  el.style.border = '1px solid ' + tgdColorToCSS(borderColor);

  const table = document.createElement('table');

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  if (Array.isArray(columns)) {
    columns.forEach(col => {
      const th = document.createElement('th');
      const headerText = getProp(col, 'HeaderText', '');
      const colWidth = getProp(col, 'ColumnWidth', 100);
      th.textContent = headerText;
      th.style.width = colWidth + 'px';
      th.style.minWidth = colWidth + 'px';
      th.style.backgroundColor = tgdColorToCSS(headerBg);
      th.style.color = tgdColorToCSS(headerFg);
      th.style.borderColor = tgdColorToCSS(gridLineColor);
      applyFont(th, headerFont);
      headerRow.appendChild(th);
    });
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body — generate placeholder rows
  const tbody = document.createElement('tbody');
  for (let r = 0; r < rowCount; r++) {
    const tr = document.createElement('tr');
    if (r === selectedRow) tr.className = 'selected';
    tr.style.height = rowHeight + 'px';

    if (Array.isArray(columns)) {
      columns.forEach((col, c) => {
        const td = document.createElement('td');
        const bg = (r % 2 === 0) ? bodyBg : bodyAltBg;
        td.style.backgroundColor = tgdColorToCSS(bg);
        td.style.color = tgdColorToCSS(bodyFg);
        td.style.borderColor = tgdColorToCSS(gridLineColor);
        applyFont(td, bodyFont);

        // Generate placeholder data
        const fmtType = getProp(col, 'FormatType', 'FORMAT_TEXT');
        const fmtDP = getProp(col, 'FormatNumDP', 0);
        if (c === 0) {
          td.textContent = r + 1; // Recipe number
        } else if (fmtType === 'FORMAT_REAL') {
          td.textContent = (0).toFixed(fmtDP);
        } else if (fmtType === 'FORMAT_INTEGER') {
          td.textContent = '0';
        } else {
          td.textContent = '';
        }
        tr.appendChild(td);
      });
    }

    // Row click selection
    tr.addEventListener('click', () => {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      const selBinding = getBinding(comp, 'SelectedRow');
      if (selBinding) {
        const evaluator = parseBinding(selBinding.mcsource);
        if (evaluator && evaluator.write) evaluator.write(vrStore, r);
      }
    });

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  el.appendChild(table);

  return el;
}
