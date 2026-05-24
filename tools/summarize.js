#!/usr/bin/env node
// Aggregate parse-corpus.js results into a markdown summary.
// Usage:  node tools/summarize.js <results.jsonl> <out-summary.md> [--top-snippets=20]

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: summarize.js <results.jsonl> <out-summary.md> [--top-snippets=N]');
  process.exit(2);
}

let topSnippets = 25;
for (const a of args) {
  const m = a.match(/^--top-snippets=(\d+)$/);
  if (m) topSnippets = +m[1];
}

const resultsPath = args[0];
const outPath = args[1];

const rl = require('readline').createInterface({ input: fs.createReadStream(resultsPath) });
let total = 0;
let ok = 0;
let fail = 0;
let skip = 0;
let totalBytes = 0;
let totalErrorNodes = 0;
let totalLines = 0;
const errorByParent = new Map();          // parent type -> count
const snippetCounts = new Map();          // normalized snippet -> { count, sample, files: Set }
const failingByRoot = new Map();          // root dir -> [ok, fail]
const failingFiles = [];                  // top N failing files by error_count

function normSnippet(s) {
  if (!s) return '';
  // Collapse whitespace, strip string/char literals, hex/decimal numbers, identifiers' suffixes.
  let t = s.replace(/[\r\n]+/g, '\\n').replace(/\s+/g, ' ').trim();
  // strip strings
  t = t.replace(/'[^']*'/g, "'STR'");
  t = t.replace(/"[^"]*"/g, '"STR"');
  // strip numeric and hex literals
  t = t.replace(/\b\$[0-9A-Fa-f]+\b/g, '$N');
  t = t.replace(/\b\d+(\.\d+)?\b/g, 'N');
  return t.slice(0, 180);
}

function rootOf(file) {
  // Bucket by the first two path components (e.g. C:\Projects\DB, C:\Program Files (x86)\DevExpress\VCL).
  const norm = file.replace(/\//g, '\\');
  const parts = norm.split('\\').filter(Boolean);
  if (parts.length < 3) return parts.slice(0, 2).join('\\');
  // For "C:\Projects\Foo\..." keep "C:\Projects\Foo"; for "C:\Program Files (x86)\Vendor\..." keep three.
  if (/^Program Files/i.test(parts[1])) return parts.slice(0, 3).join('\\');
  return parts.slice(0, 3).join('\\');
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  let rec;
  try { rec = JSON.parse(line); } catch (e) { return; }
  total++;
  if (rec.error === 'read_failed' || rec.error === 'parse_threw') { skip++; return; }
  totalBytes += rec.bytes || 0;
  totalLines += rec.lines || 0;
  totalErrorNodes += rec.error_count || 0;

  const root = rootOf(rec.file);
  const r = failingByRoot.get(root) || { ok: 0, fail: 0 };
  if (rec.ok) { ok++; r.ok++; }
  else {
    fail++;
    r.fail++;
    if (rec.first_error) {
      const ns = normSnippet(rec.first_error.snippet);
      const e = snippetCounts.get(ns) || { count: 0, sample: rec.first_error.snippet, files: new Set(), parent: rec.first_error.parent };
      e.count++;
      if (e.files.size < 8) e.files.add(rec.file);
      snippetCounts.set(ns, e);
      const parent = rec.first_error.parent || '(root)';
      errorByParent.set(parent, (errorByParent.get(parent) || 0) + 1);
    }
    if (failingFiles.length < 100) failingFiles.push({ file: rec.file, errors: rec.error_count });
  }
  failingByRoot.set(root, r);
});

rl.on('close', () => {
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  lines.push(`# Parse Corpus Summary  —  ${now}`);
  lines.push('');
  lines.push(`- **Total files**: ${total}`);
  lines.push(`- **Passed**: ${ok} (${(100 * ok / Math.max(1, total)).toFixed(2)}%)`);
  lines.push(`- **Failed**: ${fail}`);
  lines.push(`- **Skipped (read/parse-threw)**: ${skip}`);
  lines.push(`- **Total bytes**: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  lines.push(`- **Total lines**: ${totalLines.toLocaleString()}`);
  lines.push(`- **Total ERROR nodes**: ${totalErrorNodes}`);
  lines.push('');
  lines.push('## Pass rate by corpus root');
  lines.push('');
  lines.push('| Root | OK | Fail | Pass % |');
  lines.push('|------|----|------|--------|');
  const rootRows = [...failingByRoot.entries()].map(([r, v]) => ({
    r, ok: v.ok, fail: v.fail, pct: 100 * v.ok / Math.max(1, v.ok + v.fail),
  })).sort((a, b) => (b.ok + b.fail) - (a.ok + a.fail));
  for (const x of rootRows) {
    lines.push(`| ${x.r} | ${x.ok} | ${x.fail} | ${x.pct.toFixed(1)}% |`);
  }
  lines.push('');
  lines.push('## Top failing parent contexts');
  lines.push('');
  lines.push('| Parent node | First-error count |');
  lines.push('|-------------|-------------------|');
  for (const [parent, count] of [...errorByParent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    lines.push(`| \`${parent}\` | ${count} |`);
  }
  lines.push('');
  lines.push(`## Top ${topSnippets} first-error snippet fingerprints`);
  lines.push('');
  lines.push('Each entry lists the normalized fingerprint, an example raw snippet, and up to 8 files where it occurs.');
  lines.push('');
  const top = [...snippetCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, topSnippets);
  let i = 1;
  for (const [norm, info] of top) {
    lines.push(`### ${i++}. (${info.count}×, parent=\`${info.parent}\`)`);
    lines.push('');
    lines.push('Normalized:');
    lines.push('```');
    lines.push(norm);
    lines.push('```');
    lines.push('Raw sample:');
    lines.push('```pascal');
    lines.push(info.sample);
    lines.push('```');
    lines.push('Example files:');
    for (const f of info.files) lines.push(`- ${f}`);
    lines.push('');
  }
  lines.push('## Top 20 files by ERROR node count');
  lines.push('');
  for (const x of failingFiles.sort((a, b) => b.errors - a.errors).slice(0, 20)) {
    lines.push(`- ${x.errors} errors  —  ${x.file}`);
  }
  lines.push('');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.error(`wrote ${outPath} (${lines.length} lines)`);
});
