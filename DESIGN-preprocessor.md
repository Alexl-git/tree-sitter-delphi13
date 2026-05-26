# delphi13-preprocessor + sub-tree-sitter orchestrator — design

Branch: `feature/preprocessor-orchestrator`
master baseline: 98.15% on the curated Delphi 13 corpus (16,342 / 16,650 real Pascal files, after Phase 3b iter 36).

## Goal

Reach 99.5%+ Delphi correctness by **splitting** preprocessor and grammar concerns into two cooperating layers.

Currently the grammar handles `{$IFDEF}` blocks via a scanner trick (THEN-wins). It works for symmetric IFDEFs and most asymmetric ones, but cannot:
- handle 3-way nested asymmetric IFDEFs (e.g. MStreams asm/asm/Pascal)
- evaluate `{$IF defined(X) and not defined(Y)}`
- expand `{$I X.inc}` includes
- recover the ELSE branch of asymmetric IFDEFs

A separate **preprocessor** does these things cleanly via text transformation. A **pure-Delphi sub-tree-sitter** then parses the expanded output without ever seeing an IFDEF token.

## Architecture

```
                  raw .pas / .dpr / .dpk file
                              │
                              ▼
              ┌───────────────────────────────┐
              │     delphi13-preprocessor     │  (this package — new)
              │                               │
              │  • parse {$DEFINE}/{$UNDEF}   │
              │  • evaluate {$IF expr}/{$IFDEF}/{$IFNDEF}/{$IFOPT}/{$ELSEIF}/{$ELSE}/{$ENDIF}/{$IFEND}
              │  • expand {$I X.inc}          │
              │  • read defines.json + project options
              │  • emit virtual pure-Pascal text + source map
              │                               │
              │  recursive: includes expand   │
              │  through preprocessor again   │
              └───────────────────────────────┘
                              │
                              ▼
              virtual pure-Pascal text (no $-directives)
                              │
                              ▼
              ┌───────────────────────────────┐
              │   tree-sitter-delphi13-pure   │  (sub-tree-sitter — to be carved out)
              │                               │
              │  • knows NO IFDEFs            │
              │  • parses pure Delphi only    │
              │  • drops pp_open/pp_else_tail/│
              │     pp_end_only/pp_block      │
              │  • simpler grammar, smaller   │
              │     state machine             │
              └───────────────────────────────┘
                              │
                              ▼
              parse tree (positions in virtual text)
                              │
                              ▼
              ┌───────────────────────────────┐
              │       source-map rewriter     │
              │                               │
              │  rewrite each node's range    │
              │  to original-file coordinates │
              └───────────────────────────────┘
                              │
                              ▼
              parse tree (positions in original file)
```

## ELSE-branch recovery (recursive sub-tree-sitter)

For consumers that want both branches of every IFDEF (refactoring tools, semantic analyzers): the orchestrator runs the preprocessor **multiple times** with different define states. For each `{$IFDEF X}A{$ELSE}B{$ENDIF}` pair, two virtual buffers:
- Buffer with `X` defined → A flows in
- Buffer with `X` undefined → B flows in

Both buffers are parsed by the pure sub-tree-sitter (recursive: each can contain nested IFDEFs). The orchestrator merges the resulting trees into one tree-with-alternative-branches.

For **mid-expression** IFDEFs (`Items[i]{$ELSE}Strings[i]`): use `ts_parser_set_included_ranges` to feed the parser the surrounding context with substituted bytes at the IFDEF position. Same parser, same grammar, no synthetic stubs.

## Why this is the right architecture

| Concern | Old: tree-sitter-delphi13 grammar | New: split |
|---------|-----------------------------------|------------|
| Asymmetric IFDEFs | grammar absorbs as opaque or partial | preprocessor picks one branch fully |
| `{$I X.inc}` expansion | not supported | preprocessor expands |
| `{$IF defined(X)}` evaluation | not supported | preprocessor evaluates |
| ELSE recovery | not supported | post-pass via recursive sub-tree-sitter |
| Grammar complexity | growing (pp_open, pp_else_tail, pp_end_only, pp_block, asymmetric-IFDEF handling) | shrinks — drops all pp_* tokens |
| GLR cascades | sensitive to IFDEF-position changes | irrelevant |

## Implementation plan

### Phase 1 — preprocessor MVP
1. Crate / package skeleton: `delphi13-preprocessor` in this repo as a sibling tool, or a separate npm/cargo package.
2. Lexer for compiler directives: `{$DEFINE X}`, `{$UNDEF X}`, `{$IFDEF X}`, `{$IFNDEF X}`, `{$IF expr}`, `{$ELSEIF expr}`, `{$ELSE}`, `{$ENDIF}`, `{$IFEND}`, `{$IFOPT switch+}`.
3. Expression evaluator for `{$IF}`: identifiers, `defined(X)`, `declared(X)` (best-effort), `and`/`or`/`not`/parens, integer compare.
4. `{$I X.inc}` / `{$INCLUDE X.inc}` recursive expansion.
5. Default defines profile per Delphi 13 target (Win32: `MSWINDOWS`, `CPU64BITS`, `MSWINDOWS`, etc.).
6. Source map: `(virtualPos, virtualLen) → (originalFile, originalPos, originalLen)`.
7. CLI: `delphi13-preprocess <file.pas> [--defines defines.json] [--include-path PATH]` → virtual text + source map.

### Phase 2 — pure-Delphi sub-tree-sitter
1. Fork or branch tree-sitter-delphi13: drop `pp_open` / `pp_else_tail` / `pp_end_only` / `pp_block` externals.
2. Drop scanner.c's THEN-wins logic. Keep char_literal and trailing_dot_float.
3. Drop grammar rules that consumed pp_* tokens (typeref pp_block-as-type, declUses pp_block, etc.).
4. Remove the IFDEF-related conflict declarations (`[$.declEnum]`, `[$.declSet]`, ...).
5. Result: a simpler grammar by ~150-200 lines, faster generate, no GLR cascades from pp_* state interactions.

### Phase 3 — orchestrator + source-map rewriter
1. Node/Rust binding that wraps both packages.
2. `parseWithPreprocessor(file, options)` → tree with original-coordinates.
3. Optional `--with-else-alternatives` flag: runs preprocessor twice per asymmetric IFDEF, merges trees.

### Phase 4 — corpus validation
1. Run orchestrator against the same curated Delphi 13 corpus.
2. Target: ≥99.5% pass with reasonable default defines.
3. Compare per-file results to the legacy THEN-wins grammar; identify regressions.

## Open questions

- **Defines profile distribution**: ship one default per platform, or one bundled "kitchen sink" set? Bundle a per-target Delphi 13 default and let users override.
- **`{$IF declared(X)}`**: requires semantic analysis (symbol table) to evaluate. Treat as "false" by default unless a symbol-aware mode is enabled.
- **Recursion depth**: include cycles should be detected and rejected. Cap at 64 levels.
- **Performance**: preprocessor should be ≤2× the cost of tree-sitter parse alone for typical files.

## Relationship to current master

This branch does NOT modify the existing tree-sitter-delphi13 grammar yet. The pure sub-tree-sitter (Phase 2) will be a parallel artifact (perhaps `tree-sitter-delphi13-pure` in this repo, or a sibling repo).

master stays at 98.15% as the "self-contained" parser that works without a preprocessor — useful for tools that don't want the extra dependency.
