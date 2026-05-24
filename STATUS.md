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

| # | timestamp | pass % | files OK | notes |
|---|-----------|--------|----------|-------|
| 0 | 2026-05-24 06:00 | 86.42% | 14,752 | scaffold baseline |
| 1 | 2026-05-24 07:00 | 87.18% | 14,882 | external scanner (pp_block + char_literal), reverts iter-14 greedy regex |
| 2 | 2026-05-24 07:30 | 88.78% | 15,157 | sealed-typo fix + kFinal + kReadonly + kPlatform-in-delphi |
| 3 | 2026-05-24 08:00 | 89.03% | 15,200 | declProcRef trailing calling-convention |
| 4 | 2026-05-24 08:30 | 89.26% | 15,239 | pp_block added as `type` choice (IFDEF-as-type for declField/declVar/declArg types) |
| 5 | 2026-05-24 09:00 | 89.53% | 15,285 | declProp accessor _ref (`read fChilds[0]`) + declSet allows subrange |
| 6 | 2026-05-24 09:15 | **89.73%** | **15,318** | float regex accepts both `e` and `E` (`1E-3` was unparseable) |
| 7 | 2026-05-24 09:30 | 89.73% | 15,318 | test/corpus/external-scanner.txt — 5 passing scanner unit tests (no grammar change, regression safety net) |
| 8 | 2026-05-24 10:00 | 89.75% | 15,322 | Delphi 12+ inline `if-then-else` expression (`x := if c then a else b`) |
| 9 | 2026-05-24 10:15 | 89.92% | 15,351 | Delphi 12+ `for var X in Coll` inline-var in for-loop |
|10 | 2026-05-24 10:30 | 90.07% | 15,377 | declaration hints on const (`= 'x' deprecated 'msg'`) |
|11 | 2026-05-24 10:45 | 90.41% | 15,435 | `end deprecated`/`end deprecated 'msg'` on class/interface |
|12 | 2026-05-24 11:00 | 90.41% | 15,435 | single-quoted string handles `''` escape (no net change — multi-error files) |
|13 | 2026-05-24 11:15 | **90.43%** | **15,438** | soft keywords (Reference/Message/Name/Index/Read/Write) as typeref alternatives |

## Per-root focus snapshot (iter 13)

| Root               |   OK | FAIL | Pass % |
|--------------------|------|------|--------|
| **ORM3**           |  687 |   12 | **98.28%** |
| **Embarcadero**    | 4594 |  709 | **86.63%** |
| **DevExpress**     | 4190 |  200 | **95.44%** |
| **Spring4D**       |  677 |  108 | **86.24%** |
| OmniThread         |  247 |   20 | 92.51% |
| **ORM3-SERVER**    |  147 |    0 | **100.00%** |
| ORM3-CLIENT        |  230 |    3 | **98.71%** |
| ORM3-COMMON        |  301 |    9 | **97.10%** |

## Remaining failures (~1,915)

Top clusters after iter 2:
- IFDEF inside expression-position (type, args, fields, function-call args) — scanner doesn't help when the IFDEF content is one token in a larger expression
- Various `class function`/`class procedure` modifier combos with `class sealed`/`override; final`
- `declVariant` with IFDEF inside variant record case
- `declProcRef` (procedural types `type T = function(...): R`)
- Long tail of small constructs

## What's next

1. IFDEF-in-expression handling — extend scanner to handle `{$IFDEF X}a{$ELSE}b{$ENDIF}` as a single value-token at any position
2. `class sealed` modifier on classes (separate from `sealed` on methods)
3. `declProcRef` named-arg form
4. More keyword sweep (might be more typos hiding)

## Goal

≥99% on real Delphi 13 source. Path:
1. Baseline measurement (this commit)
2. Real external scanner (IFDEF blocks + `^X`) — single biggest lever
3. Iterate on remaining clusters
4. Delphi 13.x feature additions (multi-line strings, anon records, sealed combos, etc.)
5. Optional companion: `delphi13-preprocessor` for `{$I}` expansion → pushes to 99.5%
