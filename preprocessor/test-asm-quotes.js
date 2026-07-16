// Quote handling in the directive lexer.
//
// dcc's built-in assembler accepts MASM-style double-quoted operands:
//     CMP AL,"'"        (System.AnsiStrings.pas X86ASM arms)
// The lexer must not treat the apostrophe INSIDE "..." as a string opener —
// that mis-pairing swallowed the region's {$ENDIF}s and blanked the rest of
// the unit. Also: Pascal strings cannot span lines, so a stray unpaired
// quote must stop hiding directives at the end of its line.
// Run: node preprocessor/test-asm-quotes.js  (exit 0 = pass)
'use strict';

const assert = require('assert');
const { preprocess } = require('./preprocess');

let pass = 0;
function check(name, cond) { assert.ok(cond, name); console.log('  ok  ' + name); pass++; }

// 1. Double-quoted apostrophe in an (inactive) asm arm must not swallow the
//    {$ENDIF}; the code after the region stays active.
{
  const src = [
    'unit U;',
    '{$IFDEF X86ASM}',
    'asm',
    '  CMP AL,"\'"',
    '  CMP AL,\'"\'',
    'end;',
    '{$ENDIF}',
    'var ok1: Integer;',
    'end.',
  ].join('\n');
  const r = preprocess(src, { defines: [] });
  check('asm-quotes: dquoted apostrophe does not swallow {$ENDIF}', r.text.includes('var ok1'));
}

// 2. A directive inside a single-quoted string is still NOT interpreted.
{
  const src = [
    'unit U;',
    "s := '{$DEFINE NOPE}';",
    '{$IFDEF NOPE}var bad: Integer;{$ENDIF}',
    'end.',
  ].join('\n');
  const r = preprocess(src, { defines: [] });
  check('asm-quotes: directive inside \'...\' still ignored', !r.text.includes('var bad'));
}

// 3. A stray unpaired quote stops hiding directives at end of line.
{
  const src = [
    'unit U;',
    "X := 1; ' stray",
    '{$DEFINE AFTER}',
    '{$IFDEF AFTER}var ok3: Integer;{$ENDIF}',
    'end.',
  ].join('\n');
  const r = preprocess(src, { defines: [] });
  check('asm-quotes: stray quote is line-bounded', r.text.includes('var ok3'));
}

console.log('\n' + pass + ' checks passed.');
