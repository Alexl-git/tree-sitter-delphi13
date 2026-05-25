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
|13 | 2026-05-24 11:15 | 90.43% | 15,438 | soft keywords (Reference/Message/Name/Index/Read/Write) as typeref alternatives |
|14 | 2026-05-24 11:30 | 90.45% | 15,441 | caseCase allows Pascal label between caseLabel and body (Spring4D state machines) |
|15 | 2026-05-24 11:45 | 90.59% | 15,466 | more procAttribute keywords (export/varargs/winapi/interrupt) |
|16 | 2026-05-24 12:00 | **91.02%** | **15,539** | generic-type constraints `<T: class, constructor>` (huge Spring4D win) |
|17 | 2026-05-24 12:30 | 91.04% | 15,541 | declArray allows subrange element + narrow ident-OP-int subrange |
|18 | 2026-05-24 13:00 | 91.07% | 15,547 | trailing-dot float (`100.`) via external scanner; ORM3 99.43% |
|19 | 2026-05-24 13:30 | **91.09%** | **15,549** | try-except `else` last stmt may omit `;` (ORM3 99.71%, CLIENT 100%) |
|20 | 2026-05-24 14:54 | 91.09% | 15,550 | `#NN` char-literal as subrange bound (ORM3 → **99.86%**; Spring4D held) |
|21 | 2026-05-24 16:00 | 91.09% | 15,550 | REVERTED — defProc body=`pp_block+end` caused -502 file regression |
|22 | 2026-05-24 18:00 | **91.25%** | **15,578** | unit-deprecated hint + `&&` identifier prefix (Embarcadero +18, Spring4D +5) |
|23 | 2026-05-24 18:15 | 91.25% | 15,579 | inline `const NAME=value` in statement body (TableTools → **100%**) |
|24 | 2026-05-24 18:50 | 91.25% | 15,579 | REVERTED — prec(-1) pp_block+end body still −502; ORM3 ceiling FINAL |
|25 | 2026-05-24 19:30 | **91.41%** | **15,605** | `const [ref]` arg attr + prec(-1) on pp_block-as-type (Embarcadero **88.21%**) |
|26 | 2026-05-24 20:10 | 91.41% | 15,605 | scanner: add `packed` to refuse-list (foundation — 0 file delta, fixes IFDEF-packed pattern, DBClient errors 7→5) |
|27 | 2026-05-24 20:25 | 91.41% | 15,605 | REVERTED — `type` in refuse-list net -12 (Spring +2 / Embarcadero -6) |
|28 | 2026-05-24 20:40 | **91.81%** | **15,674** | `pp_block` in declUses/declRequires (Embarcadero **89.01%**, +42; Spring4D **91.34%**, +2) |
|29 | 2026-05-24 20:55 | 91.81% | 15,674 | REVERTED — cdecl-after-declField -2 |
|30 | 2026-05-24 21:25 | 91.81% | 15,674 | REVERTED — pp_block in range -97 (IFDEF-in-expr BLOCKED) |
|31 | 2026-05-24 22:30 | **91.89%** | **15,687** | soft-keyword names in declVar (Embarcadero **89.21%**) |
|32-33| 2026-05-24 22:50 | 91.89% | 15,687 | 0-delta investigations (declField/Arg + Operator + enum Default; reverted) |
|34 | 2026-05-24 23:30 | **91.93%** | **15,695** | qualified-id subrange `TFoo.Bar..TFoo.Baz` (DevExpress **95.76%**) |
|35 | 2026-05-24 23:50 | 91.93% | 15,695 | REVERTED — declEnumValue Default+Operator aliases 0 delta |
|36 | 2026-05-25 00:15 | **91.96%** | **15,695** | .inc fragment skip filter + IFDEF stats tool (real-Pascal denominator 17072→17067) |
|37 | 2026-05-25 00:45 | 91.96% | 15,695 | REVERTED — Stage-A.1 IFDEF-as-AST refactor -2977 (all-positions-needed) |
|38 | 2026-05-25 01:10 | **92.09%** | **15,717** | `pp_block.kDot.typeref` qualified-type prefix (EurekaLog/RTL XE2+ +22) |
|39 | 2026-05-25 01:25 | 92.09% | 15,717 | REVERTED — pp_block in exprDot -3048 (4th BLOCKED confirmation) |
|40 | 2026-05-25 01:35 | 92.09% | 15,717 | REVERTED — typerefDot pp_block alt -9 tracked roots |
|41 | 2026-05-25 01:55 | 92.09% | 15,717 | asmBody atomic-identifier fix (foundation, 0 delta, OtlSync asm-probe clean) |
|42 | 2026-05-25 02:10 | 92.09% | 15,717 | Investigation only (xCreate cdecl + padding-array both blocked) |
|43 | 2026-05-25 02:30 | **92.10%** | **15,719** | Delphi 11+ underscore digit-separator `1_000_000_000` in int literals (Embarcadero **89.32%**) |
|44 | 2026-05-25 02:45 | **92.35%** | **15,762** | `raise X at addr` exception re-raise w/ address (Embarcadero **89.91%**, +43 files) |
|45 | 2026-05-25 03:00 | **92.38%** | **15,766** | Soft-keyword names in declConst (DevExpress **95.90%**, +4 files) |
|46 | 2026-05-25 03:15 | **92.44%** | **15,777** | `T.Not/T.And/T.Or/T.Xor` keyword-as-identifier on exprDot RHS (DevExpress **96.13%**, Spring4D **91.59%**, +11) |
|47-52| 2026-05-25 04:00 | 92.44% | 15,777 | 6 iters at ceiling: refactor attempts (-3031 each) reverted; investigations no-op |
|53 | 2026-05-25 05:30 | **92.57%** | **15,799** | `writeonly` property modifier (Embarcadero crosses **90.25%**, Spring4D **91.72%**, +22 files) |
|54 | 2026-05-25 06:30 | **92.73%** | **15,827** | Trailing `;` in record initializer (Embarcadero **90.51%**, DevExpress **96.40%**, +28 files) |
|55 | 2026-05-25 07:00 | 92.73% | 15,827 | REVERTED — cheap-peek IFDEF-in-expr -2891 (7th IFDEF refactor confirms architectural ceiling) |
|56 | 2026-05-25 07:30 | **92.82%** | **15,842** | Inline calling-conv before `;` in _declProc (Embarcadero **90.78%**, +15 Bde RTL imports) |
|57 | 2026-05-25 07:50 | **92.86%** | **15,849** | Inline calling-conv on lambdas (Vcl.Edge WebView2 anon-method callbacks, +7) |

## Per-root focus snapshot (iter 23)

| Root               |   OK | FAIL | Pass % |
|--------------------|------|------|--------|
| **ORM3**           |  698 |    1 | **99.86%** |
| **TableTools**     |   13 |    0 | **100.00%** |
| **Spring4D**       |  720 |   65 | **91.72%** |
| **Embarcadero**    | 4816 |  485 | **90.85%** |
| DevExpress         | 4232 |  158 | 96.40% |
| OmniThread         |  247 |   20 | 92.51% |
| **ORM3-SERVER**    |  147 |    0 | **100.00%** |
| **ORM3-CLIENT**    |  233 |    0 | **100.00%** |
| **ORM3-COMMON**    |  309 |    1 | **99.68%** |

Remaining ORM3 fail (1): MStreams.pas r1084 — IFDEF wraps body internals (asm-vs-pascal switch); same structural shape as Spring4D `else{$ELSE}begin{$ENDIF}`. BLOCKED — needs preprocessor or scanner-classifier.

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
