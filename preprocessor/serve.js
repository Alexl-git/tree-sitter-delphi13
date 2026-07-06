#!/usr/bin/env node
// delphi13-preprocessor — persistent server (Option B: length-prefixed frames)
//
// A long-lived process a host (e.g. drag-lint) spawns ONCE and streams files
// through, avoiding ~136 ms of `node` cold-start per file. Steady-state cost is
// the ~2 ms preprocess itself.
//
// Usage:
//   node preprocessor/serve.js [--defines profile.json] [--include PATH]...
//                              [--include-mode expand|defines-only|off]
//
// The define profile is loaded ONCE at startup (one profile per run — see the
// drag-lint contract). Per-request `defines` override is accepted but optional.
//
// WIRE PROTOCOL (binary, on stdin/stdout):
//   Request  = [u32 LE headerLen][header JSON, UTF-8][u32 LE bodyLen][body bytes]
//   Response = [u32 LE headerLen][header JSON, UTF-8][u32 LE bodyLen][body bytes]
//
//   Request header:  { "id": <number>,
//                      "path": "<original path, for {$I} baseDir + errors>",
//                      "defines": [ ... ]        // optional per-request override
//                      "includeMode": "..."      // optional per-request override
//                    }
//   Request body:    the raw source bytes (UTF-8). The host has already
//                    transcoded/skip-filtered; the server does NOT re-read disk.
//
//   Response header (ok):    { "id", "ok": true, "bytes": <resolved length> }
//   Response header (error): { "id", "ok": false, "error": "<message>" }
//   Response body:           the resolved text bytes (UTF-8), empty on error.
//
// `id` is echoed so the host may pipeline. Frames are processed in arrival
// order. The server exits 0 on stdin EOF (clean shutdown at end of an index run).
'use strict';

const fs = require('fs');
const path = require('path');
const { preprocess } = require('./preprocess');
const { DEFAULT_DEFINES, DEFAULT_NUMERIC } = require('./defaults');

function parseArgs(argv) {
  const opts = { definesFile: null, includePaths: [], includeMode: 'expand' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--defines') opts.definesFile = argv[++i];
    else if (a === '--include') opts.includePaths.push(argv[++i]);
    else if (a === '--include-mode') opts.includeMode = argv[++i];
    else { process.stderr.write('unknown option: ' + a + '\n'); process.exit(2); }
  }
  if (!['expand', 'defines-only', 'off'].includes(opts.includeMode)) {
    process.stderr.write('invalid --include-mode: ' + opts.includeMode + '\n');
    process.exit(2);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const baseDefines = opts.definesFile
  ? (JSON.parse(fs.readFileSync(opts.definesFile, 'utf8')).defines || DEFAULT_DEFINES)
  : DEFAULT_DEFINES;

// --- framing: accumulate stdin into a buffer, pull complete frames off the front.
let buf = Buffer.alloc(0);

function writeFrame(headerObj, bodyBuf) {
  const header = Buffer.from(JSON.stringify(headerObj), 'utf8');
  const hLen = Buffer.allocUnsafe(4); hLen.writeUInt32LE(header.length, 0);
  const bLen = Buffer.allocUnsafe(4); bLen.writeUInt32LE(bodyBuf.length, 0);
  // Single writev-style write keeps the four parts contiguous on the pipe.
  process.stdout.write(Buffer.concat([hLen, header, bLen, bodyBuf]));
}

function handleRequest(header, body) {
  const id = header.id;
  try {
    const source = body.toString('utf8');
    const result = preprocess(source, {
      defines: header.defines || baseDefines,
      numericDefines: DEFAULT_NUMERIC,
      includePaths: opts.includePaths,
      includeMode: header.includeMode || opts.includeMode,
      baseDir: header.path ? path.dirname(header.path) : '.',
    });
    const out = Buffer.from(result.text, 'utf8');
    writeFrame({ id, ok: true, bytes: out.length }, out);
  } catch (e) {
    writeFrame({ id, ok: false, error: String(e && e.message || e) }, Buffer.alloc(0));
  }
}

// Pull as many complete [u32 header][header][u32 body][body] frames as available.
function drain() {
  for (;;) {
    if (buf.length < 4) return;
    const hLen = buf.readUInt32LE(0);
    if (buf.length < 4 + hLen + 4) return;
    const bLen = buf.readUInt32LE(4 + hLen);
    const total = 4 + hLen + 4 + bLen;
    if (buf.length < total) return;
    const header = JSON.parse(buf.slice(4, 4 + hLen).toString('utf8'));
    const body = buf.slice(4 + hLen + 4, total);
    buf = buf.slice(total);
    handleRequest(header, body);
  }
}

process.stdin.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); drain(); });
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
