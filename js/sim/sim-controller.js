// ============================================================
// sim-controller.js — Browser orchestration for the Trio simulator
// ------------------------------------------------------------
// Builds the machine + plant + runtime, backs the machine with the
// visualizer's live vrStore (so the running TrioBASIC code and the HMI
// share one VR table), loads the bundled Line 2 programs (or user-picked
// files), and drives the scheduler from requestAnimationFrame with a
// wall-clock budget per frame so the UI stays responsive at any speed.
// ============================================================
(function (root) {
  'use strict';
  // trio-runtime.js exports a namespace {TrioRuntime, compileProgram, ...};
  // trio-machine/trio-plant export their class directly. Normalize both.
  const TrioParser = root.TrioParser;
  const TrioRuntime = (root.TrioRuntime && root.TrioRuntime.TrioRuntime) || root.TrioRuntime;
  const TrioMachine = root.TrioMachine, TrioPlant = root.TrioPlant;

  function SimController(vrStore) {
    this.vrStore = vrStore;
    this.machine = null;
    this.plant = null;
    this.rt = null;
    this.programs = {};      // name -> statements
    this.parseErrors = {};   // file -> errors
    this.autorun = 'START_AND_SET_VARIABLES';
    this.autorunProc = 1;
    this.running = false;
    this.speed = 20;         // sim-ms per real-ms multiplier
    this.simCarry = 0;
    this.lastWall = 0;
    this.frameBudgetMs = 12; // max wall time per frame spent stepping
    this.maxSlicesPerFrame = 6000;
    this.booted = false;
    this.onFrame = null;     // UI hook
    this.loadReport = null;
  }

  SimController.prototype.buildEngine = function () {
    const vs = this.vrStore;
    // Change-detecting backend: only notify vrStore subscribers (HMI bindings)
    // when a VR actually changes, so thousands of scan writes/sec don't flood
    // the HMI renderer with no-op updates.
    const backend = vs ? { get: (i) => vs.getVR(i), set: (i, v) => { if (vs.getVR(i) !== v) vs.setVR(i, v); } } : null;
    this.machine = new TrioMachine({ vrBackend: backend });
    this.plant = new TrioPlant(this.machine, {});
    this.rt = new TrioRuntime(this.machine, { onLog: null });
    this.booted = false;
    this.simCarry = 0;
  };

  // Load programs already provided as {name: statements}.
  SimController.prototype.installPrograms = function () {
    for (const name in this.programs) this.rt.loadProgram(name, this.programs[name]);
  };

  SimController.prototype.parseAndStore = function (name, text, fileLabel) {
    const res = TrioParser.parse(text, { file: fileLabel || name });
    this.programs[name.toUpperCase()] = res.statements;
    if (res.errors && res.errors.length) this.parseErrors[fileLabel || name] = res.errors;
    return res;
  };

  // Fetch the bundled demo project (works when served over http). The demo is
  // synthetic; use "Load .BAS…" for a real controller project.
  SimController.prototype.loadSample = async function (base) {
    base = base || 'samples/demo/';
    const man = await fetch(base + 'manifest.json').then(r => r.json());
    this.autorun = (man.autorun || 'START_AND_SET_VARIABLES.BAS').replace(/\.BAS$/i, '');
    this.autorunProc = man.autorunProc || 1;
    let count = 0, errFiles = 0;
    for (const fn of man.programs) {
      try {
        const text = await fetch(base + fn).then(r => r.text());
        const r = this.parseAndStore(fn.replace(/\.BAS$/i, ''), text, fn);
        count++; if (r.errors && r.errors.length) errFiles++;
      } catch (e) { /* skip missing */ }
    }
    // The project's own regression scenarios, if the manifest names a file
    // (e.g. "scenarios": "sim/scenarios.json").
    this.scenarios = null;
    if (man.scenarios) { try { this.scenarios = await fetch(base + man.scenarios).then(r => r.json()); } catch (e) { console.warn('scenarios not loaded', e); } }
    this.loadReport = { count, errFiles, source: 'bundled demo (' + base + ')' };
    return this.loadReport;
  };

  // Load from a user-picked FileList (.BAS + optional .mpv3prj).
  SimController.prototype.loadFiles = async function (fileList) {
    let count = 0, errFiles = 0, autorun = null;
    this.scenarios = null;
    const readText = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
    for (const f of fileList) {
      const nm = f.name;
      if (/\.BAS$/i.test(nm)) {
        const text = await readText(f);
        const r = this.parseAndStore(nm.replace(/\.BAS$/i, ''), text, nm);
        count++; if (r.errors && r.errors.length) errFiles++;
      } else if (/^scenarios\.json$/i.test(nm)) {
        try { this.scenarios = JSON.parse(await readText(f)); } catch (e) { console.warn('bad scenarios.json', e); }
      } else if (/\.mpv3prj$/i.test(nm)) {
        const text = await readText(f);
        const m = text.match(/FileName="([^"]+\.BAS)"[^>]*Autorun="-?[1-9]/i) || text.match(/Autorun="-?[1-9][^>]*FileName="([^"]+\.BAS)"/i);
        if (m) autorun = m[1].replace(/\.BAS$/i, '');
      }
    }
    if (autorun) this.autorun = autorun;
    this.loadReport = { count, errFiles, source: 'user files' };
    return this.loadReport;
  };

  // Fetch a bundled file and wrap it as a File for the visualizer's loader.
  SimController.prototype.fetchAsFile = async function (url, name, type) {
    const blob = await fetch(url).then(r => r.blob());
    return new File([blob], name, { type: type });
  };

  // Load the bundled HMI screens (TGM + TGDs + images) into the visualizer app
  // so they render (and animate from vrStore) in View mode.
  SimController.prototype.loadHmiScreens = async function (base, tgmName) {
    base = base || 'samples/demo/hmi/';
    tgmName = tgmName || 'DemoCell.TGM';
    const man = await fetch(base + tgmName.replace(/ /g, '%20')).then(r => r.text());
    const pages = Array.from(man.matchAll(/<Page File="([^"]+)"/g)).map(m => m[1]);
    const imgs = Array.from(man.matchAll(/<Image File="([^"]+)"/g)).map(m => m[1]);
    const enc = (n) => base + n.replace(/ /g, '%20');
    const files = [];
    files.push(await this.fetchAsFile(enc(tgmName), tgmName, 'text/xml'));
    for (const p of pages) { try { files.push(await this.fetchAsFile(enc(p), p, 'text/xml')); } catch (e) { } }
    for (const im of imgs) { try { files.push(await this.fetchAsFile(enc(im), im, 'image/png')); } catch (e) { } }
    if (typeof app !== 'undefined' && app.loadFiles) await app.loadFiles(files);
    this.hmiLoaded = true;
    return { pages: pages.length, images: imgs.length };
  };

  SimController.prototype.boot = function () {
    this.buildEngine();
    this.installPrograms();
    this.rt.boot(this.autorun, this.autorunProc);
    this.booted = true;
    this.simCarry = 0;
  };

  SimController.prototype.reset = function () {
    this.running = false;
    this.boot();
  };

  // Advance one animation frame worth of sim time.
  SimController.prototype.frame = function (nowMs) {
    if (!this.booted) return;
    if (!this.running) { this.lastWall = nowMs; return; }
    const dtWall = Math.min(64, Math.max(0, nowMs - (this.lastWall || nowMs)));
    this.lastWall = nowMs;
    this.simCarry += dtWall * this.speed;   // target sim-ms to advance
    const startWall = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
    let slices = 0;
    while (this.simCarry >= 1 && slices < this.maxSlicesPerFrame) {
      this.rt.tick(1);
      this.plant.step(1);
      this.simCarry -= 1;
      slices++;
      if ((slices & 255) === 0) {
        const w = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
        if (w - startWall > this.frameBudgetMs) { this.simCarry = 0; break; }
      }
    }
    if (this.onFrame) this.onFrame(slices);
  };

  // Run tightly until boot completes (SYSTEMSTATUS settled or timeout).
  SimController.prototype.fastForward = function (maxSimMs) {
    if (!this.booted) return;
    maxSimMs = maxSimMs || 20000;
    for (let i = 0; i < maxSimMs; i++) { this.rt.tick(1); this.plant.step(1); }
  };

  SimController.prototype.stepSlices = function (n) {
    for (let i = 0; i < (n || 1); i++) { this.rt.tick(1); this.plant.step(1); }
    if (this.onFrame) this.onFrame(n || 1);
  };

  // ---- helpers for UI ----
  SimController.prototype.g = function (name) { const i = this.rt.globals.get(name.toLowerCase()); return i == null ? null : i; };
  SimController.prototype.getG = function (name) { const i = this.g(name); return i == null ? null : this.machine.getVr(i); };
  SimController.prototype.setG = function (name, v) { const i = this.g(name); if (i != null) this.machine.setVr(i, v); return i != null; };
  SimController.prototype.setGbit = function (name, bit, v) { const i = this.g(name); if (i == null) return false; let cur = Math.floor(this.machine.getVr(i)); cur = v ? (cur | (1 << bit)) : (cur & ~(1 << bit)); this.machine.setVr(i, cur); return true; };

  root.SimController = SimController;
})(typeof self !== 'undefined' ? self : this);
