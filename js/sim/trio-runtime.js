// ============================================================
// trio-runtime.js — TrioBASIC compiler + multi-process VM
// ------------------------------------------------------------
// Two parts:
//   1. compileProgram(statements) — lowers the parser AST into a flat
//      instruction array with resolved jump targets, so cooperative
//      multitasking is a simple instruction-pointer advance. Loops made
//      of `GOTO label` yield one "scan" per scheduler slice (matching the
//      Trio scan model); FOR/WHILE/REPEAT internal back-edges do NOT
//      yield, so bounded loops finish within a scan.
//   2. TrioRuntime — the controller VM: global symbol table (CONSTANT
//      values, GLOBAL name->VR aliases, DIM arrays), a process scheduler
//      on a 1 ms base tick, TICKS/WA timers, WDOG, RUN/STOP/PROC_STATUS,
//      and ON BASICERROR handling. All hardware effects (axes, digital/
//      analog I/O, EtherCAT/Modbus) are delegated to an injected `machine`
//      object; physics live in the plant. This keeps the VM testable in
//      Node with a stub machine.
// ============================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(
    (typeof require === 'function') ? require('./trio-parser.js') : root.TrioParser
  );
  else root.TrioRuntime = factory(root.TrioParser);
})(typeof self !== 'undefined' ? self : this, function (TrioParser) {
  'use strict';

  // ---- Axis parameter names the VM routes to the machine (bare form uses BASE axis) ----
  const AXIS_PARAMS = new Set(['SPEED', 'ACCEL', 'DECEL', 'CREEP', 'JOGSPEED', 'LSPEED',
    'MSPEED', 'MPOS', 'DPOS', 'MTYPE', 'NTYPE', 'AXISSTATUS', 'SERVO', 'AXIS_ENABLE',
    'UNITS', 'FE', 'FE_LIMIT', 'FE_RANGE', 'FE_LATCH', 'FS_LIMIT', 'RS_LIMIT', 'FHOLD_IN',
    'REP_OPTION', 'REP_DIST', 'ENCODER_RATIO', 'STEP_RATIO', 'ATYPE', 'DAC', 'DAC_OUT',
    'P_GAIN', 'I_GAIN', 'D_GAIN', 'OV_GAIN', 'VFF_GAIN', 'DRIVE_MODE', 'DRIVE_PROFILE',
    'DRIVE_ENABLE', 'DRIVE_STATUS', 'DRIVE_CONTROL', 'REMAIN', 'ENDMOVE', 'VP_SPEED',
    'ADDAX_AXIS', 'CLOSE_WIN', 'OPEN_WIN', 'TRIGGER', 'VERIFY', 'MERGE', 'DATUM_IN',
    'FWD_IN', 'REV_IN', 'FASTDEC', 'DECEL_ANGLE']);

  // Motion command verbs handled by the machine (act on BASE axis or AXIS() qualifier).
  const MOTION_CMDS = new Set(['FORWARD', 'REVERSE', 'CANCEL', 'RAPIDSTOP', 'DATUM', 'MOVE',
    'MOVEABS', 'MOVEMODIFY', 'DEFPOS', 'CONNECT', 'MOVELINK', 'CAM', 'CAMBOX', 'ADD_DAC',
    'REGIST', 'HOMES', 'MHELICAL', 'MOVECIRC']);

  // ============================================================
  // Compiler: AST statement list -> flat ops
  // ============================================================
  function compileProgram(statements, programName) {
    const ops = [];
    const labels = {};       // label name (lower) -> op index
    const loopEndPatches = []; // stack of arrays for EXIT_LOOP backpatch

    const emit = (op) => { ops.push(op); return ops.length - 1; };
    const here = () => ops.length;

    function compileList(list) { for (const s of list) compileStmt(s); }

    function compileStmt(s) {
      if (!s) return;
      switch (s.type) {
        case 'label':
          labels[s.name.toLowerCase()] = here();
          emit({ op: 'NOP', line: s.line, label: s.name });
          break;
        case 'global': emit({ op: 'DECL', kind: 'global', name: s.name, expr: s.expr, line: s.line }); break;
        case 'constant': emit({ op: 'DECL', kind: 'constant', name: s.name, expr: s.expr, line: s.line }); break;
        case 'dim': emit({ op: 'DECL', kind: 'dim', decls: s.decls, line: s.line }); break;
        case 'assign': emit({ op: 'ASSIGN', target: s.target, value: s.value, line: s.line }); break;
        case 'command': emit({ op: 'CMD', name: s.name, callArgs: s.callArgs, axis: s.axis, args: s.args, fields: s.fields, line: s.line }); break;
        case 'print': emit({ op: 'PRINT', port: s.port, items: s.items, line: s.line }); break;
        case 'run': emit({ op: 'RUN', name: s.name, proc: s.proc, line: s.line }); break;
        case 'stop': emit({ op: 'STOP', name: s.name, line: s.line }); break;
        case 'halt': emit({ op: 'HALT', line: s.line }); break;
        case 'onerror': emit({ op: 'ONERR', label: s.label, gosub: s.gosub, line: s.line }); break;
        case 'goto': emit({ op: 'JMP', target: -1, label: s.label, explicit: true, line: s.line }); break;
        case 'gosub': emit({ op: 'CALL', target: -1, label: s.label, line: s.line }); break;
        case 'return': emit({ op: 'RET', line: s.line }); break;
        case 'exitloop': {
          const idx = emit({ op: 'JMP', target: -1, line: s.line });
          if (loopEndPatches.length) loopEndPatches[loopEndPatches.length - 1].push(idx);
          break;
        }
        case 'waituntil': emit({ op: 'WAITUNTIL', cond: s.cond, line: s.line }); break;
        case 'waitloaded': emit({ op: 'WAITLOADED', mode: s.mode, line: s.line }); break;
        case 'if': compileIf(s); break;
        case 'for': compileFor(s); break;
        case 'while': compileWhile(s); break;
        case 'repeat': compileRepeat(s); break;
        default: emit({ op: 'NOP', line: s.line || 0 });
      }
    }

    function compileIf(s) {
      // cond; JZ next; then; JMP end; next: (elif...) else; end:
      const endJumps = [];
      let prevJZ = emit({ op: 'JZ', cond: s.cond, target: -1, line: s.line });
      compileList(s.then);
      endJumps.push(emit({ op: 'JMP', target: -1, line: s.line }));
      ops[prevJZ].target = here();
      for (const ei of s.elifs) {
        prevJZ = emit({ op: 'JZ', cond: ei.cond, target: -1, line: s.line });
        compileList(ei.body);
        endJumps.push(emit({ op: 'JMP', target: -1, line: s.line }));
        ops[prevJZ].target = here();
      }
      if (s.else) compileList(s.else);
      const end = here();
      for (const j of endJumps) ops[j].target = end;
    }

    function compileFor(s) {
      // FORINIT ; top: FORTEST -> if done JMP pop ; body ; FORNEXT -> JMP top ; pop: FORPOP
      // Both normal completion AND EXIT_LOOP jump to FORPOP so the loop frame is
      // always popped exactly once (fixes a forStack leak on EXIT_LOOP).
      emit({ op: 'FORINIT', var: s.var, from: s.from, to: s.to, step: s.step, line: s.line });
      const top = here();
      const testIdx = emit({ op: 'FORTEST', var: s.var, target: -1, line: s.line });
      loopEndPatches.push([]);
      compileList(s.body);
      emit({ op: 'FORNEXT', var: s.var, top: top, line: s.line });
      const popIdx = emit({ op: 'FORPOP', line: s.line });
      ops[testIdx].target = popIdx;
      for (const j of loopEndPatches.pop()) ops[j].target = popIdx;
    }

    function compileWhile(s) {
      const top = here();
      const testIdx = emit({ op: 'JZ', cond: s.cond, target: -1, internal: true, line: s.line });
      loopEndPatches.push([]);
      compileList(s.body);
      emit({ op: 'JMP', target: top, internal: true, line: s.line });
      const end = here();
      ops[testIdx].target = end;
      for (const j of loopEndPatches.pop()) ops[j].target = end;
    }

    function compileRepeat(s) {
      const top = here();
      loopEndPatches.push([]);
      compileList(s.body);
      // REPEAT..UNTIL: loop while until is false -> JZ top
      emit({ op: 'JZ', cond: s.until, target: top, internal: true, line: s.line });
      const end = here();
      for (const j of loopEndPatches.pop()) ops[j].target = end;
    }

    compileList(statements);
    emit({ op: 'END', line: 0 });

    // Resolve label jump/call targets.
    for (const op of ops) {
      if ((op.op === 'JMP' || op.op === 'CALL') && op.target === -1 && op.label) {
        const t = labels[op.label.toLowerCase()];
        if (t === undefined) { op.target = ops.length - 1; op.badLabel = true; }
        else op.target = t;
      }
    }
    return { ops, labels, name: programName };
  }

  // ============================================================
  // Runtime / VM
  // ============================================================
  const RUNNING = 1, STOPPED = 0;

  class Process {
    constructor(num, name, program) {
      this.num = num;
      this.name = name;
      this.program = program;      // {ops, labels}
      this.ip = 0;
      this.callStack = [];         // gosub return ips
      this.forStack = [];          // {var, limit, step, top}
      this.locals = new Map();     // process-local variables
      this.ticks = 0;              // per-process TICKS down-counter
      this.baseAxis = 0;           // BASE axis
      this.status = RUNNING;
      this.sleepUntil = 0;         // sim-time ms
      this.errorHandler = null;    // label name for ON BASICERROR
      this.errorGosub = false;
      this.curLine = 0;
      this.runError = 0;
      this.errorLine = 0;
      this.warnedNames = new Set();
      this.lastScanOps = 0;
    }
  }

  class TrioRuntime {
    constructor(machine, opts) {
      this.machine = machine;       // hardware/plant interface
      this.opts = opts || {};
      this.constants = new Map();   // NAME(lower) -> number
      this.globals = new Map();     // NAME(lower) -> vr index
      this.arrays = new Map();      // NAME(lower) -> {data:Float64Array, dims:[...]}
      this.programs = new Map();    // NAME(upper) -> {ops,labels}
      this.procByNum = new Map();   // proc# -> Process
      this.procByName = new Map();  // NAME(upper) -> Process (last launched)
      this.processes = [];          // active processes (execution order)
      this.simTime = 0;             // ms
      this.log = [];                // {t, level, proc, line, msg}
      this.maxOpsPerScan = (opts && opts.maxOpsPerScan) || 40000;
      this.halted = false;
      this.onLog = (opts && opts.onLog) || null;
    }

    // ---- program registry ----
    loadProgram(name, statements) {
      const compiled = compileProgram(statements, name.toUpperCase());
      this.programs.set(name.toUpperCase(), compiled);
      return compiled;
    }

    logMsg(level, msg, proc, line) {
      const entry = { t: this.simTime, level, proc: proc || null, line: line || 0, msg };
      this.log.push(entry);
      if (this.log.length > 5000) this.log.shift();
      if (this.onLog) this.onLog(entry);
    }

    // ---- link phase: pre-register all declarations from all programs ----
    // Autorun first (its dictionary defines the shared symbol table), then others.
    link(autorunName) {
      const order = [];
      if (autorunName && this.programs.has(autorunName.toUpperCase())) order.push(autorunName.toUpperCase());
      for (const n of this.programs.keys()) if (!order.includes(n)) order.push(n);
      for (const n of order) {
        const prog = this.programs.get(n);
        for (const op of prog.ops) {
          if (op.op !== 'DECL') continue;
          this.execDecl(op, null);
        }
      }
    }

    execDecl(op, proc) {
      if (op.kind === 'constant') {
        const val = op.expr ? this.evalExpr(op.expr, proc) : 0;
        this.constants.set(op.name.toLowerCase(), val);
      } else if (op.kind === 'global') {
        const idx = op.expr ? Math.round(this.evalExpr(op.expr, proc)) : 0;
        this.globals.set(op.name.toLowerCase(), idx);
      } else if (op.kind === 'dim') {
        for (const d of op.decls) {
          let total = 1;
          const dims = (d.dims && d.dims.length) ? d.dims.map(e => Math.max(1, Math.round(this.evalExpr(e, proc)) + 1)) : [1];
          for (const s of dims) total *= s;
          if (!this.arrays.has(d.name.toLowerCase())) {
            this.arrays.set(d.name.toLowerCase(), {
              data: new Float64Array(total), dims, dtype: d.dtype, strings: d.dtype === 'STRING' ? {} : null,
            });
          }
        }
      }
    }

    // ---- process lifecycle ----
    startProcess(name, num) {
      const prog = this.programs.get(name.toUpperCase());
      if (!prog) { this.logMsg('error', 'RUN of unknown program "' + name + '"'); return null; }
      if (num == null) num = this.autoProcNum();
      // stop any existing process on that number
      this.stopProcessNum(num, true);
      const p = new Process(num, name.toUpperCase(), prog);
      this.procByNum.set(num, p);
      this.procByName.set(name.toUpperCase(), p);
      this.processes.push(p);
      this.logMsg('info', 'RUN "' + name.toUpperCase() + '" on process ' + num, num);
      return p;
    }

    autoProcNum() {
      for (let i = 20; i < 64; i++) if (!this.procByNum.has(i)) return i;
      return 63;
    }

    stopProcessNum(num, silent) {
      const p = this.procByNum.get(num);
      if (p) {
        p.status = STOPPED;
        this.procByNum.delete(num);
        this.processes = this.processes.filter(x => x !== p);
        if (this.procByName.get(p.name) === p) this.procByName.delete(p.name);
        if (!silent) this.logMsg('info', 'STOP process ' + num + ' (' + p.name + ')', num);
      }
    }

    stopProcessName(name) {
      const p = this.procByName.get(name.toUpperCase());
      if (p) this.stopProcessNum(p.num);
    }

    procStatus(num) {
      const p = this.procByNum.get(Math.round(num));
      return (p && p.status === RUNNING) ? 1 : 0;
    }

    // ---- boot ----
    boot(autorunName, autorunProc) {
      this.link(autorunName);
      this.startProcess(autorunName, autorunProc == null ? 1 : autorunProc);
      this.logMsg('info', 'Controller boot — autorun ' + autorunName.toUpperCase());
    }

    // ---- scheduler: advance one base tick (default 1 ms) ----
    tick(dtMs) {
      dtMs = dtMs || 1;
      this.simTime += dtMs;
      // decrement per-process TICKS
      for (const p of this.processes) p.ticks -= dtMs;
      // run each active process one scan
      const snapshot = this.processes.slice();
      for (const p of snapshot) {
        if (p.status !== RUNNING) continue;
        if (this.simTime < p.sleepUntil) continue;
        this.runScan(p);
      }
      // advance hardware + plant physics
      if (this.machine.step) this.machine.step(dtMs, this);
    }

    // Run one process until it yields (WA/WAITUNTIL/backward explicit GOTO/END) or budget.
    runScan(p) {
      const ops = p.program.ops;
      let budget = this.maxOpsPerScan;
      p.lastScanOps = 0;
      while (budget-- > 0) {
        if (p.status !== RUNNING) return;
        const op = ops[p.ip];
        if (!op) { this.endProcess(p); return; }
        p.curLine = op.line || p.curLine;
        p.lastScanOps++;
        let yielded = false;
        try {
          yielded = this.execOp(p, op);
        } catch (e) {
          this.handleBasicError(p, e);
          return;
        }
        if (yielded) return;
      }
      // budget exhausted — yield to keep the UI responsive (busy loop)
      this.logMsg('warn', 'process ' + p.num + ' (' + p.name + ') exceeded ' + this.maxOpsPerScan + ' ops/scan — yielding', p.num, p.curLine);
    }

    endProcess(p) {
      p.status = STOPPED;
      this.procByNum.delete(p.num);
      this.processes = this.processes.filter(x => x !== p);
      if (this.procByName.get(p.name) === p) this.procByName.delete(p.name);
      this.logMsg('info', 'process ' + p.num + ' (' + p.name + ') ended', p.num, p.curLine);
    }

    // Execute one op. Returns true if the process should yield after it.
    execOp(p, op) {
      switch (op.op) {
        case 'NOP': p.ip++; return false;
        case 'DECL': this.execDecl(op, p); p.ip++; return false;
        case 'END': this.endProcess(p); return true;
        case 'ASSIGN': this.execAssign(p, op.target, op.value); p.ip++; return false;
        case 'CMD': { const y = this.execCommand(p, op); if (!y.handledIp) p.ip++; return !!y.yield; }
        case 'PRINT': this.execPrint(p, op); p.ip++; return false;
        case 'ONERR': p.errorHandler = op.label; p.errorGosub = !!op.gosub; p.ip++; return false;
        case 'JMP': {
          const backward = op.target <= p.ip;
          p.ip = op.target;
          // Only explicit user GOTO backward jumps end a scan (one scan / slice).
          return !!(op.explicit && backward);
        }
        case 'JZ': {
          const v = this.truthy(this.evalExpr(op.cond, p));
          if (!v) { p.ip = op.target; } else { p.ip++; }
          return false;
        }
        case 'CALL': p.callStack.push(p.ip + 1); p.ip = op.target; return false;
        case 'RET': p.ip = (p.callStack.length ? p.callStack.pop() : p.ip + 1); return false;
        case 'FORINIT': {
          const from = this.evalExpr(op.from, p);
          const to = this.evalExpr(op.to, p);
          const step = op.step ? this.evalExpr(op.step, p) : 1;
          this.writeVar(p, op.var, from);
          p.forStack.push({ var: op.var.toLowerCase(), limit: to, step });
          p.ip++; return false;
        }
        case 'FORTEST': {
          const f = p.forStack[p.forStack.length - 1];
          const cur = this.readVar(p, op.var);
          const done = f ? (f.step >= 0 ? cur > f.limit : cur < f.limit) : true;
          if (done) { p.ip = op.target; } else { p.ip++; }  // pop happens at FORPOP
          return false;
        }
        case 'FORNEXT': {
          const f = p.forStack[p.forStack.length - 1];
          this.writeVar(p, op.var, this.readVar(p, op.var) + (f ? f.step : 1));
          p.ip = op.top; return false;   // internal back-edge: no yield
        }
        case 'FORPOP': { p.forStack.pop(); p.ip++; return false; }
        case 'WAITUNTIL': {
          const v = this.truthy(this.evalExpr(op.cond, p));
          if (v) { p.ip++; return false; }
          return true; // stay on this op, yield
        }
        case 'WAITLOADED': {
          if (op.mode === 'IDLE') {
            const idle = this.machine.axisIdle ? this.machine.axisIdle(p.baseAxis) : true;
            if (idle) { p.ip++; return false; }
            return true;
          }
          // LOADED: yield exactly one slice so a preceding CANCEL/MOVE loads.
          if (!op._waited) { op._waited = false; }
          p.ip++; return true;
        }
        case 'RUN': {
          const proc = op.proc != null ? Math.round(this.evalExpr(op.proc, p)) : null;
          this.startProcess(op.name, proc);
          p.ip++; return false;
        }
        case 'STOP': {
          if (op.name) this.stopProcessName(op.name);
          else { p.ip++; this.endProcess(p); return true; }
          p.ip++; return false;
        }
        case 'HALT': this.halted = true; p.ip++; return true;
        default: p.ip++; return false;
      }
    }

    handleBasicError(p, e) {
      p.runError = (e && e.trioError) || 1;
      p.errorLine = p.curLine;
      this.logMsg('error', 'BASIC error in ' + p.name + ' line ' + p.curLine + ': ' + (e && e.message), p.num, p.curLine);
      if (p.errorHandler && p.program.labels[p.errorHandler.toLowerCase()] !== undefined) {
        if (p.errorGosub) p.callStack.push(p.ip);
        p.ip = p.program.labels[p.errorHandler.toLowerCase()];
      } else {
        this.endProcess(p);
      }
    }

    // ---- PRINT ----
    execPrint(p, op) {
      let s = '';
      for (const it of op.items) {
        const v = this.evalExpr(it.expr, p);
        s += (typeof v === 'string') ? v : this.fmtNum(v);
        if (it.sep === ',') s += '\t';
      }
      const port = op.port != null ? Math.round(this.evalExpr(op.port, p)) : 0;
      this.logMsg('print', s, p.num, p.curLine);
      if (this.machine.print) this.machine.print(port, s);
    }
    fmtNum(v) { if (v === Math.floor(v)) return String(v); return String(Math.round(v * 1e6) / 1e6); }

    // ============================================================
    // Command dispatch
    // ============================================================
    execCommand(p, op) {
      const name = op.name.toUpperCase();
      const args = () => op.args.map(a => this.evalExpr(a, p));
      const cargs = () => op.callArgs.map(a => this.evalExpr(a, p));
      const axisOf = () => (op.axis != null ? Math.round(this.evalExpr(op.axis, p)) : p.baseAxis);

      // Motion commands
      if (MOTION_CMDS.has(name)) {
        this.machine.motion(name, axisOf(), cargs().concat(args()), p);
        return {};
      }

      switch (name) {
        case 'WA': {
          const ms = op.callArgs.length ? this.evalExpr(op.callArgs[0], p) : (op.args.length ? this.evalExpr(op.args[0], p) : 0);
          p.sleepUntil = this.simTime + Math.max(0, ms);
          p.ip++; return { yield: true, handledIp: true };
        }
        case 'BASE': { const a = cargs(); if (a.length) p.baseAxis = Math.round(a[0]); return {}; }
        case 'OP': this.machine.op(cargs(), p); return {};
        case 'AOUT': { const a = cargs(); if (a.length >= 2) this.machine.setAout(Math.round(a[0]), a[1]); return {}; }
        case 'DV_OUT': { const a = cargs(); if (a.length >= 2) this.machine.setDvOut(Math.round(a[0]), a[1]); return {}; }
        case 'SET_BIT': { const a = cargs(); if (a.length >= 2) this.setVrBit(Math.round(a[1]), Math.round(a[0]), 1); return {}; }
        case 'CLEAR_BIT': { const a = cargs(); if (a.length >= 2) this.setVrBit(Math.round(a[1]), Math.round(a[0]), 0); return {}; }
        case 'TABLE': { const a = cargs(); if (a.length >= 2) { for (let k = 1; k < a.length; k++) this.machine.tableSet(Math.round(a[0]) + (k - 1), a[k]); } return {}; }
        case 'WDOG': return {}; // handled as assignment normally
        case 'ETHERCAT': this.machine.ethercat(cargs(), op.callArgs, p, this); return {};
        case 'USER_PID': { const a = cargs(); this.execUserPid(p, a[0] || 0, Math.round(a[1]), Math.round(a[2])); return {}; }
        case 'ETHERNET': this.machine.ethernet ? this.machine.ethernet(cargs()) : null; return {};
        case 'CO_READ': case 'CO_WRITE': return {}; // handled as function calls when they return a value
        case 'IP_PROTOCOL_CTRL': return {};
        case 'FLASHTABLE': return {};
        case 'INVERT_IN': return {};
        case 'AIN_CONFIG': case 'AOUT_CONFIG': case 'DV_IN_CONFIG': return {};
        case 'RAPIDSTOP': this.machine.motion('RAPIDSTOP', -1, [], p); return {};
        case 'PRINT': return {};
        case 'ON': return {};
        default:
          // Unknown command: accept as no-op, warn once per program+name.
          if (this.machine.command) { const handled = this.machine.command(name, cargs(), args(), axisOf(), p); if (handled) return {}; }
          this.warnOnce(p, 'cmd:' + name, 'unimplemented command "' + op.name + '" (treated as no-op)');
          return {};
      }
    }

    // ============================================================
    // Assignment
    // ============================================================
    execAssign(p, target, valueExpr) {
      const val = this.evalExpr(valueExpr, p);
      this.assignTo(p, target, val);
    }

    assignTo(p, target, val) {
      switch (target.type) {
        case 'var': return this.writeVar(p, target.name, val);
        case 'index': return this.writeIndexed(p, target.name, target.args.map(a => this.evalExpr(a, p)), val);
        case 'axisparam': {
          const axis = target.axis != null ? Math.round(this.evalExpr(target.axis, p)) : p.baseAxis;
          return this.machine.setAxisParam(axis, target.name.toUpperCase(), val, p);
        }
        case 'bit': {
          const bit = this.resolveBit(p, target.field);
          return this.writeBit(p, target.base, bit, val ? 1 : 0);
        }
        default: this.logMsg('error', 'bad assignment target', p.num, p.curLine);
      }
    }

    // Write a bare variable / builtin / axis-param(base).
    writeVar(p, name, val) {
      const lname = name.toLowerCase();
      const uname = name.toUpperCase();
      if (uname === 'WDOG') { this.machine.setWdog(val ? 1 : 0); return; }
      if (uname === 'TICKS') { p.ticks = val; return; }
      if (uname === 'SERVO_PERIOD') { this.machine.servoPeriod = val; return; }
      if (uname === 'IP_PROTOCOL_CTRL') { return; }
      if (AXIS_PARAMS.has(uname)) { this.machine.setAxisParam(p.baseAxis, uname, val, p); return; }
      if (this.globals.has(lname)) { this.setVr(this.globals.get(lname), val); return; }
      if (this.constants.has(lname)) { this.warnOnce(p, 'constassign:' + lname, 'assignment to CONSTANT "' + name + '" ignored'); return; }
      // process-local (auto-created)
      p.locals.set(lname, val);
    }

    writeIndexed(p, name, idxs, val) {
      const lname = name.toLowerCase();
      const uname = name.toUpperCase();
      if (uname === 'VR') { this.setVr(Math.round(idxs[0]), val); return; }
      if (uname === 'AOUT') { this.machine.setAout(Math.round(idxs[0]), val); return; }
      if (uname === 'DV_OUT') { this.machine.setDvOut(Math.round(idxs[0]), val); return; }
      if (uname === 'OP') { this.machine.op(idxs.concat([val]), p); return; }
      if (uname === 'TABLE') { this.machine.tableSet(Math.round(idxs[0]), val); return; }
      // Hardware config in call-assignment form -> accepted no-op.
      if (uname === 'AIN_CONFIG' || uname === 'AOUT_CONFIG' || uname === 'DV_IN_CONFIG' || uname === 'INVERT_IN') return;
      if (this.arrays.has(lname)) { const a = this.arrays.get(lname); a.data[this.flatIndex(a, idxs)] = val; return; }
      // Unknown indexed target -> create a 1-D auto array lazily.
      this.warnOnce(p, 'arr:' + lname, 'write to undeclared array "' + name + '" (auto-created)');
      const size = Math.round(idxs[0]) + 1;
      const arr = { data: new Float64Array(Math.max(size, 1)), dims: [Math.max(size, 1)], dtype: 'FLOAT', strings: null };
      this.arrays.set(lname, arr); arr.data[Math.round(idxs[0])] = val;
    }

    flatIndex(a, idxs) {
      if (a.dims.length === 1) return Math.min(Math.max(0, Math.round(idxs[0])), a.data.length - 1);
      // row-major for 2-D
      let i = 0, stride = 1;
      for (let d = a.dims.length - 1; d >= 0; d--) { i += (Math.round(idxs[d] || 0)) * stride; stride *= a.dims[d]; }
      return Math.min(Math.max(0, i), a.data.length - 1);
    }

    writeBit(p, baseNode, bit, val) {
      if (baseNode.type === 'var') {
        const lname = baseNode.name.toLowerCase();
        const uname = baseNode.name.toUpperCase();
        if (this.globals.has(lname)) { this.setVrBit(this.globals.get(lname), bit, val); return; }
        if (uname === 'WDOG') { this.machine.setWdog(val); return; }
        // local numeric bit
        let cur = Math.floor(this.readVar(p, baseNode.name) || 0);
        cur = val ? (cur | (1 << bit)) : (cur & ~(1 << bit));
        p.locals.set(lname, cur);
        return;
      }
      if (baseNode.type === 'index' && baseNode.name.toUpperCase() === 'VR') {
        const idx = Math.round(this.evalExpr(baseNode.args[0], p));
        this.setVrBit(idx, bit, val); return;
      }
      // fallback: evaluate base, cannot write back -> warn
      this.warnOnce(p, 'bitwrite', 'unsupported bit-assignment target');
    }

    // ============================================================
    // Expression evaluation
    // ============================================================
    evalExpr(node, p) {
      if (node == null) return 0;
      switch (node.type) {
        case 'num': return node.value;
        case 'str': return node.value;
        case 'var': return this.readVar(p, node.name);
        case 'call': return this.evalCall(p, node);
        case 'axisparam': {
          const axis = node.axis != null ? Math.round(this.evalExpr(node.axis, p)) : (p ? p.baseAxis : 0);
          return this.machine.getAxisParam(axis, node.name.toUpperCase(), p);
        }
        case 'procparam': return this.evalProcParam(p, node);
        case 'bit': {
          const base = this.evalExpr(node.base, p);
          const bit = this.resolveBit(p, node.field);
          return (Math.floor(base) >> bit) & 1;
        }
        case 'unary': {
          if (node.op === 'NOT') return this.truthy(this.evalExpr(node.operand, p)) ? 0 : 1;
          const v = this.evalExpr(node.operand, p);
          return node.op === '-' ? -v : +v;
        }
        case 'logical': {
          // TrioBASIC AND/OR are BITWISE integer operators. For 0/1 operands
          // (comparison results, bit access, boolean flags) this matches logical
          // AND/OR; for integer operands it performs the intended mask, e.g.
          // `(share_line_state AND 15)` in SHARE_DATA. (NOT stays logical — see
          // the 'unary' case — because the code uses it as `NOT READ_BIT(...)`.)
          const l = Math.trunc(this.evalExpr(node.left, p));
          const r = Math.trunc(this.evalExpr(node.right, p));
          return node.op === 'AND' ? (l & r) : (l | r);
        }
        case 'binary': return this.evalBinary(p, node);
        default: return 0;
      }
    }

    evalBinary(p, node) {
      const a = this.evalExpr(node.left, p);
      const b = this.evalExpr(node.right, p);
      switch (node.op) {
        case '+': return (typeof a === 'string' || typeof b === 'string') ? ('' + a + b) : a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b;
        case 'MOD': return b === 0 ? 0 : a % b;
        case '^': return Math.pow(a, b);
        case '=': return (a === b) ? 1 : 0;
        case '<>': return (a !== b) ? 1 : 0;
        case '<': return (a < b) ? 1 : 0;
        case '>': return (a > b) ? 1 : 0;
        case '<=': return (a <= b) ? 1 : 0;
        case '>=': return (a >= b) ? 1 : 0;
        default: return 0;
      }
    }

    readVar(p, name) {
      const lname = name.toLowerCase();
      const uname = name.toUpperCase();
      // process locals first (FOR vars, auto locals)
      if (p && p.locals.has(lname)) return p.locals.get(lname);
      // builtins / keywords
      switch (uname) {
        case 'TRUE': case 'ON': return 1;
        case 'FALSE': case 'OFF': return 0;
        case 'PI': return Math.PI;
        case 'WDOG': return this.machine.getWdog();
        case 'TICKS': return p ? p.ticks : 0;
        case 'SERVO_PERIOD': return this.machine.servoPeriod || 1000;
        case 'PROCNUMBER': return p ? p.num : 0;
        case 'TIME': return this.simTime / 1000;
        case 'TIME$': return this.machine.timeString ? this.machine.timeString() : '00:00:00';
        case 'DATE$': return this.machine.dateString ? this.machine.dateString() : '01/01/2025';
        case 'RUN_ERROR': return p ? p.runError : 0;
        case 'ERROR_LINE': return p ? p.errorLine : 0;
      }
      if (AXIS_PARAMS.has(uname)) return this.machine.getAxisParam(p ? p.baseAxis : 0, uname, p);
      if (this.globals.has(lname)) return this.getVr(this.globals.get(lname));
      if (this.constants.has(lname)) return this.constants.get(lname);
      // scalar access of a declared array name -> element 0
      if (this.arrays.has(lname)) return this.arrays.get(lname).data[0];
      // undefined -> auto-created local var = 0 (Trio semantics), warn once
      if (p) { this.warnOnce(p, 'undef:' + lname, 'undefined identifier "' + name + '" — treated as local variable = 0'); p.locals.set(lname, 0); }
      return 0;
    }

    evalCall(p, node) {
      const name = node.name.toUpperCase();
      const a = node.args.map(x => this.evalExpr(x, p));
      switch (name) {
        case 'VR': return this.getVr(Math.round(a[0]));
        case 'TABLE': return this.machine.tableGet(Math.round(a[0]));
        case 'IN': return this.machine.inRead(Math.round(a[0]), a.length > 1 ? Math.round(a[1]) : undefined);
        case 'OP': return this.machine.readOp(Math.round(a[0]));      // OP(n) read form
        case 'READ_OP': return this.machine.readOp(Math.round(a[0]));
        case 'READ_BIT': return this.getVrBit(Math.round(a[1]), Math.round(a[0])); // READ_BIT(bit, vr)
        case 'AIN': return this.machine.ain(Math.round(a[0]));
        case 'DV_IN': return this.machine.dvIn(Math.round(a[0]));
        case 'DV_OUT': return this.machine.getDvOut(Math.round(a[0]));
        case 'AOUT': return this.machine.getAout(Math.round(a[0]));
        case 'MODBUS': return this.machine.modbus ? this.machine.modbus(a, node.args, p, this) : 0;
        case 'FLASHTABLE': return 0;
        case 'STR': case 'STR$': {
          if (a.length <= 1) return String(a[0] === undefined ? '' : this.fmtNum(a[0]));
          // Trio STR(value, before_dp, after_dp): fixed-point with `after` decimals
          const after = a.length >= 3 ? Math.max(0, Math.round(a[2])) : 0;
          return Number(a[0]).toFixed(after);
        }
        case 'CHR': case 'CHR$': return String.fromCharCode(Math.round(a[0]));
        case 'LEN': return String(a[0] == null ? '' : a[0]).length;
        case 'ABS': return Math.abs(a[0]);
        case 'INT': return Math.trunc(a[0]);
        case 'SGN': return Math.sign(a[0]);
        case 'SQR': return Math.sqrt(Math.max(0, a[0]));
        case 'FRAC': return a[0] - Math.trunc(a[0]);
        case 'ROUND': return Math.round(a[0]);
        case 'SIN': return Math.sin(a[0]);
        case 'COS': return Math.cos(a[0]);
        case 'TAN': return Math.tan(a[0]);
        case 'ATAN': return Math.atan(a[0]);
        case 'EXP': return Math.exp(a[0]);
        case 'LN': return Math.log(Math.max(1e-12, a[0]));
        case 'MAX': return Math.max.apply(null, a);
        case 'MIN': return Math.min.apply(null, a);
        case 'CO_READ': return this.machine.coRead ? this.machine.coRead(a, node.args, p, this) : 1;
        case 'CO_WRITE': return this.machine.coWrite ? this.machine.coWrite(a, node.args, p, this) : 1;
        case 'ETHERCAT': return this.machine.ethercat(a, node.args, p, this);
        case 'GET': return 0;
        default:
          // Array element access?
          if (this.arrays.has(node.name.toLowerCase())) {
            const arr = this.arrays.get(node.name.toLowerCase());
            return arr.data[this.flatIndex(arr, a)];
          }
          if (this.machine.func) { const r = this.machine.func(name, a, p); if (r !== undefined) return r; }
          this.warnOnce(p, 'fn:' + name, 'unknown function "' + node.name + '()" — returning 0');
          return 0;
      }
    }

    evalProcParam(p, node) {
      const name = node.name.toUpperCase();
      const pv = node.proc != null ? Math.round(this.evalExpr(node.proc, p)) : (p ? p.num : 0);
      switch (name) {
        case 'PROC_STATUS': return this.procStatus(pv);
        case 'RUN_ERROR': { const q = this.procByNum.get(pv); return q ? q.runError : 0; }
        case 'ERROR_LINE': { const q = this.procByNum.get(pv); return q ? q.errorLine : 0; }
        case 'PROC': return pv;
        default: return 0;
      }
    }

    resolveBit(p, field) {
      if (typeof field === 'number') return Math.round(field);
      if (field == null) return 0;
      const lname = String(field).toLowerCase();
      if (this.constants.has(lname)) return Math.round(this.constants.get(lname));
      const n = parseInt(field, 10);
      if (!isNaN(n)) return n;
      this.warnOnce(p, 'bit:' + lname, 'unknown bit field "' + field + '" — using 0');
      return 0;
    }

    // ---- USER_PID: positional PID matching the project's VR-block contract ----
    // USER_PID(mode, in_base, out_base). All state lives in the VR table, so
    // this is a pure function of the blocks:
    //   IN  +0 auto +1 pv +2 sp +3 xout_manual +4 kp +5 ti +6 td +7 scan_ms
    //       +8 min_out +9 max_out +10 use_i +11 hold_i +12 reset_i +13 igain_reset
    //       +14 deadband +15 ffd
    //   OUT +0 xout +1 err +2 last_p +3 last_i +4 last_d +5 at_high +6 at_low
    //       +7 i_sum(internal) +8 last_pv(internal) +10 initialized(internal)
    // Clamping is enabled only when max_out > min_out (the project leaves both 0
    // for the pumps, i.e. unclamped). Anti-windup backs the integral out on clamp.
    execUserPid(p, mode, inB, outB) {
      const V = (o) => this.getVr(inB + o), O = (o) => this.getVr(outB + o), Wo = (o, v) => this.setVr(outB + o, v);
      const auto = V(0), pv = V(1), sp = V(2), xman = V(3);
      const kp = V(4), ti = V(5), td = V(6), scan = V(7);
      const minO = V(8), maxO = V(9), useI = V(10), holdI = V(11), resetI = V(12), igainReset = V(13), deadb = V(14), ffd = V(15);
      const dt = scan > 0 ? scan / 1000 : 1;
      let err = sp - pv;
      if (deadb > 0 && Math.abs(err) <= deadb) err = 0;
      let iSum = O(7), lastPv = O(8), inited = O(10);
      if (resetI) iSum = igainReset;
      if (!inited) { lastPv = pv; inited = 1; }
      let pTerm = 0, iTerm = 0, dTerm = 0, xout;
      if (!mode || !auto) {
        // manual / hold: output follows manual value with bumpless integral tracking
        xout = xman;
        pTerm = kp * err;
        iSum = xman - pTerm;
        iTerm = iSum;
      } else {
        pTerm = kp * err;
        if (useI && !holdI && ti > 0) iSum += (kp / ti) * err * dt;
        iTerm = useI ? iSum : 0;
        const dPv = pv - lastPv;
        dTerm = (td > 0) ? -(kp * td * dPv / dt) : 0; // derivative on measurement (no kick)
        xout = pTerm + iTerm + dTerm + ffd;
      }
      let atHigh = 0, atLow = 0;
      if (maxO > minO) {
        if (xout > maxO) { xout = maxO; atHigh = 1; if (useI && ti > 0 && auto && mode) iSum -= (kp / ti) * err * dt; }
        else if (xout < minO) { xout = minO; atLow = 1; if (useI && ti > 0 && auto && mode) iSum -= (kp / ti) * err * dt; }
      }
      Wo(0, xout); Wo(1, err); Wo(2, pTerm); Wo(3, iTerm); Wo(4, dTerm);
      Wo(5, atHigh); Wo(6, atLow); Wo(7, iSum); Wo(8, pv); Wo(10, inited);
    }

    // ---- VR helpers ----
    getVr(i) { return this.machine.getVr(i); }
    setVr(i, v) { this.machine.setVr(i, v); }
    getVrBit(i, b) { return (Math.floor(this.machine.getVr(i)) >> b) & 1; }
    setVrBit(i, b, val) {
      let v = Math.floor(this.machine.getVr(i));
      v = val ? (v | (1 << b)) : (v & ~(1 << b));
      this.machine.setVr(i, v);
    }

    truthy(v) { return !!(typeof v === 'string' ? v.length : v); }

    warnOnce(p, key, msg) {
      if (!p) { return; }
      if (p.warnedNames.has(key)) return;
      p.warnedNames.add(key);
      this.logMsg('warn', msg, p.num, p.curLine);
    }

    // ---- introspection for UI ----
    processTable() {
      return this.processes.map(p => ({
        num: p.num, name: p.name, status: p.status, line: p.curLine,
        sleeping: this.simTime < p.sleepUntil, ticks: Math.max(0, Math.round(p.ticks)),
      })).sort((a, b) => a.num - b.num);
    }
  }

  return { compileProgram, TrioRuntime, Process, AXIS_PARAMS, MOTION_CMDS };
});
