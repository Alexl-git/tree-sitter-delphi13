# v1.2.1 — 100.000% on compilable Delphi 13: the last two real gaps are closed

**Packages:** `tree-sitter-delphi13` **1.2.1** · `tree-sitter-delphi13-pure` **1.2.1**
**Date:** 2026-07-16 (same-day follow-up to v1.2.0). Both fixes gated by
full-corpus pre/post diffs with **zero regressions** on both paths.

## Numbers (11,722 unique real files)

| basis | v1.2.0 | v1.2.1 |
|---|---|---|
| orchestrated raw rows | 99.770% | **99.818% (30 fails)** |
| deduplicated | 99.700% | **99.735%** |
| deduplicated + valid-Delphi-13-only | 99.965% (4 rows) | **100.000% (0 rows)** |
| master raw rows | 98.588% | 98.612% |

Every one of the 30 residual failures is invalid source (dcc32 rejects it too),
an intentionally-broken test fixture, or non-Delphi (FreePascal / .NET) — a parser
that accepted them would be wrong.

## The two fixes

1. **`platform` hint before the initializer** — `Default8087CW: Word platform =
   $033F;` (`System.pas`, six sites). `typeref` gains an optional trailing
   `kPlatform`, mirroring its existing `kDeprecated 'msg'` slot; the initializer
   then follows as a normal default value. **`System.pas` — the largest, most
   IFDEF-dense unit in the RTL — now parses clean on the orchestrated path.**
   CST nuance: in `T = C platform;` the `kPlatform` leaf now sits *inside*
   `typeref` rather than beside it (the `deprecated`+message shape is unchanged).
2. **`Register` as a record field name** — `Register: UINT;` after a prior field
   (`Winapi.D3D10(_1).pas` shader-reflection records). Narrowly aliased
   (`kRegister` only) into `declField`'s name slot with two declared conflicts;
   the trailing-callconv production (`DispInvoke: procedure(...); cdecl;`) is
   regression-guarded.

Both were previously documented as blocked (a declVar-level attempt was a
bisect-confirmed parser-table explosion; the 2026-07-06 all-callconvs attempt
likewise) — the v1.2.1 shapes ride existing role-sets instead and generate cleanly.

## Packaging

- `delphi13-preprocessor`'s `files` whitelist was missing `tolerance.js`,
  `defaults.js` and `serve.js` — the published 1.0.0's `bin` CLI crashes on
  import as a result. Fixed here; ships with 1.1.0.
- README refreshed (the npm/GitHub page previously showed numbers from an
  obsolete 35,556-row counting era).

## Fixtures

`platform-hint-init.txt`, `register-field-name.txt` (+ callconv guard);
`type-alias-hint.txt` updated for the typeref-level `kPlatform` placement.
