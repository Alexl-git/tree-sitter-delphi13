# delphi13-preprocessor

[![npm](https://img.shields.io/npm/v/delphi13-preprocessor.svg)](https://www.npmjs.com/package/delphi13-preprocessor)
[![license](https://img.shields.io/npm/l/delphi13-preprocessor.svg)](../LICENSE)

Standalone Delphi 13 preprocessor — resolves `{$IFDEF}` / `{$IF}` / `{$ELSE}` / `{$ENDIF}` chains, `{$DEFINE}` / `{$UNDEF}`, `{$I X.inc}` includes, and numeric directives. Produces preprocessor-resolved text suitable for [`tree-sitter-delphi13-pure`](https://www.npmjs.com/package/tree-sitter-delphi13-pure) or any other consumer that prefers flat source.

Pairs with the pure tree-sitter sub-grammar to reach **99.33%** parse rate on real-world Delphi 13 corpora.

## Install

```sh
npm install delphi13-preprocessor
```

## Library usage

```js
const fs = require('fs');
const { preprocess } = require('delphi13-preprocessor');

const raw = fs.readFileSync('MyUnit.pas', 'utf8');

const { text, defines } = preprocess(raw, {
  defines: ['MSWINDOWS', 'WIN64', 'CPU64BITS', 'UNICODE',
            'COMPILER_VERSION_37', 'VER370',
            'SUPPORTS_GENERICS', 'SUPPORTS_INLINE',
            'ASSEMBLER'],
  numericDefines: {
    CompilerVersion: 37,
    RTLVersion: 37,
  },
  baseDir: 'C:/MyProject',     // for {$I X.inc} resolution (same-dir only)
  includeMode: 'expand',       // 'expand' (default) | 'defines-only' | 'off'
});

// Returns `{ text, defines }`:
//   text    — the active-branch source with inactive branches (and directives)
//             replaced by whitespace, preserving line AND byte offsets so
//             tree-sitter positions map 1:1 back to the ORIGINAL file.
//   defines — the final define set (Array) after all {$DEFINE}/{$UNDEF}.

// `includeMode` controls {$I X.inc} handling:
//   'expand'       — splice the resolved .inc body into the output (default).
//                    Shifts offsets after the include point.
//   'defines-only' — apply the .inc's {$DEFINE}/{$UNDEF} to the parent (so a
//                    later {$IFDEF X} in the parent resolves correctly) but do
//                    NOT splice the body. Keeps output 1:1 with input, and does
//                    not duplicate .inc symbols for consumers that index .inc
//                    files separately.
//   'off'          — blank the {$I} directive, ignore its defines. 1:1 offsets.
```

## CLI

```sh
node node_modules/delphi13-preprocessor/cli.js path/to/file.pas [--defines defines.json]
```

Emits preprocessed pure-Pascal text to stdout.

## Supported directives

- **Conditional**: `{$IFDEF}` / `{$IFNDEF}` / `{$IF expr}` / `{$ELSEIF expr}` / `{$ELSE}` / `{$ENDIF}` / `{$IFEND}`
- **Define management**: `{$DEFINE Name}`, `{$UNDEF Name}`
- **Includes**: `{$I X.inc}` and `{$INCLUDE X.inc}` (same-directory resolution)
- **Expression evaluation in `{$IF}`**:
  - `defined(X)`, `not defined(X)`
  - Boolean `and` / `or` / `not`
  - Numeric comparison: `CompilerVersion >= 21.0`, `RTLVersion < 31`
  - Parenthesized sub-expressions

## What it does NOT do

- **`{$IF declared(SymName)}`** always returns false. Implementing this would require a lightweight symbol pre-scan (TYPE/CONST/VAR/FUNCTION declarations in the same unit). On the TODO list.
- **Cross-directory `{$I}` search paths**. Currently the include file must live in the same directory as the file being preprocessed. Search-path support is on the TODO list.
- **`{$INLINE}` / `{$EXTERNALSYM}` / `{$WARN}`** and other purely-compiler directives — these are passed through as-is (consumers see them in `extras`).

## Per-project defines profiles

For real-world parsing, you often need project-specific defines to pick the right IFDEF branches. The orchestrator in the parent repo uses path-based regex profiles for EurekaLog, AsyncPro, FireDAC, fibplus, and Indy. Example:

```js
const PATH_DEFINES = [
  { re: /EurekaLog/i, defs: ['EUREKALOG', 'USE_NAMESPACES', 'COMPILER37', /* ... */] },
  { re: /AsyncPro/i, defs: ['PRNDRV', 'APAX', 'Ver130', 'Ver140', 'Ver150'] },
  { re: /FireDAC/i, defs: ['FireDAC_64', 'FireDAC_SQLITE_EXTERNAL'] },
];
```

See [`tools/parse-corpus-orchestrated.js`](https://github.com/Alexl-git/tree-sitter-delphi13/blob/master/tools/parse-corpus-orchestrated.js) in the parent repo for the full reference set.

## License

MIT.
