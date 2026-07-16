// Tests for the `{$I}` include modes: expand (default), defines-only, off.
// Run: node preprocessor/test-include-modes.js  (exit 0 = pass)
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { preprocess } = require('./preprocess');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppinc-'));
fs.writeFileSync(path.join(dir, 'config.inc'), '{$DEFINE FEATURE_X}\n{$UNDEF LEGACY}\n');

// Parent {$I}s a config, then branches on a define the config sets, and on one
// the config UNDEFs. Also declares a spliceable const inside the .inc to detect
// body-splicing.
fs.writeFileSync(path.join(dir, 'consts.inc'), 'const IncOnly = 1;\n');

const src = [
  'unit U;',
  '{$I config.inc}',
  '{$IFDEF FEATURE_X}',
  'var hasX: Integer;',
  '{$ELSE}',
  'var noX: Integer;',
  '{$ENDIF}',
  '{$IFDEF LEGACY}',
  'var old: Integer;',
  '{$ENDIF}',
  '{$I consts.inc}',
  'end.',
  '',
].join('\n');

let pass = 0;
function check(name, cond) { assert.ok(cond, name); console.log('  ok  ' + name); pass++; }

// --- expand (default): Delphi textual-include semantics — config defines
// PROPAGATE to the parent (dcc32 behavior), body spliced.
{
  const r = preprocess(src, { defines: ['LEGACY'], baseDir: dir, includeMode: 'expand' });
  check('expand: {$DEFINE FEATURE_X} propagates (THEN taken)', r.text.includes('hasX') && !r.text.includes('noX'));
  check('expand: {$UNDEF LEGACY} propagates (LEGACY branch dropped)', !r.text.includes('var old'));
  check('expand: consts.inc body IS spliced', r.text.includes('IncOnly'));
  check('expand: offsets shift (length changes)', r.text.length !== src.length);
  // default (no includeMode) must equal expand — no behavior change for existing callers.
  const rDefault = preprocess(src, { defines: ['LEGACY'], baseDir: dir });
  check('expand: default mode === expand (no regression)', rDefault.text === r.text);
}

// --- defines-only: config defines propagate, body NOT spliced, offsets 1:1.
{
  const r = preprocess(src, { defines: ['LEGACY'], baseDir: dir, includeMode: 'defines-only' });
  check('defines-only: {$DEFINE FEATURE_X} propagates (THEN taken)', r.text.includes('hasX') && !r.text.includes('noX'));
  check('defines-only: {$UNDEF LEGACY} propagates (LEGACY branch dropped)', !r.text.includes('var old'));
  check('defines-only: include body NOT spliced', !r.text.includes('IncOnly'));
  check('defines-only: offsets stay 1:1 (length preserved)', r.text.length === src.length);
  check('defines-only: line count preserved', r.text.split('\n').length === src.split('\n').length);
}

// --- off: config defines ignored, body blanked, offsets 1:1.
{
  const r = preprocess(src, { defines: ['LEGACY'], baseDir: dir, includeMode: 'off' });
  check('off: config define NOT propagated (ELSE taken)', r.text.includes('noX'));
  check('off: include body blanked', !r.text.includes('IncOnly'));
  check('off: offsets 1:1', r.text.length === src.length);
}

// --- unresolved include is always blanked 1:1 regardless of mode.
{
  const s2 = 'unit V;\n{$I nope.inc}\nend.\n';
  for (const m of ['expand', 'defines-only', 'off']) {
    const r = preprocess(s2, { defines: [], baseDir: dir, includeMode: m });
    check('unresolved include blanked 1:1 (' + m + ')', r.text.length === s2.length);
  }
}

console.log('\n' + pass + ' checks passed.');
