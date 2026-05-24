// Top failing fingerprints in Embarcadero RTL/VCL.
const fs = require('fs');
const by = {};
let total = 0;
const rl = require('readline').createInterface({ input: fs.createReadStream('work/results-baseline.jsonl') });
rl.on('line', l => {
  if (!l) return;
  let o; try { o = JSON.parse(l); } catch { return; }
  if (o.ok || o.error || !o.first_error) return;
  if (!o.file.toLowerCase().startsWith('c:\\program files (x86)\\embarcadero\\')) return;
  total++;
  const sn = o.first_error.snippet.replace(/\s+/g, ' ').replace(/'[^']*'/g, 'STR').slice(0, 100);
  const k = o.first_error.parent + ': ' + sn;
  by[k] = (by[k] || 0) + 1;
});
rl.on('close', () => {
  console.log('Embarcadero fails:', total);
  Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) =>
    console.log(String(v).padStart(3), k));
});
