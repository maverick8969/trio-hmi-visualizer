// ============================================================
// trio-machine.js — Simulated Trio controller hardware
// ------------------------------------------------------------
// Everything the VM touches that isn't language semantics: the VR
// table, motion axes (with simple ramp physics), digital + analog
// I/O banks, the software WDOG / STO, and EtherCAT / Modbus / CoE
// command stubs that return "healthy" so the boot sequence and comms
// programs proceed. Physics that couple outputs->sensors (thermal,
// flow) live in trio-plant.js, which reads/writes through this object.
//
// The VM calls: getVr/setVr, getAxisParam/setAxisParam, motion,
// op/readOp, inRead, ain, getAout/setAout, dvIn/setDvOut, tableGet/
// tableSet, getWdog/setWdog, ethercat/coRead/coWrite, step, axisIdle.
// ============================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TrioMachine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MTYPE_IDLE = 0, MTYPE_MOVE = 1, MTYPE_MOVEABS = 2, MTYPE_FORWARD = 10, MTYPE_REVERSE = 11;

  class Axis {
    constructor(num) {
      this.num = num;
      this.sp = 0;          // SPEED (demand magnitude)
      this.accel = 1000;
      this.decel = 1000;
      this.mspeed = 0;      // measured speed (signed)
      this.mpos = 0;        // measured position
      this.dpos = 0;        // demand position
      this.mtype = MTYPE_IDLE;
      this.servo = 0;
      this.enable = 0;
      this.axisstatus = 0;  // fault bitfield
      this.dir = 0;         // commanded direction: +1 fwd, -1 rev, 0 stop
      this.moveTarget = null; // for MOVE/MOVEABS
      this.homed = 0;
      this.params = {};     // misc axis params (gains, ratios, config)
      this.faultFollowing = false;
    }
  }

  class TrioMachine {
    constructor(opts) {
      opts = opts || {};
      this.numAxes = opts.numAxes || 8;
      this.vrSize = opts.vrSize || 8192;
      this.vr = new Float64Array(this.vrSize);
      // Optional external VR backend (e.g. the visualizer's vrStore) so the
      // running code and the HMI share ONE source of truth. When present,
      // getVr/setVr delegate to it and HMI bindings react to writes.
      this.vrBackend = opts.vrBackend || null;
      this.table = new Float64Array(opts.tableSize || 16000);
      this.axes = [];
      for (let i = 0; i < this.numAxes; i++) this.axes.push(new Axis(i));
      this.op = this.op.bind(this);
      this.opState = new Uint8Array(64);
      this.ain = this._ain.bind(this);
      this.ainVals = new Float64Array(32);
      this.aoutVals = new Float64Array(32);
      this.dvInVals = new Float64Array(32);   // thermocouple/RTD device inputs (centi-degC)
      this.dvOutVals = new Float64Array(32);
      this.wdog = 0;
      this.servoPeriod = 1000; // us
      this.ethercatState = 0;  // 0=init/stopped,1=preop,2=safeop,3=op
      this.vrSink = opts.vrSink || null;   // optional external store (browser vrStore mirror)
      this.startEpoch = opts.startEpochMs || 0;
      this.faults = { estopHeld: false, meterCommsLoss: false, ethercatDrop: false };
      this.eventSink = opts.eventSink || null;
      // physical E-stop line: 1 = healthy/released, 0 = pressed. Default released.
      this.estopLine = 1;
      // traverse home-switch trip position (axis 0 units); homing forwards to it
      this.homeSwitchPos = opts.homeSwitchPos != null ? opts.homeSwitchPos : 2.0;
      // axes that measure speed in rpm (position integrates in revs, /60);
      // all others integrate mpos += mspeed*dt (Trio units/sec convention).
      this.rpmAxes = opts.rpmAxes || { 1: true, 2: true, 3: true, 5: true };
      // axes NOT on the EtherCAT servo torque path — the nip-roll Optidrive
      // (4) and the mixer VFD (5) are analog/PDO driven; the plant owns their
      // mspeed, so step() skips the servo ramp/STO logic for them.
      this.externalAxes = opts.externalAxes || { 4: true, 5: true };
    }

    // ---- VR ----
    getVr(i) {
      i = Math.round(i);
      if (this.vrBackend) return this.vrBackend.get(i) || 0;
      return (i >= 0 && i < this.vrSize) ? this.vr[i] : 0;
    }
    setVr(i, v) {
      i = Math.round(i);
      if (this.vrBackend) { this.vrBackend.set(i, v); if (this.vrSink) this.vrSink(i, v); return; }
      if (i < 0 || i >= this.vrSize) return;
      this.vr[i] = v;
      if (this.vrSink) this.vrSink(i, v);
    }

    // ---- TABLE ----
    tableGet(i) { i = Math.round(i); return (i >= 0 && i < this.table.length) ? this.table[i] : 0; }
    tableSet(i, v) { i = Math.round(i); if (i >= 0 && i < this.table.length) this.table[i] = v; }

    // ---- WDOG / STO ----
    getWdog() { return this.wdog; }
    setWdog(v) { this.wdog = v ? 1 : 0; }

    // ---- digital I/O ----
    op(args, proc) {
      if (!args || !args.length) return;
      if (args.length === 1) {
        const mask = Math.round(args[0]);
        for (let i = 0; i < 24; i++) this.opState[i] = (mask >> i) & 1;
      } else if (args.length === 2) {
        this.opState[Math.round(args[0])] = args[1] ? 1 : 0;
      } else {
        const first = Math.round(args[0]), count = Math.round(args[1]), val = args[2] ? 1 : 0;
        for (let k = 0; k < count; k++) { const ch = first + k; if (ch >= 0 && ch < this.opState.length) this.opState[ch] = val; }
      }
    }
    readOp(ch) { ch = Math.round(ch); return this.opState[ch] ? 1 : 0; }

    inRead(ch, ch2) {
      ch = Math.round(ch);
      // IN 0 = safety E-stop line (1 = healthy, 0 = pressed). Fault overrides.
      if (ch === 0) return (this.estopLine && !this.faults.estopHeld) ? 1 : 0;
      // Forced by the UI / test takes precedence.
      if (this.inForced && this.inForced[ch] !== undefined) return this.inForced[ch];
      // IN 1 = traverse home switch: active once the traverse (axis 0) has run
      // forward past the home-switch position (drives the DATUM homing search).
      // Modeled as the logical reading the code expects (INVERT_IN is recorded
      // but not re-applied here — see homeSwitchPos).
      if (ch === 1) return (this.axes[0].mpos >= this.homeSwitchPos) ? 1 : 0;
      return this.inState ? (this.inState[ch] ? 1 : 0) : 0;
    }
    setIn(ch, v) { if (!this.inForced) this.inForced = {}; this.inForced[Math.round(ch)] = v ? 1 : 0; }
    clearInForce(ch) { if (this.inForced) delete this.inForced[Math.round(ch)]; }

    // ---- analog ----
    _ain(ch) { ch = Math.round(ch); return this.ainVals[ch] || 0; }
    setAin(ch, v) { ch = Math.round(ch); if (ch >= 0 && ch < this.ainVals.length) this.ainVals[ch] = v; }
    getAout(ch) { ch = Math.round(ch); return this.aoutVals[ch] || 0; }
    setAout(ch, v) { ch = Math.round(ch); if (ch >= 0 && ch < this.aoutVals.length) this.aoutVals[ch] = v; }
    dvIn(ch) { ch = Math.round(ch); return this.dvInVals[ch] || 0; }
    setDvIn(ch, v) { ch = Math.round(ch); if (ch >= 0 && ch < this.dvInVals.length) this.dvInVals[ch] = v; }
    setDvOut(ch, v) { ch = Math.round(ch); if (ch >= 0 && ch < this.dvOutVals.length) this.dvOutVals[ch] = v ? (v === true ? 1 : v) : 0; }
    getDvOut(ch) { ch = Math.round(ch); return this.dvOutVals[ch] || 0; }

    // ---- axes ----
    axis(n) { n = Math.round(n); return (n >= 0 && n < this.axes.length) ? this.axes[n] : this.axes[0]; }

    getAxisParam(n, name) {
      const ax = this.axis(n);
      switch (name) {
        case 'MSPEED': return ax.mspeed;
        case 'SPEED': return ax.sp;
        case 'ACCEL': return ax.accel;
        case 'DECEL': return ax.decel;
        case 'MPOS': return ax.mpos;
        case 'DPOS': return ax.dpos;
        case 'MTYPE': case 'NTYPE': return ax.mtype;
        case 'AXISSTATUS': return ax.axisstatus;
        case 'SERVO': return ax.servo;
        case 'AXIS_ENABLE': case 'DRIVE_ENABLE': return ax.enable;
        case 'REMAIN': return ax.moveTarget != null ? (ax.moveTarget - ax.mpos) : 0;
        default: return ax.params[name] !== undefined ? ax.params[name] : 0;
      }
    }

    setAxisParam(n, name, val) {
      const ax = this.axis(n);
      switch (name) {
        case 'SPEED': ax.sp = val; break;
        case 'ACCEL': ax.accel = Math.abs(val) || ax.accel; break;
        case 'DECEL': ax.decel = Math.abs(val) || ax.decel; break;
        case 'MPOS': ax.mpos = val; break;
        case 'DPOS': ax.dpos = val; break;
        case 'MTYPE': ax.mtype = val; break;
        case 'SERVO': ax.servo = val ? 1 : 0; break;
        case 'AXIS_ENABLE': case 'DRIVE_ENABLE': ax.enable = val ? 1 : 0; break;
        case 'AXISSTATUS': ax.axisstatus = val; break;
        default: ax.params[name] = val; break;
      }
    }

    axisIdle(n) { return this.axis(n).mtype === MTYPE_IDLE; }

    motion(cmd, n, args) {
      if (cmd === 'RAPIDSTOP') { for (const ax of this.axes) { ax.dir = 0; ax.moveTarget = null; } return; }
      const ax = this.axis(n);
      switch (cmd) {
        case 'FORWARD': ax.dir = 1; ax.mtype = MTYPE_FORWARD; ax.moveTarget = null; break;
        case 'REVERSE': ax.dir = -1; ax.mtype = MTYPE_REVERSE; ax.moveTarget = null; break;
        case 'CANCEL': ax.dir = 0; ax.moveTarget = null; break; // decel to 0, then idle
        case 'DATUM':
          if (args.length && Math.round(args[0]) === 0) { ax.axisstatus = 0; ax.faultFollowing = false; }
          else { ax.homed = 1; ax.mpos = 0; ax.dpos = 0; ax.mtype = MTYPE_IDLE; }
          break;
        case 'DEFPOS': if (args.length) { ax.mpos = args[0]; ax.dpos = args[0]; } break;
        case 'MOVE': if (args.length) { ax.moveTarget = ax.mpos + args[0]; ax.dir = Math.sign(args[0]) || 1; ax.mtype = MTYPE_MOVE; } break;
        case 'MOVEABS': if (args.length) { ax.moveTarget = args[0]; ax.dir = Math.sign(args[0] - ax.mpos) || 1; ax.mtype = MTYPE_MOVEABS; } break;
        default: break;
      }
    }

    // ---- EtherCAT / CoE / Modbus stubs (return healthy) ----
    // ETHERCAT(func, slot, [vr...]) — function-code dispatch.
    ethercat(a, rawArgs, proc, rt) {
      const func = Math.round(a[0]);
      if (this.faults.ethercatDrop) { this.ethercatState = 0; }
      if (func === 0) { this.ethercatState = this.faults.ethercatDrop ? 0 : 3; return 1; } // start master -> Op
      if (func === 0x22) { // read state into VR at a[2]
        const vrIdx = a.length >= 3 ? Math.round(a[2]) : null;
        if (vrIdx != null) this.setVr(vrIdx, this.faults.ethercatDrop ? 0 : 3);
        return 1;
      }
      if (func === 0x64) return 1;   // CoE motor-error clear
      if (func === 0x91) return 1;   // PDO / SDO helper
      return 1;
    }
    ethernet(a) { return 1; }
    // CO_READ(slot, addr, index, sub, type, vr) — set vr to an expected value, return success.
    coRead(a, rawArgs) {
      const idx = Math.round(a[2]);   // CoE index
      const sub = Math.round(a[3]);
      const vrIdx = a.length >= 6 ? Math.round(a[5]) : null;
      if (vrIdx != null) {
        if (idx === 0x1018 && sub === 1) this.setVr(vrIdx, 734);      // vendor id
        else if (idx === 0x1018 && sub === 2) this.setVr(vrIdx, 368); // product id
        else this.setVr(vrIdx, 0);
      }
      return 1;
    }
    coWrite() { return 1; }
    command(name, cargs, args, axis, proc) {
      // catch-all for config verbs we accept but don't model
      const NOOP = ['INVERT_IN', 'AIN_CONFIG', 'AOUT_CONFIG', 'DV_IN_CONFIG', 'ENCODER_RATIO',
        'STEP_RATIO', 'FLASHTABLE', 'ATYPE', 'MODBUS', 'MODBUSM', 'GLOBAL', 'TROFF', 'TRON',
        'RESET', 'CLEAR', 'CLEAR_PARAMS', 'AXIS_OFFSET'];
      return NOOP.indexOf(name) >= 0;
    }

    // Modbus master read/write stub — returns success; flow-meter data is
    // synthesized by the plant, so meter reads simply succeed here.
    modbus(a, rawArgs, proc, rt) {
      if (this.faults.meterCommsLoss) return 0;
      return 1;
    }

    timeString() { const s = Math.floor((this.startEpoch + this._simMs) / 1000); const hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60, ss = s % 60; return pad(hh) + ':' + pad(mm) + ':' + pad(ss); }
    dateString() { return '01/01/2025'; }

    // ---- physics step (axes) ----
    step(dtMs, rt) {
      this._simMs = rt ? rt.simTime : (this._simMs || 0) + dtMs;
      const dt = dtMs / 1000;
      for (const ax of this.axes) {
        // External (VFD/analog) axes: the plant owns mspeed; just integrate pos.
        if (this.externalAxes[ax.num]) {
          ax.mpos += (this.rpmAxes[ax.num] ? (ax.mspeed / 60) : ax.mspeed) * dt;
          ax.dpos = ax.mpos;
          continue;
        }
        // Safe-torque-off model: torque requires WDOG (STO energized) AND the
        // servo loop closed (SERVO=1). AXIS_ENABLE is the EtherCAT drive-enable
        // (set during boot bring-up / reset) and is recorded but not gating —
        // on a normal boot INIT closes the loop with SERVO=1 without an explicit
        // per-axis AXIS_ENABLE, and dropping WDOG or SERVO is what removes torque.
        const torque = this.wdog && ax.servo;
        let target;
        if (!torque) {
          target = 0;
          if (Math.abs(ax.mspeed) < 1e-6) { ax.mspeed = 0; if (ax.mtype !== MTYPE_IDLE) ax.mtype = MTYPE_IDLE; ax.dir = 0; }
        } else if (ax.moveTarget != null) {
          // point move (MOVE/MOVEABS): trapezoidal profile — cruise at SPEED,
          // then decelerate so the axis stops ON target (no overshoot/hunting).
          const remain = ax.moveTarget - ax.mpos;
          const absR = Math.abs(remain);
          if (absR < 0.01 && Math.abs(ax.mspeed) < 0.05) {
            ax.mpos = ax.moveTarget; ax.moveTarget = null; ax.dir = 0; ax.mtype = MTYPE_IDLE; target = 0;
          } else {
            const vStop = Math.sqrt(2 * (ax.decel || 1000) * absR); // speed that still stops in `remain`
            target = Math.sign(remain) * Math.min(ax.sp, vStop);
          }
        } else {
          target = ax.dir * ax.sp;
        }
        // ramp mspeed toward target
        const rate = (Math.abs(target) > Math.abs(ax.mspeed) ? ax.accel : ax.decel) || 1000;
        const dv = rate * dt;
        if (ax.mspeed < target) ax.mspeed = Math.min(target, ax.mspeed + dv);
        else if (ax.mspeed > target) ax.mspeed = Math.max(target, ax.mspeed - dv);
        // settle to idle when stopped & not commanded
        if (ax.dir === 0 && ax.moveTarget == null && Math.abs(ax.mspeed) < 1e-3) { ax.mspeed = 0; if (torque || ax.mtype !== MTYPE_IDLE) ax.mtype = MTYPE_IDLE; }
        // integrate position. Rotary (rpm) axes advance in revs (mspeed/60);
        // linear axes (traverse, nip) advance mpos += mspeed*dt (units/sec).
        ax.mpos += (this.rpmAxes[ax.num] ? (ax.mspeed / 60) : ax.mspeed) * dt;
        ax.dpos = ax.mpos;
      }
    }

    // Fault injection helpers (called by UI)
    setFault(name, on) { this.faults[name] = !!on; }
    pressEstop(pressed) { this.estopLine = pressed ? 0 : 1; }
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  TrioMachine.MTYPE = { IDLE: MTYPE_IDLE, MOVE: MTYPE_MOVE, MOVEABS: MTYPE_MOVEABS, FORWARD: MTYPE_FORWARD, REVERSE: MTYPE_REVERSE };
  return TrioMachine;
});
