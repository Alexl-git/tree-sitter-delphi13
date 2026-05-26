# tree-sitter-delphi13 v1.0.0

First production release of a tree-sitter grammar pipeline targeted at Delphi 13 (RAD Studio 37.0 / Florence) and its surrounding ecosystem.

## Headline

**99.33% pass rate on a 35,556-file curated Delphi 13 corpus** (zero ERROR nodes in the resulting tree).

| corpus root | pass rate | files |
|---|---|---|
| ORM3 (user's own production code) | **100.00%** | full set |
| Spring4D | 99.87% | full set |
| DevExpress VCL | 99.82% | full set |
| OmniThreadLibrary | 99.62% | full set |
| Embarcadero RAD Studio 13 RTL/VCL | 99.24% | full set |

The remaining ~0.5% are intentionally broken DUnitX test cases, real vendor source typos, C-language code mistakenly placed in `.pas` files (fibplus TREES.PAS), `{$IF declared(...)}` cases that need full symbol awareness, and a handful of pathologically large auto-generated TypeLib units.

## What's in this release

Three packages, one repo:

### 1. `tree-sitter-delphi13` (this directory)
The master tree-sitter grammar focused on **Delphi 13 only** — what the modern Delphi compiler accepts, nothing more. Derived from [Isopod/tree-sitter-pascal](https://github.com/Isopod/tree-sitter-pascal) (MIT) and substantially extended for Delphi 13 surface coverage.

Self-contained "THEN-wins" parser. 93.48% standalone on the same corpus. Use this when you want a single grammar and can live with imperfect conditional-compilation handling.

### 2. `tree-sitter-delphi13-pure` (`pure/` subdirectory)
A simpler sub-grammar that **drops `pp_*` tokens** entirely. It expects preprocessor-resolved source as input. Paired with the preprocessor below, this is the path that reaches 99.33%.

### 3. `delphi13-preprocessor` (`preprocessor/` subdirectory)
A standalone JavaScript library that performs Delphi-style preprocessing as a text transformation:

- Evaluates `{$IFDEF}` / `{$IFNDEF}` / `{$IF expr}` / `{$ELSE}` / `{$ELSEIF}` / `{$ENDIF}` directive chains
- `{$DEFINE}` / `{$UNDEF}` with scope tracking
- Numeric directives (`CompilerVersion >= 21.0`)
- `{$I X.inc}` include-file resolution (same-directory)
- Path-based per-project defines profiles (EurekaLog, AsyncPro, FireDAC, fibplus, Indy)

Consumable by other tools — formatters, refactoring tools, language servers — that need preprocessor resolution without requiring tree-sitter.

## The architecture

```
raw .pas / .dpr / .dpk file
       │
       ▼
   delphi13-preprocessor      (text → text + source map)
   expands {$I X.inc} chains
   evaluates IFDEF expressions
   resolves per-project defines profiles
       │
       ▼
   tree-sitter-delphi13-pure  (text → AST)
   no pp_* tokens — simpler grammar
       │
       ▼
   AST
```

Splitting preprocessing from parsing turned out to be a 5+ percentage-point win over the best single-pass approach (93.48% → 99.33% on the same corpus). The pattern is portable — the same idea would apply to FreePascal or any Pascal-family language with cpp-style conditional compilation.

## Companion: tree-sitter-dfm

A separate repo at [github.com/Alexl-git/tree-sitter-dfm](https://github.com/Alexl-git/tree-sitter-dfm) parses Delphi form files (`.dfm` / `.fmx`, text format). 100% pass on 11,044 real text-DFM files.

## Install (for grammar consumers)

```sh
git clone https://github.com/Alexl-git/tree-sitter-delphi13
cd tree-sitter-delphi13
npm install --ignore-scripts
./node_modules/.bin/tree-sitter generate
node-gyp rebuild
```

npm publishing is planned for a follow-up — currently the recommended consumption path is git submodule or vendored sources.

## Known limitations

- **Inline `asm` blocks** are treated as opaque text by design. This is not tree-sitter-asm. The `asm`/`end` boundaries are recognized; the body is one token.
- **`{$IF declared(SymName)}`** always evaluates to `false` — there is no symbol table. ~10 corpus files use this and get the wrong branch. A lightweight symbol pre-scan would address most cases (see TODO.md).
- **Include-file search path** is currently same-directory only. `{$I ..\Common\X.inc}` and similar cross-directory references won't resolve.
- **FreePascal-specific extensions** (FPC operator overloading variants, `{$mode ObjFPC}` directives, macOS PasCocoa namespaces) are not covered. A separate `tree-sitter-delphi-plus-fp` is planned.

## Acknowledgements

This work builds on [Isopod/tree-sitter-pascal](https://github.com/Isopod/tree-sitter-pascal) by Robert Schütz. The MIT license header from upstream is preserved. A separate PR with applicable grammar extensions will be opened against upstream so the broader Pascal community can benefit from the proven fixes (~25 atomic commits — string-literal `^X`, dotted property `read`/`write`, trailing labels, subrange types, anonymous record/class types, exception bare-`raise`, package files, and more).

## License

MIT — same as upstream tree-sitter-pascal.
