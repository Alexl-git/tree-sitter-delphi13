// Top fingerprints under a given file-prefix.
const fs = require('fs');
const pfx = (process.argv[2] || '').toLowerCase();
const by = {};
let total = 0;
const rl = require('readline').createInterface({ input: fs.createReadStream('work/results-baseline.jsonl') });
rl.on('line', l => {
  if (!l) return;
  let o; try { o = JSON.parse(l); } catch { return; }
  if (o.ok || o.error || !o.first_error) return;
  if (pfx && !o.file.toLowerCase().startsWith(pfx)) return;
  total++;
  const sn = o.first_error.snippet.replace(/\s+/g, ' ').replace(/'[^']*'/g, 'STR').slice(0, 100);
  const k = o.first_error.parent + ': ' + sn;
  by[k] = (by[k] || 0) + 1;
});
rl.on('close', () => {
  console.log('fails under "' + pfx + '":', total);
  Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) =>
    console.log(String(v).padStart(3), k));
});
