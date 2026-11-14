const { buildSim, run } = require('./harness.js');
const sim = buildSim({}); const { rt, machine } = sim;
let pass=0,fail=0; const ck=(n,c,x)=>{c?(pass++,console.log('  PASS',n,x??'')):(fail++,console.log('  FAIL',n,x??''));};
const gi=(n)=>rt.globals.get(n.toLowerCase()); const C=(n)=>rt.constants.get(n.toLowerCase());
const getG=(n)=>{const i=gi(n); return i==null?null:machine.getVr(i);};
const setG=(n,v)=>{const i=gi(n); if(i!=null)machine.setVr(i,v);};
const setBit=(n,b,v)=>{const i=gi(n); let c=Math.floor(machine.getVr(i)); c=v?(c|(1<<b)):(c&~(1<<b)); machine.setVr(i,c);};
rt.boot('START_AND_SET_VARIABLES',1); run(sim,18000);

// idle line: KPI block published
ck('share_systemstatus (VR4017) = 40', machine.getVr(4017)===40, machine.getVr(4017));
const hb0=machine.getVr(4020); run(sim,5000);
ck('share_heartbeat incrementing', machine.getVr(4020)>hb0, hb0+' -> '+machine.getVr(4020));
ck('end_shift_button_visible=1 when idle (bitwise mask)', machine.getVr(4058)===1, 'VR4058='+machine.getVr(4058));
ck('share_line_state=0 idle', machine.getVr(4000)===0, machine.getVr(4000));

// start the line: home -> auto traverse + pumps + nip
setBit('traverse_controlword_vr', C('controlbithome'),1); run(sim,6000);
setG('material_start_pos',10); setG('material_end_pos',90);
setG('traverse_speed_setpt',40); setG('traverse_accel',80); setG('traverse_decel',80);
setBit('triocontrolword_vr', C('automode'),1);
setBit('traverse_controlword_vr', C('controlbitinitmove'),1);
setG('pumpa_rpm_setpoint',50); setG('pumpb_mix_ratio',1); setG('hmi_pumps_run',1);
setG('niproll_inch_per_min_hz',1); setG('nip_speed_setpt',30);
machine.setVr(5010, Math.floor(machine.getVr(5010))|1); // nip run
run(sim,4000);
const ls=machine.getVr(4000);
ck('share_line_state has motion bits', (ls & 1) && (ls & 2) && (ls & 4), 'VR4000='+ls+' (bin '+ls.toString(2)+')');
ck('automode bit(16) in line_state', (ls & 16)!==0, 'ls='+ls);
ck('share_system_running=1 (3-way AND)', machine.getVr(4001)===1, machine.getVr(4001));
ck('end_shift_button_visible=0 while running (mask!=0)', machine.getVr(4058)===0, 'VR4058='+machine.getVr(4058));
ck('share_pumpa_rpm_x10 ~ 500', Math.abs(machine.getVr(4006)-500)<80, 'VR4006='+machine.getVr(4006));
ck('share_length_lo populated', machine.getVr(4002)>0, 'VR4002='+machine.getVr(4002));

console.log(`\n  SHARE/KPI: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
