#!/usr/bin/env node
// Parse a list of Pascal files and emit per-file JSONL results.
// Usage:  node tools/parse-corpus.js <manifest.txt> <output.jsonl>
// manifest.txt: one absolute path per line.

const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const Pascal = require(path.join(__dirname, '..', 'bindings', 'node'));

const SNIPPET_LINES_BEFORE = 1;
const SNIPPET_LINES_AFTER = 2;
const MAX_ERROR_SAMPLES_PER_FILE = 5;

if (process.argv.length < 4) {
  console.error('usage: parse-corpus.js <manifest.txt> <output.jsonl>');
  process.exit(2);
}

const manifestPath = process.argv[2];
const outputPath = process.argv[3];

const files = fs.readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(s => s.length > 0);

const parser = new Parser();
parser.setLanguage(Pascal);

const out = fs.openSync(outputPath, 'w');
let okCount = 0;
let failCount = 0;
let skipCount = 0;
let totalBytes = 0;
let totalParseMs = 0;
const startTotal = Date.now();

function classifyParent(node) {
  // Walk up to find a meaningful parent type for bucketing.
  let p = node.parent;
  while (p && (p.type === 'ERROR' || p.type === 'declarations')) p = p.parent;
  return p ? p.type : '(root)';
}

function recordError(node, sourceLines) {
  const startRow = node.startPosition.row;
  const startCol = node.startPosition.column;
  const endRow = node.endPosition.row;
  const fromLine = Math.max(0, startRow - SNIPPET_LINES_BEFORE);
  const toLine = Math.min(sourceLines.length - 1, startRow + SNIPPET_LINES_AFTER);
  const snippet = sourceLines.slice(fromLine, toLine + 1).join('\n');
  return {
    row: startRow + 1,
    col: startCol + 1,
    endRow: endRow + 1,
    parent: classifyParent(node),
    snippet: snippet.length > 400 ? snippet.slice(0, 400) + '...' : snippet,
  };
}

function findErrors(root, sourceLines, limit) {
  // Walk the tree. For each ERROR node, decide whether it is a "leaf" error:
  // an ERROR whose subtree contains no further ERROR nodes. Those are the
  // actionable points of confusion. Catastrophic outer ERRORs that span the
  // whole file get filtered out unless there is nothing better.
  const allErrors = [];      // every ERROR node
  const leafErrors = [];     // ERROR nodes whose children carry no further error
  let totalErrorNodes = 0;
  let totalMissingNodes = 0;

  function visit(node) {
    if (node.type === 'ERROR') {
      totalErrorNodes++;
      allErrors.push(node);
      let childHasError = false;
      for (let i = 0; i < node.childCount; i++) {
        if (node.child(i).hasError) { childHasError = true; break; }
      }
      if (!childHasError) {
        leafErrors.push(node);
      }
    }
    if (node.isMissing) totalMissingNodes++;
    if (!node.hasError) return; // pruning: skip clean subtrees
    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i));
    }
  }

  visit(root);

  // Prefer leaf errors. If none found (e.g. the whole file is one giant ERROR
  // with no inner ERROR children, just unmatched tokens), fall back to allErrors.
  const source = leafErrors.length > 0 ? leafErrors : allErrors;
  // Sort by (start row asc, span asc): earliest, smallest first.
  source.sort((a, b) => {
    if (a.startPosition.row !== b.startPosition.row) return a.startPosition.row - b.startPosition.row;
    const sa = a.endPosition.row - a.startPosition.row;
    const sb = b.endPosition.row - b.startPosition.row;
    return sa - sb;
  });
  const samples = source.slice(0, limit).map(n => recordError(n, sourceLines));
  return { samples, errorNodeCount: totalErrorNodes, missingNodeCount: totalMissingNodes };
}

for (const file of files) {
  let bytes = 0;
  let lines = 0;
  let source;
  try {
    source = fs.readFileSync(file);
    bytes = source.length;
    // Pascal source is typically ANSI/CP-1252 or UTF-8. Try UTF-8, fall back.
    try {
      source = source.toString('utf8');
    } catch (e) {
      source = source.toString('binary');
    }
    lines = (source.match(/\n/g) || []).length + 1;
  } catch (e) {
    skipCount++;
    fs.writeSync(out, JSON.stringify({ file, error: 'read_failed', message: String(e) }) + '\n');
    continue;
  }
  totalBytes += bytes;

  // Skip non-Pascal files that share a .pas/.dpr/.dpk/.inc extension. Without
  // this filter the metric is pulled down by content that the compiler also
  // rejects — text templates, interpreter test fragments, mislabeled files.
  {
    const head = source.slice(0, 2048);
    let skip = null;
    // JCL/JEDI text templates with substitution placeholders (the JCL
    // package generator does %NAME% → 'JclCore' before the file is real).
    if (/%[A-Z][A-Z0-9_]*%/.test(head)) skip = 'template_placeholder';
    // Indy macro-expansion include files where the body is just attributes.
    else if (/^\s*\[assembly:\s*Assembly[A-Z]/.test(head) && head.length < 4096) {
      // Already handled cleanly by declAssemblyAttribute — leave as-is.
    }
    // JEDI interpreter test fragments. Two shapes:
    //   1) No module header (just bare statements/expressions);
    //   2) Have `unit X;` but no `interface` section — go directly to
    //      `function`/`procedure`/`const`/`begin`. The Delphi compiler
    //      rejects these; only JEDI's JvInterpreter can run them.
    else if (
      !/\b(unit|program|library|package)\b/i.test(head) &&
      !/^\s*(\/\/|\{|\(\*|\s*$)/.test(source.slice(0, 200)) &&
      /\b(end|begin|:=)\b/.test(head)
    ) {
      skip = 'interpreter_fragment';
    }
    else if (
      // JEDI JvInterpreter test units. Three matching shapes:
      //   - `unit X;` at start (allowing comments before), no `interface`,
      //     has `function main` or `procedure main` (sample entry point)
      //   - `unit X;` at start, no `interface`, body is bare decl/stmt
      //     (matched by the original /^\s*unit\s+\w+;/ shape)
      /\bunit\s+\w+\s*;/i.test(head) &&
      !/\binterface\b/i.test(source) &&
      (/\b(function|procedure)\s+main\b/i.test(head) ||
       /^\s*unit\s+\w+\s*;/i.test(head))
    ) {
      skip = 'interpreter_fragment';
    }
    // XML/MSBuild project file mislabeled .pas/.dpr/etc.
    else if (/^\s*<\?xml|^\s*<Project\s+xmlns=/.test(head)) {
      skip = 'xml_not_pascal';
    }
    // .inc fragments meant to be `{$I}`-included into an existing const/var
    // block (no module header, body opens with bare `IDENT = value;` decls).
    // The Delphi compiler only accepts these via include — standalone parse
    // is impossible.
    else if (
      /\.inc$/i.test(file) &&
      !/\b(unit|program|library|package|interface|implementation)\b/i.test(head) &&
      /^\s*(?:\/\/[^\n]*\n|\{[^}]*\}|\(\*[^*]*\*+\)|\s)*[A-Za-z_]\w*\s*=\s*/i.test(head)
    ) {
      skip = 'inc_fragment';
    }
    if (skip) {
      skipCount++;
      fs.writeSync(out, JSON.stringify({ file, error: skip, bytes }) + '\n');
      continue;
    }
  }

  const t0 = Date.now();
  let tree;
  try {
    tree = parser.parse(source);
  } catch (e) {
    skipCount++;
    fs.writeSync(out, JSON.stringify({ file, error: 'parse_threw', message: String(e) }) + '\n');
    continue;
  }
  const parseMs = Date.now() - t0;
  totalParseMs += parseMs;

  const sourceLines = source.split(/\r?\n/);
  const { samples, errorNodeCount, missingNodeCount } = findErrors(tree.rootNode, sourceLines, MAX_ERROR_SAMPLES_PER_FILE);
  const ok = errorNodeCount === 0 && !tree.rootNode.hasError;
  if (ok) okCount++; else failCount++;

  const rec = {
    file,
    bytes,
    lines,
    parse_ms: parseMs,
    ok,
    error_count: errorNodeCount,
    missing_count: missingNodeCount,
    first_error: samples[0] || null,
    samples: samples.slice(1),  // additional samples after first
  };
  fs.writeSync(out, JSON.stringify(rec) + '\n');

  // Lightweight progress to stderr every 200 files
  if (((okCount + failCount + skipCount) % 200) === 0) {
    process.stderr.write(`  ... ${okCount + failCount + skipCount}/${files.length}  ok=${okCount} fail=${failCount} skip=${skipCount}\n`);
  }
}

fs.closeSync(out);

const totalMs = Date.now() - startTotal;
const summary = {
  total: files.length,
  ok: okCount,
  fail: failCount,
  skip: skipCount,
  total_bytes: totalBytes,
  total_parse_ms: totalParseMs,
  wall_ms: totalMs,
};
process.stderr.write('SUMMARY ' + JSON.stringify(summary) + '\n');
console.log(JSON.stringify(summary));
