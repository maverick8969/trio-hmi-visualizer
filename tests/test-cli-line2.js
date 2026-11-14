// tools/trio-sim.js checks that need the Line 2 controller project (TRIO_LINE2_DIR).
// Generic CLI behaviour is covered on the demo project by test-cli.js.
'use strict';
const path = require('path'), { spawnSync } = require('child_process');
const { line2Dir } = require('./line2.js');
const CLI = path.join(__dirname, '../tools/trio-sim.js');
const LINE2 = line2Dir();

let fails = 0;
function sim(args) {
  const r = spawnSync(process.execPath, [CLI, '--compact', '--log', 'none', '--bas', LINE2, ...args], { encoding: 'utf8' });
  let json = null; try { json = JSON.parse(r.stdout); } catch (e) { }
  return { code: r.status, json, stderr: r.stderr };
}
function check(name, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) { fails++; if (extra) console.log('     ', JSON.stringify(extra).slice(0, 600)); }
}

// parse-only
let r = sim(['--parse-only']);
check('parse-only on Line 2 is clean', r.code === 0 && r.json.ok && r.json.project.programs > 10, r);

// boot + expectations, in-order steps
r = sim(['--fast-boot', '--expect', 'wdog = 1', '--expect', 'VR:24 = 0x28', '--dump', 'kpi']);
check('fast-boot reaches 0x28', r.code === 0 && r.json.final.systemStatus === 40, r);
check('kpi dump annotates VR names', r.json && r.json.dumps[0].values.kpi['4000'].name === 'share_line_state', r.json && r.json.dumps);

r = sim(['--fast-boot', '--set', 'hmi_pumps_run=1,pumpa_rpm_setpoint=50', '--run', '4000', '--expect', 'axis:1:MSPEED ~ 50 6']);
check('pump drive + approx assertion', r.code === 0, r.json);

console.log(`\n==== ${fails} Line 2 CLI test failures ====`);
process.exit(fails ? 1 : 0);
