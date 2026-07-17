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
// follower keywords can legally continue an expression — so a ';' at a
// mis-identified site keeps valid code valid and invalid code invalid.
//
// REPLACEMENT, not insertion (offset-identity invariant): the ';' REPLACES
// the first whitespace byte after the last code character of the line —
// a space, a tab, or the CR of a CRLF ending. LF is never touched (line
// count and every following offset stay identical), and if the line has no
// eligible byte (LF-only ending with no trailing whitespace) it is left
// unfixed. Output length is therefore ALWAYS byte-identical to the input,
// matching the canonical Delphi port, whose tree-sitter spans map 1:1 back
// to the original file with no source map.
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
  // Split on LF only, keeping any trailing '\r' inside each line — so the CR
  // of a CRLF ending is an in-line byte the replacement below may consume.
  const lines = text.split('\n');
  const st = { brace: false, paren: false };
  // code[i] = line with comments blanked (columns preserved). A trailing '\r'
  // is whitespace to every trim/regex below, so scanning the raw line is fine.
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

    // REPLACE the first whitespace byte after the last code character with
    // ';' — space, tab, or the CR of a CRLF ending. No eligible byte (LF-only
    // ending, code runs to the line's last char) -> leave the line unfixed;
    // offsets always take precedence over the fix.
    const col = trimmed.length; // first char after the code (column-preserving strip)
    const c = lines[i][col];
    if (c !== ' ' && c !== '\t' && c !== '\r') continue;
    lines[i] = lines[i].slice(0, col) + ';' + lines[i].slice(col + 1);
    edits.push({ row: i, col });
  }

  return { text: lines.join('\n'), edits };
}

module.exports = { applyTolerances };
