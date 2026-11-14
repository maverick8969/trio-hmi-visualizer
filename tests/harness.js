// Node test harness for the Trio simulator engine.
const fs = require('fs'), path = require('path');
const { parse } = require('../js/sim/trio-parser.js');
const { TrioRuntime } = require('../js/sim/trio-runtime.js');
const TrioMachine = require('../js/sim/trio-machine.js');
const TrioPlant = require('../js/sim/trio-plant.js');
function buildSim() {
  const dir = path.join(__dirname, '../samples/line2');
  const files = fs.readdirSync(dir).filter(f => f.toUpperCase().endsWith('.BAS'));
  const machine = new TrioMachine({});
  const plant = new TrioPlant(machine, {});
  const rt = new TrioRuntime(machine, {});
  for (const f of files) rt.loadProgram(f.replace(/\.BAS$/i,''), parse(fs.readFileSync(path.join(dir,f),'utf8'),{file:f}).statements);
  return { machine, plant, rt, files };
}
function run(sim, ms){ for(let i=0;i<ms;i++){sim.rt.tick(1);sim.plant.step(1);} }
module.exports = { buildSim, run };
