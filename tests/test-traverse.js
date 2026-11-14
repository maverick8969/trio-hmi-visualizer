const { buildSim, run } = require('./harness.js');
const sim = buildSim({}); const { rt, machine } = sim;
let pass=0,fail=0; const ck=(n,c,x)=>{c?(pass++,console.log('  PASS',n,x??'')):(fail++,console.log('  FAIL',n,x??''));};
const gi=(n)=>rt.globals.get(n.toLowerCase());
const setG=(n,v)=>{const i=gi(n); if(i!=null)machine.setVr(i,v);};
const getG=(n)=>{const i=gi(n); return i==null?null:machine.getVr(i);};
const setBit=(n,b,v)=>{const i=gi(n); let c=Math.floor(machine.getVr(i)); c=v?(c|(1<<b)):(c&~(1<<b)); machine.setVr(i,c);};
const getBit=(n,b)=>{const i=gi(n); return (Math.floor(machine.getVr(i))>>b)&1;};

rt.boot('START_AND_SET_VARIABLES',1); run(sim,18000);
// constants for bits
const C=(n)=>rt.constants.get(n.toLowerCase());
console.log('  bits: home=',C('controlbithome'),'initmove=',C('controlbitinitmove'),'homed=',C('statusbithomed'),'homing=',C('statusbithoming'));

// --- HOME (manual) ---
setBit('traverse_controlword_vr', C('controlbithome'), 1);
run(sim, 6000);
ck('traverse homed after DATUM', getBit('traverse_statusword_vr', C('statusbithomed'))===1, 'homed='+getBit('traverse_statusword_vr',C('statusbithomed'))+' mpos='+machine.getAxisParam(0,'MPOS').toFixed(2));

// --- AUTO traverse strokes ---
setG('material_start_pos',10); setG('material_end_pos',90);
setG('traverse_speed_setpt',30); setG('traverse_accel',60); setG('traverse_decel',60);
setBit('triocontrolword_vr', C('automode'), 1);
setBit('traverse_controlword_vr', C('controlbitinitmove'), 1);
let minp=1e9,maxp=-1e9,movedTypes=new Set();
for(let i=0;i<14000;i++){ rt.tick(1); sim.plant.step(1); const p=machine.getAxisParam(0,'MPOS'); if(p<minp)minp=p; if(p>maxp)maxp=p; movedTypes.add(machine.getAxisParam(0,'MTYPE')); }
ck('traverse reached far end (~90)', maxp>85, 'max='+maxp.toFixed(1));
ck('traverse returned toward start (~10)', minp<15, 'min='+minp.toFixed(1));
ck('traverse used MOVEABS motion', movedTypes.has(2), 'mtypes='+[...movedTypes].join(','));

// --- ZONE transitions ---
setG('zone_control_enable',1); setG('zone_end_distance_pct',25);
setG('zone1_traverse_speed',8); setG('zone3_traverse_speed',8);
const zones=new Set();
for(let i=0;i<16000;i++){ rt.tick(1); sim.plant.step(1); zones.add(getG('zone_current')); }
ck('zone_current cycles 1/2/3', zones.has(1)&&zones.has(2)&&zones.has(3), 'seen='+[...zones].sort().join(','));
ck('zone boundaries computed', getG('zone_boundary_l')>10 && getG('zone_boundary_r')<90, 'L='+getG('zone_boundary_l')+' R='+getG('zone_boundary_r'));

console.log(`\n  Traverse: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
