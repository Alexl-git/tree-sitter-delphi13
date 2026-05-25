const fs = require('fs');
const lines = fs.readFileSync('work/results-baseline.jsonl','utf8').split('\n').filter(Boolean);
const seen = new Set();
for (const ln of lines) {
  const d = JSON.parse(ln);
  if (d.ok) continue;
  const f = d.file.toLowerCase();
  if (seen.has(f)) continue;
  seen.add(f);
  const s = (d.first_error && d.first_error.snippet) || '';
  if (/\b(stdcall|cdecl|safecall|register|pascal|winapi)\b\s*\n\s*(var|begin|const|type|procedure|function)/i.test(s)) {
    const base = d.file.split(/[\\/]/).pop();
    console.log(base + ' r' + d.first_error.row + ': ' + s.slice(0,140).replace(/\n/g,'\\n'));
  }
}
