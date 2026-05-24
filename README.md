# tree-sitter-delphi13

Tree-sitter grammar focused on **Delphi 13 (RAD Studio 37.0)** — what the
modern Delphi compiler accepts, nothing more.

## Why a fresh project?

This is a focused derivation of [Isopod/tree-sitter-pascal][upstream]
(MIT licensed; see [LICENSE](LICENSE)). The differences in design intent:

| | tree-sitter-pascal (upstream) | tree-sitter-delphi13 (this) |
|---|---|---|
| Target | Pascal family (Delphi, FreePascal, FPC variants) | Delphi 13 only |
| Grammar surface | Many `enable_if(fpc, ...)` branches | Single Delphi-13 surface |
| Inline asm | Parsed structurally | Treated as opaque (comment-like) |
| Preprocessor blocks | Token-level `{$IFDEF}` | External scanner consumes whole `{$IF*}...{$END*}` blocks |
| Non-Pascal corpus files | Counted as failures | Filtered by harness (binary DFM, JCL templates, JEDI interpreter fragments, etc.) |
| Companion | — | Pairs with separate `tree-sitter-dfm` for form files |

## Status

| Component | State |
|-----------|-------|
| Grammar | Delphi-13-focused, all proven fixes from upstream forked in |
| External scanner | (planned — IFDEF blocks + `^X` char literal disambiguation) |
| Preprocessor | (planned as separate `delphi13-preprocessor` library, for `{$I X.inc}` expansion) |
| Harness | Day-1 filtering for non-Delphi files |
| Corpus | Curated Delphi-13 only (modern projects + RAD Studio 13 RTL/VCL) |

## Build

```powershell
npm install --ignore-scripts
.\node_modules\.bin\tree-sitter generate
node "C:\Program Files\nodejs\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js" rebuild
```

## Run baseline

```powershell
pwsh -File tools\run-baseline.ps1
```

## Credits

- [Philip Zander][isopod-author] — original tree-sitter-pascal grammar
- [Benjamin Gray (Isopod)][upstream] — current maintainer

[upstream]: https://github.com/Isopod/tree-sitter-pascal
[isopod-author]: https://github.com/PhilipRoman
