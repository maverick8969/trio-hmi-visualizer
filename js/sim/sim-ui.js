// ============================================================
// sim-ui.js — Simulator dashboard (Simulate mode)
// ------------------------------------------------------------
// Builds a control/observation dashboard over the running engine:
// transport (boot/run/step/speed), process table, axis strip, heater
// zones, pump flows, digital/analog I/O, operator levers, fault
// injection, a live VR watch, an event log, and a trend chart. All
// state comes from the SimController; because the machine is backed by
// the visualizer's vrStore, any HMI screens loaded in View mode animate
// live alongside this dashboard.
// ============================================================
(function (root) {
  'use strict';

  // ---- static label maps (from the I/O map) ----
  const OP_LABELS = {
    0: 'Mixer Run', 4: 'E-Stop Reset', 5: 'WATCHDOG', 6: 'NipRoll Down', 7: 'ΔP-A Heat',
    8: 'ΔP-B Heat', 9: 'MixHead Heat', 10: 'Mixer Lube', 11: 'Purge 1', 12: 'Purge 2',
    16: 'Stack Red', 17: 'Stack Yellow', 18: 'Stack Green', 19: 'Horn',
    20: 'Overhead Z1', 21: 'Overhead Z2', 22: 'Overhead Z3',
  };
  const IN_LABELS = { 0: 'Safety E-Stop (1=OK)', 1: 'Traverse Home', 2: 'Traverse RS Limit', 3: 'Mixer Running' };
  const AXES = [
    { n: 0, name: 'Traverse' }, { n: 1, name: 'Pump A' }, { n: 2, name: 'Pump B' },
    { n: 3, name: 'Pump C / Kicker' }, { n: 4, name: 'Nip Roll' }, { n: 5, name: 'Mixer' },
  ];
  const MTYPE_NAME = { 0: 'IDLE', 1: 'MOVE', 2: 'MOVEABS', 10: 'FORWARD', 11: 'REVERSE', 21: 'CONNECT', 22: 'MOVELINK' };
  const SYS_BITS = ['E-Stop', 'EC-Starting', 'EC-Error', 'EC-Started', 'Enabling', 'DriveEn', 'EC-Stopped'];

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function build(sim) {
    const rootEl = el('div'); rootEl.id = 'sim-root';
    rootEl.innerHTML = `
      <div id="sim-bar">
        <button id="sim-boot" class="sb primary">⟳ Boot</button>
        <button id="sim-play" class="sb">▶ Run</button>
        <button id="sim-step" class="sb">⏭ Step 100ms</button>
        <button id="sim-ffwd" class="sb">⏩ Fast-boot</button>
        <span class="sb-sep"></span>
        <label class="sb-lbl">Speed</label>
        <select id="sim-speed">
          <option value="1">1× real</option><option value="5">5×</option>
          <option value="20" selected>20×</option><option value="100">100×</option>
        </select>
        <span class="sb-sep"></span>
        <span class="sb-stat">t=<b id="sim-clock">0.0</b>s</span>
        <span class="sb-stat">WDOG <b id="sim-wdog" class="chip">?</b></span>
        <span class="sb-stat">Mode <b id="sim-mode" class="chip">?</b></span>
        <span class="sb-stat" id="sim-boot-state">not booted</span>
        <span class="sb-stat" id="sim-load" style="margin-left:auto;color:#888;"></span>
        <label for="sim-file" class="sb">Load .BAS…</label>
        <input type="file" id="sim-file" multiple accept=".bas,.BAS,.mpv3prj" style="display:none">
      </div>
      <div id="sim-sys"></div>
      <div id="sim-grid">
        <div class="sim-col">
          <div class="sim-card"><h4>Operator Controls</h4><div id="sim-ops"></div></div>
          <div class="sim-card"><h4>Fault Injection</h4><div id="sim-faults"></div></div>
          <div class="sim-card"><h4>Trend</h4><canvas id="sim-trend" width="360" height="140"></canvas><div id="sim-trend-key"></div></div>
        </div>
        <div class="sim-col">
          <div class="sim-card"><h4>Processes</h4><div id="sim-procs" class="sim-table"></div></div>
          <div class="sim-card"><h4>Axes</h4><div id="sim-axes" class="sim-table"></div></div>
          <div class="sim-card"><h4>Heater Zones</h4><div id="sim-heat"></div></div>
          <div class="sim-card"><h4>Pump Flow</h4><div id="sim-flow" class="sim-table"></div></div>
        </div>
        <div class="sim-col">
          <div class="sim-card"><h4>Digital Outputs (OP)</h4><div id="sim-op" class="io-grid"></div></div>
          <div class="sim-card"><h4>Digital Inputs (IN) — click to force</h4><div id="sim-in" class="io-grid"></div></div>
          <div class="sim-card"><h4>Analog</h4><div id="sim-analog" class="sim-table"></div></div>
          <div class="sim-card"><h4>VR Watch</h4><input id="sim-vrfilter" placeholder="filter globals… (e.g. pump, zone, estop)"><div id="sim-vr" class="sim-table"></div></div>
        </div>
      </div>
      <div class="sim-card" id="sim-logcard"><h4>Event Log <select id="sim-logfilter"><option value="all">all</option><option value="warn">warnings+errors</option><option value="print">PRINT</option></select></h4><div id="sim-log"></div></div>
    `;
    return rootEl;
  }

  function SimUI(sim) {
    this.sim = sim;
    this.rootEl = build(sim);
    this.trend = { t: [], z1: [], z1sp: [], pa: [], max: 400 };
    this.vrFilter = '';
    this.logFilter = 'all';
    this.logIndex = 0;
    this.staticBuilt = false;
    this.frameCount = 0;
  }

  SimUI.prototype.mount = function (parent) { parent.appendChild(this.rootEl); this.wire(); };

  SimUI.prototype.wire = function () {
    const r = this.rootEl, sim = this.sim, self = this;
    r.querySelector('#sim-boot').onclick = () => { sim.reset(); self.buildStatic(); self.refresh(true); self.setBootState(); };
    r.querySelector('#sim-play').onclick = (e) => { sim.running = !sim.running; e.target.textContent = sim.running ? '⏸ Pause' : '▶ Run'; };
    r.querySelector('#sim-step').onclick = () => { sim.stepSlices(100); self.refresh(true); };
    r.querySelector('#sim-ffwd').onclick = () => { sim.fastForward(18000); self.refresh(true); };
    r.querySelector('#sim-speed').onchange = (e) => { sim.speed = parseFloat(e.target.value); };
    r.querySelector('#sim-vrfilter').oninput = (e) => { self.vrFilter = e.target.value.toLowerCase(); self.renderVR(true); };
    r.querySelector('#sim-logfilter').onchange = (e) => { self.logFilter = e.target.value; self.logIndex = 0; r.querySelector('#sim-log').innerHTML = ''; };
    r.querySelector('#sim-file').onchange = async (e) => {
      sim.programs = {}; sim.parseErrors = {};
      const rep = await sim.loadFiles(e.target.files);
      sim.reset(); self.buildStatic(); self.refresh(true);
      r.querySelector('#sim-load').textContent = rep.count + ' programs (' + rep.errFiles + ' w/ parse errors)';
    };
  };

  SimUI.prototype.setBootState = function () {
    const bs = this.rootEl.querySelector('#sim-boot-state');
    bs.textContent = this.sim.booted ? 'booted' : 'not booted';
  };

  // ---- static panels (rebuilt on boot/load) ----
  SimUI.prototype.buildStatic = function () {
    this.buildOps();
    this.buildFaults();
    this.buildIO();
    this.setBootState();
    const lr = this.sim.loadReport;
    if (lr) this.rootEl.querySelector('#sim-load').textContent = lr.count + ' programs · ' + lr.source + (lr.errFiles ? ' · ' + lr.errFiles + ' parse-error files' : '');
    this.staticBuilt = true;
  };

  SimUI.prototype.buildOps = function () {
    const sim = this.sim, host = this.rootEl.querySelector('#sim-ops'); host.innerHTML = '';
    const toggle = (label, get, set) => {
      const row = el('div', 'op-row');
      const b = el('button', 'op-toggle', label);
      const upd = () => { const on = get(); b.classList.toggle('on', !!on); };
      b.onclick = () => { set(!get()); upd(); };
      row.appendChild(b); host.appendChild(row); this._opUpdaters = this._opUpdaters || []; this._opUpdaters.push(upd);
    };
    this._numInputs = [];
    const num = (label, name, dflt) => {
      const row = el('div', 'op-row'); row.appendChild(el('span', 'op-lbl', label));
      const inp = el('input', 'op-num'); inp.type = 'number'; inp.value = (sim.getG(name) ?? dflt) || 0;
      inp.dataset.g = name;
      inp.onchange = () => sim.setG(name, parseFloat(inp.value) || 0);
      row.appendChild(inp); host.appendChild(row);
      this._numInputs.push({ inp, name, dflt });
      return inp;
    };
    // Pumps RUN also applies the Pump A setpoint (recipe load zeroes it at boot),
    // so a single click actually spins the pumps.
    toggle('Pumps RUN', () => sim.getG('hmi_pumps_run'), (v) => {
      if (v && (sim.getG('pumpa_rpm_setpoint') || 0) <= 0) {
        const sp = this._pumpSpInput ? parseFloat(this._pumpSpInput.value) || 50 : 50;
        sim.setG('pumpa_rpm_setpoint', sp);
      }
      sim.setG('hmi_pumps_run', v ? 1 : 0);
    });
    this._pumpSpInput = num('Pump A setpoint (rpm)', 'pumpa_rpm_setpoint', 50);
    num('Pump B mix ratio', 'pumpb_mix_ratio', 1);
    toggle('Purge', () => sim.getG('hmi_purge'), (v) => sim.setG('hmi_purge', v ? 1 : 0));
    toggle('AUTO mode', () => (Math.floor(sim.getG('triocontrolword_vr') || 0) >> 1) & 1, (v) => sim.setGbit('triocontrolword_vr', 1, v ? 1 : 0));
    // Heater zone enables + setpoints
    const heat = (label, onName, spName) => {
      const row = el('div', 'op-row');
      const b = el('button', 'op-toggle', label);
      const upd = () => b.classList.toggle('on', !!sim.getG(onName));
      b.onclick = () => {
        const nv = sim.getG(onName) ? 0 : 1;
        sim.setG(onName, nv);
        if (nv) { // seed sensible deadband so control acts
          if ((sim.getG(spName) || 0) === 0) sim.setG(spName, 300);
          sim.setG(spName.replace('_offon_sp', '_upper_db').replace('_sp', '_upper_db'), 5);
        }
        upd();
      };
      const inp = el('input', 'op-num'); inp.type = 'number'; inp.value = sim.getG(spName) ?? 300;
      inp.title = 'setpoint °F'; inp.onchange = () => sim.setG(spName, parseFloat(inp.value) || 0);
      row.appendChild(b); row.appendChild(inp); host.appendChild(row);
      this._opUpdaters.push(upd);
    };
    heat('Overhead Z1', 'overhead_zone1_on', 'overhead_zone1_offon_sp');
    heat('Overhead Z2', 'overhead_zone2_on', 'overhead_zone2_offon_sp');
    heat('Overhead Z3', 'overhead_zone3_on', 'overhead_zone3_offon_sp');
    heat('Mixer Head', 'mixer_head_on', 'mixer_head_offon_sp');
  };

  SimUI.prototype.buildFaults = function () {
    const sim = this.sim, host = this.rootEl.querySelector('#sim-faults'); host.innerHTML = '';
    const btn = (label, cls, fn) => { const b = el('button', 'fault-btn ' + (cls || ''), label); b.onclick = fn; host.appendChild(b); return b; };
    const estopBtn = btn('■ PRESS E-STOP', 'danger', () => {
      const pressed = sim.machine.faults.estopHeld || sim.machine.estopLine === 0;
      sim.machine.pressEstop(!pressed);
      estopBtn.textContent = !pressed ? '► RELEASE E-STOP' : '■ PRESS E-STOP';
      estopBtn.classList.toggle('active', !pressed);
    });
    btn('Safety-Relay Reset', '', () => sim.setG('safety_relay_reset', 1));
    const ec = btn('Drop EtherCAT', '', () => { const on = !sim.machine.faults.ethercatDrop; sim.machine.setFault('ethercatDrop', on); ec.classList.toggle('active', on); ec.textContent = on ? 'Restore EtherCAT' : 'Drop EtherCAT'; });
    const mc = btn('Meter Comms Loss', '', () => { const on = !sim.machine.faults.meterCommsLoss; sim.machine.setFault('meterCommsLoss', on); mc.classList.toggle('active', on); mc.textContent = on ? 'Restore Meters' : 'Meter Comms Loss'; });
  };

  SimUI.prototype.buildIO = function () {
    const opHost = this.rootEl.querySelector('#sim-op'); opHost.innerHTML = '';
    this._opCells = {};
    Object.keys(OP_LABELS).forEach(k => {
      const cell = el('div', 'io-cell'); cell.appendChild(el('span', 'io-n', 'OP' + k));
      cell.appendChild(el('span', 'io-name', OP_LABELS[k]));
      opHost.appendChild(cell); this._opCells[k] = cell;
    });
    const inHost = this.rootEl.querySelector('#sim-in'); inHost.innerHTML = '';
    this._inCells = {};
    Object.keys(IN_LABELS).forEach(k => {
      const cell = el('div', 'io-cell click'); cell.appendChild(el('span', 'io-n', 'IN' + k));
      cell.appendChild(el('span', 'io-name', IN_LABELS[k]));
      cell.onclick = () => {
        if (k === '0') { const pressed = this.sim.machine.estopLine === 0; this.sim.machine.pressEstop(!pressed); }
        else { const cur = this.sim.machine.inRead(parseInt(k)); this.sim.machine.setIn(parseInt(k), cur ? 0 : 1); }
      };
      inHost.appendChild(cell); this._inCells[k] = cell;
    });
  };

  // ---- live refresh ----
  SimUI.prototype.refresh = function (force) {
    if (!this.staticBuilt) this.buildStatic();
    const sim = this.sim, m = sim.machine, rt = sim.rt, r = this.rootEl;
    r.querySelector('#sim-clock').textContent = (rt.simTime / 1000).toFixed(1);
    const wd = m.getWdog();
    const wdEl = r.querySelector('#sim-wdog'); wdEl.textContent = wd ? 'ON' : 'OFF'; wdEl.className = 'chip ' + (wd ? 'ok' : 'bad');
    const auto = (Math.floor(m.getVr(1)) >> 1) & 1;
    const mEl = r.querySelector('#sim-mode'); mEl.textContent = auto ? 'AUTO' : 'MANUAL'; mEl.className = 'chip ' + (auto ? 'warn' : '');
    // sys bits
    const sys = Math.floor(m.getVr(24));
    const sysHost = r.querySelector('#sim-sys'); sysHost.innerHTML = '';
    sysHost.appendChild(el('span', 'sys-lbl', 'SYSTEMSTATUS ' + sys + ' (0x' + sys.toString(16) + '):'));
    SYS_BITS.forEach((b, i) => { const on = (sys >> i) & 1; sysHost.appendChild(el('span', 'sys-bit ' + (on ? 'on' : ''), b)); });

    if (this._opUpdaters) this._opUpdaters.forEach(f => f());
    // reflect live VR values into numeric inputs (unless the user is editing one)
    if (this._numInputs) for (const ni of this._numInputs) {
      if (document.activeElement !== ni.inp) { const v = sim.getG(ni.name); if (v != null) ni.inp.value = fmt(v); }
    }
    this.renderProcs(); this.renderAxes(); this.renderHeat(); this.renderFlow();
    this.renderIO(); this.renderAnalog(); this.renderVR(force); this.renderLog();
    this.pushTrend(); this.drawTrend();
  };

  SimUI.prototype.renderProcs = function () {
    const rows = this.sim.rt.processTable();
    const host = this.rootEl.querySelector('#sim-procs');
    let html = '<div class="tr th"><span>#</span><span>program</span><span>line</span><span>state</span></div>';
    for (const p of rows) html += `<div class="tr"><span>${p.num}</span><span>${p.name}</span><span>${p.line}</span><span>${p.sleeping ? 'sleep' : 'run'}</span></div>`;
    host.innerHTML = html;
  };

  SimUI.prototype.renderAxes = function () {
    const m = this.sim.machine, host = this.rootEl.querySelector('#sim-axes');
    let html = '<div class="tr th"><span>axis</span><span>MTYPE</span><span>MSPEED</span><span>MPOS</span><span>SRV</span></div>';
    for (const a of AXES) {
      const mt = m.getAxisParam(a.n, 'MTYPE'), ms = m.getAxisParam(a.n, 'MSPEED'), mp = m.getAxisParam(a.n, 'MPOS'), sv = m.getAxisParam(a.n, 'SERVO');
      const moving = mt !== 0;
      html += `<div class="tr"><span>${a.name}</span><span class="${moving ? 'mv' : ''}">${MTYPE_NAME[mt] || mt}</span><span>${ms.toFixed(1)}</span><span>${mp.toFixed(2)}</span><span>${sv ? '●' : '○'}</span></div>`;
    }
    host.innerHTML = html;
  };

  SimUI.prototype.renderHeat = function () {
    const host = this.rootEl.querySelector('#sim-heat');
    const zones = this.sim.plant.getZoneTemps();
    let html = '';
    for (const z of zones) {
      const pct = Math.max(0, Math.min(100, (z.tempF - 60) / (520 - 60) * 100));
      html += `<div class="heat-row"><span class="heat-lbl">${z.label}</span>
        <span class="heat-bar"><span class="heat-fill ${z.on ? 'hot' : ''}" style="width:${pct}%"></span></span>
        <span class="heat-val">${z.tempF.toFixed(0)}°F</span><span class="heat-on ${z.on ? 'on' : ''}">${z.on ? 'HEAT' : 'off'}</span></div>`;
    }
    host.innerHTML = html;
  };

  SimUI.prototype.renderFlow = function () {
    const host = this.rootEl.querySelector('#sim-flow');
    const flows = this.sim.plant.getPumpFlows();
    let html = '<div class="tr th"><span>pump</span><span>rpm</span><span>g/sec</span></div>';
    for (const f of flows) html += `<div class="tr"><span>${f.label}</span><span>${f.rpm.toFixed(1)}</span><span>${f.flow.toFixed(1)}</span></div>`;
    host.innerHTML = html;
  };

  SimUI.prototype.renderIO = function () {
    const m = this.sim.machine;
    for (const k in this._opCells) this._opCells[k].classList.toggle('on', m.readOp(parseInt(k)) === 1);
    for (const k in this._inCells) this._inCells[k].classList.toggle('on', m.inRead(parseInt(k)) === 1);
  };

  SimUI.prototype.renderAnalog = function () {
    const m = this.sim.machine, host = this.rootEl.querySelector('#sim-analog');
    let html = '<div class="tr th"><span>chan</span><span>value</span></div>';
    html += `<div class="tr"><span>AOUT6 Mixer spd</span><span>${m.getAout(6).toFixed(0)}</span></div>`;
    html += `<div class="tr"><span>AOUT7 Kevlar %</span><span>${(m.getAout(7) / 2048 * 100).toFixed(0)}%</span></div>`;
    const dv = [[0, 'ΔP-A'], [1, 'ΔP-B'], [2, 'MixHead'], [5, 'Ovhd1'], [6, 'Ovhd2'], [7, 'Ovhd3']];
    for (const [ch, nm] of dv) html += `<div class="tr"><span>DV_IN${ch} ${nm}</span><span>${(m.dvIn(ch) / 100 * 1.8 + 32).toFixed(0)}°F</span></div>`;
    host.innerHTML = html;
  };

  SimUI.prototype.renderVR = function (rebuild) {
    const host = this.rootEl.querySelector('#sim-vr'), sim = this.sim;
    const f = this.vrFilter;
    if (rebuild || !this._vrRows) {
      this._vrRows = [];
      const names = Array.from(sim.rt.globals.keys()).sort();
      for (const nm of names) {
        if (f && nm.indexOf(f) < 0) continue;
        this._vrRows.push(nm);
        if (this._vrRows.length >= 80) break;
      }
      host.innerHTML = this._vrRows.map(nm => `<div class="tr" data-vr="${sim.rt.globals.get(nm)}"><span>${nm}</span><span class="vrn">VR${sim.rt.globals.get(nm)}</span><span class="vrv" data-nm="${nm}">·</span></div>`).join('');
    }
    host.querySelectorAll('.vrv').forEach(sp => { const i = sim.rt.globals.get(sp.dataset.nm); sp.textContent = fmt(sim.machine.getVr(i)); });
  };

  SimUI.prototype.renderLog = function () {
    const host = this.rootEl.querySelector('#sim-log'), log = this.sim.rt.log;
    while (this.logIndex < log.length) {
      const e = log[this.logIndex++];
      if (this.logFilter === 'warn' && !(e.level === 'warn' || e.level === 'error')) continue;
      if (this.logFilter === 'print' && e.level !== 'print') continue;
      const line = el('div', 'log-line ' + e.level);
      line.textContent = `[${(e.t / 1000).toFixed(1)}s] ${e.level.toUpperCase()} ${e.proc ? 'p' + e.proc : ''}${e.line ? ' L' + e.line : ''}: ${e.msg}`;
      host.appendChild(line);
    }
    while (host.childNodes.length > 300) host.removeChild(host.firstChild);
    host.scrollTop = host.scrollHeight;
  };

  SimUI.prototype.pushTrend = function () {
    const sim = this.sim, tr = this.trend;
    tr.t.push(sim.rt.simTime / 1000);
    tr.z1.push(sim.plant.getZoneTemps()[0].tempF);
    tr.z1sp.push(sim.getG('overhead_zone1_offon_sp') || 0);
    tr.pa.push(Math.abs(sim.machine.getAxisParam(1, 'MSPEED')));
    if (tr.t.length > tr.max) { tr.t.shift(); tr.z1.shift(); tr.z1sp.shift(); tr.pa.shift(); }
  };

  SimUI.prototype.drawTrend = function () {
    const c = this.rootEl.querySelector('#sim-trend'); if (!c) return;
    const ctx = c.getContext('2d'), W = c.width, H = c.height, tr = this.trend;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#11111b'; ctx.fillRect(0, 0, W, H);
    if (tr.t.length < 2) return;
    const n = tr.t.length;
    const line = (arr, max, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * W; const y = H - (arr[i] / max) * (H - 6) - 3; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    };
    line(tr.z1, 520, '#f38ba8'); line(tr.z1sp, 520, '#89b4fa'); line(tr.pa, 210, '#a6e3a1');
    this.rootEl.querySelector('#sim-trend-key').innerHTML =
      '<span style="color:#f38ba8">■ Ovhd Z1 °F</span> <span style="color:#89b4fa">■ Z1 SP</span> <span style="color:#a6e3a1">■ PumpA rpm</span>';
  };

  function fmt(v) { if (v === Math.floor(v)) return String(v); return (Math.round(v * 100) / 100).toString(); }

  // ============================================================
  // Boot the simulator UI into the page
  // ============================================================
  function initSim() {
    if (typeof vrStore === 'undefined' || !root.SimController) { setTimeout(initSim, 50); return; }
    const sim = new root.SimController(vrStore);
    const ui = new SimUI(sim);
    root.simController = sim; root.simUI = ui;

    // Add a Simulate toggle button to the toolbar.
    const toolbar = document.getElementById('toolbar');
    const btn = el('button', 'mode-btn', '◉ Simulator'); btn.id = 'btn-sim';
    const sep = el('div', 'separator');
    toolbar.appendChild(sep); toolbar.appendChild(btn);

    // Mount hidden overlay.
    const mainWrap = document.getElementById('main');
    ui.mount(document.body);
    ui.rootEl.style.display = 'none';

    let active = false;
    const setActive = (on) => {
      active = on;
      ui.rootEl.style.display = on ? 'flex' : 'none';
      mainWrap.style.display = on ? 'none' : 'flex';
      btn.classList.toggle('active', on);
      document.querySelectorAll('#toolbar .mode-btn[data-mode]').forEach(b => b.classList.toggle('active', false));
    };
    btn.onclick = async () => {
      if (!active) {
        if (Object.keys(sim.programs).length === 0) {
          try { await sim.loadSample(); } catch (e) { /* served over file:// — user can Load .BAS */ }
          sim.boot(); ui.buildStatic();
        }
        setActive(true); ui.refresh(true);
      } else setActive(false);
    };
    // Return to visualizer when a view/edit mode button is pressed.
    document.querySelectorAll('#toolbar .mode-btn[data-mode]').forEach(b => b.addEventListener('click', () => { if (active) setActive(false); }));

    // Animation loop.
    let last = 0;
    function loop(now) {
      sim.frame(now);
      if (active && sim.booted) { ui._frac = (ui._frac || 0) + 1; if (sim.running ? (ui._frac % 2 === 0) : true) ui.refresh(false); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSim);
  else initSim();

  root.SimUI = SimUI;
})(typeof self !== 'undefined' ? self : this);
