// delphi13-preprocessor — directive lexer (Phase 1 MVP)
//
// Recognizes Delphi compiler directives at the byte-stream level. Emits a
// flat sequence of "chunks": plain-text spans and directive records. The
// evaluator (preprocess.js) consumes this sequence and decides which spans
// to keep based on the active define state.
//
// Directive forms recognized:
//   {$DEFINE X}        define a symbol
//   {$UNDEF X}         undef a symbol
//   {$IFDEF X}         conditional: symbol defined
//   {$IFNDEF X}        conditional: symbol NOT defined
//   {$IF expr}         conditional: boolean expression (incl. defined(X))
//   {$IFOPT switch}    conditional: compiler switch state — treated as false MVP
//   {$ELSE}            alternative branch
//   {$ELSEIF expr}     alternative with expr
//   {$ENDIF} / {$IFEND}  end of conditional
//   {$I X.inc} / {$INCLUDE X.inc}  include another file
//   Everything else under `{$X}` is a passthrough directive — emitted as
//   plain text so the downstream parser sees it as a regular `pp` token.
//
// Comment forms recognized and skipped (transparently kept in output):
//   {...}            brace block comment (without leading `$`)
//   (* ... *)        Pascal alt-block comment
//   // ... \n        line comment
//
// Returns: array of chunks. Each chunk is either:
//   { kind: 'text', value, srcStart, srcEnd }
//   { kind: 'directive', dir, args, srcStart, srcEnd, line }
//
// Source positions are byte offsets into the input string.

'use strict';

const DIR_KEYWORDS = new Set([
  'define', 'undef',
  'ifdef', 'ifndef', 'if', 'ifopt', 'ifend',
  'else', 'elseif', 'endif',
  'i', 'include',
]);

function lex(input) {
  const chunks = [];
  const n = input.length;
  let i = 0;
  let textStart = 0;

  function flushText(end) {
    if (textStart < end) {
      chunks.push({ kind: 'text', value: input.slice(textStart, end), srcStart: textStart, srcEnd: end });
    }
  }

  function lineAt(pos) {
    // 0-indexed line number
    let line = 0;
    for (let k = 0; k < pos; k++) if (input.charCodeAt(k) === 10) line++;
    return line;
  }

  while (i < n) {
    const c = input.charCodeAt(i);

    // // line comment — passthrough
    if (c === 47 /* / */ && i + 1 < n && input.charCodeAt(i + 1) === 47) {
      while (i < n && input.charCodeAt(i) !== 10) i++;
      continue;
    }

    // (* ... *) block comment — passthrough
    if (c === 40 /* ( */ && i + 1 < n && input.charCodeAt(i + 1) === 42) {
      i += 2;
      while (i < n - 1 && !(input.charCodeAt(i) === 42 && input.charCodeAt(i + 1) === 41)) i++;
      i = Math.min(n, i + 2);
      continue;
    }

    // String literal — skip without interpreting any `{` inside
    if (c === 39 /* ' */) {
      i++;
      while (i < n && !(input.charCodeAt(i) === 39 && input.charCodeAt(i + 1) !== 39)) {
        // doubled quote = escaped quote, consume both
        if (input.charCodeAt(i) === 39 && input.charCodeAt(i + 1) === 39) { i += 2; continue; }
        i++;
      }
      if (i < n) i++; // consume closing '
      continue;
    }

    // { ... } — directive (if `{$`) or brace comment
    if (c === 123 /* { */) {
      if (i + 1 < n && input.charCodeAt(i + 1) === 36 /* $ */) {
        // Directive. Flush preceding text first.
        flushText(i);
        const start = i;
        i += 2; // past `{$`
        // Read directive keyword
        const kwStart = i;
        while (i < n && /[A-Za-z]/.test(input[i])) i++;
        const kw = input.slice(kwStart, i).toLowerCase();
        // Read arguments up to matching `}`
        const argStart = i;
        let depth = 1;
        while (i < n && depth > 0) {
          if (input.charCodeAt(i) === 125) { depth--; if (depth === 0) break; }
          i++;
        }
        const argEnd = i;
        if (i < n) i++; // consume `}`
        const args = input.slice(argStart, argEnd).trim();
        const isKnown = DIR_KEYWORDS.has(kw);
        if (isKnown) {
          chunks.push({
            kind: 'directive', dir: kw, args, srcStart: start, srcEnd: i, line: lineAt(start),
          });
          textStart = i;
        } else {
          // Unknown / passthrough directive — keep as text so downstream
          // parser sees it as a regular `pp` token.
          // Do NOT flush; leave textStart where it was so the directive's
          // bytes are part of the upcoming text chunk.
          // (We already advanced past `}`.)
        }
        continue;
      }
      // Brace comment — passthrough
      while (i < n && input.charCodeAt(i) !== 125) i++;
      if (i < n) i++;
      continue;
    }

    i++;
  }
  flushText(n);
  return chunks;
}

module.exports = { lex };
