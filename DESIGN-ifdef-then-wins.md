# IFDEF "THEN-wins" refactor — design

Branch: `refactor/ifdef-then-wins`
Baseline (master): 93.48% on the curated Delphi 13 corpus (15,955 / 17,067 real Pascal files).

## Problem statement

The current scanner emits the entire `{$IF*} ... {$END*}` block as one opaque
token (`pp_block`), which the grammar consumes as an `extras` (whitespace-like)
item. This works for IFDEFs that wrap *whole structural units* (declarations,
statements) — those are the most common case and parse cleanly.

It fails for IFDEFs that wrap *partial expression content*:

```pascal
LSASL := {$IFDEF HAS_GENERICS_TList}LSASLList.Items[i]{$ELSE}LSASLList.Strings[i]{$ENDIF};
```

The scanner consumes the entire `{$IFDEF}...{$ENDIF}` as one token, hiding
`Items[i]` / `Strings[i]` from the parser. The parser sees an opaque token
where it needs an `_expr` — falls back to error recovery, which cascades for
hundreds of lines downstream.

Seven prior attempts (iters 49, 50, 51, 55, 37, 39, 40) tried to add the
opaque token as an `_expr` alternative or split into discrete open/else/end
tokens with grammar-level handling. Every attempt cascaded -100 to -3000 files
on the full corpus — the GLR parser explores too many states when pp tokens
appear in expression positions.

## New approach — "THEN-wins"

Read *through* the IFDEF directives in the scanner:

- THEN-branch content flows out as **regular tokens** to the parser
- ELSE-branch content is consumed as **one opaque tail token**
- Directive markers themselves are emitted as **`extras`** (whitespace-like)

From the parser's POV, a symmetric IFDEF like
`{$IFDEF X}value_a{$ELSE}value_b{$ENDIF}` reads as just `value_a` surrounded
by two extras tokens — parses cleanly in any expression position.

### Tokens

The scanner emits up to three external tokens for an IFDEF block:

| Token            | What it covers                                   | Grammar role |
|------------------|--------------------------------------------------|--------------|
| `pp_open`        | `{$IF X}` / `{$IFDEF X}` / `{$IFNDEF X}` etc.    | `extras`     |
| `pp_else_tail`   | `{$ELSE}…{$ENDIF}` — opaque from else to end     | `extras`     |
| `pp_end_only`    | `{$ENDIF}` / `{$IFEND}` (no else seen)           | `extras`     |

`pp_else_tail` and `pp_end_only` are alternative closers — the scanner picks
based on whether it sees `{$ELSE}` first or `{$ENDIF}` first while looking
ahead from the current position.

The legacy `pp_block` token is **retained** as a safety-net fallback for
pathological cases (e.g. IFDEF spans an `end` token that closes a parent
block — see "Risks" below). It will only be emitted when the scanner detects
a shape it can't safely read through.

### Nesting

Nested IFDEFs work without changes to the parser. Each invocation of the
scanner emits exactly one directive token, and nested `{$IFDEF Y}…{$ENDIF}`
inside a THEN body just becomes another pp_open / pp_end_only pair —
all extras from the parser's POV.

The scanner does need depth-aware lookahead **when consuming `pp_else_tail`**
to skip over nested `{$IFDEF}/{$ENDIF}` pairs inside the else body. This is
the same depth-tracking the current scanner already does for `pp_block`.

### Symmetric vs asymmetric IFDEFs

| Pattern                                            | THEN-wins outcome |
|----------------------------------------------------|---------------------|
| `{$IFDEF X}a{$ELSE}b{$ENDIF}` (both expressions)   | Parses as `a` ✓     |
| `{$IFDEF X}cdecl{$ELSE}stdcall{$ENDIF}` (callconv) | Parses as `cdecl` ✓ |
| `{$IFDEF X}then begin{$ELSE}then{$ENDIF}`          | Parses `then begin`; ELSE dropped (asymmetric — user accepts) |
| `{$IFDEF X}{$ENDIF}` (empty)                       | Parses as zero tokens (just extras) ✓ |
| `{$IFDEF X}body{$ENDIF}` (no else)                 | Parses as `body` ✓  |

### AST shape

For tools that need to recover the IFDEF structure post-parse:

- `pp_open` extras nodes are visible in the source range — tools can scan
  back from a parse position to find the wrapping `{$IFDEF}` directive
- `pp_else_tail` carries the raw else+end text as its source range
- Pairing pp_open ↔ pp_else_tail/pp_end_only is a tree-walk over extras

This matches how tree-sitter handles comments — they're in the tree but
don't break the structural parse.

## Migration plan

| Phase | Work | Expected file delta |
|-------|------|---------------------|
| 0 | Branch + DESIGN.md (this commit) + measurement snapshot | 0 (no code change) |
| 1 | Scanner emits new tokens (pp_open/pp_else_tail/pp_end_only) alongside pp_block. Grammar registers them but doesn't use them yet. Verify no regression. | 0 |
| 2 | Grammar adds new tokens to `extras`. Scanner stops emitting pp_block for IFDEFs the new model can handle. Measure. | Target: +500 to +1000 files (most of the IFDEF-in-expression cluster). Risk: regression where pp_block-as-extras was load-bearing. |
| 3 | Iterate on regressions; sharpen the scanner's "can I read through?" decision. | Recover regressions; reach plateau. |
| 4 | Drop pp_block entirely once new model covers all real cases. | Cleanup. |

## Risks

- **Asymmetric IFDEFs that need the ELSE side to parse** (~1.05% of IFDEFs
  per ifdef-stats.js). Cannot be fixed without a full preprocessor; user
  accepts dropping them.
- **`end`-spanning IFDEFs** — e.g. `{$IFDEF X}end else begin{$ENDIF}` where
  the THEN side closes a parent block. Scanner must detect this shape and
  fall back to opaque pp_block, otherwise the parser breaks on unbalanced
  `end`. Heuristic: if the THEN body contains a top-level `end`/`begin`/`;`
  that would change block balance, refuse to read through.
- **`uses`-clause IFDEFs** — currently handled by explicit `pp_block` in
  `declUses`. New model: directive markers as extras in uses clause should
  work since unit names parse as identifiers either way.
- **Cascade risk during phase 2** — new extras may interact badly with GLR.
  Will measure on sample manifest before full corpus.

## Out of scope

- True preprocessor / `{$I X.inc}` include expansion (separate
  `delphi13-preprocessor` library, not blocked on this work).
- Asymmetric IFDEFs where ELSE side is structurally required.
- `{$IF expr}` numeric-expression evaluation. The directive is treated
  syntactically, never evaluated.

## Success criteria

- Net pass-rate on full corpus: ≥ 94.5% (target +1pp over master 93.48%)
- No regression on roots currently at 100%: TableTools, ORM3-SERVER,
  ORM3-CLIENT
- No regression on ORM3 (99.86%) — the one remaining failure is the
  asm-vs-pascal IFDEF which is asymmetric and won't be fixed by this work
- All atomic commits; each grammar/scanner change measured separately
