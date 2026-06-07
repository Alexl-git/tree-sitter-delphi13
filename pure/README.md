# tree-sitter-delphi13-pure

[![npm](https://img.shields.io/npm/v/tree-sitter-delphi13-pure.svg)](https://www.npmjs.com/package/tree-sitter-delphi13-pure)
[![license](https://img.shields.io/npm/l/tree-sitter-delphi13-pure.svg)](../LICENSE)

> **⚠️ Requires [`delphi13-preprocessor`](https://www.npmjs.com/package/delphi13-preprocessor) for the full benefit.**
> This grammar parses **preprocessor-resolved** Delphi source only — it drops
> `{$IFDEF}` / `pp_*` tokens, so on **raw** Delphi it will mis-parse any
> conditional-directive regions. Run the preprocessor first:
> ```sh
> npm install tree-sitter-delphi13-pure delphi13-preprocessor
> ```
> Want a single grammar that handles `{$IFDEF}` itself, with no preprocessor
> step? Use [`tree-sitter-delphi13`](https://www.npmjs.com/package/tree-sitter-delphi13) instead.

Pure Delphi 13 tree-sitter sub-grammar — **drops `pp_*` tokens entirely** and expects preprocessor-resolved source as input.

Pairs with [`delphi13-preprocessor`](https://www.npmjs.com/package/delphi13-preprocessor) for a `preprocessor → pure → AST` pipeline that reaches **99.33%** on real-world Delphi 13 corpora (35,556 files). See [the parent repo](https://github.com/Alexl-git/tree-sitter-delphi13) for context.

## When to use this vs the master grammar

| | `tree-sitter-delphi13` (master) | `tree-sitter-delphi13-pure` (this) |
|---|---|---|
| Handles `{$IFDEF}` directly | Yes — picks THEN branch via external scanner | No — expects preprocessor to resolve before parsing |
| Standalone pass rate | 93.48% | (depends on preprocessor) |
| Pipeline pass rate (with preprocessor) | — | 99.33% |
| Parser size | larger (pp_* tokens + scanner state) | smaller |
| Conflicts | more (pp_block in many positions) | fewer |
| Right choice for | one-pass parsers, syntax highlighting | tools that already need preprocessor output anyway (formatters, refactorers, LSPs) |

## Install

```sh
npm install tree-sitter-delphi13-pure tree-sitter delphi13-preprocessor
```

## Usage

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

## What's dropped vs the master grammar

| Aspect | Master | Pure |
|---|---|---|
| `pp_block` external token | Yes | **Dropped** |
| `pp_open` / `pp_else_tail` / `pp_end_only` externals | Yes | **Dropped** |
| `pp_block` in `type` / `declUses` / `declRequires` / `declFieldNoSemi` | Yes | **Dropped** |
| THEN-wins scanner logic | Yes | **Dropped** (much smaller scanner) |
| `pp` regex for single-line `{$X}` directives | In `extras` | In `extras` (kept — for harmless directives like `{$EXTERNALSYM}` that don't affect structure) |

Removing the IFDEF machinery removed ~150-200 lines of pp_* handling and 4 conflict declarations that were paying taxes on every parser state.

## License

MIT.
