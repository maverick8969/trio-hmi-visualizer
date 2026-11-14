#!/usr/bin/env node
// ============================================================
// trio-sim — headless command-line driver for the Trio simulator
// ------------------------------------------------------------
// Runs real TrioBASIC (.BAS) programs against the simulated controller +
// plant with no browser, and prints machine-readable JSON. Built so that
// agents (and CI) working in the controller repo can boot the line, drive
// inputs, inject faults, read VR outputs, and assert on them.
//
// Steps run IN THE ORDER GIVEN on the command line. Run with --help.
// Exit codes: 0 = ok, 1 = an --expect / scenario / --diff failed, 2 = usage or load error.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadProject, loadProjectScenarios, makeSim, DEFAULT_BAS_DIR, ROOT } = require('./lib/sim-node.js');
const { runScenario, resolveWhat, compare, BUILTINS } = require(path.join(ROOT, 'js/sim/sim-scenarios.js'));

const HELP = `trio-sim — headless Trio controller simulator

Usage: node tools/trio-sim.js [project options] [steps...] [output options]

Project
  --bas <dir>            Folder holding the .BAS programs (searched recursively).
                         Default: samples/demo, a small synthetic project bundled
                         with this repo. Point it at your controller repo.
  --autorun <NAME>       Override autorun program (default: manifest.json, then the
                         .mpv3prj IsAutorun entry, then START_AND_SET_VARIABLES).

Steps (executed left to right; a --boot is inserted automatically if omitted)
  --boot                 Re-link and restart the controller from power-on.
  --fast-boot [ms]       Run the boot sequence (default 18000 sim-ms).
  --run <ms>             Advance simulated time.
  --set k=v[,k=v...]     Write globals by name, or raw VRs as VR:123=v.
  --set-bit name.bit=v   Set/clear one bit of a control word (e.g. mixer_controlword_vr.4=1).
  --input ch=0|1         Force a digital input (IN) channel; ch=clear releases it.
  --estop on|off         Press / release the E-stop.
  --fault name=on|off    Machine fault: ethercatDrop, meterCommsLoss.
  --expect "<what> <op> <value> [tol]"
                         Assert. ops: = != > < >= <= ~ (approx, tol default 0.5).
                         what: wdog | VR:24 | bit:24.0 | axis:1:MSPEED | op:20 |
                         temp:overhead1 | flow:pumpA | nip:running | nip:speed |
                         mixer:rpm | mixer:running | <global name>
  --dump <spec[,spec]>   Capture state at this point. specs:
                         VR:4000-4058  VR:24  kpi (=VR:4000-4058)  globals
                         globals:<substr>  io  axes  procs  drives  heaters
                         flows  table:0-59  or any <what> expression above.
  --scenario <x>         Run regression scenarios: all | <name substring> (both from the
                         project's sim/scenarios.json) | path/to/file.json | .js module.
  --steps <file.json>    Run a step list ([{boot:true},{run:1000},...]) — same
                         format as js/sim/sim-scenarios.js — inline in the sequence.

Modes / output
  --parse-only           Only parse the programs; report syntax errors and exit.
  --list-globals [sub]   Boot (+fast-boot) and list named globals → VR index/value.
  --list-scenarios       List the project's scenarios (from <--bas>/sim/scenarios.json).
  --snapshot <file>      Write the final state (globals, io, axes, kpi) as JSON.
  --diff <file>          Compare final state against a saved --snapshot; non-zero
                         exit if anything differs beyond --tol (default 1e-6).
  --tol <n>              Numeric tolerance for --diff.
  --log [all|warn|print] Include the runtime event log in the output (default: warn).
  --compact              Single-line JSON.
  -h, --help             This help.

Examples
  node tools/trio-sim.js --scenario all
  node tools/trio-sim.js --bas ../line2 --fast-boot --dump kpi,wdog,VR:24
  node tools/trio-sim.js --bas . --fast-boot --set hmi_pumps_run=1,pumpa_rpm_setpoint=50 \\
       --run 4000 --expect "axis:1:MSPEED ~ 50 6" --dump axes,flows
  node tools/trio-sim.js --bas . --fast-boot --run 5000 --snapshot /tmp/before.json
  node tools/trio-sim.js --bas . --fast-boot --run 5000 --diff /tmp/before.json
`;

function die(msg) { process.stderr.write(`trio-sim: ${msg}\n(run with --help for usage)\n`); process.exit(2); }

function num(v) {
  if (v === undefined) return v;
  const s = String(v).trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  const n = Number(s);
  if (Number.isNaN(n)) die(`not a number: ${v}`);
  return n;
}
const round = (v) => (typeof v === 'number' && !Number.isInteger(v)) ? Math.round(v * 1e6) / 1e6 : v;

// ---------------- argument parsing ----------------
function parseArgs(argv) {
  const o = { bas: null, autorun: null, steps: [], mode: 'run', snapshot: null, diff: null, tol: 1e-6, log: 'warn', compact: false, listFilter: '' };
  const peek = (i) => argv[i + 1];
  const need = (i, flag) => { const v = argv[i + 1]; if (v === undefined || (v.startsWith('--') && !/^--?\d/.test(v))) die(`${flag} needs a value`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': process.stdout.write(HELP); process.exit(0); break;
      case '--bas': o.bas = need(i, a); i++; break;
      case '--autorun': o.autorun = need(i, a); i++; break;
      case '--boot': o.steps.push({ boot: true }); break;
      case '--fast-boot': {
        const v = peek(i);
        if (v !== undefined && /^\d+$/.test(v)) { o.steps.push({ fastforward: +v }); i++; } else o.steps.push({ fastforward: 18000 });
        break;
      }
      case '--run': o.steps.push({ run: num(need(i, a)) }); i++; break;
      case '--set': {
        const set = {};
        for (const kv of need(i, a).split(',')) {
          const m = /^\s*([^=]+?)\s*=\s*(.+)\s*$/.exec(kv); if (!m) die(`bad --set entry: ${kv}`);
          set[m[1]] = num(m[2]);
        }
        o.steps.push({ set }); i++; break;
      }
      case '--set-bit': {
        const m = /^([^.=]+)\.(\d+)\s*=\s*([01])$/.exec(need(i, a)); if (!m) die('--set-bit expects name.bit=0|1');
        o.steps.push({ setBit: { name: m[1], bit: +m[2], value: +m[3] } }); i++; break;
      }
      case '--input': {
        const m = /^(\d+)\s*=\s*(0|1|clear)$/.exec(need(i, a)); if (!m) die('--input expects ch=0|1|clear');
        o.steps.push({ input: { ch: +m[1], value: m[2] } }); i++; break;
      }
      case '--estop': { const v = need(i, a).toLowerCase(); o.steps.push({ estop: v === 'on' || v === '1' || v === 'true' }); i++; break; }
      case '--fault': {
        const m = /^(\w+)\s*=\s*(on|off|1|0|true|false)$/i.exec(need(i, a)); if (!m) die('--fault expects name=on|off');
        o.steps.push({ fault: { name: m[1], on: /^(on|1|true)$/i.test(m[2]) } }); i++; break;
      }
      case '--expect': {
        const parts = need(i, a).trim().split(/\s+/);
        if (parts.length < 3) die(`--expect needs "<what> <op> <value> [tol]", got: ${argv[i + 1]}`);
        o.steps.push({ expect: { what: parts[0], op: parts[1], value: num(parts[2]), tol: parts[3] != null ? num(parts[3]) : undefined } }); i++; break;
      }
      case '--dump': o.steps.push({ dump: need(i, a).split(',').map(s => s.trim()).filter(Boolean) }); i++; break;
      case '--scenario': o.steps.push({ scenario: need(i, a) }); i++; break;
      case '--steps': {
        const f = need(i, a); i++;
        let arr; try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { die(`cannot read --steps ${f}: ${e.message}`); }
        if (!Array.isArray(arr)) die('--steps file must be a JSON array of steps');
        o.steps.push(...arr); break;
      }
      case '--parse-only': o.mode = 'parse'; break;
      case '--list-globals': {
        o.mode = 'globals'; const v = peek(i);
        if (v !== undefined && !v.startsWith('--')) { o.listFilter = v.toLowerCase(); i++; }
        break;
      }
      case '--list-scenarios': o.mode = 'scenarios'; break;
      case '--snapshot': o.snapshot = need(i, a); i++; break;
      case '--diff': o.diff = need(i, a); i++; break;
      case '--tol': o.tol = num(need(i, a)); i++; break;
      case '--log': {
        const v = peek(i);
        if (v && /^(all|warn|print|none)$/.test(v)) { o.log = v; i++; } else o.log = 'all';
        break;
      }
      case '--compact': o.compact = true; break;
      default: die(`unknown argument: ${a}`);
    }
  }
  return o;
}

// ---------------- state capture ----------------
function globalsMap(sim, filter) {
  const out = {};
  const names = [...sim.rt.globals.keys()].sort();
  for (const n of names) if (!filter || n.includes(filter)) out[n] = round(sim.machine.getVr(sim.rt.globals.get(n)));
  return out;
}
function vrRange(sim, a, b) { const out = {}; for (let i = a; i <= b; i++) out[i] = round(sim.machine.getVr(i)); return out; }
function vrNames(sim) { const m = new Map(); for (const [n, i] of sim.rt.globals) if (!m.has(i)) m.set(i, n); return m; }

function captureIo(sim) {
  const m = sim.machine, op = {}, inp = {}, aout = {}, ain = {}, dvIn = {};
  for (let c = 0; c < m.opState.length; c++) if (m.readOp(c)) op[c] = 1;
  for (let c = 0; c < 64; c++) { const v = m.inRead(c); if (v) inp[c] = v; }
  for (let c = 0; c < m.aoutVals.length; c++) if (m.aoutVals[c]) aout[c] = round(m.aoutVals[c]);
  for (let c = 0; c < m.ainVals.length; c++) if (m.ainVals[c]) ain[c] = round(m.ainVals[c]);
  for (let c = 0; c < m.dvInVals.length; c++) if (m.dvInVals[c]) dvIn[c] = round(m.dvInVals[c]);
  return { op_on: op, in_on: inp, aout, ain, dv_in: dvIn };
}
function captureAxes(sim) {
  const out = {};
  for (let n = 0; n < sim.machine.numAxes; n++) {
    const g = (p) => round(sim.machine.getAxisParam(n, p));
    out[n] = { MTYPE: g('MTYPE'), MSPEED: g('MSPEED'), SPEED: g('SPEED'), MPOS: g('MPOS'), DPOS: g('DPOS'), AXIS_ENABLE: g('AXIS_ENABLE'), AXISSTATUS: g('AXISSTATUS') };
  }
  return out;
}
function captureHeaters(sim) { const o = {}; for (const z of sim.plant.getZoneTemps()) o[z.key] = { tempF: round(z.tempF), on: z.on }; return o; }
function captureFlows(sim) { const o = {}; for (const f of sim.plant.getPumpFlows()) o[f.key] = { rpm: round(f.rpm), flow: round(f.flow) }; return o; }
function captureDrives(sim) {
  const d = sim.plant.getDrives();
  for (const k of Object.keys(d)) for (const kk of Object.keys(d[k])) d[k][kk] = round(d[k][kk]);
  return d;
}

function dumpSpec(sim, spec) {
  let m;
  if (spec === 'kpi') spec = 'VR:4000-4058';
  if ((m = /^VR:(\d+)-(\d+)$/i.exec(spec))) {
    const names = vrNames(sim), vals = vrRange(sim, +m[1], +m[2]), out = {};
    for (const k of Object.keys(vals)) out[k] = names.has(+k) ? { name: names.get(+k), value: vals[k] } : vals[k];
    return out;
  }
  if ((m = /^table:(\d+)-(\d+)$/i.exec(spec))) { const o = {}; for (let i = +m[1]; i <= +m[2]; i++) o[i] = round(sim.machine.tableGet(i)); return o; }
  if (spec === 'globals') return globalsMap(sim);
  if ((m = /^globals:(.+)$/i.exec(spec))) return globalsMap(sim, m[1].toLowerCase());
  if (spec === 'io') return captureIo(sim);
  if (spec === 'axes') return captureAxes(sim);
  if (spec === 'procs') return sim.rt.processTable();
  if (spec === 'drives') return captureDrives(sim);
  if (spec === 'heaters') return captureHeaters(sim);
  if (spec === 'flows') return captureFlows(sim);
  if (!/^(wdog|VR:\d+|bit:\d+\.\d+|axis:\d+:\w+|op:\d+|temp:\w+|flow:\w+|nip:\w+|mixer:\w+)$/i.test(spec) && sim.globalIndex(spec) == null) {
    return { error: `unknown global or dump spec: ${spec}` };
  }
  return round(resolveWhat(sim, spec));
}

function snapshotState(sim) {
  return {
    simTimeMs: sim.rt.simTime, wdog: sim.machine.getWdog(), systemStatus: sim.machine.getVr(24),
    globals: globalsMap(sim), kpi: vrRange(sim, 4000, 4058), io: captureIo(sim), axes: captureAxes(sim),
    heaters: captureHeaters(sim), flows: captureFlows(sim),
  };
}

// Flatten nested objects into "a.b.c" -> leaf for diffing.
function flatten(obj, prefix, out) {
  out = out || {};
  for (const k of Object.keys(obj || {})) {
    const v = obj[k], key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
}
function diffSnapshots(base, cur, tol) {
  const a = flatten(base), b = flatten(cur), changes = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (k === 'simTimeMs') continue;
    const x = a[k], y = b[k];
    const same = (typeof x === 'number' && typeof y === 'number') ? Math.abs(x - y) <= tol : JSON.stringify(x) === JSON.stringify(y);
    if (!same) changes.push({ key: k, baseline: x === undefined ? null : x, current: y === undefined ? null : y });
  }
  return changes;
}

// ---------------- scenario loading ----------------
function projectScenarios(dir) {
  let found;
  try { found = loadProjectScenarios(dir); } catch (e) { die(`bad sim/scenarios.json: ${e.message}`); }
  return { file: found ? found.file : null, list: BUILTINS.concat(found ? found.scenarios : []) };
}

function resolveScenarios(arg, dir) {
  const proj = projectScenarios(dir);
  if (arg === 'all' || arg === 'builtin') {
    if (!proj.list.length) die(`no scenarios: add sim/scenarios.json to ${dir} or pass a file to --scenario`);
    return proj.list;
  }
  if (/\.(json|js|cjs)$/i.test(arg)) {
    const f = path.resolve(arg);
    if (!fs.existsSync(f)) die(`scenario file not found: ${arg}`);
    let x = /\.json$/i.test(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : require(f);
    if (x && x.BUILTINS) x = x.BUILTINS; if (x && x.scenarios) x = x.scenarios;
    if (!Array.isArray(x)) x = [x];
    return x;
  }
  const hits = proj.list.filter(s => s.name.toLowerCase().includes(arg.toLowerCase()));
  if (!hits.length) die(`no scenario in ${proj.file || 'the project'} matches "${arg}". Try --list-scenarios.`);
  return hits;
}

// ---------------- main ----------------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  const emit = (obj) => process.stdout.write(JSON.stringify(obj, null, o.compact ? 0 : 2) + '\n');

  if (o.mode === 'scenarios') {
    const proj = projectScenarios(path.resolve(o.bas || DEFAULT_BAS_DIR));
    emit({ scenarios: proj.list.map(s => s.name), file: proj.file });
    return 0;
  }

  let project;
  try { project = loadProject(o.bas || DEFAULT_BAS_DIR, { autorun: o.autorun }); } catch (e) { die(e.message); }
  const projectInfo = {
    dir: project.dir, programs: project.files.length, autorun: project.autorun,
    parseErrors: Object.values(project.errors).reduce((n, e) => n + e.length, 0),
  };
  if (project.duplicates.length) projectInfo.duplicateNamesIgnored = project.duplicates;
  if (!project.programs[project.autorun.name]) die(`autorun program ${project.autorun.name} not found in ${project.dir} (use --autorun)`);

  if (o.mode === 'parse') {
    emit({ ok: projectInfo.parseErrors === 0, project: projectInfo, files: project.files, errors: project.errors });
    return projectInfo.parseErrors ? 1 : 0;
  }

  const sim = makeSim(project);
  sim.reset();

  if (o.mode === 'globals') {
    sim.advance(18000);
    const out = {};
    for (const [n, i] of [...sim.rt.globals].sort((x, y) => x[1] - y[1])) if (!o.listFilter || n.includes(o.listFilter)) out[n] = { vr: i, value: round(sim.machine.getVr(i)) };
    emit({ project: projectInfo, globals: out });
    return 0;
  }

  const steps = o.steps.slice();
  if (!steps.some(s => s.boot || s.scenario)) steps.unshift({ boot: true });
  if (!steps.length) steps.push({ boot: true });

  const results = { expectations: [], dumps: [], scenarios: [] };
  let failed = 0;
  for (const s of steps) {
    if (s.dump) {
      const d = { atMs: sim.rt.simTime, values: {} };
      for (const spec of s.dump) d.values[spec] = dumpSpec(sim, spec);
      results.dumps.push(d);
    } else if (s.input) {
      if (s.input.value === 'clear') sim.machine.clearInForce(s.input.ch); else sim.machine.setIn(s.input.ch, +s.input.value);
    } else if (s.scenario) {
      for (const scn of resolveScenarios(s.scenario, project.dir)) {
        const r = await runScenario(sim, scn);
        failed += r.failed;
        results.scenarios.push({ name: r.name, ok: r.failed === 0, passed: r.passed, total: r.total, failures: r.results.filter(x => !x.ok).map(x => ({ ...x, actual: round(x.actual) })) });
      }
    } else if (s.expect) {
      const actual = resolveWhat(sim, s.expect.what);
      const ok = compare(actual, s.expect.op || '=', s.expect.value, s.expect.tol);
      if (!ok) failed++;
      results.expectations.push({ atMs: sim.rt.simTime, what: s.expect.what, op: s.expect.op || '=', value: s.expect.value, tol: s.expect.tol, actual: round(actual), ok });
    } else {
      // boot / fastforward / run / set / setBit / estop / fault / log
      await runScenario(sim, { name: '_step', steps: [s] });
      if (s.set) for (const k of Object.keys(s.set)) if (!/^VR:\d+$/i.test(k) && sim.globalIndex(k) == null) results.unknownGlobals = [...(results.unknownGlobals || []), k];
    }
  }

  const out = {
    ok: failed === 0, project: projectInfo,
    final: { simTimeMs: sim.rt.simTime, wdog: sim.machine.getWdog(), systemStatus: sim.machine.getVr(24) },
  };
  if (results.unknownGlobals) { out.ok = false; out.unknownGlobals = [...new Set(results.unknownGlobals)]; failed++; }
  if (results.scenarios.length) out.scenarios = results.scenarios;
  if (results.expectations.length) out.expectations = results.expectations;
  if (results.dumps.length) out.dumps = results.dumps;

  if (o.snapshot) { fs.writeFileSync(o.snapshot, JSON.stringify(snapshotState(sim), null, 2)); out.snapshot = path.resolve(o.snapshot); }
  if (o.diff) {
    let base; try { base = JSON.parse(fs.readFileSync(o.diff, 'utf8')); } catch (e) { die(`cannot read --diff ${o.diff}: ${e.message}`); }
    const changes = diffSnapshots(base, snapshotState(sim), o.tol);
    out.diff = { baseline: path.resolve(o.diff), changed: changes.length, changes };
    if (changes.length) { out.ok = false; failed++; }
  }
  if (o.log !== 'none') {
    const want = o.log === 'all' ? null : o.log === 'print' ? ['print'] : ['warn', 'error'];
    const entries = sim.rt.log.filter(e => !want || want.includes(e.level));
    out.log = { count: entries.length, entries: entries.slice(-200) };
  }
  emit(out);
  return failed ? 1 : 0;
}

main().then(code => process.exit(code)).catch(e => { process.stderr.write(`trio-sim: ${e.stack || e}\n`); process.exit(2); });
