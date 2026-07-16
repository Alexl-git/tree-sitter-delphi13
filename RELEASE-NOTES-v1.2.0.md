# v1.2.0 — coverage release: orchestrated gap 0.239% → 0.035% on real Delphi 13

**Packages:** `tree-sitter-delphi13` **1.2.0** · `tree-sitter-delphi13-pure` **1.2.0**
· `delphi13-preprocessor` **1.1.0**
**Date:** 2026-07-16. Eleven commits (`6f10463`…this release), every one gated by a
full-corpus pre/post diff with **zero regressions** on both paths.

## Numbers (17,081-row corpus, 11,722 unique real files)

| path | v1.1.2 | v1.2.0 |
|---|---|---|
| orchestrated (preprocessor → pure), raw rows | 99.503% (82 fails) | **99.770% (38 fails)** |
| master (raw → full grammar), raw rows | 98.443% (257) | **98.588% (233)** |
| orchestrated, deduped | 99.444% | **99.700%** |
| orchestrated, deduped + Delphi-13-only | 99.761% (27 rows) | **99.965% (4 rows)** |

The 4 remaining real-gap rows: `System.pas` (+ a dated backup copy) — needs the
`platform`-hint-before-initializer arm whose declVar interaction explodes parser-table
construction (bisect-confirmed, documented in TODO.md) — and `Winapi.D3D10(_1).pas`
(`Register:` as a field name; documented not-worth-it). Everything else that fails is
invalid source, intentional fixtures, or non-Delphi (FPC/.NET).

## Grammar (root + pure, in lockstep)

- **Implicit `begin…end.` unit initialization** (Turbo-Pascal form, still dcc-valid).
  Unit tail restructured; the implicit block renders as the same `block` node
  `program`/`library` produce. Recovers bdemts, SHDocVw, System.Win.InternetExplorer,
  Winapi.OpenGL.PkgHelper, AsyncPro APFPDENG.
- **`trailingText`** — everything after the module's final `end.` is one flaggable
  node (dcc ignores it with W1011). New node type.
- **`genericArgTpl`** — nested generic instantiation in a method resolution clause:
  `function TFunc<T1, IEnumerable<TResult>>.Invoke = Bind;`. New node type.
- **Control chars ≤ #31 between tokens are whitespace** (classic Pascal / dcc
  behavior; DevExpress ships a stray 0x12 in dxPDFForm.pas).
- **Goto label as a then/else/do body** — `if Index = 0 then Found: …`,
  `else FoundMismatch: Exit`, `while true do redo: case …`. Labels could already
  prefix statements in lists; now single-statement bodies too. Case-arm
  interpretation deterministically wins where both parses complete.
- **Lenient directive tail in interface declaration lists** — the FINAL directive
  group may omit its `;` (`function IsEq(…): Boolean; overload` before the next
  declaration; dcc32-verified). `defProc` headers stay strict: `procedure P;
  stdcall begin` is still rejected, exactly like dcc.

## Preprocessor (`delphi13-preprocessor` 1.1.0)

- **Include defines propagate in expand mode** — `{$I}` is textual inclusion: a
  `{$DEFINE X}` inside the include now affects `{$IFDEF X}` after it (dcc semantics).
- **Nearest-first include resolution** — baseDir + includePaths, then baseDir's
  immediate subdirectories, then up to 3 parent levels each with their immediate
  subdirectories (cached). Covers EurekaLog `Source\Common\*.inc`, AsyncPro
  `PrnDrv\Win9xME` → `source\AwDefine.inc`. Opt out: `nearSearch: false`.
- **Decoded UTF-8 BOMs are blanked** (offset-preserving), including BOMs inside
  spliced include bodies.
- **Lexer understands MASM `"…"` asm strings**, and both quote skips are bounded at
  end-of-line — a stray quote can no longer hide later directives (fixes a
  System.AnsiStrings blank-to-EOF).
- **NEW: opt-in dcc-tolerance pass** (`tolerances: true`) — inserts the `;` dcc
  itself imagines in two dcc32-verified no-`;` constructs (final directive group;
  `array[..] of T` as last record field). Row/column-preserving; conservative
  anchors; a false positive provably cannot make valid code invalid.

## Consumer notes (drag-lint and friends)

- Three additive CST node types: `trailingText`, `genericArgTpl`, and `block` as a
  direct `unit` child. Existing queries are unaffected.
- Delphi preprocessor ports should mirror the five preprocessor changes above to
  stay oracle-diff green.
- Re-index anything indexed with older DLLs — recovering error nodes drop in-scope
  symbols.

## Test suite

Four new corpus fixtures (implicit-init, trailing-text, generic-resolution-nested,
ctrl-char-ws, label-body, lenient-directive-tail) and four new preprocessor test
files (include-resolve, bom, asm-quotes, tolerance). The 3 known `pp_block`
external-scanner corpus-test failures remain pre-existing and unrelated.
