// delphi13-preprocessor — dcc-tolerance normalization pass
//
// dcc32 accepts a handful of constructs where a terminating ';' is simply
// absent, treating them exactly as if the ';' were present (all shapes
// verified with dcc32, RAD Studio 37 — see CORPUS-CEILING-REPORT.md).
// Grammar-level fixes for these were evaluated and rejected: the with-';'
// and no-';' forms share their whole prefix, and expressing the fork either
// lands in auto-generated repeat states that cannot be declared as
// conflicts, or (split-tail variants) risks parser-table explosion.
//
// This pass instead inserts the ';' dcc imagines, BEFORE parsing:
//
//   Rule A — final routine-directive group without its ';':
//       function F(...): BOOL; stdcall
//       function G(...): string; deprecated 'msg'
//       function H: LongWord; stdcall; external 'k32' name 'GetTickCount'
//     Anchors: an earlier ';' must exist on the same line (a declaration
//     tail, never a statement), and the NEXT code line must start with a
//     declaration keyword.
//
//   Rule B — `array[..] of T` as the last record field without its ';':
//       padding: array [0 .. 83] of Byte // comment
//       end;
//     Anchors: the field's element type is a plain (dotted) identifier and
//     the NEXT code line starts with `end`.
//
// Safety property (why false positives cannot corrupt valid code): in
// Pascal an extra ';' before `end` is an empty statement, and none of the
// follower keywords can legally continue an expression — so inserting ';'
// at a mis-identified site keeps valid code valid and invalid code invalid.
//
// Positions: the ';' is inserted directly after the LAST CODE character of
// the line — everything before it (all declaration tokens) keeps its exact
// (row, col); only a trailing comment on the same line shifts right by one
// column. Line/row numbers never change.
//
// The pass is OPT-IN (`preprocess(..., { tolerances: true })`) and runs on
// the final preprocessed text only (not inside include recursion).

'use strict';

const DIRWORD = '(?:stdcall|cdecl|safecall|pascal|register|winapi|inline'
  + '|overload|varargs|assembler|near|far|export|platform|experimental'
  + '|final|static|unsafe|reintroduce|virtual|dynamic|override|abstract)';
const STR = "'[^']*'";
const DIRUNIT = `(?:${DIRWORD}`
  + `|deprecated(?:\\s+${STR})?`
  + `|external(?:\\s+${STR})?(?:\\s+name\\s+${STR})?(?:\\s+index\\s+\\d+)?)`;
// ';' earlier on the line, then one-or-more directive units — and NO final ';'.
const RULE_A = new RegExp(`;\\s*${DIRUNIT}(?:\\s*;\\s*${DIRUNIT})*$`, 'i');
const RULE_A_FOLLOWER = /^\s*(function|procedure|constructor|destructor|class|var|const|type|threadvar|resourcestring|property|implementation|interface|initialization|finalization|uses|begin|end|exports|label)\b/i;

const RULE_B = /:\s*(?:packed\s+)?array\s*\[[^\]]*\]\s*of\s+[A-Za-z_][\w.]*$/i;
const RULE_B_FOLLOWER = /^\s*end\b/i;

// Blank comments (brace, paren-star, line) out of one line, preserving
// columns; strings are kept verbatim (line-bounded, doubled-quote aware).
// `st` carries block-comment state across lines: { brace, paren }.
function stripComments(line, st) {
  let out = '';
  let i = 0;
  const n = line.length;
  while (i < n) {
    if (st.brace) {
      const j = line.indexOf('}', i);
      if (j < 0) { out += ' '.repeat(n - i); i = n; }
      else { out += ' '.repeat(j + 1 - i); i = j + 1; st.brace = false; }
      continue;
    }
    if (st.paren) {
      const j = line.indexOf('*)', i);
      if (j < 0) { out += ' '.repeat(n - i); i = n; }
      else { out += ' '.repeat(j + 2 - i); i = j + 2; st.paren = false; }
      continue;
    }
    const c = line[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (line[j] === "'") {
          if (line[j + 1] === "'") { j += 2; continue; }
          j++; break;
        }
        j++;
      }
      out += line.slice(i, j); i = j; continue;
    }
    if (c === '/' && line[i + 1] === '/') { out += ' '.repeat(n - i); break; }
    if (c === '{') { st.brace = true; continue; }
    if (c === '(' && line[i + 1] === '*') { st.paren = true; continue; }
    out += c; i++;
  }
  return out;
}

function applyTolerances(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(nl);
  const st = { brace: false, paren: false };
  // code[i] = line with comments blanked (columns preserved)
  const code = lines.map(l => stripComments(l, st));

  function nextCodeLine(i) {
    for (let j = i + 1; j < code.length; j++) {
      if (code[j].trim() !== '') return code[j];
    }
    return null;
  }

  const edits = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = code[i].trimEnd();
    if (trimmed === '' || trimmed.endsWith(';')) continue;

    let match = false;
    if (RULE_A.test(trimmed)) {
      const follower = nextCodeLine(i);
      if (follower !== null && RULE_A_FOLLOWER.test(follower)) match = true;
    }
    if (!match && RULE_B.test(trimmed)) {
      const follower = nextCodeLine(i);
      if (follower !== null && RULE_B_FOLLOWER.test(follower)) match = true;
    }
    if (!match) continue;

    // Insert ';' right after the last code character.
    const col = trimmed.length; // trimEnd of the column-preserving strip
    lines[i] = lines[i].slice(0, col) + ';' + lines[i].slice(col);
    edits.push({ row: i, col });
  }

  return { text: lines.join(nl), edits };
}

module.exports = { applyTolerances };
