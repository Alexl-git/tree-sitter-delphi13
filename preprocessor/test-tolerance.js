// Tests for tolerance.js — dcc-tolerated constructs normalized by REPLACING one
// adjacent whitespace byte (space/tab/CR — never LF) with the ';' dcc itself
// imagines (all shapes dcc32-verified valid, exit 0).
//
// REPLACEMENT (not insertion) is the load-bearing semantics: output length is
// ALWAYS byte-identical to the input (the offset-identity invariant of the
// canonical Delphi port — tree-sitter spans map 1:1 to the original file with
// no source map). A line with no eligible byte (LF-only ending, no trailing
// space) is left untouched — real-world Delphi sources are CRLF, so the CR is
// always available; fixtures below use \r\n accordingly.
//
// Every positive fixture is lifted from a real corpus file.
// Run: node preprocessor/test-tolerance.js  (exit 0 = pass)
'use strict';

const assert = require('assert');
const { applyTolerances } = require('./tolerance');

let pass = 0;
function check(name, cond) { assert.ok(cond, name); console.log('  ok  ' + name); pass++; }
function lines(s) { return s.split(/\r?\n/); }

// --- Rule A: final directive group without its ';' (forward/interface decls) ---

// dxServerModeUtils.pas L47 — deprecated 'msg' with trailing spaces, next line a function.
{
  const src = [
    "function A(const V: Variant): string; deprecated 'use B instead'  ",
    'function B(const V: Variant): string;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('A: deprecated-msg tail gets ; (trailing space consumed)', lines(r.text)[0].includes("deprecated 'use B instead'; "));
  check('A: OFFSET-IDENTITY — length unchanged', r.text.length === src.length);
  check('A: edit recorded', r.edits.length === 1 && r.edits[0].row === 0);
}

// dxGDIPlusAPI.pas L1554 — overload directly before CRLF; the CR is consumed.
{
  const src = [
    'function R(const R1, R2: TdxGpRectF): Boolean; overload',
    '',
    '// codecs',
    'procedure CheckImageCodecs;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('A: overload tail gets ; (CR consumed; blank+comment skipped)', lines(r.text)[0].endsWith('overload;'));
  check('A: length unchanged after CR consumption', r.text.length === src.length);
  check('A: line count unchanged (LF untouched)', lines(r.text).length === 4);
}

// dxCryptoAPI.pas L1188 — stdcall, next line an {$EXTERNALSYM} (non-code), then a function.
{
  const src = [
    'function C(h: HCERTSTORE; dw: DWORD): BOOL; stdcall',
    '{$EXTERNALSYM CertControlStore}',
    'function D(p: PCERT_CONTEXT): PCERT_CONTEXT; stdcall;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('A: stdcall tail gets ; ({$...} line skipped)', lines(r.text)[0].endsWith('stdcall;'));
}

// external '...' name '...' chain (dcc32-verified form from the grammar notes).
{
  const src = [
    "function G: LongWord; stdcall; external 'k32' name 'GetTickCount'",
    'implementation',
  ].join('\r\n');
  const r = applyTolerances(src);
  check("A: external-name tail gets ;", lines(r.text)[0].endsWith("name 'GetTickCount';"));
}

// NEGATIVE: LF-only line ending with no trailing whitespace — no eligible byte,
// stays untouched (documented limitation; real corpus files are CRLF).
{
  const src = [
    'function R(const R1, R2: TdxGpRectF): Boolean; overload',
    'procedure CheckImageCodecs;',
  ].join('\n');
  const r = applyTolerances(src);
  check('A-neg: LF-only, no spare byte — untouched', r.edits.length === 0 && r.text === src);
}

// NEGATIVE: deprecated whose message continues on the NEXT line — no insert.
{
  const src = [
    'procedure P; deprecated',
    "  'use Q instead';",
  ].join('\r\n');
  const r = applyTolerances(src);
  check('A-neg: continuation string blocks edit', r.edits.length === 0);
}

// NEGATIVE: proper ';' already present — untouched.
{
  const src = [
    'function A: Integer; stdcall;',
    'function B: Integer;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('A-neg: already-terminated line untouched', r.text === src);
}

// NEGATIVE: directive keyword as an identifier in a statement — no same-line ';'
// before it, so no match.
{
  const src = [
    '  X := Overload',
    'end;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('A-neg: statement ending in keyword untouched', r.edits.length === 0);
}

// --- Rule B: array[..] of T as last record field without ';' ---

// FireDAC.Phys.MongoDBCli.pas — trailing // comment; the separating space is consumed.
{
  const src = [
    '    err_off: Cardinal;',
    '    padding: array [0 .. 83] of Byte // bson_value_t   value;',
    '  end;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('B: array field gets ; (space before comment consumed)', lines(r.text)[1].includes('of Byte;// bson_value_t'));
  check('B: length unchanged', r.text.length === src.length);
}

// Winapi.ShlObj.pas — packed array, MULTIPLE comment lines before end.
{
  const src = [
    '    szMessage: packed array[0..MAX_PATH-1] of WCHAR; // text such as "Move to %1"',
    '    szInsert: packed array[0..MAX_PATH-1] of WCHAR   // text such as "Documents"',
    '',
    '// some UI coloring is applied',
    '// %% and %1 are markers',
    '  end;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('B: packed array + multi-comment gap gets ;', lines(r.text)[1].includes('of WCHAR;  //'));
}

// SHX.pas — multi-dimensional index, CR consumed.
{
  const src = [
    '  TsgSHXStack = record',
    '    Index: Integer;',
    '    Value: array[0..4, 0..2] of Double',
    '  end;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('B: multi-dim array field gets ; (CR consumed)', lines(r.text)[2].endsWith('of Double;'));
  check('B: length unchanged', r.text.length === src.length);
}

// NEGATIVE: array field WITH ';' — untouched.
{
  const src = [
    '    Value: array[0..4] of Double;',
    '  end;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('B-neg: terminated array field untouched', r.edits.length === 0);
}

// NEGATIVE: next code line is NOT end — no edit (could be a continuation).
{
  const src = [
    '    Value: array[0..4] of Double',
    '    Extra: Integer;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('B-neg: non-end follower blocks edit', r.edits.length === 0);
}

// --- General: strings/comments containing decl keywords do not confuse the scanner ---
{
  const src = [
    "  S := '; stdcall',  { function }",
    'end;',
  ].join('\r\n');
  const r = applyTolerances(src);
  check('scanner: keywords inside strings/comments ignored', r.edits.length === 0);
}

console.log('\n' + pass + ' checks passed.');
