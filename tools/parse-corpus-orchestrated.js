#!/usr/bin/env node
// Run preprocessor + pure tree-sitter on a corpus manifest.
//
// Pipeline:
//   raw .pas -> preprocessor (resolves IFDEFs) -> pure parser
//
// Usage:  node tools/parse-corpus-orchestrated.js <manifest.txt> <output.jsonl>
//
// Default defines: a sensible Delphi 13 Win64 profile. Override with
// DEFINES_JSON env var pointing to a defines.json file.

'use strict';

const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const PureLang = require(path.join(__dirname, '..', 'pure', 'bindings', 'node'));
const { preprocess } = require(path.join(__dirname, '..', 'preprocessor', 'preprocess'));

const MAX_ERROR_SAMPLES_PER_FILE = 5;

if (process.argv.length < 4) {
  console.error('usage: parse-corpus-orchestrated.js <manifest.txt> <output.jsonl>');
  process.exit(2);
}

const manifestPath = process.argv[2];
const outputPath = process.argv[3];

const files = fs.readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);

const parser = new Parser();
parser.setLanguage(PureLang);

const DEFAULT_DEFINES = [
  'MSWINDOWS', 'WIN64', 'CPU64BITS', 'CPUX86_64',
  'CONDITIONALEXPRESSIONS', 'UNICODE',
  'COMPILER_VERSION_37', 'VER370',
  // RTL feature flags that legacy code commonly checks; defaults reflect
  // Delphi 13 reality.
  'SUPPORTS_GENERICS', 'SUPPORTS_INLINE', 'SUPPORTS_CLASSVARS',
  'SUPPORTS_STRICT', 'SUPPORTS_ENHANCED_RECORDS',
  'SUPPORTS_FOR_IN', 'SUPPORTS_REGION',
];
const DEFAULT_NUMERIC = {
  // Delphi 13 Florence is internal version 37.0; CompilerVersion is 37.0 too.
  CompilerVersion: 37,
  RTLVersion: 37,
};
let defines = DEFAULT_DEFINES;
if (process.env.DEFINES_JSON) {
  defines = JSON.parse(fs.readFileSync(process.env.DEFINES_JSON, 'utf8')).defines || DEFAULT_DEFINES;
}

const out = fs.openSync(outputPath, 'w');
let okCount = 0, failCount = 0, skipCount = 0;
const start = Date.now();

function findErrors(root, maxSamples) {
  const samples = [];
  let errorCount = 0, missingCount = 0;
  function walk(n) {
    if (!n.hasError) return;
    if (n.type === 'ERROR') errorCount++;
    if (n.isMissing) missingCount++;
    if ((n.type === 'ERROR' || n.isMissing) && samples.length < maxSamples) {
      samples.push({ row: n.startPosition.row, col: n.startPosition.column, endRow: n.endPosition.row, parent: n.parent ? n.parent.type : 'root' });
    }
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  }
  walk(root);
  return { samples, errorCount, missingCount };
}

let i = 0;
for (const file of files) {
  i++;
  if (i % 500 === 0) process.stderr.write(`  ... ${i}/${files.length}  ok=${okCount} fail=${failCount} skip=${skipCount}\n`);

  let source;
  try { source = fs.readFileSync(file, 'utf8'); }
  catch (_) { skipCount++; fs.writeSync(out, JSON.stringify({ file, error: 'read' }) + '\n'); continue; }

  // Apply same harness filter as parse-corpus.js
  const head = source.slice(0, 2048);
  let skip = null;
  if (/%[A-Z][A-Z0-9_]*%/.test(head)) skip = 'template_placeholder';
  else if (/^\s*<\?xml|^\s*<Project\s+xmlns=/.test(head)) skip = 'xml_not_pascal';
  else if (/\.inc$/i.test(file)) {
    const headStripped = head
      .replace(/\{[^}]*\}/g, ' ').replace(/\(\*[\s\S]*?\*\)/g, ' ').replace(/\/\/[^\n]*/g, ' ');
    if (!/\b(unit|program|library|package|interface|implementation)\b/i.test(headStripped))
      skip = 'inc_fragment';
  }
  if (skip) { skipCount++; fs.writeSync(out, JSON.stringify({ file, error: skip }) + '\n'); continue; }

  // Preprocess
  let preprocessed;
  try {
    preprocessed = preprocess(source, {
      defines, numericDefines: DEFAULT_NUMERIC, baseDir: path.dirname(file),
    }).text;
  } catch (e) {
    skipCount++;
    fs.writeSync(out, JSON.stringify({ file, error: 'preprocess_threw', message: String(e) }) + '\n');
    continue;
  }

  // Pure parse
  let tree;
  try { tree = parser.parse(preprocessed); }
  catch (e) {
    skipCount++;
    fs.writeSync(out, JSON.stringify({ file, error: 'parse_threw', message: String(e) }) + '\n');
    continue;
  }

  const { samples, errorCount, missingCount } = findErrors(tree.rootNode, MAX_ERROR_SAMPLES_PER_FILE);
  const ok = errorCount === 0 && !tree.rootNode.hasError;
  if (ok) okCount++; else failCount++;
  fs.writeSync(out, JSON.stringify({
    file, bytes: preprocessed.length,
    ok, error_count: errorCount, missing_count: missingCount,
    first_error: samples[0] || null, samples: samples.slice(1),
  }) + '\n');
}
fs.closeSync(out);
const wallMs = Date.now() - start;
const summary = { total: files.length, ok: okCount, fail: failCount, skip: skipCount, wall_ms: wallMs };
process.stderr.write(`SUMMARY ${JSON.stringify(summary)}\n`);
process.stdout.write(JSON.stringify(summary) + '\n');
