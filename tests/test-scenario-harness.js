const fs=require('fs'), path=require('path');
const { parse } = require('../js/sim/trio-parser.js');
const { TrioRuntime } = require('../js/sim/trio-runtime.js');
const TrioMachine = require('../js/sim/trio-machine.js');
const TrioPlant = require('../js/sim/trio-plant.js');
const { runScenario, BUILTINS } = require('../js/sim/sim-scenarios.js');

function makeSim(){
  const dir=path.join(__dirname,'../samples/line2');
  const files=fs.readdirSync(dir).filter(f=>f.toUpperCase().endsWith('.BAS'));
  const sim={ programs:{} };
  sim.reset=function(){
    sim.machine=new TrioMachine({});
    sim.plant=new TrioPlant(sim.machine,{});
    sim.rt=new TrioRuntime(sim.machine,{});
    for(const f of files) sim.rt.loadProgram(f.replace(/\.BAS$/i,''), parse(fs.readFileSync(path.join(dir,f),'utf8'),{}).statements);
    sim.rt.boot('START_AND_SET_VARIABLES',1);
  };
  sim.getG=(n)=>{ const i=sim.rt.globals.get(n.toLowerCase()); return i==null?null:sim.machine.getVr(i); };
  sim.setG=(n,v)=>{ const i=sim.rt.globals.get(n.toLowerCase()); if(i!=null) sim.machine.setVr(i,v); };
  sim.setGbit=(n,b,v)=>{ const i=sim.rt.globals.get(n.toLowerCase()); if(i==null)return; let c=Math.floor(sim.machine.getVr(i)); c=v?(c|(1<<b)):(c&~(1<<b)); sim.machine.setVr(i,c); };
  return sim;
}
(async()=>{
  const sim=makeSim(); let totalFail=0;
  for(const scn of BUILTINS){
    const r=await runScenario(sim, scn); totalFail+=r.failed;
    console.log(`${r.failed?'FAIL':'PASS'}  ${scn.name}  (${r.passed}/${r.total})`);
    for(const res of r.results) if(!res.ok) console.log(`     x ${res.what} ${res.op} ${res.value} (actual ${typeof res.actual==='number'?res.actual.toFixed(2):res.actual})`);
  }
  console.log(`\n==== ${totalFail} assertion failures across ${BUILTINS.length} scenarios ====`);
  process.exit(totalFail?1:0);
})();
