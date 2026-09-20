#!/usr/bin/env node
//
// validate-queries.js -- compile every queries/*.scm against the SHIPPED .wasm.
//
// WHY THIS EXISTS, AND WHY `tree-sitter query` IS NOT ENOUGH.
//
// 1. Engine parity. Native tree-sitter evaluates `#match?` with the Rust regex
//    crate; web-tree-sitter hands the pattern to JavaScript's RegExp. The two
//    disagree -- the regex crate accepts an inline `(?i)` flag, JavaScript
//    rejects it with "Invalid group". A query using `(?i)` passes the CLI and
//    then throws on load in VS Code, Cursor and every browser host, taking the
//    WHOLE query file down with it. That shipped in v1.2.3 and killed the SQL
//    and asm injections in every WASM host, silently.
//
// 2. Grammar selection. `tree-sitter query` picks the grammar from the sample
//    file's extension via the global tree-sitter config, NOT from the directory
//    it is run in -- so running it on pure/queries/*.scm quietly validates them
//    against the FULL grammar instead. Loading an explicit .wasm removes the
//    ambiguity.
//
// Exit code 0 = every query compiles against the parser that actually ships.
//
// Usage:  node tools/validate-queries.js
// Needs:  npm run build-wasm   (see WASM-BUILD.md)

const fs = require('fs');
const path = require('path');

let Parser;
try {
  Parser = require('web-tree-sitter');
} catch {
  console.error('web-tree-sitter is not installed. Run: npm install');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  {
    id: 'tree-sitter-delphi13',
    wasm: 'tree-sitter-delphi13.wasm',
    queries: 'queries',
    samples: ['examples/smoke.pas'],
  },
  {
    id: 'tree-sitter-delphi13-pure',
    wasm: 'pure/tree-sitter-delphi13_pure.wasm',
    queries: 'pure/queries',
    samples: ['examples/smoke.pas'],
  },
];

let failures = 0;
let checked = 0;

(async () => {
  await Parser.init();

  for (const t of TARGETS) {
    const wasm = path.join(ROOT, t.wasm);
    const qdir = path.join(ROOT, t.queries);
    console.log(`\n=== ${t.id} ===`);

    if (!fs.existsSync(wasm)) {
      console.error(`  MISSING ${path.relative(ROOT, wasm)} -- run \`npm run build-wasm\` first (see WASM-BUILD.md)`);
      failures++;
      continue;
    }
    if (!fs.existsSync(qdir)) {
      console.error(`  MISSING query directory ${path.relative(ROOT, qdir)}`);
      failures++;
      continue;
    }

    const L = await Parser.Language.load(wasm);
    const parser = new Parser();
    parser.setLanguage(L);
    console.log(`  parser  ABI=${L.version} nodeKinds=${L.nodeTypeCount} fields=${L.fieldCount}`);

    // Parse the samples once so we can also report whether a query matches
    // anything at all -- a query that compiles but never fires is usually a
    // pattern written against the wrong node names.
    const trees = (t.samples || [])
      .map(s => path.join(ROOT, s))
      .filter(f => fs.existsSync(f))
      .map(f => ({ f, tree: parser.parse(fs.readFileSync(f, 'utf8')) }));

    for (const t2 of trees) {
      let errs = 0;
      const walk = n => { if (n.type === 'ERROR' || n.isMissing) errs++; for (let i = 0; i < n.childCount; i++) walk(n.child(i)); };
      walk(t2.tree.rootNode);
      if (errs) console.log(`  sample  ${path.basename(t2.f)}: ${errs} ERROR/MISSING node(s)`);
    }

    for (const file of fs.readdirSync(qdir).filter(f => f.endsWith('.scm')).sort()) {
      checked++;
      const src = fs.readFileSync(path.join(qdir, file), 'utf8');
      let q;
      try {
        q = L.query(src);
      } catch (e) {
        console.error(`  FAIL    ${file}: ${String(e && e.message || e).split('\n')[0]}`);
        failures++;
        continue;
      }
      const hits = trees.reduce((n, x) => n + q.captures(x.tree.rootNode).length, 0);
      const note = (trees.length && hits === 0) ? '  (compiles, but matched nothing on the samples)' : '';
      console.log(`  ok      ${file.padEnd(16)} captureNames=${new Set(q.captureNames).size} matches=${hits}${note}`);
    }
  }

  console.log('');
  if (failures) {
    console.error(`${failures} failure(s) across ${checked} query file(s).`);
    process.exit(1);
  }
  console.log(`All ${checked} query file(s) compile against their shipped WASM.`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });