// End-to-end tests for tools/trio-sim.js (the headless CLI agents use), run on the
// bundled synthetic demo project (samples/demo). Line 2 specifics: test-cli-line2.js.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const CLI = path.join(__dirname, '../tools/trio-sim.js');
const DEMO = path.join(__dirname, '../samples/demo');

let fails = 0;
function sim(args) {
  const r = spawnSync(process.execPath, [CLI, '--compact', '--log', 'none', ...args], { encoding: 'utf8' });
  let json = null; try { json = JSON.parse(r.stdout); } catch (e) { }
  return { code: r.status, json, stderr: r.stderr };
}
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) { fails++; if (extra) console.log('     ', JSON.stringify(extra).slice(0, 600)); }
}

// parse-only on the default (demo) project
let r = sim(['--parse-only']);
check('parse-only on the demo is clean', r.code === 0 && r.json.ok && r.json.project.programs === 3 && /demo$/.test(r.json.project.dir), r);

// boot + in-order steps + expectations
r = sim(['--run', '1000', '--expect', 'wdog = 1', '--set-bit', 'cmd_word.0=1', '--run', '3000',
  '--expect', 'bit:11.0 = 1', '--expect', 'speed_actual ~ 50 1', '--dump', 'VR:100-106']);
check('START ramps speed (set-bit, approx expect)', r.code === 0, r.json);
check('dump annotates VR names', r.json && r.json.dumps[0].values['VR:100-106']['101'].name === 'speed_actual', r.json && r.json.dumps);

// failing expectation -> exit 1
r = sim(['--run', '500', '--expect', 'wdog = 0']);
check('failed expectation exits 1', r.code === 1 && r.json.expectations[0].ok === false, r);

// unknown global in --set is reported
r = sim(['--run', '500', '--set', 'definitely_not_a_global=1']);
check('unknown --set global flagged', r.code === 1 && r.json.unknownGlobals.includes('definitely_not_a_global'), r.json);

// usage error -> exit 2
r = sim(['--nope']);
check('bad flag exits 2', r.code === 2);

// project scenarios: <bas>/sim/scenarios.json
r = sim(['--list-scenarios']);
check('--list-scenarios lists the project file', r.code === 0 && r.json.scenarios.length >= 5 && /sim[\\/]scenarios\.json$/.test(r.json.file), r.json);
r = sim(['--scenario', 'all']);
check('all project scenarios pass via CLI', r.code === 0 && r.json.scenarios.length >= 5 && r.json.scenarios.every(s => s.ok), r.json && r.json.scenarios);
r = sim(['--scenario', 'jog']);
check('scenario name substring', r.code === 0 && r.json.scenarios.length === 1, r.json && r.json.scenarios);

// external project dir: nested folder, autorun from .mpv3prj, no scenarios file,
// snapshot/diff catches a behaviour change
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trio-cli-'));
const src = path.join(tmp, 'src'); fs.mkdirSync(src);
for (const f of fs.readdirSync(DEMO)) if (/\.BAS$/i.test(f)) fs.copyFileSync(path.join(DEMO, f), path.join(src, f));
fs.writeFileSync(path.join(src, 'Demo.mpv3prj'),
  '<Project><Items><Item Type="basic" Name="DEMO_MAIN" FileName="DEMO_MAIN.BAS" IsAutorun="True" /></Items></Project>\n');
r = sim(['--bas', tmp, '--scenario', 'all']);
check('no sim/scenarios.json -> usage error', r.code === 2 && /no scenarios/.test(r.stderr), r);
const run = ['--bas', tmp, '--run', '1000', '--set-bit', 'cmd_word.0=1', '--run', '2500'];
const snap = path.join(tmp, 'base.json');
r = sim([...run, '--snapshot', snap]);
check('external dir: autorun detected from .mpv3prj', r.code === 0 && /mpv3prj/.test(r.json.project.autorun.source), r.json && r.json.project);
r = sim([...run, '--diff', snap]);
check('identical run diffs clean', r.code === 0 && r.json.diff.changed === 0, r.json && r.json.diff);
const cell = path.join(src, 'CELL_LOGIC.BAS');
fs.writeFileSync(cell, fs.readFileSync(cell, 'utf8').replace('part_count = part_count + 1', 'part_count = part_count + 2'));
r = sim([...run, '--diff', snap]);
check('code change shows up in --diff', r.code === 1 && r.json.diff.changes.some(c => c.key === 'globals.part_count'), r.json && r.json.diff);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n==== ${fails} CLI test failures ====`);
process.exit(fails ? 1 : 0);
