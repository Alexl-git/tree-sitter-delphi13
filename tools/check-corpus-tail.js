#!/usr/bin/env node
// check-corpus-tail.js -- refuse a corpus file whose LAST test has an empty expected tree.
//
// `tree-sitter test` (0.24.x) silently drops the last test of a corpus file when its
// expected section is empty -- which is exactly what an `:error` test looks like -- and
// `tree-sitter test --update` then deletes it from the file (seen 2026-11-05, lane 146 b2:
// a passing count hid a vanished case). Keep every `:error` test away from the end of its
// file: put a tree test (a control) after it. This script is the guard; `npm test` runs it
// before `tree-sitter test`.
//
// usage: node tools/check-corpus-tail.js [corpusDir ...]   (default: test/corpus and pure/test/corpus)
'use strict';
const fs = require('fs');
const path = require('path');

const dirs = process.argv.length > 2
  ? process.argv.slice(2)
  : [path.join(__dirname, '..', 'test', 'corpus'), path.join(__dirname, '..', 'pure', 'test', 'corpus')];

let bad = 0, files = 0;
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
    files++;
    const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n');
    // A test = header (=== line, title, optional attributes, === line), input, --- line, expected.
    const headers = [...text.matchAll(/^={3,}\n([^\n]*)\n((?::[^\n]*\n)*)={3,}\n/gm)];
    if (headers.length === 0) continue;
    const last = headers[headers.length - 1];
    const tail = text.slice(last.index + last[0].length);
    const sep = tail.search(/^-{3,}\s*$/m);
    const expected = sep < 0 ? '' : tail.slice(sep).replace(/^-{3,}\s*$/m, '').trim();
    if (expected === '') {
      bad++;
      console.error(`${path.relative(process.cwd(), path.join(dir, name))}: last test "${last[1].trim()}" has an empty expected tree` +
        ` (attributes: ${last[2].trim() || 'none'}) -- tree-sitter test drops it; move it before a tree test`);
    }
  }
}
console.log(`check-corpus-tail: ${files} corpus files, ${bad} with an empty-expected last test`);
process.exit(bad ? 1 : 0);
