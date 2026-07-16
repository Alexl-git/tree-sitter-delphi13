// Tests for `{$I}` filename resolution beyond the current directory.
// Layout modeled on real corpora (EurekaLog Source/Common, AsyncPro PrnDrv/Win9xME):
//
//   root/
//     defs.inc              <- grandparent-level include
//     Common/ELDefs.inc     <- sibling-subdir include (defines CPU_OK)
//     Source/
//       unit-in-source      <- {$I ELDefs.inc} must find ../Common (parent's subdir)
//       Sub/
//         unit-in-sub       <- {$I defs.inc} must find ../../ (2 levels up)
//     shadow.inc + Source/shadow.inc  <- nearest (baseDir) copy must win
//
// Run: node preprocessor/test-include-resolve.js  (exit 0 = pass)
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { preprocess } = require('./preprocess');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ppres-'));
const srcDir = path.join(root, 'Source');
const subDir = path.join(srcDir, 'Sub');
const commonDir = path.join(root, 'Common');
fs.mkdirSync(srcDir); fs.mkdirSync(subDir); fs.mkdirSync(commonDir);

fs.writeFileSync(path.join(commonDir, 'ELDefs.inc'), '{$DEFINE CPU_OK}\n');
fs.writeFileSync(path.join(root, 'defs.inc'), '{$DEFINE ROOT_OK}\n');
fs.writeFileSync(path.join(root, 'shadow.inc'), 'const ShadowFar = 1;\n');
fs.writeFileSync(path.join(srcDir, 'shadow.inc'), 'const ShadowNear = 1;\n');
// Nested: outer.inc includes inner.inc (same dir), inner defines NESTED_OK.
fs.writeFileSync(path.join(commonDir, 'inner.inc'), '{$DEFINE NESTED_OK}\n');
fs.writeFileSync(path.join(commonDir, 'outer.inc'), '{$I inner.inc}\n');
// Name with a space, single-quoted.
fs.writeFileSync(path.join(commonDir, 'two words.inc'), '{$DEFINE SPACED_OK}\n');

let pass = 0;
function check(name, cond) { assert.ok(cond, name); console.log('  ok  ' + name); pass++; }

// 1. Include in a SUBDIRECTORY of a parent dir (EurekaLog: Source\X.pas -> Source\..\Common\ELDefs.inc
//    ... modeled here as baseDir=Source, target=root/Common/ELDefs.inc: parent's subdir).
{
  const src = 'unit U;\n{$I ELDefs.inc}\n{$IFDEF CPU_OK}var ok: Integer;{$ENDIF}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: srcDir });
  check('resolve: parent\'s subdir (Common/) found', r.text.includes('var ok'));
}

// 2. Include two levels up (AsyncPro: PrnDrv\Win9xME\X.pas -> source\AwDefine.inc).
{
  const src = 'unit U;\n{$I defs.inc}\n{$IFDEF ROOT_OK}var ok2: Integer;{$ENDIF}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: subDir });
  check('resolve: two levels up found', r.text.includes('var ok2'));
}

// 3. Subdirectory of baseDir itself.
{
  const src = 'unit U;\n{$I ELDefs.inc}\n{$IFDEF CPU_OK}var ok3: Integer;{$ENDIF}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: root });
  check('resolve: subdir of baseDir found', r.text.includes('var ok3'));
}

// 4. Nearest-first: baseDir copy shadows the parent copy.
{
  const src = 'unit U;\n{$I shadow.inc}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: srcDir });
  check('resolve: baseDir copy wins over parent copy', r.text.includes('ShadowNear') && !r.text.includes('ShadowFar'));
}

// 5. Transitive defines through nested includes (outer -> inner -> {$DEFINE NESTED_OK}).
{
  const src = 'unit U;\n{$I outer.inc}\n{$IFDEF NESTED_OK}var ok5: Integer;{$ENDIF}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: commonDir });
  check('resolve: nested include defines propagate transitively', r.text.includes('var ok5'));
}

// 6. Quoted name containing a space.
{
  const src = "unit U;\n{$INCLUDE 'two words.inc'}\n{$IFDEF SPACED_OK}var ok6: Integer;{$ENDIF}\nend.\n";
  const r = preprocess(src, { defines: [], baseDir: commonDir });
  check('resolve: quoted name with space', r.text.includes('var ok6'));
}

// 7. Still-unresolvable include stays blanked 1:1 (no offset shift, no throw).
{
  const src = 'unit U;\n{$I really-not-there.inc}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: subDir });
  check('resolve: unresolvable still blanked 1:1', r.text.length === src.length);
}

// 8. nearSearch:false restores strict same-dir-only resolution.
{
  const src = 'unit U;\n{$I ELDefs.inc}\n{$IFDEF CPU_OK}var ok8: Integer;{$ENDIF}\nend.\n';
  const r = preprocess(src, { defines: [], baseDir: srcDir, nearSearch: false });
  check('resolve: nearSearch:false keeps old strict behavior', !r.text.includes('var ok8'));
}

console.log('\n' + pass + ' checks passed.');
