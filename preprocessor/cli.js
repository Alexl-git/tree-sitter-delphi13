#!/usr/bin/env node
// delphi13-preprocessor CLI
//
// Usage:
//   node preprocessor/cli.js <file.pas> [--defines defines.json] [--include PATH]
//
// Emits the preprocessed pure-Pascal text to stdout.

'use strict';

const fs = require('fs');
const path = require('path');
const { preprocess } = require('./preprocess');

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: node preprocessor/cli.js <file.pas> [--defines defines.json] [--include PATH]...');
    process.exit(2);
  }
  let file = null;
  let definesFile = null;
  const includePaths = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--defines') definesFile = args[++i];
    else if (a === '--include') includePaths.push(args[++i]);
    else if (a.startsWith('--')) { console.error('unknown option:', a); process.exit(2); }
    else if (!file) file = a;
  }
  if (!file) { console.error('no input file'); process.exit(2); }

  const source = fs.readFileSync(file, 'utf8');
  let defines = [];
  if (definesFile) {
    defines = JSON.parse(fs.readFileSync(definesFile, 'utf8')).defines || [];
  } else {
    // Default Delphi 13 Win64 profile
    defines = [
      'MSWINDOWS', 'WIN64', 'CPU64BITS', 'CPUX86_64', 'CONDITIONALEXPRESSIONS',
      'UNICODE', 'NEXTGEN_FALSE', // negation tokens (matches some legacy IFDEFs)
      'COMPILER_VERSION_37',
    ];
  }
  const result = preprocess(source, {
    defines,
    includePaths,
    baseDir: path.dirname(file),
  });
  process.stdout.write(result.text);
}

main();
