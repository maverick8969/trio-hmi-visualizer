// Run every tests/test-*.js in its own Node process; exit non-zero if any fail.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter(f => /^test-.*\.js$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) process.stdout.write((r.stdout || '').split('\n').slice(-25).join('\n') + (r.stderr || '') + '\n');
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
