// The bundled synthetic demo project (samples/demo) must parse cleanly and pass
// its own scenarios. Runs without any external project.
const path = require('path');
const { runScenario } = require('../js/sim/sim-scenarios.js');
const { loadProject, loadProjectScenarios, makeSim, DEFAULT_BAS_DIR } = require('../tools/lib/sim-node.js');

let fails = 0;
const check = (name, ok, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { fails++; if (extra) console.log('     ', JSON.stringify(extra).slice(0, 600)); } };

const project = loadProject(DEFAULT_BAS_DIR);
check('demo is the default project', path.basename(project.dir) === 'demo', project.dir);
check('demo parses cleanly', Object.keys(project.errors).length === 0, project.errors);
check('demo autorun from manifest', project.autorun.name === 'DEMO_MAIN' && project.autorun.source === 'manifest.json', project.autorun);

const found = loadProjectScenarios(DEFAULT_BAS_DIR);
check('demo ships sim/scenarios.json', found && found.scenarios.length >= 5, found && found.file);
(async () => {
  const sim = makeSim(project);
  for (const scn of (found ? found.scenarios : [])) {
    const r = await runScenario(sim, scn);
    check(`scenario: ${scn.name} (${r.passed}/${r.total})`, r.failed === 0, r.results.filter(x => !x.ok));
  }
  console.log(`\n==== ${fails} demo failures ====`);
  process.exit(fails ? 1 : 0);
})();
