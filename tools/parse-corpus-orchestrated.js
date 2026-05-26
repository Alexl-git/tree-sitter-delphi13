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
  'MSWINDOWS', 'WIN64', 'CPU64BITS', 'CPUX86_64', 'CPUX64',
  'CONDITIONALEXPRESSIONS', 'UNICODE',
  'COMPILER_VERSION_37', 'VER370',
  // RTL feature flags that legacy code commonly checks; defaults reflect
  // Delphi 13 reality.
  'SUPPORTS_GENERICS', 'SUPPORTS_INLINE', 'SUPPORTS_CLASSVARS',
  'SUPPORTS_STRICT', 'SUPPORTS_ENHANCED_RECORDS',
  'SUPPORTS_FOR_IN', 'SUPPORTS_REGION',
  // Delphi 13 Florence ASSEMBLER define (RTL inline-asm gating)
  'ASSEMBLER',
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

  // Path-based per-project defines tuning. Each entry adds defines when
  // the file path matches. Designed for the common case where a project
  // assumes its own gate define is on.
  const PATH_DEFINES = [
    { re: /EurekaLog/i, defs: [
      'EUREKALOG', 'USE_NAMESPACES',
      'HAS_UNIT_TYPES', 'HAS_UNIT_CONTNRS', 'HAS_UNIT_GENERICS',
      'HAS_UNIT_GENERICS_COLLECTIONS', 'HAS_UNIT_GENERICS_DEFAULTS',
      'HAS_UNIT_RTTI', 'HAS_UNIT_DATEUTILS', 'HAS_UNIT_STRUTILS',
      'SUPPORTS_COMPILETIME_MESSAGES', 'Windows',
      // EurekaLog version-gate defines — Delphi 13 maps to COMPILER37.
      'COMPILER37',
      // EurekaLog also uses Compiler<N>_up / _down range gates.
      'Compiler11_up', 'Compiler12_up', 'Compiler14_up', 'Compiler15_up',
      'Compiler16_up', 'Compiler17_up', 'Compiler18_up', 'Compiler19_up',
      'Compiler20_up', 'Compiler21_up', 'Compiler22_up', 'Compiler23_up',
      'Compiler24_up', 'Compiler25_up', 'Compiler26_up', 'Compiler27_up',
      'Compiler28_up', 'Compiler29_up', 'Compiler30_up', 'Compiler31_up',
      'Compiler32_up', 'Compiler33_up', 'Compiler34_up', 'Compiler35_up',
      'Compiler36_up', 'Compiler37_up',
      // Prefer pure-Pascal bodies over asm so functions get full impls.
      // (NOT LEGACYSTRLEN — that's IFNDEF-gated; defining it skips the body.)
      'PUREPASCAL', 'HAS_ANSI_STRINGS',
    ]},
    { re: /AsyncPro|Orpheus|SysTools/i, defs: [
      'PRNDRV', 'DYNAMIC_LINK',
      // AsyncPro Apax / version gates — files require these defined or
      // emit compile-time fatal-message text.
      'APAX', 'Ver130', 'Ver140', 'Ver150',
    ]},
    { re: /FireDAC/i, defs: [
      'FireDAC_64', 'FireDAC_SQLITE_EXTERNAL',
    ]},
    { re: /Indy10|\\Indy\\|fibplus/i, defs: [
      'USE_INLINE', 'HAS_GENERICS_TList', 'USE_NAMESPACES',
      // fibplus version gates D_XE2..D_RX (Delphi 13)
      'WINDOWS',
      'D_XE2', 'D_XE3', 'D_XE4', 'D_XE5', 'D_XE6', 'D_XE7', 'D_XE8',
      'D_X10', 'D_X10_1', 'D_X10_2', 'D_X10_3', 'D_X10_4',
      'D_X11', 'D_X11_1', 'D_X11_2', 'D_X11_3',
      'D_X12', 'D_X13',
    ]},
  ];
  const fileDefines = [...defines];
  for (const p of PATH_DEFINES) if (p.re.test(file)) fileDefines.push(...p.defs);

  // Preprocess
  let preprocessed;
  try {
    preprocessed = preprocess(source, {
      defines: fileDefines, numericDefines: DEFAULT_NUMERIC, baseDir: path.dirname(file),
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
