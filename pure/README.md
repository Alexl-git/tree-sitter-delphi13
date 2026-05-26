# tree-sitter-delphi13-pure

Sub-tree-sitter that parses **pure Delphi only** — no IFDEF awareness.

Designed to be fed the virtual text output of `../preprocessor/cli.js` (or any
equivalent preprocessor). All `{$IF*}` / `{$IFDEF}` / `{$ELSE}` / `{$ENDIF}` /
`{$I}` directives are expected to have been resolved upstream into plain
Pascal source.

## Differences vs the parent `tree-sitter-delphi13` grammar

| Aspect | Parent (master) | Pure |
|---|---|---|
| `pp_block` external token | Yes | **Dropped** |
| `pp_open` / `pp_else_tail` / `pp_end_only` externals | Yes | **Dropped** |
| `pp_block` in `type` choice | Yes | **Dropped** |
| `pp_block` in `declUses` / `declRequires` | Yes | **Dropped** |
| `pp_block` in `declFieldNoSemi` type set | Yes | **Dropped** |
| THEN-wins scanner logic | Yes | **Dropped** (much smaller scanner) |
| `pp` regex (single-line `{$X}`) | In extras | In extras (kept — for harmless directives like `{$EXTERNALSYM}` that don't affect structure) |

## Status

Phase 2 scaffold landed (grammar.js stripped of IFDEF-related tokens and
rules). Next steps:
1. Strip THEN-wins scanner code from `scanner.c`.
2. Set up `binding.gyp` / `package.json` for an independent native binding.
3. Wire the orchestrator: `preprocessor -> pure parse -> source-map rewrite`.
4. Run the orchestrator on the curated corpus and measure.

## Why split?

The parent grammar's `pp_block` machinery and the iter-37+ `declFieldNoSemi`
conflict-cascade family fundamentally limit grammar evolution. Carving out a
pure variant removes ~150-200 lines of pp_*-handling, eliminates 4 conflict
declarations that were paid taxes on every state, and lets us iterate the
core grammar without GLR-cascade risk from IFDEF tokens that the preprocessor
has already resolved.
