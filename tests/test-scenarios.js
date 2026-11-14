const { buildSim, run } = require('./harness.js');
const sim = buildSim({});
const { rt, machine, plant } = sim;
const G = (n) => { const i = rt.globals.get(n.toLowerCase()); return i==null?null:machine.getVr(i); };
const setG = (n,v) => { const i = rt.globals.get(n.toLowerCase()); if(i==null){console.log('  !! no global',n);return;} machine.setVr(i,v); };
let pass=0, fail=0;
function check(name, cond, extra){ if(cond){pass++; console.log('  PASS',name, extra!==undefined?'('+extra+')':'');} else {fail++; console.log('  FAIL',name, extra!==undefined?'('+extra+')':'');} }

rt.boot('START_AND_SET_VARIABLES', 1);
run(sim, 18000);
console.log('\n[BOOT]');
check('14 processes running', rt.processTable().length>=13, rt.processTable().length);
check('WDOG on', machine.getWdog()===1);
check('SYSTEMSTATUS = 0x28', machine.getVr(24)===40, machine.getVr(24));

console.log('\n[PUMP START]');
setG('use_flow_meters',0);
setG('pumpb_mix_ratio',1);
setG('pumpa_rpm_setpoint',50);
setG('hmi_pumps_run',1);
run(sim, 4000);
const mA = machine.getAxisParam(1,'MSPEED'), mtA = machine.getAxisParam(1,'MTYPE');
check('pump A MTYPE != idle', mtA!==0, 'mtype='+mtA);
check('pump A MSPEED ramped ~50', mA>40 && mA<60, mA.toFixed(2));
check('pump A flow VR602 > 0', machine.getVr(602)>0, machine.getVr(602).toFixed(2)+' g/s');
check('pump B follows A (MTYPE!=idle)', machine.getAxisParam(2,'MTYPE')!==0, machine.getAxisParam(2,'MTYPE'));

console.log('\n[HEATER on/off]');
setG('heat_on_time',3); setG('heat_off_time',3);
setG('overhead_zone1_offon_sp',300);
setG('overhead_zone1_upper_db',5);
setG('overhead_zone1_lower_db',-5);
setG('overhead_zone1_on',1);
const z1before = plant.getZoneTemps()[0].tempC;
run(sim, 6000);
const z1after = plant.getZoneTemps()[0].tempC;
check('overhead zone1 heater OP20 ON', machine.readOp(20)===1, 'OP20='+machine.readOp(20));
check('overhead zone1 temp rising', z1after>z1before+2, z1before.toFixed(1)+'->'+z1after.toFixed(1)+' C');

console.log('\n[E-STOP]');
machine.pressEstop(true);
run(sim, 600);
check('WDOG dropped', machine.getWdog()===0);
check('estop_active bit set', (machine.getVr(24)&1)===1, 'VR24='+machine.getVr(24));
check('pump A cancelled to idle', machine.getAxisParam(1,'MTYPE')===0, 'mtype='+machine.getAxisParam(1,'MTYPE'));
check('hmi_pumps_run cleared', G('hmi_pumps_run')===0, G('hmi_pumps_run'));

console.log('\n[RESET / recovery]');
machine.pressEstop(false);
setG('safety_relay_reset',1);
run(sim, 5000);
check('WDOG re-armed', machine.getWdog()===1);
check('estop_active cleared', (machine.getVr(24)&1)===0, 'VR24='+machine.getVr(24));
check('SYSTEMSTATUS settled 0x28', machine.getVr(24)===40, machine.getVr(24));

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
