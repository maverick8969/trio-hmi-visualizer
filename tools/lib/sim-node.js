// ============================================================
// sim-node.js — Build a headless Trio simulator from a folder of .BAS files.
// ------------------------------------------------------------
// Shared by tools/trio-sim.js and the Node tests. Point it at ANY directory
// (e.g. a checkout of the Line 2 controller repo) — it finds the .BAS files,
// works out the autorun program, and returns a `sim` object compatible with
// js/sim/sim-scenarios.js (reset/getG/setG/setGbit + machine/plant/rt).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { parse } = require(path.join(ROOT, 'js/sim/trio-parser.js'));
const { TrioRuntime } = require(path.join(ROOT, 'js/sim/trio-runtime.js'));
const TrioMachine = require(path.join(ROOT, 'js/sim/trio-machine.js'));
const TrioPlant = require(path.join(ROOT, 'js/sim/trio-plant.js'));

const DEFAULT_BAS_DIR = path.join(ROOT, 'samples/line2');
const DEFAULT_HMI_DIR = path.join(ROOT, 'samples/line2-hmi');
const DEFAULT_AUTORUN = 'START_AND_SET_VARIABLES';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', '.github']);

// Recursively collect files matching `re` under `dir` (depth-limited).
function findFiles(dir, re, depth = 6) {
  const out = [];
  (function walk(d, lvl) {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (lvl < depth && !SKIP_DIRS.has(e.name)) walk(p, lvl + 1); }
      else if (re.test(e.name)) out.push(p);
    }
  })(dir, 0);
  return out.sort();
}

// Autorun resolution: explicit > manifest.json > .mpv3prj (IsAutorun) > default.
function detectAutorun(dir, basFiles) {
  const man = path.join(dir, 'manifest.json');
  if (fs.existsSync(man)) {
    try {
      const j = JSON.parse(fs.readFileSync(man, 'utf8'));
      if (j.autorun) return { name: j.autorun.replace(/\.BAS$/i, '').toUpperCase(), proc: j.autorunProc || 1, source: 'manifest.json' };
    } catch (e) { /* fall through */ }
  }
  for (const prj of findFiles(dir, /\.mpv3prj$/i, 3)) {
    const t = fs.readFileSync(prj, 'utf8');
    for (const tag of t.match(/<[^>]*FileName="[^"]+\.BAS"[^>]*>/gi) || []) {
      if (/IsAutorun="True"/i.test(tag)) {
        const fn = /FileName="([^"]+)\.BAS"/i.exec(tag)[1];
        return { name: fn.toUpperCase(), proc: 1, source: path.relative(dir, prj) };
      }
    }
  }
  const names = basFiles.map(f => path.basename(f).replace(/\.BAS$/i, '').toUpperCase());
  if (names.includes(DEFAULT_AUTORUN)) return { name: DEFAULT_AUTORUN, proc: 1, source: 'default' };
  return { name: names[0] || DEFAULT_AUTORUN, proc: 1, source: 'first-file' };
}

// Parse every .BAS once; returns { programs: {NAME: statements}, files, errors, autorun }.
function loadProject(dir, opts = {}) {
  dir = path.resolve(dir || DEFAULT_BAS_DIR);
  if (!fs.existsSync(dir)) throw new Error(`BAS directory not found: ${dir}`);
  const basFiles = findFiles(dir, /\.BAS$/i);
  if (!basFiles.length) throw new Error(`No .BAS files found under ${dir}`);
  const programs = {}, errors = {}, files = [], duplicates = [];
  for (const f of basFiles) {
    const name = path.basename(f).replace(/\.BAS$/i, '').toUpperCase();
    const rel = path.relative(dir, f);
    if (programs[name]) { duplicates.push(rel); continue; }
    const res = parse(fs.readFileSync(f, 'utf8'), { file: path.basename(f) });
    programs[name] = res.statements;
    files.push(rel);
    if (res.errors && res.errors.length) errors[rel] = res.errors;
  }
  let autorun = detectAutorun(dir, basFiles);
  if (opts.autorun) autorun = { name: opts.autorun.replace(/\.BAS$/i, '').toUpperCase(), proc: opts.autorunProc || 1, source: 'cli' };
  return { dir, programs, files, errors, duplicates, autorun };
}

// Build a scenario-compatible sim object. `project` from loadProject().
function makeSim(project, opts = {}) {
  const sim = { project };
  sim.reset = function () {
    sim.machine = new TrioMachine({});
    sim.plant = new TrioPlant(sim.machine, {});
    sim.rt = new TrioRuntime(sim.machine, { onLog: opts.onLog || null });
    for (const name in project.programs) sim.rt.loadProgram(name, project.programs[name]);
    sim.rt.boot(project.autorun.name, project.autorun.proc);
  };
  const idx = (n) => { const i = sim.rt.globals.get(String(n).toLowerCase()); return i == null ? null : i; };
  sim.globalIndex = idx;
  sim.getG = (n) => { const i = idx(n); return i == null ? null : sim.machine.getVr(i); };
  sim.setG = (n, v) => { const i = idx(n); if (i == null) return false; sim.machine.setVr(i, v); return true; };
  sim.setGbit = (n, b, v) => {
    const i = idx(n); if (i == null) return false;
    let c = Math.floor(sim.machine.getVr(i)); c = v ? (c | (1 << b)) : (c & ~(1 << b));
    sim.machine.setVr(i, c); return true;
  };
  sim.advance = (ms) => { for (let i = 0; i < ms; i++) { sim.rt.tick(1); sim.plant.step(1); } };
  return sim;
}

module.exports = { ROOT, DEFAULT_BAS_DIR, DEFAULT_HMI_DIR, findFiles, detectAutorun, loadProject, makeSim };
