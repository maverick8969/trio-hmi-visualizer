// End-to-end tests for tools/trio-sim.js (the headless CLI agents use).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const CLI = path.join(__dirname, '../tools/trio-sim.js');
const SAMPLES = path.join(__dirname, '../samples/line2');

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

// parse-only
let r = sim(['--parse-only']);
check('parse-only on samples is clean', r.code === 0 && r.json.ok && r.json.project.programs > 10, r);

// boot + expectations, in-order steps
r = sim(['--fast-boot', '--expect', 'wdog = 1', '--expect', 'VR:24 = 0x28', '--dump', 'kpi']);
check('fast-boot reaches 0x28', r.code === 0 && r.json.final.systemStatus === 40, r);
check('kpi dump annotates VR names', r.json && r.json.dumps[0].values.kpi['4000'].name === 'share_line_state', r.json && r.json.dumps);

r = sim(['--fast-boot', '--set', 'hmi_pumps_run=1,pumpa_rpm_setpoint=50', '--run', '4000', '--expect', 'axis:1:MSPEED ~ 50 6']);
check('pump drive + approx assertion', r.code === 0, r.json);

// failing expectation -> exit 1
r = sim(['--fast-boot', '--expect', 'wdog = 0']);
check('failed expectation exits 1', r.code === 1 && r.json.expectations[0].ok === false, r);

// unknown global in --set is reported
r = sim(['--fast-boot', '--set', 'definitely_not_a_global=1']);
check('unknown --set global flagged', r.code === 1 && r.json.unknownGlobals.includes('definitely_not_a_global'), r.json);

// usage error -> exit 2
r = sim(['--nope']);
check('bad flag exits 2', r.code === 2);

// built-in scenarios
r = sim(['--scenario', 'all']);
check('all built-in scenarios pass via CLI', r.code === 0 && r.json.scenarios.length >= 7 && r.json.scenarios.every(s => s.ok), r.json && r.json.scenarios);

// external project dir: nested folder, autorun from .mpv3prj, snapshot/diff catches a behavior change
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trio-cli-'));
const src = path.join(tmp, 'src'); fs.mkdirSync(src);
for (const f of fs.readdirSync(SAMPLES)) if (/\.(BAS|mpv3prj)$/i.test(f)) fs.copyFileSync(path.join(SAMPLES, f), path.join(src, f));
const snap = path.join(tmp, 'base.json');
r = sim(['--bas', tmp, '--fast-boot', '--run', '2000', '--snapshot', snap]);
check('external dir: autorun detected from .mpv3prj', r.code === 0 && /mpv3prj/.test(r.json.project.autorun.source), r.json && r.json.project);
r = sim(['--bas', tmp, '--fast-boot', '--run', '2000', '--diff', snap]);
check('identical run diffs clean', r.code === 0 && r.json.diff.changed === 0, r.json && r.json.diff);
const share = path.join(src, 'SHARE_DATA.BAS');
fs.writeFileSync(share, fs.readFileSync(share, 'utf8').replace('share_heartbeat = share_heartbeat + 1', 'share_heartbeat = share_heartbeat + 2'));
r = sim(['--bas', tmp, '--fast-boot', '--run', '2000', '--diff', snap]);
check('code change shows up in --diff', r.code === 1 && r.json.diff.changes.some(c => c.key === 'globals.share_heartbeat'), r.json && r.json.diff);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n==== ${fails} CLI test failures ====`);
process.exit(fails ? 1 : 0);
