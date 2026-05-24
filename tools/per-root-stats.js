#!/usr/bin/env node
// Aggregate parse results by focus root.
//
// Tracks the user's high-priority targets:
//   ORM3        — C:\Projects\DB\ORM3
//   Embarcadero — C:\Program Files (x86)\Embarcadero\Studio\37.0
//   DevExpress  — C:\Program Files (x86)\DevExpress\VCL
//   Spring4D    — C:\Projects\spring4d
//
// Plus a summary line for "all real Pascal" (excluding harness skips).

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || 'work/results-baseline.jsonl';

const targets = [
  { name: 'ORM3',        match: /^C:\\Projects\\DB\\ORM3\\/i },
  { name: 'TableTools',  match: /^C:\\Projects\\TableTools\\/i },
  { name: 'Spring4D',    match: /^C:\\Projects\\spring4d/i },
  { name: 'Embarcadero', match: /^C:\\Program Files \(x86\)\\Embarcadero\\/i },
  { name: 'DevExpress',  match: /^C:\\Program Files \(x86\)\\DevExpress\\/i },
  { name: 'OmniThread',  match: /^C:\\Projects\\OmniThreadLibrary/i },
  { name: 'ORM3-CLIENT', match: /^C:\\Projects\\DB\\ORM3\\CLIENT\\/i },
  { name: 'ORM3-SERVER', match: /^C:\\Projects\\DB\\ORM3\\SERVER\\/i },
  { name: 'ORM3-COMMON', match: /^C:\\Projects\\DB\\ORM3\\COMMON\\/i },
];

for (const t of targets) { t.ok = 0; t.fail = 0; t.skip = 0; }
let realOK = 0, realFail = 0, realSkip = 0;

const rl = require('readline').createInterface({ input: fs.createReadStream(file) });
rl.on('line', l => {
  if (!l) return;
  let o;
  try { o = JSON.parse(l); } catch (e) { return; }
  if (o.error) {
    realSkip++;
    for (const t of targets) if (t.match.test(o.file)) t.skip++;
    return;
  }
  if (o.ok) {
    realOK++;
    for (const t of targets) if (t.match.test(o.file)) t.ok++;
  } else {
    realFail++;
    for (const t of targets) if (t.match.test(o.file)) t.fail++;
  }
});
rl.on('close', () => {
  const realTotal = realOK + realFail;
  const realPct = realTotal > 0 ? (100 * realOK / realTotal).toFixed(2) : 'n/a';
  console.log(`Overall (real Pascal): ${realOK} OK / ${realTotal} = ${realPct}%   [+${realSkip} skip]`);
  console.log('');
  console.log('| Root               |    OK |  FAIL |  Pass % |');
  console.log('|--------------------|-------|-------|---------|');
  for (const t of targets) {
    const total = t.ok + t.fail;
    const pct = total > 0 ? (100 * t.ok / total).toFixed(2).padStart(6) : '  n/a ';
    console.log(`| ${t.name.padEnd(18)} | ${String(t.ok).padStart(5)} | ${String(t.fail).padStart(5)} |  ${pct}% |`);
  }
});
