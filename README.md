# tree-sitter-delphi13

[![npm](https://img.shields.io/npm/v/tree-sitter-delphi13.svg)](https://www.npmjs.com/package/tree-sitter-delphi13)
[![license](https://img.shields.io/npm/l/tree-sitter-delphi13.svg)](LICENSE)

Tree-sitter grammar pipeline focused on **Delphi 13 (RAD Studio 37.0 / Florence)** and the surrounding modern Delphi ecosystem.

**99.33% pass rate** on a 35,556-file curated Delphi 13 corpus (zero ERROR nodes).

| corpus root | pass rate |
|---|---|
| ORM3 (production application code) | **100.00%** |
| Spring4D | 99.87% |
| DevExpress VCL | 99.82% |
| OmniThreadLibrary | 99.62% |
| Embarcadero RAD Studio 13 RTL/VCL | 99.24% |

The remaining ~0.5% are intentionally broken DUnitX test cases, real vendor source typos, C-language code mistakenly placed in `.pas` files, and a handful of pathologically large auto-generated TypeLib units.

## Three packages, one repo

| Package | What it does |
|---|---|
| **`tree-sitter-delphi13`** *(this directory)* | Master grammar — Delphi-13 syntax, all proven fixes from upstream merged + new extensions. Self-contained "THEN-wins" parser (93.48% on its own). |
| **[`tree-sitter-delphi13-pure`](pure/)** | Simpler sub-grammar that drops `pp_*` tokens entirely. Expects preprocessor-resolved source. |
| **[`delphi13-preprocessor`](preprocessor/)** | Standalone JavaScript library that resolves `{$IFDEF}` / `{$IF}` / `{$DEFINE}` / `{$I X.inc}` directives as a text transformation. |

The full pipeline `preprocessor → pure → AST` is what reaches **99.33%**. Use the master grammar alone if you don't need conditional-compilation awareness; use the pipeline if you do.

## Architecture

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

Splitting preprocessing from parsing was a 5+ percentage-point win over the best single-pass approach. The pattern is portable to any Pascal-family language with cpp-style conditional compilation.

## Install

```sh
npm install tree-sitter-delphi13 tree-sitter
```

For the full preprocessor pipeline:

```sh
npm install tree-sitter-delphi13-pure delphi13-preprocessor tree-sitter
```

## Quick start (master grammar)

```js
const Parser = require('tree-sitter');
const Delphi13 = require('tree-sitter-delphi13');

const parser = new Parser();
parser.setLanguage(Delphi13);

const source = `
unit Hello;
interface
procedure SayHi;
implementation
procedure SayHi;
begin
  WriteLn('hi');
end;
end.
`;

const tree = parser.parse(source);
console.log(tree.rootNode.toString());
```

## Quick start (preprocessor pipeline)

```js
const fs = require('fs');
const Parser = require('tree-sitter');
const DelphiPure = require('tree-sitter-delphi13-pure');
const { preprocess } = require('delphi13-preprocessor');

const raw = fs.readFileSync('MyUnit.pas', 'utf8');

const { text } = preprocess(raw, {
  defines: ['MSWINDOWS', 'WIN64', 'CPU64BITS', 'UNICODE', 'COMPILER_VERSION_37'],
  numericDefines: { CompilerVersion: 37, RTLVersion: 37 },
  baseDir: 'C:/MyProject',
});

const parser = new Parser();
parser.setLanguage(DelphiPure);
const tree = parser.parse(text);
```

## DFM companion

Delphi form files (`.dfm` / `.fmx`, text format) have their own grammar at [tree-sitter-dfm](https://github.com/Alexl-git/tree-sitter-dfm) — 100% on 11,044 real DFM files.

```sh
npm install tree-sitter-dfm
```

## Build from source

```sh
git clone https://github.com/Alexl-git/tree-sitter-delphi13
cd tree-sitter-delphi13
npm install --ignore-scripts
./node_modules/.bin/tree-sitter generate
node-gyp rebuild
```

## Known limitations

- **Inline `asm` blocks** treated as opaque text by design. Not tree-sitter-asm.
- **`{$IF declared(SymName)}`** always evaluates to `false` — no symbol table. ~10 corpus files use this. A lightweight symbol pre-scan would address most cases.
- **Include search path** is currently same-directory only. Cross-directory `{$I ..\Common\X.inc}` requires a search-path option (see TODO.md).
- **FreePascal-specific extensions** (operator overloading variants, `{$mode ObjFPC}` directives, macOS PasCocoa namespaces) are not covered. A separate `tree-sitter-delphi-plus-fp` repo is planned.

## Acknowledgements

Built on [Isopod/tree-sitter-pascal](https://github.com/Isopod/tree-sitter-pascal) (MIT, originally by Philip Zander). The MIT license header is preserved.

A separate effort is upstreaming the applicable grammar-only extensions (30 atomic commits — caret control-char `^X`, dotted property `read`/`write`, generic constraints, trailing labels, subrange extensions, package files, and more) back to upstream so the broader Pascal community can benefit.

## License

MIT — same as upstream tree-sitter-pascal.
