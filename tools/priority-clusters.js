// Show top failing fingerprints filtered to the user's priority roots.
const fs = require('fs');
const file = process.argv[2] || 'work/results-baseline.jsonl';
const patterns = [
  { name: 'ORM3',        re: /^C:\\Projects\\DB\\ORM3\\/i },
  { name: 'Embarcadero', re: /^C:\\Program Files \(x86\)\\Embarcadero\\/i },
  { name: 'DevExpress',  re: /^C:\\Program Files \(x86\)\\DevExpress\\/i },
  { name: 'Spring4D',    re: /^C:\\Projects\\spring4d/i },
  { name: 'OmniThread',  re: /^C:\\Projects\\OmniThreadLibrary/i },
];
const by = {};
let total = 0;
const rl = require('readline').createInterface({ input: fs.createReadStream(file) });
rl.on('line', l => {
  if (!l) return;
  let o;
  try { o = JSON.parse(l); } catch (e) { return; }
  if (o.ok || o.error || !o.first_error) return;
  const hit = patterns.find(p => p.re.test(o.file));
  if (!hit) return;
  total++;
  const sn = o.first_error.snippet.replace(/\s+/g, ' ').replace(/'[^']*'/g, 'STR').slice(0, 100);
  const k = `${hit.name} | ${o.first_error.parent}: ${sn}`;
  by[k] = (by[k] || 0) + 1;
});
rl.on('close', () => {
  console.log('priority-root fails:', total);
  Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) =>
    console.log(String(v).padStart(3), k));
});
