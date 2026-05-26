#!/usr/bin/env node
// Parse a list of Pascal files THROUGH THE PREPROCESSOR first, then through
// tree-sitter-delphi13. Emits per-file JSONL with the same shape as
// tools/parse-corpus.js so existing summary tools work on the output.
//
// Usage:  node tools/parse-corpus-preprocessed.js <manifest.txt> <output.jsonl>
//
// Default defines: a sensible Delphi 13 Win64 profile. Override with
// DEFINES_JSON env var pointing to a defines.json file.

'use strict';

const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const Pascal = require(path.join(__dirname, '..', 'bindings', 'node'));
const { preprocess } = require(path.join(__dirname, '..', 'preprocessor', 'preprocess'));

const MAX_ERROR_SAMPLES_PER_FILE = 5;

if (process.argv.length < 4) {
  console.error('usage: parse-corpus-preprocessed.js <manifest.txt> <output.jsonl>');
  process.exit(2);
}

const manifestPath = process.argv[2];
const outputPath = process.argv[3];

const files = fs.readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);

const parser = new Parser();
parser.setLanguage(Pascal);

const DEFAULT_DEFINES = [
  'MSWINDOWS', 'WIN64', 'CPU64BITS', 'CPUX86_64',
  'CONDITIONALEXPRESSIONS', 'UNICODE',
  'COMPILER_VERSION_37', 'VER370',
];
let defines = DEFAULT_DEFINES;
if (process.env.DEFINES_JSON) {
  defines = JSON.parse(fs.readFileSync(process.env.DEFINES_JSON, 'utf8')).defines || DEFAULT_DEFINES;
}

const out = fs.openSync(outputPath, 'w');
let okCount = 0, failCount = 0, skipCount = 0, totalBytes = 0, totalParseMs = 0;
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
  if (i % 200 === 0) process.stderr.write(`  ... ${i}/${files.length}  ok=${okCount} fail=${failCount} skip=${skipCount}\n`);
  let source;
  try { source = fs.readFileSync(file, 'utf8'); }
  catch (_) { skipCount++; fs.writeSync(out, JSON.stringify({ file, error: 'read', }) + '\n'); continue; }

  // Apply the same harness filter as parse-corpus.js (template / interpreter
  // / xml / inc-fragment skips).
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
      defines,
      baseDir: path.dirname(file),
    }).text;
  } catch (e) {
    skipCount++;
    fs.writeSync(out, JSON.stringify({ file, error: 'preprocess_threw', message: String(e) }) + '\n');
    continue;
  }

  totalBytes += preprocessed.length;
  const t0 = Date.now();
  let tree;
  try { tree = parser.parse(preprocessed); }
  catch (e) { skipCount++; fs.writeSync(out, JSON.stringify({ file, error: 'parse_threw', message: String(e) }) + '\n'); continue; }
  const parseMs = Date.now() - t0;
  totalParseMs += parseMs;

  const { samples, errorCount, missingCount } = findErrors(tree.rootNode, MAX_ERROR_SAMPLES_PER_FILE);
  const ok = errorCount === 0 && !tree.rootNode.hasError;
  if (ok) okCount++; else failCount++;
  fs.writeSync(out, JSON.stringify({
    file, bytes: preprocessed.length, parse_ms: parseMs,
    ok, error_count: errorCount, missing_count: missingCount,
    first_error: samples[0] || null, samples: samples.slice(1),
  }) + '\n');
}
fs.closeSync(out);
const wallMs = Date.now() - start;
const summary = { total: files.length, ok: okCount, fail: failCount, skip: skipCount, total_bytes: totalBytes, total_parse_ms: totalParseMs, wall_ms: wallMs };
process.stderr.write(`SUMMARY ${JSON.stringify(summary)}\n`);
process.stdout.write(JSON.stringify(summary) + '\n');
