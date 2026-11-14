const { buildSim, run } = require('./harness.js');
const sim = buildSim({}); const { rt, machine, plant } = sim;
let pass=0,fail=0; const ck=(n,c,x)=>{c?(pass++,console.log('  PASS',n,x??'')):(fail++,console.log('  FAIL',n,x??''));};
const gi=(n)=>rt.globals.get(n.toLowerCase()); const C=(n)=>rt.constants.get(n.toLowerCase());
const setG=(n,v)=>{const i=gi(n); if(i!=null)machine.setVr(i,v);};
const getG=(n)=>{const i=gi(n); return i==null?null:machine.getVr(i);};
const setBit=(n,b,v)=>{const i=gi(n); let c=Math.floor(machine.getVr(i)); c=v?(c|(1<<b)):(c&~(1<<b)); machine.setVr(i,c);};
rt.boot('START_AND_SET_VARIABLES',1); run(sim,18000);

// ---- HOME traverse first (manual mode) ----
setBit('traverse_controlword_vr', C('controlbithome'),1); run(sim,6000);
ck('traverse homed', (Math.floor(getG('traverse_statusword_vr'))>>C('statusbithomed'))&1, 'homed');

// ---- NIP ROLL ----
setG('niproll_inch_per_min_hz',1); setG('nip_speed_setpt',30);
machine.setVr(5010, Math.floor(machine.getVr(5010))|1); // control run bit 0
run(sim,2000);
ck('nip status running (VR5000.0)', (Math.floor(machine.getVr(5000))&1)===1, 'VR5000='+machine.getVr(5000));
ck('nip axis speed >0', machine.getAxisParam(4,'MSPEED')>1, machine.getAxisParam(4,'MSPEED').toFixed(1)+' in/min');

// ---- MIXER VFD (auto mode) ----
setG('mixer_head_speed_sp',8000); setG('mixer_head_init_lube_count',0);
setBit('triocontrolword_vr', C('automode'), 1);
machine.setVr(7, Math.floor(machine.getVr(7))|(1<<C('mixer_ctrl_bit_run')));
run(sim,3000);
ck('mixer motor OP0 on', machine.readOp(0)===1, 'OP0='+machine.readOp(0));
ck('mixer spindle ~8000rpm', machine.getAxisParam(5,'MSPEED')>6000, machine.getAxisParam(5,'MSPEED').toFixed(0)+' rpm');
ck('mixer feedback VR565 ~8000', Math.abs(getG('mixer_reference_speed')-8000)<600, 'ref='+getG('mixer_reference_speed'));

// ---- PRODUCT LENGTH (nip + traverse-auto + pumpA) ----
setG('material_start_pos',10); setG('material_end_pos',90);
setG('traverse_speed_setpt',40); setG('traverse_accel',80); setG('traverse_decel',80);
setBit('traverse_controlword_vr', C('controlbitinitmove'),1);
setG('use_flow_meters',0); setG('pumpb_mix_ratio',1); setG('pumpa_rpm_setpoint',50); setG('hmi_pumps_run',1);
run(sim,2000); // let motion establish
const len0=getG('product_length'), sec0=getG('production_seconds');
run(sim,9000);
console.log('  [dbg] traverse MTYPE',machine.getAxisParam(0,'MTYPE'),'pumpA MTYPE',machine.getAxisParam(1,'MTYPE'),'nipRun',(Math.floor(machine.getVr(5000))&1),'shiftDone',getG('operator_shift_done'));
ck('product_length accumulating', getG('product_length')>len0+0.001, (len0||0).toFixed(3)+' -> '+getG('product_length').toFixed(3)+' ft');
ck('production_seconds counting', getG('production_seconds')>sec0, (sec0||0)+' -> '+getG('production_seconds'));

console.log(`\n  Drives: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
