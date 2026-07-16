# RESUME — tree-sitter-delphi13

Cold-start pointer. Written 2026-07-16 (c) — v1.2.0 release state. Read this first,
then [TODO.md](TODO.md) (session table + remaining gaps) and
[CORPUS-CEILING-REPORT.md](CORPUS-CEILING-REPORT.md) (§0 addendum).

---

## Status — v1.2.1 committed + tagged + pushed (100.000% adjusted); npm: root+pure 1.2.0 LIVE, 1.2.1 + preprocessor 1.1.0 need one OTP publish each

- **v1.2.0** (root) / **1.2.0** (pure) / **1.1.0** (preprocessor) — 11 commits over
  v1.1.2, tagged `v1.2.0`, pushed to origin/master.
- **npm publish blocked on auth** (`npm whoami` → E401), exactly like v1.1.2 was:
  ```
  npm login
  cd C:\Projects\tree-sitter-delphi13      && npm publish
  cd C:\Projects\tree-sitter-delphi13\pure && npm publish
  ```
  (Optionally also `preprocessor/` if publishing `delphi13-preprocessor` separately.)
  NOTE: registry still has root 1.1.1 / pure 1.1.0 — v1.1.2/1.1.1 were never
  published; v1.2.0 supersedes them.
- **drag-lint DLLs rebuilt from the v1.2.0 parser and all 9 live copies refreshed**
  (see the INBOX note in their repo). They preprocess by default (PP-Task-9), so
  they benefit from the whole orchestrated stack once they port the preprocessor
  changes.

## Numbers at v1.2.0 (zero regressions at every step)

| path | v1.1.2 | v1.2.0 |
|---|---|---|
| orchestrated raw | 99.503% (82 fails) | **99.770% (38)** |
| master raw | 98.443% (257) | **98.588% (233)** |
| deduped + Delphi-13-only | 99.761% (27 rows) | **99.965% (4 rows)** |

The 4 remaining real rows: System.pas ×2 (needs the `platform = $x` declVar arm —
**table bomb**, bisect-confirmed; a `typeref`-trailing-`platform` angle is untried),
D3D10 ×2 (`Register:` field — documented not-worth-it).

## What landed (11 commits) — full detail in TODO.md session table

preprocessor: include-defines propagation (expand mode) · nearest-first include
search · BOM strip incl. spliced includes · MASM `"…"` asm-string lexing ·
**dcc-tolerance pass** (opt-in `tolerances:true` — inserts the `;` dcc imagines;
closed the directive-tail AND array-last-field clusters textually).
grammar (root+pure): implicit `begin..end.` init · `trailingText` · `genericArgTpl`
· ctrl-chars-as-whitespace · **label as then/else/do body** (prec.dynamic keeps
case-arms winning) · **lenient directive tail in interface lists** (strict/lenient
split via `declProcFront($)`; defProc stays strict).
harness: UTF-16 BOM sniff · POSIX define profile for `\rtl\posix\`.

## Gotchas for a cold start

1. Rebuild both `build/Release/*.node` and `pure/build/Release/*.node` before
   trusting measurements; drag-lint DLLs never auto-rebuild.
2. 573 `error`-key rows in scan results are intentional exclusions; dedupe
   case-insensitively (17,081 rows = 11,722 files).
3. 3 corpus-test failures are pre-existing (`pp_block`); `declProcFwd`
   unnecessary-conflict warning on generate is pre-existing and harmless.
4. **Generate table bombs**: new roles for keywords that already have several
   (kPlatform in declVar), or pulling the `genericTpl`/`_genericName` web into new
   contexts → 20-min generates (abort + redesign). Healthy generate ≈ 4–5 min.
   The session's successful restructures each needed only NAMED conflicts —
   if generate demands a hidden `_repeat` rule, that design is dead.
5. tree-sitter regex: `[\s\S]*` compiles to an empty match — use `(.|\s)*`.
6. Root and `pure/` grammars are hand-maintained in lockstep; port every fix.
7. Do NOT regenerate `work/manifest-baseline.txt` from `tools/corpus-roots.txt`
   (drops ORM3; backup at `work/manifest-baseline-2026-05-24.bak`).

## Open items

- `tools/corpus-roots.txt` publish policy (starter vs real roots) — deliberately
  undecided.
- Corpus expansion (mORMot/JCL/TMS) — the proven way to surface unknown gaps.
- drag-lint: port the 5 preprocessor changes (their Delphi port must stay
  oracle-diff green); consider enabling a tolerance-pass equivalent.
