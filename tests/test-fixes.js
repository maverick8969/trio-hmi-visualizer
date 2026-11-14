const { parse } = require('../js/sim/trio-parser.js');
const { tokenize } = require('../js/sim/trio-lexer.js');
const { TrioRuntime } = require('../js/sim/trio-runtime.js');
const TrioMachine = require('../js/sim/trio-machine.js');
let pass=0,fail=0; const ck=(n,c,x)=>{c?(pass++,console.log('  PASS',n,x??'')):(fail++,console.log('  FAIL',n,x??''));};

// 1. numeric bit access VR(100).2 must lex as VR(100) DOT 2 (not 0.2)
const toks = tokenize('x = VR(100).2\n').tokens.map(t=>t.type+':'+t.value).join(' ');
ck('numeric bit access lexes as DOT+num', toks.includes('dot:.') && toks.includes('num:2') && !toks.includes('num:0.2'), toks);

// leading-dot float still works
const t2 = tokenize('x = .5 + y\n').tokens.filter(t=>t.type==='num').map(t=>t.value);
ck('leading-dot float .5 preserved', t2[0]===0.5, JSON.stringify(t2));

// 2. write/read a VR bit numerically through the runtime
function runProg(src, checks){
  const m=new TrioMachine({}); const rt=new TrioRuntime(m,{});
  rt.loadProgram('T', parse(src,{}).statements); rt.boot('T',1);
  for(let i=0;i<2000 && rt.processes.length;i++){rt.tick(1);}
  return {m,rt};
}
{ const {m}=runProg('VR(100)=0\nVR(100).3=1\nVR(100).1=1\nSTOP\n');
  ck('VR(100).3 and .1 set -> 10', m.getVr(100)===10, m.getVr(100)); }

// 3. EXIT_LOOP inside FOR pops the frame (nested FOR: outer runs exactly 3x)
{ const src=`
outer = 0
FOR i = 1 TO 3
  outer = outer + 1
  FOR j = 1 TO 9
    IF j = 2 THEN
      EXIT_LOOP
    ENDIF
  NEXT j
NEXT i
VR(200) = outer
STOP
`;
  const {m,rt}=runProg(src);
  ck('nested FOR+EXIT_LOOP outer runs 3x', m.getVr(200)===3, m.getVr(200));
}

// 4. EXIT_LOOP in a GOTO-looped FOR does not leak forStack across scans
{ const src=`
lp:
FOR k = 0 TO 5
  IF AXISSTATUS AXIS(k) > 0 THEN
    EXIT_LOOP
  ENDIF
NEXT k
GOTO lp
`;
  const m=new TrioMachine({}); const rt=new TrioRuntime(m,{});
  rt.loadProgram('T', parse(src,{}).statements); rt.boot('T',1);
  for(let i=0;i<500;i++) rt.tick(1);
  const proc = rt.processes[0];
  ck('no forStack leak over 500 scans', proc && proc.forStack.length<=1, 'depth='+(proc?proc.forStack.length:'gone'));
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
