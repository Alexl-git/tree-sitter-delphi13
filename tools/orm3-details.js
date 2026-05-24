const fs = require('fs');
const path = require('path');
const rl = require('readline').createInterface({ input: fs.createReadStream('work/results-baseline.jsonl') });
rl.on('line', l => {
  if (!l) return;
  let o; try { o = JSON.parse(l); } catch { return; }
  if (o.ok || o.error || !o.first_error) return;
  if (!o.file.toLowerCase().startsWith('c:\\projects\\db\\orm3\\')) return;
  console.log(path.basename(o.file).padEnd(30), 'r' + String(o.first_error.row).padStart(4), 'parent=' + o.first_error.parent);
  console.log('   ', o.first_error.snippet.replace(/\n/g, ' / ').slice(0, 140));
});
