#!/usr/bin/env node
// delphi13-preprocessor CLI
//
// Usage:
//   node preprocessor/cli.js <file.pas> [--defines defines.json] [--include PATH]
//                            [--include-mode expand|defines-only|off]
//
// Emits the preprocessed pure-Pascal text to stdout.

'use strict';

const fs = require('fs');
const path = require('path');
const { preprocess } = require('./preprocess');
const { DEFAULT_DEFINES } = require('./defaults');

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: node preprocessor/cli.js <file.pas> [--defines defines.json] [--include PATH]...');
    process.exit(2);
  }
  let file = null;
  let definesFile = null;
  let includeMode = 'expand';
  const includePaths = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--defines') definesFile = args[++i];
    else if (a === '--include') includePaths.push(args[++i]);
    else if (a === '--include-mode') includeMode = args[++i];
    else if (a.startsWith('--')) { console.error('unknown option:', a); process.exit(2); }
    else if (!file) file = a;
  }
  if (!file) { console.error('no input file'); process.exit(2); }
  if (!['expand', 'defines-only', 'off'].includes(includeMode)) {
    console.error('invalid --include-mode:', includeMode); process.exit(2);
  }

  const source = fs.readFileSync(file, 'utf8');
  const defines = definesFile
    ? (JSON.parse(fs.readFileSync(definesFile, 'utf8')).defines || [])
    : DEFAULT_DEFINES;
  const result = preprocess(source, {
    defines,
    includePaths,
    includeMode,
    baseDir: path.dirname(file),
  });
  process.stdout.write(result.text);
}

main();
