// Node test harness for the Trio simulator engine, run against the Line 2
// project (see tests/line2.js). Programs are loaded but not booted.
const { TrioRuntime } = require('../js/sim/trio-runtime.js');
const TrioMachine = require('../js/sim/trio-machine.js');
const TrioPlant = require('../js/sim/trio-plant.js');
const { loadProject } = require('../tools/lib/sim-node.js');
const { line2Dir } = require('./line2.js');
function buildSim() {
  const project = loadProject(line2Dir());
  const machine = new TrioMachine({});
  const plant = new TrioPlant(machine, {});
  const rt = new TrioRuntime(machine, {});
  for (const name in project.programs) rt.loadProgram(name, project.programs[name]);
  return { machine, plant, rt, files: project.files };
}
function run(sim, ms){ for(let i=0;i<ms;i++){sim.rt.tick(1);sim.plant.step(1);} }
module.exports = { buildSim, run };
