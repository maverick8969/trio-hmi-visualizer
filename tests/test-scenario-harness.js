// Run the Line 2 project's own regression scenarios (<Line 2 repo>/sim/scenarios.json)
// in-process through sim-scenarios.js.
const { runScenario } = require('../js/sim/sim-scenarios.js');
const { loadProject, loadProjectScenarios, makeSim } = require('../tools/lib/sim-node.js');
const { line2Dir, SKIP } = require('./line2.js');

const dir = line2Dir();
const found = loadProjectScenarios(dir);
if (!found) { console.log(`SKIP: ${dir} has no sim/scenarios.json (see integrations/line2/README.md)`); process.exit(SKIP); }
(async () => {
  const sim = makeSim(loadProject(dir)); let totalFail = 0;
  for (const scn of found.scenarios) {
    const r = await runScenario(sim, scn); totalFail += r.failed;
    console.log(`${r.failed ? 'FAIL' : 'PASS'}  ${scn.name}  (${r.passed}/${r.total})`);
    for (const res of r.results) if (!res.ok) console.log(`     x ${res.what} ${res.op} ${res.value} (actual ${typeof res.actual === 'number' ? res.actual.toFixed(2) : res.actual})`);
  }
  console.log(`\n==== ${totalFail} assertion failures across ${found.scenarios.length} scenarios ====`);
  process.exit(totalFail ? 1 : 0);
})();
