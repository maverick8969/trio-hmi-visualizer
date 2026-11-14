const fs = require('fs');
const path = require('path');
const { parse } = require('../js/sim/trio-parser.js');
const { findFiles } = require('../tools/lib/sim-node.js');
// Parse the bundled demo, plus the Line 2 project when TRIO_LINE2_DIR is set.
const dirs = [path.join(__dirname, '../samples/demo')];
if (process.env.TRIO_LINE2_DIR && fs.existsSync(process.env.TRIO_LINE2_DIR)) dirs.push(path.resolve(process.env.TRIO_LINE2_DIR));
else console.log('(Line 2 project not parsed: set TRIO_LINE2_DIR to include it)');
const files = [].concat(...dirs.map(d => findFiles(d, /\.BAS$/i)));
let totalErr = 0;
const typeCount = {};
function walk(node){ if(!node||typeof node!=='object')return; if(node.type){typeCount[node.type]=(typeCount[node.type]||0)+1;} for(const k in node){const v=node[k]; if(Array.isArray(v))v.forEach(walk); else if(v&&typeof v==='object')walk(v);} }
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const { statements, errors } = parse(src, { file: path.basename(f) });
  statements.forEach(walk);
  if (errors.length) {
    totalErr += errors.length;
    console.log(`\n${f}: ${errors.length} parse errors`);
    errors.slice(0, 10).forEach(e => {
      const lines = src.split('\n');
      console.log(`   line ${e.line}: ${e.message}`);
      if (lines[e.line-1]!==undefined) console.log(`        > ${lines[e.line-1].trim().slice(0,90)}`);
    });
  }
}
console.log(`\nParsed ${files.length} files, ${totalErr} total parse errors.`);
console.log('Node type counts:', JSON.stringify(typeCount, null, 0));
