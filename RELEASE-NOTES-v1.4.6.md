# tree-sitter-delphi13 v1.4.6

Patch release on top of v1.4.5 (same grammar, same trees).

## Fixed

- WebAssembly build: the external scanner called `tolower()`, which the WASM C runtime used by `tree-sitter build --wasm` does not provide, so the v1.4.5 release job failed at the query gate and published nothing. Both scanners (`src/scanner.c`, `pure/src/scanner.c`) now lowercase ASCII inline. Behaviour is identical (the call only ever saw ASCII), native builds are unchanged in output.

## Contents of v1.4.5 (released here)

v1.4.6 is the first published build of the v1.4.5 grammar: Paul McGee's seven fixes (character subrange in a set, several hint directives on a variable, chained calling conventions on a procedural-type field, code page given by a constant, program with no `program` line, the right operand of `is`, and `<` after a binary operator via an external generic-`<` token) plus the orphan `asm ... end;` repair. See RELEASE-NOTES-v1.4.5.md.
