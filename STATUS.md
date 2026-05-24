# tree-sitter-delphi13 — STATUS

## Active stage

**Phase 1**: clean grammar baseline against curated Delphi-13 corpus.

## Architecture (planned)

```
.pas/.dpr/.dpk file
       │
       ▼
   [optional]  delphi13-preprocessor   (separate library, NOT in this repo)
                expands {$I X.inc} chains, evaluates {$DEFINE}/{$IF defined()}
                produces a virtual buffer + source map
       │
       ▼
   tree-sitter-delphi13                 (this repo)
     - grammar.js   Delphi-13 syntax rules (no fpc/objc branches)
     - scanner.c    external scanner: pp_block + ^X char_literal
     - tools/       harness with day-1 filtering of non-Delphi files
```

## Status snapshot

| Component       | State                                                  |
|-----------------|--------------------------------------------------------|
| Grammar         | Forked from tree-sitter-pascal with all proven fixes + Delphi-13 lock-in (no fpc/objc) |
| Scanner         | Skeleton (always returns false; same behavior as upstream) |
| Harness         | Filtering for binary / template / interpreter fragments / XML |
| Corpus          | Curated Delphi-13 only (~9,761 files; vs 39K in unfiltered Pascal corpus) |
| Preprocessor    | Not started (deferred — separate library) |

## Iteration history

| # | timestamp | pass % | notes |
|---|-----------|--------|-------|
| 0 | (baseline) | — | initial measurement pending |

## Goal

≥99% on real Delphi 13 source. Path:
1. Baseline measurement (this commit)
2. Real external scanner (IFDEF blocks + `^X`) — single biggest lever
3. Iterate on remaining clusters
4. Delphi 13.x feature additions (multi-line strings, anon records, sealed combos, etc.)
5. Optional companion: `delphi13-preprocessor` for `{$I}` expansion → pushes to 99.5%
