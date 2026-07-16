// A UTF-8 BOM decoded to U+FEFF must not survive preprocessing: as the first
// char of the MAIN input it becomes a space (offset-preserving), and an
// included file's BOM must not be spliced into the middle of the output
// (Velthuis.BigIntegers {$INCLUDE 'bases.inc'} — bases.inc carries a BOM).
// Run: node preprocessor/test-bom.js  (exit 0 = pass)
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { preprocess } = require('./preprocess');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppbom-'));
fs.writeFileSync(path.join(dir, 'withbom.inc'), '﻿const FromInc = 1;\n');

let pass = 0;
function check(name, cond) { assert.ok(cond, name); console.log('  ok  ' + name); pass++; }

// 1. Leading BOM on the main input is blanked, length preserved.
{
  const src = '﻿unit U;\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: dir });
  check('bom: main input BOM blanked', !r.text.includes('﻿'));
  check('bom: main input length preserved', r.text.length === src.length);
  check('bom: content intact', r.text.includes('unit U;'));
}

// 2. Included file's BOM does not get spliced mid-output.
{
  const src = 'unit U;\n{$I withbom.inc}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: dir });
  check('bom: included BOM not spliced', !r.text.includes('﻿'));
  check('bom: included body still spliced', r.text.includes('FromInc'));
}

console.log('\n' + pass + ' checks passed.');
