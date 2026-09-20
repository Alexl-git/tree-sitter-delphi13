# RESUME - tree-sitter-delphi13

## >>> RESUME HERE - 2026-09-20: v1.3.0 SHIPPED; ZED AWAITS A MANUAL TEST

**NEXT ACTION (blocked on the user, expected Wed/Thu 2026-09-24 or 25):**
run `editors/ZED-TESTING.md` end to end in Zed. Nothing else in the Zed track
moves until that is done, because Zed's registry requires the extension to be
tested manually at the commit being submitted.

**When the test passes, file BOTH of these as a pair (do not send one alone --
the second discloses the first, and is false until the first exists):**
1. `ZED-SUBMISSION.md` -- PR to `zed-industries/extensions` (submodule +
   `extensions.toml` entry with `path = "editors/zed"`, then `pnpm sort-extensions`).
2. `ZED-PASCAL-OUTREACH.md` -- issue on `ChemisTechlabs/zed-pascal`.

Then, in order: Cursor forum post (**user only** -- web login, I cannot reach it;
text is in `UPSTREAM-vscode-tree-sitter-wasm.md`), the VS Code PR (same file;
needs the user's Microsoft CLA signature, lowest-confidence item), and finally a
VS Code extension, which is the only real path to Delphi support there.

### What shipped today

* **npm published and round-trip verified** (installed from the registry and
  loaded through `web-tree-sitter`, not merely packed):
  `tree-sitter-delphi13` **1.3.0**, `tree-sitter-delphi13-pure` **1.3.0**,
  `tree-sitter-dfm` **1.1.0**. `delphi13-preprocessor` unchanged at 1.1.0.
* **WASM ships** in all three (ABI 14). Emscripten must be pinned to **3.1.64**;
  `emsdk install latest` yields glue code that fails at load time, not build
  time. See `WASM-BUILD.md`.
* **Query set complete**: 18 files. New this session: `tags.scm`, `folds.scm`,
  `brackets.scm`, `textobjects.scm`, plus Neovim and Helix indent variants.
* **CI added and green** in both repos; builds the WASM and compiles every query
  against it.
* **GitHub Releases** created for both, with prebuilds + `.wasm` attached.
* **`release.yml` fixed** -- see Gotchas.
* **`editors/INSTALL.md`** -- Neovim, Helix, Zed, Emacs, VS Code/Cursor, drag-lint.
* **Zed extension now registers drag-lint as a language server**
  (`editors/zed/src/delphi13.rs`). Compiles clean for `wasm32-wasip2`.
  **Never run inside Zed.**
* **Isopod outreach letter sent by the user** to `Isopod/tree-sitter-pascal`.

### Coverage, settled

Measured on the 2,218 `.pas` of the RAD Studio 37.0 tree, same manifest both ways
(`work/results-embarc-master.jsonl`, `work/results-embarc-orch.jsonl`):

| Path | ok / readable | rate |
|---|---|---|
| Master grammar alone | 2183 / 2217 | 98.47% |
| preprocessor -> pure | 2217 / 2217 | **100.000%** |

Exactly one master-path failure survives the pipeline and it is
`FMX.WebBrowser.Win.pas`, scored `template_placeholder` -- an excluded category,
not a parse failure.

**Which number applies depends on the consumer, and this matters in every pitch:**
a stock editor (Zed, Neovim, Helix) loads ONE grammar and gets 98.47%. Only a
consumer that can run the preprocessor first reaches 100%. `delphi13-preprocessor`
is pure JS and the pure grammar ships as WASM, so the 100% pipeline DOES run in an
Electron host -- which is the strongest argument available for VS Code and Cursor,
and is NOT available to Zed. Do not promise Zed 100%.

DFM: 9,681 files scanned, 705 binary/resource-form (out of scope), 8,976 text,
**99.18%**, and all 74 failures traced to malformed input. Zero grammar defects.

### Gotchas that will bite a cold start

* **No inline regex flags in `.scm`.** Native tree-sitter uses the Rust regex
  crate; `web-tree-sitter` uses JavaScript `RegExp`, which rejects `(?i)` and
  takes the WHOLE query file down silently. `injections.scm` shipped that way for
  three releases and the CLI never complained. Always
  `npm run build-wasm && npm run validate-queries`.
* **`tree-sitter query` picks the grammar from the sample file's EXTENSION**, not
  the working directory -- so it will validate `pure/queries` against the full
  grammar and report success. Only `tools/validate-queries.js` is trustworthy.
* **Indent queries are not portable.** Zed `@indent/@start/@end`; Neovim
  `@indent.begin/.end/.branch`; Helix `@indent/@outdent`. The top-level
  `indents.scm` is Zed's -- it is a silent no-op in Neovim. Variants live in
  `queries/nvim/` and `queries/helix/`.
* **`macos-13` is retired and starves.** It hung the v1.2.2 and v1.3.0 release
  runs until the 24h ceiling cancelled them, which is why neither produced a
  Release automatically. Removed from the matrix; darwin-x64 is now
  cross-compiled on `macos-latest` via `prebuildify --arch x64`. **That path has
  never actually run** -- watch the next tagged release.
* **darwin-x64 is missing from the v1.3.0 GitHub Release** (built by hand from
  artifacts rescued off the cancelled run). Stated in the release notes.
* **`npm install --ignore-scripts` breaks the tree-sitter CLI**: the package ships
  only a downloader in its install script, so no binary appears. CI does
  `npm rebuild tree-sitter-cli` -- and `pure/` needs its own.
* **Three pp_block corpus tests fail** and are pre-existing; `tree-sitter test` is
  therefore not wired into CI.
* **Rust 1.98.1 + `wasm32-wasip2`** installed 2026-09-20 under `~/.cargo`
  (`--no-modify-path`). Needed for Zed to build the extension. The old note
  saying wasip1 was wrong.

### Uncommitted, deliberately

* `ISOPOD-OUTREACH-DRAFT.md` -- the user's own edits (signature + a P.S.) made
  after posting it. Worth committing.
* `tree-sitter-DFM/RELEASE-NOTES-v1.0.0.md` -- a stale edit from an earlier
  session, not from this work.

### Security follow-up

**STILL LIVE AS OF 2026-09-20 -- the user confirmed it was NOT revoked.** An npm
**granular access token with "Bypass 2FA" enabled**, read+write on the three
`tree-sitter-*` packages, was created to publish v1.3.0. It sits in plaintext in
`~/.npmrc` AND in PowerShell history
(`%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`).

Bypass 2FA means anyone holding it can publish to those packages without an OTP.
Revoke at https://www.npmjs.com/settings/alexanderl2/tokens (delete the
`release-2026-09*` entries). Only revocation on the website invalidates it --
deleting the local copy reduces exposure but the token stays valid.

If it expired on its own (a 7-day expiry was suggested at creation), confirm that
on the same page rather than assuming.

---

## >>> v1.2.2 FULLY PUBLISHED — DONE 2026-07-17 #5

Released v1.2.2 (JEDI/JVCL corpus + 3 grammar-gap fixes). Commit 2f1e844, tag
v1.2.2 pushed. **GitHub Release v1.2.2 LIVE** with 4 assets: root+pure 1.2.2 tgz,
JS `delphi13-preprocessor-1.1.0.tgz`, AND the canonical **Delphi** preprocessor
source `delphi13-preprocessor-delphi-1.2.2.zip` (6 drag-lint `src/preprocess/*.pas`
units + README). **npm: `tree-sitter-delphi13` 1.2.2 + `tree-sitter-delphi13-pure`
1.2.2 are LIVE** (user published w/ OTP 2026-07-17); `delphi13-preprocessor` 1.1.0
unchanged/already live. Nothing pending. drag-lint still needs to rebuild their
production DLL — see `Delphi-RAG-lint/docs/INBOX-tree-sitter-jedi-jvcl-grammar-fixes.md`.

## >>> JEDI/JVCL CORPUS + 3 GRAMMAR-GAP FIXES — DONE 2026-07-17 #4

User asked to scan JEDI+JVCL (were NOT in the corpus), fix the gaps found, add
them permanently. Result:
- **3 grammar gaps fixed** in BOTH `grammar.js` (full) and `pure/grammar.js`,
  each dcc32-confirmed valid Delphi 13, each a minimal keyword-alias / narrow
  form (no table bomb; generate 4m18s full / 3m58s pure):
  1. subrange bound = nested const-expr call `2..Succ(High(TV))` (JclSysUtils);
  2. `inherited At(...)` — `at` soft keyword as inherited method name (JclCLR);
  3. `Operator:` as a class/record FIELD name (JvXmlDatabase) — alias kOperator.
- **Verification (zero regression everywhere):** tree-sitter test 52 pass / 3
  pre-existing pp_block fails; 3 new corpus tests added. Full grammar (rebuilt
  DLL) baseline 16376/51/654 IDENTICAL; JEDI/JVCL 14917->14921 (the 4 gap files
  fixed, 0 regressed). Pure grammar orch baseline 16478/30/573 IDENTICAL.
- **JEDI+JVCL added to `tools/corpus-roots.txt`** (durable); regenerated
  `work/manifest.txt` = 23,385 deduped files -> full scan 22467 ok / 364 fail /
  554 skip (364 = excludable long tail: JvInterpreter scripts, jpp-macro
  sources, archive, .NET, define-profile artifacts).
- Rebuilt DLL is at `tools/corpusscan/Win64/Release` ONLY (old = `.dll.bak-jul16`);
  drag-lint's production `third_party/dll-win64` copy NOT touched (their call).
  Node bindings (root+pure) rebuilt. See [[jedi-jvcl-corpus-gaps]].

## >>> USER'S IMMEDIATE NEXT ACTION (2026-07-17 #2) — DONE 2026-07-17 #3

All three steps completed. Next real work = the ALL-DELPHI MIGRATION section below.

1. **VERIFIED — 100% still holds.** Re-ran `CorpusScanDelphi` (Win64\Release exe +
   staged delphi13 DLL) against `work\manifest-baseline.txt` →
   `SUMMARY total 17081, ok 16376, fail 51, skip 654` — **byte-identical** to the
   recorded `work\results-delphi-harness.jsonl` (0 differing lines; fresh out =
   `work\results-delphi-verify.jsonl`). Second confirmation: `git diff v1.2.1..HEAD`
   touches only CI/docs/JS-tolerance — **no `grammar.js`/`src\parser.c` change**, so
   the v1.2.1 100.000%-adjusted ceiling is definitionally preserved. The 51
   all-Delphi-harness fails are the known in-flight set (EurekaLog/fibplus/Indy/
   Orpheus include-body-splice by-design + YADF/jcf/Loader2019 fixtures & non-D13).
2. **PUBLISHED.** The v1.2.1 GitHub Release already existed (published
   2026-07-16); it had **no assets**. Attached `delphi13-preprocessor-1.1.0.tgz`
   (`npm pack` of `preprocessor/`) and appended a "For JavaScript users" section to
   the release body pointing JS consumers at it. `gh release view v1.2.1`.
3. **README fixed.** 100.000% figure already correctly placed (badge/headline/
   table). Added to the `delphi13-preprocessor` row: canonical preprocessor is now
   the pure-Delphi port (in drag-lint); JS package = byte-for-byte oracle + drop-in
   for JS consumers. Committed.

Note: npm state — root+pure **1.2.0 LIVE**; **1.2.1 + delphi13-preprocessor 1.1.0
still need one OTP publish each** (user runs `npm publish ... --auth-type=web`).
drag-lint repo has **6 local unpushed commits** (the team's call to push) incl. the
tolerance.pas port; INBOX `Delphi-RAG-lint/docs/INBOX-tree-sitter-preprocessor-fully-ported.md`
tells them to review + push.

---

## >>> ALL-DELPHI MIGRATION (IN FLIGHT 2026-07-17) — read this section second

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
