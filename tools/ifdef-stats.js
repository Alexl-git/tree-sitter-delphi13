#!/usr/bin/env node
// Categorize every {$IF*}...{$END*} block in the corpus by structural
// shape, so we can decide whether a parse-IFDEF-as-AST-branches refactor
// is feasible and where the special cases live.
//
// Categories (mutually exclusive, first match wins):
//   single        — {$IFDEF X}body{$ENDIF}  (no {$ELSE})
//   sym_lit       — both branches are single literal/identifier (e.g. "4" vs "2")
//   sym_call      — both branches are call-like (Foo(...) vs Bar(...))
//   sym_typeref   — both branches are identifier/qualified-id (Classes vs System.Classes)
//   sym_stmt_eq   — both branches end with ';' (look statement-shaped, similar length)
//   asym_kw       — wraps a single keyword (packed, type, virtual, ...)
//   asym_open     — {$IF} opens a different structural keyword than {$ELSE}
//                   (e.g. {$IF}case ... else{$ELSE}begin{$ENDIF})
//   crossterm     — terminator ';' / ',' / '.' lives inside the block
//   nested        — contains nested {$IF}/{$IFEND}
//   other         — everything else (long mixed branches)

const fs = require('fs');
const path = require('path');

const manifest = process.argv[2] || 'work/manifest-baseline.txt';
const files = fs.readFileSync(manifest, 'utf8').split(/\r?\n/).filter(Boolean);

const stats = {
  files_scanned: 0,
  total_blocks: 0,
  by_category: {},
  examples: {},
};

const STRUCTURAL_KWS = /^(case|begin|end|repeat|until|if|then|else|class|record|object|interface|implementation|unit|program|library|package|var|const|type|function|procedure|while|for|with)\b/i;

function bumpCat(cat, example, file, row) {
  stats.by_category[cat] = (stats.by_category[cat] || 0) + 1;
  if (!stats.examples[cat]) stats.examples[cat] = [];
  if (stats.examples[cat].length < 3) {
    stats.examples[cat].push({ file: path.basename(file), row, snippet: example.replace(/\s+/g, ' ').trim().slice(0, 100) });
  }
}

// Scan source, find every {$IF*}...{$ENDIF}/{$IFEND} block, categorize.
function scanFile(file) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return; }

  let i = 0;
  while (i < src.length) {
    // Find next {$if
    const open = src.toLowerCase().indexOf('{$if', i);
    if (open < 0) break;
    // Skip if it's actually {$ifend ...} or {$ifdef-inside-string} (not perfect but cheap)
    if (src.toLowerCase().substr(open, 6) === '{$ifen') { i = open + 1; continue; }

    // Find the } that closes the opening directive
    const openEnd = src.indexOf('}', open);
    if (openEnd < 0) break;

    // Walk forward, tracking depth, until matching {$endif}/{$ifend}
    let depth = 1;
    let scanPos = openEnd + 1;
    let elsePos = -1;
    let nested = false;
    let blockClose = -1;

    while (scanPos < src.length && depth > 0) {
      const next = src.toLowerCase().indexOf('{$', scanPos);
      if (next < 0) break;
      const lc = src.toLowerCase();
      const tag = lc.substr(next, 7);
      const tagEnd = src.indexOf('}', next);
      if (tagEnd < 0) break;

      if (tag.startsWith('{$ifend')) { depth--; if (depth === 0) { blockClose = tagEnd + 1; break; } }
      else if (tag.startsWith('{$endif')) { depth--; if (depth === 0) { blockClose = tagEnd + 1; break; } }
      else if (tag.startsWith('{$end')) { depth--; if (depth === 0) { blockClose = tagEnd + 1; break; } }
      else if (tag.startsWith('{$if')) { depth++; nested = true; }
      else if (tag.startsWith('{$else') && depth === 1 && elsePos < 0) { elsePos = next; }

      scanPos = tagEnd + 1;
    }

    if (blockClose < 0) { i = open + 1; continue; }

    stats.total_blocks++;
    const blockSrc = src.slice(open, blockClose);
    const row = (src.slice(0, open).match(/\n/g) || []).length + 1;

    // Categorize
    let cat;
    if (nested) {
      cat = 'nested';
    } else if (elsePos < 0) {
      cat = 'single';
    } else {
      const branchA = src.slice(openEnd + 1, elsePos).trim();
      const branchB = src.slice(src.indexOf('}', elsePos) + 1, blockClose - 7 /* approx ENDIF */).trim();

      const isKw = (s) => /^[A-Za-z_]\w*$/.test(s) && STRUCTURAL_KWS.test(s);
      const isIdent = (s) => /^[A-Za-z_][\w.]*$/.test(s);
      const isCall = (s) => /^[A-Za-z_][\w.]*\s*\(.*\)$/s.test(s);
      const endsWithSemi = (s) => /;\s*$/.test(s);
      const containsTerminator = (s) => /(;|,|\.)\s*$/.test(s) && !/end\s*$/i.test(s);
      const opensStructural = (s) => STRUCTURAL_KWS.test(s);

      if (isKw(branchA) && isKw(branchB)) cat = 'asym_kw';
      else if (isIdent(branchA) && isIdent(branchB)) cat = 'sym_typeref';
      else if (isCall(branchA) && isCall(branchB)) cat = 'sym_call';
      else if (/^[\d\-+]/.test(branchA) && /^[\d\-+]/.test(branchB)) cat = 'sym_lit';
      else if (endsWithSemi(branchA) && endsWithSemi(branchB)) cat = 'sym_stmt_eq';
      else if (opensStructural(branchA) !== opensStructural(branchB)) cat = 'asym_open';
      else if (containsTerminator(branchA) || containsTerminator(branchB)) cat = 'crossterm';
      else cat = 'other';
    }
    bumpCat(cat, blockSrc, file, row);

    i = blockClose;
  }
}

let processed = 0;
for (const f of files) {
  if (!/\.(pas|dpr|dpk|inc)$/i.test(f)) continue;
  scanFile(f);
  stats.files_scanned++;
  if (++processed % 2000 === 0) process.stderr.write(`  ... ${processed}/${files.length}\n`);
}

console.log(`Files scanned: ${stats.files_scanned}`);
console.log(`Total {$IF*}...{$END*} blocks: ${stats.total_blocks}`);
console.log('');
console.log('| Category       |  Count |    %   |');
console.log('|----------------|--------|--------|');
const ordered = Object.entries(stats.by_category).sort((a, b) => b[1] - a[1]);
for (const [cat, n] of ordered) {
  const pct = ((100 * n) / stats.total_blocks).toFixed(2);
  console.log(`| ${cat.padEnd(14)} | ${String(n).padStart(6)} | ${pct.padStart(5)}% |`);
}
console.log('');
console.log('## Examples per category');
for (const [cat] of ordered) {
  console.log(`\n### ${cat}`);
  for (const ex of stats.examples[cat]) {
    console.log(`  ${ex.file}:${ex.row}  ${ex.snippet}`);
  }
}
