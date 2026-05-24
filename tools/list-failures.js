// List failures for files under a path prefix (case-insensitive).
const fs = require('fs');
const path = require('path');
const pfx = (process.argv[2] || '').toLowerCase();
const max = parseInt(process.argv[3] || '50');
let n = 0;
const rl = require('readline').createInterface({ input: fs.createReadStream('work/results-baseline.jsonl') });
rl.on('line', l => {
  if (!l || n >= max) return;
  let o; try { o = JSON.parse(l); } catch { return; }
  if (o.ok || o.error || !o.first_error) return;
  if (!o.file.toLowerCase().startsWith(pfx)) return;
  n++;
  console.log(
    path.basename(o.file).padEnd(40),
    'r' + String(o.first_error.row).padStart(4),
    'p=' + o.first_error.parent.padEnd(16),
    '|',
    o.first_error.snippet.replace(/\s+/g, ' ').slice(0, 80)
  );
});
