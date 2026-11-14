// Run every tests/test-*.js in its own Node process; exit non-zero if any fail.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter(f => /^test-.*\.js$/.test(f)).sort();
let failed = 0, skipped = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const skip = r.status === 77;           // see tests/line2.js
  const ok = r.status === 0;
  if (skip) skipped++; else if (!ok) failed++;
  console.log(`${skip ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok && !skip) process.stdout.write((r.stdout || '').split('\n').slice(-25).join('\n') + (r.stderr || '') + '\n');
}
const ran = files.length - skipped;
console.log(`\n${ran - failed}/${ran} test files passed` + (skipped
  ? `, ${skipped} skipped: they need the Line 2 controller project. Set TRIO_LINE2_DIR to a checkout of the Line 2 repo to run them.`
  : ''));
process.exit(failed ? 1 : 0);
