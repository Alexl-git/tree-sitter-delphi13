# tree-sitter-delphi13 v1.4.2

Both grammars (root + pure), lockstep. **Binaries refresh only -- no grammar change from v1.4.1.**

## Why

The npm package `tree-sitter-delphi13@1.4.1` shipped the v1.4.0 binaries: `prebuilds/*/*.node`
and `tree-sitter-delphi13.wasm` were built on 2026-10-31 from the v1.4.0 parser; only
`src/parser.c` carried the 1.4.1 fix. Consumers loading the prebuilt `.node` or the `.wasm`
did not get the last-array-field fix (see RELEASE-NOTES-v1.4.1.md). `tree-sitter-delphi13-pure`
1.4.1 was never published to npm.

## What changed

- All `.node` prebuilds (linux-x64, win32-x64, darwin-x64, darwin-arm64) and both `.wasm`
  files rebuilt from the v1.4.1 grammar (commit ad17f6a). WASM built with Emscripten 3.1.64.
- Version 1.4.2 in package.json, package-lock.json, pure/package.json, tree-sitter.json,
  pure/tree-sitter.json.

## Checks

- win32-x64 `.node` (root + pure) and both `.wasm`: a record whose last field is
  `B: array[0..1] of Byte` with no `;` before `end` parses with no error; the old binary
  reports `MISSING ";"` on the same input.
- `npm run validate-queries`: all 18 query files compile against the rebuilt `.wasm`.
