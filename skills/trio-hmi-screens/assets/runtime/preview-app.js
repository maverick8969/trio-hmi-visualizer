// ============================================================
// preview-app.js — Stand-alone HMI simulator shell.
// Loaded after the shared visualizer runtime (utils, vr-store, binding-engine,
// tgd-parser, image-store, renderers, action-handler). Provides the global
// `app` object those modules call into, plus a variables panel, event log,
// keypad and a tiny rule engine that stands in for the controller program.
// ============================================================

const DATA = JSON.parse(document.getElementById('hmi-data').textContent);

const app = {
  mode: 'run',
  pages: {},
  currentPage: null,
  keypadTarget: null,
  simEnabled: true,

  init() {
    Object.assign(imageStore._images, DATA.images || {});
    DATA.pages.forEach(p => {
      const page = parseTGD(p.xml, p.fileName);
      if (page) this.pages[p.name] = page; else log('Failed to parse ' + p.fileName);
    });
    this.buildTabs();
    this.buildVarPanel();
    this.instrumentStore();
    this.applyInit();
    this.compileRules();
    this.navigateToPage(DATA.startup);
    window.addEventListener('resize', () => this.fit());
    setInterval(() => this.runRules(), Math.max(20, DATA.tick || 100));
  },

  // ---------------- pages ----------------
  navigateToPage(name) {
    const page = this.pages[name];
    if (!page) { log('GotoPage: unknown page ' + name); return; }
    this.currentPage = page;
    const canvas = document.getElementById('hmi-canvas');
    renderPage(page, canvas);
    this.wireMomentary(canvas);
    document.querySelectorAll('#tabs button').forEach(b => {
      if (b.dataset.page === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    this.fit();
  },

  buildTabs() {
    const tabs = document.getElementById('tabs');
    Object.keys(this.pages).forEach(name => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.dataset.page = name;
      b.addEventListener('click', () => this.navigateToPage(name));
      tabs.appendChild(b);
    });
  },

  fit() {
    const page = this.currentPage;
    if (!page) return;
    const stage = document.getElementById('stage');
    const wrap = document.getElementById('canvas-wrapper');
    const s = Math.min((stage.clientWidth - 24) / page.width, (stage.clientHeight - 24) / page.height, 2);
    wrap.style.width = page.width + 'px';
    wrap.style.height = page.height + 'px';
    wrap.style.transform = 'scale(' + Math.max(s, 0.1) + ')';
    // keep layout box equal to the scaled size so flex centering works
    wrap.style.margin = ((page.height * (s - 1)) / 2) + 'px ' + ((page.width * (s - 1)) / 2) + 'px';
  },

  // Make ButtonDown/ButtonUp (jog) buttons behave like a real touch panel:
  // release fires when the pointer leaves or is lifted anywhere, and touch works.
  wireMomentary(canvas) {
    canvas.querySelectorAll('.hmi-button').forEach(el => {
      let pressed = false;
      const down = () => { pressed = true; el.classList.add('pressed'); };
      const up = (synth) => {
        if (!pressed) return;
        pressed = false;
        el.classList.remove('pressed');
        if (synth) el.dispatchEvent(new MouseEvent('mouseup'));
      };
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', () => up(false));
      el.addEventListener('mouseleave', () => up(true));
      el.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse') { e.preventDefault(); el.dispatchEvent(new MouseEvent('mousedown')); }
      });
      el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') up(true); });
      el.addEventListener('pointercancel', () => up(true));
    });
  },

  // ---------------- actions ----------------
  handleAction(actionStr, comp) {
    log((comp ? comp.name + ': ' : '') + actionStr, 'action');
    executeAction(actionStr, comp, this);
  },

  // ---------------- keypad ----------------
  showKeypad(type, targetName, sourceComp) {
    let target = sourceComp;
    if (targetName && this.currentPage) {
      target = this.currentPage.components.find(c => c.name === targetName) || sourceComp;
    }
    const tb = target ? getBinding(target, 'Text') : null;
    const ev = tb ? parseBinding(tb.mcsource) : null;
    this.keypadTarget = { evaluator: ev, comp: target };
    const disp = document.getElementById('keypad-display');
    disp.value = ev ? ev.evaluate(vrStore) : '';
    const lo = target ? getProp(target, 'MinVal', null) : null;
    const hi = target ? getProp(target, 'MaxVal', null) : null;
    document.getElementById('keypad-target').textContent =
      (target ? target.name : '') + (tb ? '  →  ' + tb.mcsource : '') +
      (lo !== null || hi !== null ? '   [' + (lo !== null ? lo : '') + ' … ' + (hi !== null ? hi : '') + ']' : '');
    document.getElementById('keypad-overlay').classList.add('visible');
    disp.focus();
    disp.select();
  },

  hideKeypad() {
    document.getElementById('keypad-overlay').classList.remove('visible');
    this.keypadTarget = null;
  },

  keypadInput(key) {
    const d = document.getElementById('keypad-display');
    switch (key) {
      case 'enter': {
        const t = this.keypadTarget;
        let v = parseFloat(d.value);
        if (t && t.comp && getProp(t.comp, 'FormatType', '') === 'FORMAT_INTEGER') v = Math.round(v);
        const lo = t && t.comp ? getProp(t.comp, 'MinVal', null) : null;
        const hi = t && t.comp ? getProp(t.comp, 'MaxVal', null) : null;
        if (!isNaN(v) && ((lo !== null && v < lo) || (hi !== null && v > hi))) {
          document.getElementById('keypad-target').textContent =
            'Out of range: ' + (lo !== null ? lo : '-∞') + ' … ' + (hi !== null ? hi : '∞');
          log('keypad ' + t.comp.name + ' rejected ' + v + ' (range ' + lo + '..' + hi + ')');
          d.select();
          return;
        }
        if (t && t.evaluator && t.evaluator.write && !isNaN(v)) {
          t.evaluator.write(vrStore, v);
          log('keypad ' + (t.comp ? t.comp.name : '') + ' = ' + v, 'action');
        }
        this.hideKeypad();
        break;
      }
      case 'cancel': this.hideKeypad(); break;
      case 'bksp': d.value = d.value.slice(0, -1); break;
      case 'clear': d.value = ''; break;
      case 'sign': d.value = d.value.startsWith('-') ? d.value.slice(1) : '-' + d.value; break;
      default: d.value += key;
    }
  },

  // ---------------- variables panel ----------------
  buildVarPanel() {
    const list = document.getElementById('vr-list');
    this.rows = {};
    (DATA.variables || []).forEach(v => {
      const row = document.createElement('div');
      row.className = 'vr-row';
      const line = document.createElement('div');
      line.className = 'vr-line';
      const addr = document.createElement('span');
      addr.className = 'vr-addr';
      addr.textContent = 'VR(' + v.index + ')';
      const desc = document.createElement('span');
      desc.className = 'vr-desc';
      desc.textContent = v.desc || '';
      desc.title = v.desc || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.setAttribute('aria-label', 'VR(' + v.index + ') value');
      input.addEventListener('change', () => {
        const n = parseFloat(input.value);
        if (!isNaN(n)) vrStore.setVR(v.index, n);
      });
      line.append(addr, desc, input);
      row.appendChild(line);
      const bitEls = {};
      if (v.bits && v.bits.length) {
        const bits = document.createElement('div');
        bits.className = 'vr-bits';
        v.bits.forEach(b => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'vr-bit';
          btn.textContent = '.' + b + (v.bitDescs && v.bitDescs[b] ? ' ' + v.bitDescs[b] : '');
          btn.addEventListener('click', () => vrStore.toggleVRBit(v.index, b));
          bits.appendChild(btn);
          bitEls[b] = btn;
        });
        row.appendChild(bits);
      }
      list.appendChild(row);
      this.rows[v.index] = { row, input, bitEls };
      this.refreshRow(v.index);
    });
    if (!(DATA.variables || []).length) list.innerHTML = '<div class="vr-row vr-desc">No VR references found.</div>';
  },

  refreshRow(idx, flash) {
    const r = this.rows && this.rows[idx];
    if (!r) return;
    const val = vrStore.getVR(idx);
    if (document.activeElement !== r.input) r.input.value = Number.isInteger(val) ? val : +val.toFixed(4);
    Object.keys(r.bitEls).forEach(b => r.bitEls[b].classList.toggle('on', !!vrStore.getVRBit(idx, +b)));
    if (flash) {
      r.row.classList.add('flash');
      requestAnimationFrame(() => requestAnimationFrame(() => r.row.classList.remove('flash')));
    }
  },

  instrumentStore() {
    const orig = vrStore.setVR.bind(vrStore);
    vrStore.setVR = (index, value, silent) => {
      const before = vrStore.getVR(index);
      orig(index, value, silent);
      if (before !== value && !this._quiet) log('VR(' + index + '): ' + fmt(before) + ' → ' + fmt(value));
      this.refreshRow(index, before !== value);
    };
  },

  // ---------------- simulated controller ----------------
  applyInit() {
    this._quiet = true;
    vrStore._vr = {};
    vrStore._programs = {};
    vrStore._custom = {};
    Object.entries(DATA.init || {}).forEach(([addr, val]) => {
      const m = addr.match(/^VR\((\d+)\)(?:\.(\d+))?$/);
      if (!m) return;
      if (m[2] !== undefined) vrStore.setVRBit(+m[1], +m[2], val ? 1 : 0);
      else vrStore.setVR(+m[1], +val);
    });
    this._quiet = false;
    vrStore.notifyAll();
    Object.keys(this.rows || {}).forEach(i => this.refreshRow(+i));
  },

  compileRules() {
    this.rules = [];
    (DATA.rules || []).forEach((r, i) => {
      try {
        const rule = {
          src: r,
          cond: r.if ? compileExpression(r.if) : null,
          every: r.every || 0,
          last: 0,
          sets: Object.entries(r.set || {}).map(([target, expr]) => {
            const m = target.match(/^VR\((\d+)\)(?:\.(\d+))?$/);
            if (!m) throw new Error('bad target ' + target);
            return { idx: +m[1], bit: m[2] !== undefined ? +m[2] : null, fn: compileExpression(String(expr)) };
          })
        };
        this.rules.push(rule);
      } catch (e) {
        log('Rule ' + i + ' ignored: ' + e.message);
      }
    });
  },

  runRules() {
    if (!this.simEnabled) return;
    const now = performance.now();
    this._quiet = true;   // rule-driven changes are not logged (they would flood the log)
    try {
      this.rules.forEach(r => {
        if (r.every && now - r.last < r.every) return;
        r.last = now;
        if (r.cond && !r.cond(vrStore)) return;
        const vals = r.sets.map(s => s.fn(vrStore));   // evaluate all before writing
        r.sets.forEach((s, i) => {
          if (s.bit !== null) {
            if (vrStore.getVRBit(s.idx, s.bit) !== (vals[i] ? 1 : 0)) vrStore.setVRBit(s.idx, s.bit, vals[i] ? 1 : 0);
          } else if (vrStore.getVR(s.idx) !== vals[i]) {
            vrStore.setVR(s.idx, vals[i]);
          }
        });
      });
    } finally {
      this._quiet = false;
    }
  }
};

function fmt(v) { return typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(4) : v; }

function log(msg, cls) {
  const ol = document.getElementById('log');
  const li = document.createElement('li');
  li.textContent = msg;
  if (cls) li.className = cls;
  ol.insertBefore(li, ol.firstChild);
  while (ol.children.length > 80) ol.removeChild(ol.lastChild);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#keypad .kp-btn').forEach(b => b.addEventListener('click', () => app.keypadInput(b.dataset.key)));
  document.getElementById('keypad-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) app.hideKeypad(); });
  document.getElementById('keypad-display').addEventListener('keydown', e => {
    if (e.key === 'Enter') app.keypadInput('enter');
    else if (e.key === 'Escape') app.keypadInput('cancel');
  });
  document.getElementById('btn-reset').addEventListener('click', () => { app.applyInit(); log('Reset to initial values', 'action'); });
  document.getElementById('btn-sim').addEventListener('click', e => {
    app.simEnabled = !app.simEnabled;
    e.currentTarget.setAttribute('aria-pressed', String(app.simEnabled));
    e.currentTarget.textContent = 'Sim: ' + (app.simEnabled ? 'on' : 'off');
  });
  document.getElementById('btn-panel').addEventListener('click', () => {
    document.body.classList.toggle('panel-hidden');
    app.fit();
  });
  app.init();
  window.hmi = { app, vrStore, data: DATA };
});
