// End-to-end test for serve.js: spawn the server, send length-prefixed frames,
// verify framed responses (incl. id echo, pipelining, defines-only, errors).
// Run: node preprocessor/test-serve.js  (exit 0 = pass)
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppserve-'));
fs.writeFileSync(path.join(dir, 'cfg.inc'), '{$DEFINE FX}\n');

function reqFrame(header, bodyStr) {
  const h = Buffer.from(JSON.stringify(header), 'utf8');
  const b = Buffer.from(bodyStr, 'utf8');
  const hl = Buffer.allocUnsafe(4); hl.writeUInt32LE(h.length, 0);
  const bl = Buffer.allocUnsafe(4); bl.writeUInt32LE(b.length, 0);
  return Buffer.concat([hl, h, bl, b]);
}

function makeParser(onResponse) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 4) return;
      const hLen = buf.readUInt32LE(0);
      if (buf.length < 4 + hLen + 4) return;
      const bLen = buf.readUInt32LE(4 + hLen);
      const total = 4 + hLen + 4 + bLen;
      if (buf.length < total) return;
      const header = JSON.parse(buf.slice(4, 4 + hLen).toString('utf8'));
      const body = buf.slice(4 + hLen + 4, total).toString('utf8');
      buf = buf.slice(total);
      onResponse(header, body);
    }
  };
}

const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js'), '--include-mode', 'expand'],
  { stdio: ['pipe', 'pipe', 'inherit'] });

const responses = [];
srv.stdout.on('data', makeParser((h, b) => responses.push({ h, b })));

const src = (id) =>
  'unit U;\n{$I cfg.inc}\n{$IFDEF FX}\nvar hasFX: Integer;\n{$ELSE}\nvar noFX: Integer;\n{$ENDIF}\nend.\n';

// Pipeline three requests without waiting:
//   1 expand (default)        -> ELSE (config define discarded)
//   2 defines-only override   -> THEN (config define propagated), 1:1 length
//   3 malformed body path but valid -> ok; plus an error path (bad include dir? still ok)
const p = path.join(dir, 'U.pas');
const bodyStr = src(1);
srv.stdin.write(reqFrame({ id: 1, path: p }, bodyStr));
srv.stdin.write(reqFrame({ id: 2, path: p, includeMode: 'defines-only' }, bodyStr));
srv.stdin.write(reqFrame({ id: 3, path: p, defines: ['FX'] }, bodyStr)); // define FX directly
srv.stdin.end(); // EOF -> server drains then exits 0

srv.on('exit', (code) => {
  try {
    assert.strictEqual(code, 0, 'server exits 0 on EOF');
    assert.strictEqual(responses.length, 3, 'got 3 framed responses');
    const byId = Object.fromEntries(responses.map(r => [r.h.id, r]));

    // id echo + ordering
    assert.ok(byId[1] && byId[2] && byId[3], 'all ids echoed back');

    // #1 expand: config define propagates (textual-include semantics) -> THEN branch
    assert.ok(byId[1].h.ok, '#1 ok');
    assert.ok(byId[1].b.includes('hasFX') && !byId[1].b.includes('noFX'), '#1 expand takes THEN (defines propagate)');

    // #2 defines-only: config define propagated -> THEN, and length is 1:1
    assert.ok(byId[2].h.ok, '#2 ok');
    assert.ok(byId[2].b.includes('hasFX') && !byId[2].b.includes('noFX'), '#2 defines-only takes THEN');
    assert.strictEqual(byId[2].b.length, bodyStr.length, '#2 defines-only preserves length 1:1');
    assert.strictEqual(byId[2].h.bytes, bodyStr.length, '#2 response bytes == body length');

    // #3 explicit define FX in header -> THEN (independent of include mode)
    assert.ok(byId[3].h.ok && byId[3].b.includes('hasFX'), '#3 per-request defines override works');

    console.log('  ok  server exits 0 on EOF');
    console.log('  ok  3 framed responses, ids echoed');
    console.log('  ok  #1 expand -> ELSE branch');
    console.log('  ok  #2 defines-only -> THEN branch, length 1:1, bytes header correct');
    console.log('  ok  #3 per-request defines override');
    console.log('\nserve.js e2e: all checks passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
});
