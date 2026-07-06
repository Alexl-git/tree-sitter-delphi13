// delphi13-preprocessor — chunk processor (Phase 1 MVP)
//
// Walks the chunk sequence from lexer.js, maintains a defines table, and
// emits a virtual source string that contains only the active branches.
//
// Conditional inactive branches are REPLACED with whitespace (newlines)
// so the virtual source has identical line numbers to the original. This
// keeps tree-sitter source positions usable for error reporting.
//
// `{$I X.inc}` expansion is supported in Phase 1 with a simple resolver
// that looks up files relative to the current file's directory and any
// supplied include paths.

'use strict';

const fs = require('fs');
const path = require('path');
const { lex } = require('./lexer');
const { evalExpr } = require('./evalExpr');

function preprocess(input, options = {}) {
  // In `defines-only` include mode the child recursion shares the PARENT's live
  // defines Set by reference (options._sharedDefines) so the child's
  // {$DEFINE}/{$UNDEF} mutate the parent table — required so a parent {$IFDEF X}
  // after `{$I config.inc}` (where config.inc defined X) resolves correctly.
  const defines = options._sharedDefines
    || new Set((options.defines || []).map(d => d.toLowerCase()));
  // Numeric defines for `{\$IF X < N}` form: name->number map.
  const numericDefines = new Map(
    Object.entries(options.numericDefines || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const includePaths = options.includePaths || [];
  const baseDir = options.baseDir || '.';
  const maxIncludeDepth = options.maxIncludeDepth || 64;
  // Include handling:
  //   'expand'       (default) — splice the resolved .inc body into the output.
  //   'defines-only'           — apply the .inc's {$DEFINE}/{$UNDEF} to the
  //                              parent, but BLANK the `{$I}` directive (no body
  //                              splice). Keeps output length 1:1 with the input
  //                              (no offset shift) and avoids double-indexing
  //                              .inc symbols that a consumer indexes separately.
  //   'off'                    — blank the `{$I}` directive, ignore its defines.
  const includeMode = options.includeMode || 'expand';

  const chunks = lex(input);
  // State stack for nested IFs:
  //   active: are we emitting text right now?
  //   takenBranch: have we already taken any THEN/ELSEIF branch?
  //   anyOuterFalse: is some ancestor IF false (which makes whole subtree inactive)?
  const stack = [{ active: true, takenBranch: true, anyOuterFalse: false }];

  // Buffer pieces in an array and join at the end. Direct `out += text`
  // is O(N^2) in V8 for large accumulations — kills perf on 200 KB+ files.
  const outBuf = [];
  let depth = options._depth || 0;

  function top() { return stack[stack.length - 1]; }
  function effectivelyActive() { return stack.every(s => s.active); }

  function blankifyOrEmit(text) {
    if (effectivelyActive()) {
      outBuf.push(text);
    } else {
      // Replace non-newline chars with spaces so line numbers stay aligned.
      // Use regex replace (single allocation) instead of per-char concat.
      outBuf.push(text.replace(/[^\n]/g, ' '));
    }
  }

  function blankifyDirective(srcLen) {
    outBuf.push(' '.repeat(srcLen));
  }

  function resolveInclude(name) {
    const tryPaths = [baseDir, ...includePaths];
    for (const dir of tryPaths) {
      const p = path.resolve(dir, name);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  for (const ch of chunks) {
    if (ch.kind === 'text') {
      blankifyOrEmit(ch.value);
      continue;
    }
    // Directive
    const dir = ch.dir;
    const srcLen = ch.srcEnd - ch.srcStart;

    if (dir === 'define' || dir === 'undef') {
      if (effectivelyActive()) {
        const name = ch.args.split(/\s+/)[0].toLowerCase();
        if (dir === 'define') defines.add(name);
        else defines.delete(name);
      }
      blankifyDirective(srcLen);
      continue;
    }

    if (dir === 'ifdef' || dir === 'ifndef' || dir === 'if' || dir === 'ifopt') {
      let cond;
      if (dir === 'ifdef') cond = defines.has(ch.args.toLowerCase());
      else if (dir === 'ifndef') cond = !defines.has(ch.args.toLowerCase());
      else if (dir === 'if') cond = evalExpr(ch.args, defines, numericDefines);
      else cond = false; // {$IFOPT switch} — conservative
      const outerInactive = !effectivelyActive();
      stack.push({
        active: cond && !outerInactive,
        takenBranch: cond,
        anyOuterFalse: outerInactive,
      });
      blankifyDirective(srcLen);
      continue;
    }

    if (dir === 'else') {
      const s = top();
      if (s) {
        s.active = !s.takenBranch && !s.anyOuterFalse;
        s.takenBranch = true;
      }
      blankifyDirective(srcLen);
      continue;
    }

    if (dir === 'elseif') {
      const s = top();
      if (s) {
        if (s.takenBranch) {
          s.active = false;
        } else {
          const cond = evalExpr(ch.args, defines, numericDefines);
          s.active = cond && !s.anyOuterFalse;
          if (cond) s.takenBranch = true;
        }
      }
      blankifyDirective(srcLen);
      continue;
    }

    if (dir === 'endif' || dir === 'ifend') {
      if (stack.length > 1) stack.pop();
      blankifyDirective(srcLen);
      continue;
    }

    if (dir === 'i' || dir === 'include') {
      if (!effectivelyActive()) { blankifyDirective(srcLen); continue; }
      if (depth >= maxIncludeDepth) { blankifyDirective(srcLen); continue; }
      const fname = ch.args.replace(/^['"]|['"]$/g, '').trim();
      const resolved = resolveInclude(fname);
      if (!resolved) {
        // Unresolved include — leave as whitespace so line count stays.
        blankifyDirective(srcLen);
        continue;
      }
      if (includeMode === 'off') {
        blankifyDirective(srcLen);
        continue;
      }
      const sub = fs.readFileSync(resolved, 'utf8');
      if (includeMode === 'defines-only') {
        // Recurse sharing THIS defines Set so the child's {$DEFINE}/{$UNDEF}
        // mutate the parent table live. Discard the child text; blank the
        // directive so parent offsets stay 1:1. The child evaluates its own
        // conditionals under the same (now-shared) active define profile.
        preprocess(sub, {
          ...options,
          _sharedDefines: defines,
          baseDir: path.dirname(resolved),
          _depth: depth + 1,
        });
        blankifyDirective(srcLen);
      } else {
        // 'expand' (default): splice the resolved child text into the output.
        const subOut = preprocess(sub, {
          ...options,
          baseDir: path.dirname(resolved),
          _depth: depth + 1,
        });
        outBuf.push(subOut.text);
      }
      continue;
    }

    // Unknown directive — keep as text (passthrough). Should not reach
    // here since lexer filters unknown into text chunks already.
    blankifyDirective(srcLen);
  }

  return { text: outBuf.join(''), defines: Array.from(defines) };
}

module.exports = { preprocess };
