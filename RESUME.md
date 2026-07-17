# RESUME — tree-sitter-delphi13

## >>> ALL-DELPHI MIGRATION (IN FLIGHT 2026-07-17) — read this section first

User directive: "get rid of JS, preprocessor 100% only Delphi." State at handoff:

**DONE (committed):**
- tree-sitter `e92e158`: JS tolerance switched to REPLACEMENT semantics
  (offset-identity; corpus outcome identical 16,478 ok) — the frozen reference.
- drag-lint `260dd7d`: **tolerance.pas port COMPLETE** — the Delphi preprocessor
  now has ALL 5 v1.2.1 changes. All 13 preprocess suites green.
  `run_tolerance.ps1` = the FIRST node-free suite (byte-compares against frozen
  `fixtures/tolerance/*.expected` snapshots) — the template for de-JS-ing the rest.
- drag-lint `dabd499`: **CorpusScanDelphi** (tools\corpusscan) — all-Delphi
  harness (lenient Node-parity encoding; defines-only includes; --tolerances;
  full delphi13 DLL), 17,081 rows in ~137s.

**NEXT ACTION (the exact spot):** diff `work\results-delphi-harness.jsonl`
(ok 16,376 / fail 51 / skip 654) against the JS reference
`work\results-orch-tolrepl.jsonl` (16,478 / 30 / 573) with the session's node
differ pattern (join per-file, categorize error-class changes). Remaining deltas:
(a) skip +81 — re-categorize after the lenient-decode fix (was read/threw);
(b) fail +21, of which ~12 are the include-BODY-splice class (EurekaLog
ESendAPI*/EConsts/EUnmangling, fibplus VariantRtn, Indy idassemblyinfo +
iddsnsasllisteditorformnet, Orpheus ovcspary) — JS 'expand' spliced content
includes (const lists / routine bodies); Delphi is deliberately defines-only
(offset-identity). POLICY DECISION NEEDED: accept+document as the harness
semantic (recommended) or add measurement-only expansion. Gate: no JS-pass may
fail without a recorded reason.

**THEN:** (1) convert the 4 render.js-calling suites (asm_quotes, include_modes,
include_resolve, preprocess_core/oracle_corpus) to frozen snapshots per the
run_tolerance template; (2) JS decommission in THIS repo: label `preprocessor/`
as frozen reference, remove delphi13-preprocessor from `.github/workflows/
release.yml` npm-publish step + publishing plans, README note ("canonical
preprocessor is Delphi, in drag-lint"); (3) new corpus numbers = Delphi-harness
numbers going forward; (4) INBOX note to drag-lint + memory update.

**Gotchas:** drag-lint repo = git, branch `main`, has origin (my 2 commits are
LOCAL; pushing is the drag-lint team's call). Their 3 dirty files (BACKLOG.md,
dclDragLintWizard.*) are THEIR pre-existing changes — do not touch. Delphi
TEncoding is STRICT where Node is lenient (the harness has LenientUtf8Decode /
SafeUtf8Encode for parity — reuse them). TTSParser.ParseString raises on ''.
Build recipes: scratchpad bats (build-draglint-cli.bat, build-corpusscan.bat)
via PowerShell Start-Process; stage drag-lint.exe to third_party\dll-win64.

---

Cold-start pointer. Written 2026-07-16 (c) — v1.2.0 release state. Read this first,
then [TODO.md](TODO.md) (session table + remaining gaps) and
[CORPUS-CEILING-REPORT.md](CORPUS-CEILING-REPORT.md) (§0 addendum).

---

## Status — v1.2.1 committed + tagged + pushed (100.000% adjusted); npm: root+pure 1.2.0 LIVE, 1.2.1 + preprocessor 1.1.0 need one OTP publish each

- **v1.2.1** (root+pure) — tagged + pushed. **npm state:** root+pure **1.2.0 are
  LIVE** (user published with OTP); **1.2.1 and delphi13-preprocessor 1.1.0 are
  built and one OTP away each**:
  ```
  cd C:\Projects\tree-sitter-delphi13              && npm publish   (OTP)
  cd C:\Projects\tree-sitter-delphi13\pure         && npm publish   (OTP)
  cd C:\Projects\tree-sitter-delphi13\preprocessor && npm publish   (OTP)
  ```
  The preprocessor publish matters: the registry's 1.0.0 has a broken `bin`
  (files-whitelist omitted defaults.js; 1.1.0 fixes packaging + adds the include
  semantics + tolerance pass).
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

**v1.2.1 closed the last two**: System.pas ×2 via typeref-trailing-`platform` (the
declVar arm remains a documented table bomb — don't retry that shape) and D3D10 ×2
via a kRegister-only field-name alias. **Adjusted rate: 100.000% — zero real gaps.**
Final: orchestrated 99.818% raw (30 fails, all invalid/fixture/non-Delphi), master
98.612%.

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
