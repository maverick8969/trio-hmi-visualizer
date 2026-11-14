const { TrioRuntime } = require('../js/sim/trio-runtime.js');
const TrioMachine = require('../js/sim/trio-machine.js');
let pass=0,fail=0; const ck=(n,c,x)=>{c?(pass++,console.log('  PASS',n,x??'')):(fail++,console.log('  FAIL',n,x??''));};

// --- Direct PID unit test: closed loop against a first-order plant ---
const m=new TrioMachine({}); const rt=new TrioRuntime(m,{});
const IN=400, OUT=420, SP=10;
m.setVr(IN+0,1);   // auto
m.setVr(IN+2,SP);  // sp
m.setVr(IN+4,0.8); // kp
m.setVr(IN+5,1.5); // ti
m.setVr(IN+6,0);   // td
m.setVr(IN+7,100); // scan ms
m.setVr(IN+10,1);  // use_i
let pv=0;
for(let i=0;i<400;i++){
  m.setVr(IN+1, pv);                 // feed process variable
  rt.execUserPid(null,1,IN,OUT);     // run PID
  const xout=m.getVr(OUT+0);
  pv += 0.25*(xout - pv*0.15);       // simple first-order plant driven by xout
}
ck('PID drives PV to setpoint (integral on)', Math.abs(pv-SP)<0.5, 'pv='+pv.toFixed(2));
ck('PID output nonzero', m.getVr(OUT+0)!==0, 'xout='+m.getVr(OUT+0).toFixed(2));

// deadband: no correction inside band
const m2=new TrioMachine({}); const rt2=new TrioRuntime(m2,{});
m2.setVr(IN+0,1); m2.setVr(IN+2,10); m2.setVr(IN+1,9.9); m2.setVr(IN+4,1); m2.setVr(IN+14,0.5); // deadband 0.5
rt2.execUserPid(null,1,IN,OUT);
ck('deadband suppresses small error', m2.getVr(OUT+1)===0, 'err='+m2.getVr(OUT+1));

// manual mode: output follows manual value
const m3=new TrioMachine({}); const rt3=new TrioRuntime(m3,{});
m3.setVr(IN+0,0); m3.setVr(IN+3,7.5); // auto off, xout_manual=7.5
rt3.execUserPid(null,1,IN,OUT);
ck('manual mode output = xout_manual', Math.abs(m3.getVr(OUT+0)-7.5)<1e-9, m3.getVr(OUT+0));

console.log(`\n  PID unit: ${pass} passed, ${fail} failed`);

// --- Integration: USER_PID no longer "unimplemented"; pump B PID engages ---
const { buildSim, run } = require('./harness.js');
const sim = buildSim({});
sim.rt.boot('START_AND_SET_VARIABLES',1);
run(sim, 18000);
// enable flow-meter PID ratio control in auto
const setG=(n,v)=>{const i=sim.rt.globals.get(n.toLowerCase()); if(i!=null) sim.machine.setVr(i,v);};
setG('use_flow_meters',1);
setG('pumpa_rpm_setpoint',50);
setG('pumpb_mix_ratio',0.8);
// provide calibration factors so pump B PID path produces a speed
setG('pumpa_rpm_per_gramspersec',0.033);
setG('pumpb_rpm_per_gramspersec',0.033);
setG('hmi_pumps_run',1);
sim.machine.setVr(1, Math.floor(sim.machine.getVr(1))|2); // automode bit
run(sim, 8000);
const warns = sim.rt.log.filter(e=>e.level==='warn' && /USER_PID/.test(e.msg));
ck('no "unimplemented USER_PID" warning', warns.length===0, warns.length+' warns');
const xoutVr = sim.rt.globals.get('pumpb_speed_pid_xout');
console.log('  pump B PID xout VR value:', sim.machine.getVr(xoutVr).toFixed(3), '| pump A rpm', sim.machine.getAxisParam(1,'MSPEED').toFixed(1), '| pump B rpm', sim.machine.getAxisParam(2,'MSPEED').toFixed(1));
process.exit(fail?1:0);
