// Locate the Line 2 controller project for the tests that exercise real Line 2
// behaviour. Its code is not stored in this public repo: set TRIO_LINE2_DIR to a
// checkout of the Line 2 repo. Without it those tests exit 77, which run-all.js
// reports as SKIP.
'use strict';
const fs = require('fs'), path = require('path');

const SKIP = 77;

function line2Dir() {
  const d = process.env.TRIO_LINE2_DIR;
  if (!d || !fs.existsSync(d)) {
    console.log('SKIP: needs the Line 2 controller project. Set TRIO_LINE2_DIR to a checkout of the Line 2 repo.');
    process.exit(SKIP);
  }
  return path.resolve(d);
}

module.exports = { line2Dir, SKIP };
