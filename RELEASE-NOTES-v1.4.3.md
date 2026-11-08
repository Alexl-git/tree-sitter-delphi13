# tree-sitter-delphi13 v1.4.3

Both grammars (root + pure), lockstep.

## Fix

- `external <lib> name '<string>'` may omit its closing `;` before the next declaration,
  an attribute, or `end` (`function SHGetMalloc; external shell32 name 'SHGetMalloc'`).
  dcc accepts it and Borland shipped it: Delphi 5 `shlobj.pas` has five such lines.
  `procExternal` gains a `kName literalString` tail with no `;`; the tree has the same shape
  as the `;` form. Deliberately only the name-string form: an optional `;` after every
  clause grew the root parser by 16% in states, this form by 5.7%. A `[` after the string
  (attribute on the next declaration vs. index on the string) is a declared GLR conflict.
  `external L` alone or `external L index N` without `;` stay errors, and a `;`-less
  external still cannot take a body.
  Reported by drag-lint (E-SHLOBJ-PARSE, drag-lint 1.46). Grammar commit b12b539.

## What changed

- Version 1.4.3 in package.json, package-lock.json, pure/package.json, tree-sitter.json,
  pure/tree-sitter.json, DISTRIBUTION.md.
- `.node` prebuilds (linux-x64, win32-x64, darwin-x64, darwin-arm64) and both `.wasm`
  files rebuilt from the v1.4.3 grammar. WASM built with Emscripten 3.1.64.

## Checks

- `tree-sitter test`: new `test/corpus/proc-external-no-semi.txt` (7 cases, incl. the
  negative controls and a `;` control) passes in both grammars.
