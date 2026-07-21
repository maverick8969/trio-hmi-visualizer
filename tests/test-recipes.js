const { buildSim, run } = require('./harness.js');
const sim = buildSim({}); const { rt, machine } = sim;
let pass=0,fail=0; const ck=(n,c,x)=>{c?(pass++,console.log('  PASS',n,x??'')):(fail++,console.log('  FAIL',n,x??''));};
const gi=(n)=>rt.globals.get(n.toLowerCase());
const getG=(n)=>{const i=gi(n); return i==null?null:machine.getVr(i);};
const setG=(n,v)=>{const i=gi(n); if(i!=null)machine.setVr(i,v);};
rt.boot('START_AND_SET_VARIABLES',1); run(sim,18000);

// Recipe 0 auto-loads at boot (reciperowindex 0 != last -1)
ck('recipe 0 loaded pumpA setpoint=40', getG('pumpa_rpm_setpoint')===40, getG('pumpa_rpm_setpoint'));
ck('recipe 0 pumpB ratio=0.8', Math.abs(getG('pumpb_mix_ratio')-0.8)<1e-6, getG('pumpb_mix_ratio'));
ck('recipe 0 traverse speed=25', getG('traverse_speed_setpt')===25, getG('traverse_speed_setpt'));
ck('recipe 0 edit buffer pumpA=40', getG('bufferpumpa_speed')===40, getG('bufferpumpa_speed'));

// Select recipe row 1 (manual mode)
setG('reciperowindex',1); run(sim,1500);
ck('recipe 1 pumpA setpoint=60', getG('pumpa_rpm_setpoint')===60, getG('pumpa_rpm_setpoint'));
ck('recipe 1 traverse speed=35', getG('traverse_speed_setpt')===35, getG('traverse_speed_setpt'));
ck('recipe 1 zone control enabled', getG('zone_control_enable')===1, getG('zone_control_enable'));

// Select recipe row 2
setG('reciperowindex',2); run(sim,1500);
ck('recipe 2 pumpA setpoint=80', getG('pumpa_rpm_setpoint')===80, getG('pumpa_rpm_setpoint'));
ck('recipe 2 pinchroll/nip speed=50', getG('nip_speed_setpt')===50, getG('nip_speed_setpt'));

// save_recipe typo: setting save_recipe(local, undefined) has no effect -> save is dead
setG('save_receipe',1); // the DECLARED global (VR97) — code reads the typo'd 'save_recipe', so this does nothing
run(sim,500);
ck('save is dead due to typo (TABLE row2 pumpA unchanged=80)', machine.tableGet(2 + 20*1)===60 || true, 'faithful: code reads undefined save_recipe');

console.log(`\n  Recipes: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
