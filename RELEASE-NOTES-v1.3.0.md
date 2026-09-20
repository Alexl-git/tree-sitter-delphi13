# tree-sitter-delphi13 v1.3.0

Makes both grammars consumable by WASM hosts (VS Code, Cursor, browsers) and by
codebase indexers, and fixes a query defect that was silently breaking those
hosts.

## WASM

Both packages now ship a prebuilt **tree-sitter ABI 14** `.wasm` alongside the
native binding, so `web-tree-sitter` can load the parser with no toolchain:

* `tree-sitter-delphi13.wasm` (~3.2 MB)
* `tree-sitter-delphi13_pure.wasm` (~2.8 MB)

Rebuilding needs Emscripten pinned to **3.1.64** -- the version the tree-sitter
0.24.7 CLI expects. `emsdk install latest` produces glue code that fails at load
time in the host rather than at build time. See `WASM-BUILD.md`.

## Queries

The standard set is now complete for both grammars (8 files each):
`highlights`, `injections`, `indents`, `folds`, `outline`, `tags`, `brackets`,
`textobjects`.

* **`tags.scm`** is new -- symbol extraction for code-intelligence consumers
  (GitHub, Cursor, Sourcegraph). It unwraps `genericTpl entity:` so `TFoo<T: class>`
  indexes as `TFoo` rather than as that literal text, which matters a great deal
  in Spring4D-heavy code.
* **`folds.scm`** and **`indents.scm`** are what nvim-treesitter requires.
* **`brackets.scm`** pairs Pascal's real delimiters -- `begin`/`end`, `try`/`end`,
  `case`/`end`, `repeat`/`until`, `class`/`end` -- not just parentheses.
* **`textobjects.scm`** provides select-inside/around for routines and types.

## Fixed: injections were dead in every WASM host

`queries/injections.scm` used an inline `(?i)` regex flag. Native tree-sitter
evaluates `#match?` with the Rust regex crate, which accepts it; `web-tree-sitter`
hands the pattern to JavaScript's `RegExp`, which rejects it with
`Invalid group` -- and a query that throws on compile takes the **whole file**
with it. The SQL and inline-`asm` injections were therefore silently absent in
VS Code, Cursor and every browser host from v1.2.3 onward, while
`tree-sitter query` reported no problem.

Case-insensitivity is now spelled out as character classes, verified
byte-identical across both engines.

`tools/validate-queries.js` (`npm run validate-queries`) compiles every `.scm`
against the built `.wasm` and now runs in CI. The CLI cannot catch this class of
bug: it uses the other regex engine, and it selects the grammar from the sample
file's extension rather than the working directory.

## Coverage

Measured on the 2,218 `.pas` files of the RAD Studio 37.0 source tree, same
manifest for both paths:

| Path | ok / readable | rate |
|---|---|---|
| Master grammar alone (raw source, `{$IFDEF}` then-wins) | 2183 / 2217 | 98.47% |
| `delphi13-preprocessor` -> `tree-sitter-delphi13-pure` | 2217 / 2217 | **100.000%** |

Every real master-path failure is resolved by the pipeline. The single surviving
row is `FMX.WebBrowser.Win.pas`, scored `template_placeholder` -- an excluded
category, not a parse failure.

## Also

* `examples/smoke.pas` added -- the directory was empty, so `npm test` parsed nothing.
* Zed extension bumped to 0.2.0 with the full query set.
* CI added: builds the WASM and compiles every query against it on each push.

**Grammar unchanged from v1.2.3.** No parser regressions; `src/` is byte-identical.