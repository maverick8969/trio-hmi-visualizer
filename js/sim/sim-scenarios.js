// ============================================================
// sim-scenarios.js — Declarative scenario / assertion harness
// ------------------------------------------------------------
// Define repeatable test sequences against the running simulator:
// set inputs, toggle bits, inject faults, advance time, and assert.
// Usable from Node (regression tests) and from the dashboard UI.
//
// A scenario is { name, steps: [ ...step ] } where each step is one of:
//   { boot: true }                     re-link + restart the controller
//   { fastforward: ms }                advance ms (used to run the ~18s boot)
//   { run: ms }                        advance ms
//   { set: { name: value, ... } }      set globals by name ('VR:123' for raw VR)
//   { setBit: { name, bit, value } }   set one control-word bit
//   { estop: true|false }              press / release the E-stop
//   { fault: { name, on } }            machine fault (ethercatDrop, meterCommsLoss)
//   { expect: { what, op, value, tol } } assertion (see resolveWhat for `what`)
//   { log: 'message' }
//
// `what` forms: 'wdog', 'VR:24', 'bit:24.0', 'axis:1:MSPEED', 'op:20',
//   'temp:overhead1', 'flow:pumpA', 'nip:running', 'mixer:rpm', or a global
//   name. `op`: '=', '!=', '>', '<', '>=', '<=', '~' (approx within tol).
// ============================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SimScenarios = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function resolveWhat(sim, what) {
    const m = sim.machine, p = sim.plant;
    if (what === 'wdog') return m.getWdog();
    let mt;
    if ((mt = /^VR:(\d+)$/.exec(what))) return m.getVr(+mt[1]);
    if ((mt = /^bit:(\d+)\.(\d+)$/.exec(what))) return (Math.floor(m.getVr(+mt[1])) >> +mt[2]) & 1;
    if ((mt = /^axis:(\d+):(\w+)$/.exec(what))) return m.getAxisParam(+mt[1], mt[2].toUpperCase());
    if ((mt = /^op:(\d+)$/.exec(what))) return m.readOp(+mt[1]);
    if ((mt = /^temp:(\w+)$/.exec(what))) { const z = p.getZoneTemps().find(z => z.key === mt[1]); return z ? z.tempF : 0; }
    if ((mt = /^flow:(\w+)$/.exec(what))) { const f = p.getPumpFlows().find(f => f.key === mt[1]); return f ? f.flow : 0; }
    if (what === 'nip:running') return p.nip.running ? 1 : 0;
    if (what === 'nip:speed') return p.nip.speed;
    if (what === 'mixer:rpm') return p.mixer.rpm;
    if (what === 'mixer:running') return p.mixer.running ? 1 : 0;
    // default: named global
    const v = sim.getG(what);
    return v == null ? 0 : v;
  }

  function compare(a, op, b, tol) {
    switch (op) {
      case '=': case '==': return a === b;
      case '!=': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '~': return Math.abs(a - b) <= (tol == null ? 0.5 : tol);
      default: return false;
    }
  }

  function setValue(sim, key, val) {
    const m = /^VR:(\d+)$/.exec(key);
    if (m) sim.machine.setVr(+m[1], val); else sim.setG(key, val);
  }

  // Advance the engine synchronously in chunks, yielding to the caller between
  // chunks (so a browser UI can stay responsive during long runs).
  async function advance(sim, ms, yieldFn) {
    let done = 0;
    while (done < ms) {
      const chunk = Math.min(2500, ms - done);
      for (let i = 0; i < chunk; i++) { sim.rt.tick(1); sim.plant.step(1); }
      done += chunk;
      if (yieldFn) await yieldFn();
    }
  }

  async function runScenario(sim, scn, opts) {
    opts = opts || {};
    const results = [];
    for (const s of scn.steps) {
      if (s.boot) sim.reset();
      else if (s.fastforward != null) await advance(sim, s.fastforward, opts.yield);
      else if (s.run != null) await advance(sim, s.run, opts.yield);
      else if (s.set) for (const k in s.set) setValue(sim, k, s.set[k]);
      else if (s.setBit) sim.setGbit(s.setBit.name, s.setBit.bit, s.setBit.value);
      else if (s.estop != null) sim.machine.pressEstop(s.estop);
      else if (s.fault) sim.machine.setFault(s.fault.name, s.fault.on);
      else if (s.log) { /* narrative only */ }
      else if (s.expect) {
        const actual = resolveWhat(sim, s.expect.what);
        const ok = compare(actual, s.expect.op || '=', s.expect.value, s.expect.tol);
        results.push({ what: s.expect.what, op: s.expect.op || '=', value: s.expect.value, actual, ok });
      }
    }
    const failed = results.filter(r => !r.ok).length;
    return { name: scn.name, results, failed, passed: results.length - failed, total: results.length };
  }

  // ---- Built-in scenarios (each self-contained: boots fresh) ----
  const BOOT = [{ boot: true }, { fastforward: 18000 }];
  const BUILTINS = [
    {
      name: 'Boot to operational (0x28)',
      steps: [...BOOT,
        { expect: { what: 'wdog', op: '=', value: 1 } },
        { expect: { what: 'VR:24', op: '=', value: 40 } },
      ],
    },
    {
      name: 'Pump start ramps to setpoint + flow',
      steps: [...BOOT,
        { set: { use_flow_meters: 0, pumpb_mix_ratio: 1, pumpa_rpm_setpoint: 50, hmi_pumps_run: 1 } },
        { run: 4000 },
        { expect: { what: 'axis:1:MTYPE', op: '!=', value: 0 } },
        { expect: { what: 'axis:1:MSPEED', op: '~', value: 50, tol: 6 } },
        { expect: { what: 'flow:pumpA', op: '>', value: 0 } },
      ],
    },
    {
      name: 'E-stop → drives safe, then recover to 0x28',
      steps: [...BOOT,
        { set: { pumpa_rpm_setpoint: 50, hmi_pumps_run: 1 } }, { run: 3000 },
        { expect: { what: 'axis:1:MTYPE', op: '!=', value: 0 } },
        { estop: true }, { run: 600 },
        { expect: { what: 'wdog', op: '=', value: 0 } },
        { expect: { what: 'bit:24.0', op: '=', value: 1 } },
        { expect: { what: 'axis:1:MTYPE', op: '=', value: 0 } },
        { expect: { what: 'hmi_pumps_run', op: '=', value: 0 } },
        { estop: false }, { set: { safety_relay_reset: 1 } }, { run: 5000 },
        { expect: { what: 'wdog', op: '=', value: 1 } },
        { expect: { what: 'VR:24', op: '=', value: 40 } },
      ],
    },
    {
      name: 'Heater deadband energizes below setpoint',
      steps: [...BOOT,
        { set: { heat_on_time: 3, heat_off_time: 3, overhead_zone1_offon_sp: 300, overhead_zone1_upper_db: 5, overhead_zone1_lower_db: -5, overhead_zone1_on: 1 } },
        { run: 6000 },
        { expect: { what: 'op:20', op: '=', value: 1 } },
        { expect: { what: 'temp:overhead1', op: '>', value: 90 } },
      ],
    },
    {
      name: 'Mixer VFD spins spindle + reads back speed',
      steps: [...BOOT,
        { set: { mixer_head_speed_sp: 8000, mixer_head_init_lube_count: 0 } },
        { setBit: { name: 'triocontrolword_vr', bit: 1, value: 1 } },   // auto
        { setBit: { name: 'mixer_controlword_vr', bit: 4, value: 1 } }, // run
        { run: 3000 },
        { expect: { what: 'op:0', op: '=', value: 1 } },
        { expect: { what: 'axis:5:MSPEED', op: '>', value: 6000 } },
        { expect: { what: 'mixer_reference_speed', op: '~', value: 8000, tol: 700 } },
      ],
    },
    {
      name: 'Recipe select loads working setpoints',
      steps: [...BOOT,
        { expect: { what: 'pumpa_rpm_setpoint', op: '=', value: 40 } },   // recipe 0 auto-loads at boot
        { set: { reciperowindex: 1 } }, { run: 1500 },
        { expect: { what: 'pumpa_rpm_setpoint', op: '=', value: 60 } },
        { expect: { what: 'traverse_speed_setpt', op: '=', value: 35 } },
        { expect: { what: 'zone_control_enable', op: '=', value: 1 } },
      ],
    },
    {
      name: 'KPI share block + end-shift gate (bitwise mask)',
      steps: [...BOOT,
        { expect: { what: 'VR:4017', op: '=', value: 40 } },   // Share_SystemStatus mirror
        { expect: { what: 'VR:4058', op: '=', value: 1 } },    // idle -> END SHIFT button visible
        { set: { hmi_pumps_run: 1 } }, { run: 3000 },
        { expect: { what: 'bit:4000.2', op: '=', value: 1 } }, // pump A bit set in line_state
        { expect: { what: 'VR:4058', op: '=', value: 0 } },    // running -> hidden (mask != 0)
      ],
    },
  ];

  return { runScenario, resolveWhat, compare, BUILTINS };
});
