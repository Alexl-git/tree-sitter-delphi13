# RESUME — tree-sitter-delphi13

Cold-start pointer. Written 2026-07-16. Read this first, then
[TODO.md](TODO.md) (ranked gaps) and [CORPUS-CEILING-REPORT.md](CORPUS-CEILING-REPORT.md)
(every remaining failure, diagnosed).

---

## Status — v1.1.2 committed, tagged, PUSHED. npm publish NOT done.

- **Committed + tagged:** `d58fae3` = `v1.1.2` (root) / pure `1.1.1`. **Pushed to
  origin/master; tag `v1.1.2` pushed.** Working tree clean.
- **DLLs shipped to drag-lint:** rebuilt 2026-07-16 11:06, all **9 live copies**
  refreshed. Verified `DRagLint.CLI.pas` = 0 syntax errors.
- **drag-lint notified:** `C:\Projects\Delphi-RAG-lint\docs\INBOX-tree-sitter-grammar-dll-refreshed.md`
  (untracked in *their* git — they see it as a new file).

## THE ONE THING LEFT: npm publish

**Blocked on auth only.** `npm whoami` → `E401 Unauthorized`. Both packages are built,
version-bumped and dry-run verified:

| package | on npm | to publish |
|---|---|---|
| `tree-sitter-delphi13` | 1.1.1 | **1.1.2** (822.7 kB, 16 files) |
| `tree-sitter-delphi13-pure` | 1.1.0 | **1.1.1** (733.9 kB, 13 files) |

```
npm login
cd C:\Projects\tree-sitter-delphi13      && npm publish
cd C:\Projects\tree-sitter-delphi13\pure && npm publish
```

Nothing else is pending. Do NOT re-run the grammar work.

## Open decision — `tools/corpus-roots.txt` publish policy

`corpus-roots.txt` is a PUBLIC starter file with 6 roots. It does **NOT** reproduce the
real 11,722-file corpus, which also spans ORM3 (699), Indy (662), RADStudio12Demos (787),
Orpheus, dsharp, AsyncPro, DUnitX, EurekaLog, Loader2019, plus IDE registry paths from
`tools/delphi13-roots.txt` (`E:\CAD`, `CatalogRepository`).

**TRAP: regenerating `work/manifest-baseline.txt` from `corpus-roots.txt` alone silently
shrinks the corpus 17,081 → 12,889 rows and DROPS ORM3.** A backup of the good manifest is
at `work/manifest-baseline-2026-05-24.bak`.

Decide: (a) keep the starter public and record the real roots in a gitignored local file,
or (b) commit the full root list — which puts `C:\Projects\DB\ORM3`, `E:\OneDrive\...`,
`Loader2019\Backups` into a public repo. Left undecided deliberately.

## Numbers as of v1.1.2 (zero regressions)

| path | ok / readable | rate | gap |
|---|---|---|---|
| master (raw → full grammar) | 16,251 / 16,508 | 98.443% | 1.557% |
| orchestrated (preprocessor → pure) | 16,426 / 16,508 | 99.503% | **0.497%** |
| orchestrated, deduped | 11,259 / 11,322 | 99.444% | 0.556% |
| orchestrated, deduped + Delphi-13-only | 11,259 / 11,286 | **99.761%** | **0.239%** |

Own projects: drag-lint `src/` **100%** (139/139), drag-lint-graph **100%** (31/31),
ORM3 99.74% master / 100% orchestrated.

## Next actionable work (ranked) — target was 0.13%, reached 0.239%

From `TODO.md`. To reach ~0.13% needs ~16 more files:

1. **Chained adjacent IFDEF arms** — `{$IFDEF A}x{$ENDIF}{$IFDEF B}y{$ENDIF}` (the
   `{$ELSE}` form already parses). Was 5 files; **now 3** (the asm fix incidentally
   cleared EurekaLog `ECompatibility` + `EInject`). Best remaining lever.
2. **Implicit `begin..end.` init** — 4 files. Needs the unit-tail restructure below.
3. **Final directive group with no trailing `;`** — 3 DevExpress files. **VERIFIED valid**
   (dcc32 exit 0). Needs the directive-tail restructure below.
4. **Text after final `end.`** — 2 files (dcc only warns W1011).
5. **Nested generic in a method resolution clause** — 2 files. Root cause known:
   `genericArg`'s name is `delimited1($.identifier)`, bare identifiers only.

Judged NOT worth it: `Register:` as a record field (2 files vs parser-table blow-up);
`array[..] of T` as unterminated last field (+3/−2, lexical ambiguity GLR can't split).

## Gotchas that WILL bite a cold start

1. **Everything is stale-prone. Rebuild before trusting any measurement.**
   - `build/Release/*.node` **and** `pure/build/Release/*.node` — the corpus harness
     (`tools/parse-corpus*.js`) loads these. Run `npx node-gyp build` in **both** root and
     `pure/` after `tree-sitter generate`, or you measure the OLD grammar.
   - drag-lint's DLL never auto-rebuilds. Recipes:
     `C:\Projects\Delphi-RAG-lint\build\_buildgrammar{32,64}_manual.bat`. Run via
     PowerShell `Start-Process -Wait` **WITHOUT** `-NoNewWindow` (with it, the loop hangs
     after the first build). Then refresh all 9 live copies, platform-matched.
2. **Scoring trap.** `parse-corpus*.js` emits an `error` key for files it *intentionally
   excludes* (573: 410 `inc_fragment`, 154 `read_failed`, 7 `interpreter_fragment`, 2
   `template_placeholder`). Those are NOT parse failures. Score `ok / (total - excluded)`.
   Counting them as failures gives a bogus ~95%.
3. **The corpus double-counts unless deduped.** Fixed in `build-manifest.ps1`, but the
   committed `manifest-baseline.txt` predates the fix: 17,081 rows = 11,722 real files.
   Dedupe case-insensitively before quoting file counts.
4. **3 corpus-test failures are PRE-EXISTING** (`pp_block` external-scanner). Verified by
   stashing. Do not chase them as regressions.
5. **`Warning: unnecessary conflicts declProcFwd` on generate is PRE-EXISTING.** Verified
   against a pristine tree. Harmless.
6. **Two structural fixes were attempted and reverted** — read the inline notes at the
   `unit` rule and `_declProc` in `grammar.js` BEFORE retrying. Both cascade:
   - implicit init → conflict on `implementation` cascades into `_statementsTr` internals.
     The cheap fix (accept a bare `.`) makes the unit's `end` OPTIONAL → a genuinely
     missing `end` parses clean. Unacceptable for a linter consumer.
   - no-`;` directive tail → the with-`;` and no-`;` forms share their whole prefix; the
     fork lands between two AUTO-GENERATED hidden repeat rules that cannot be named in
     `conflicts`. Declaring the parent (`_declProc`) does not help.
7. **Trust `TODO.md`'s 2026-07-16 list over older prose.** Five stale records were
   corrected this session (2 gaps were already fixed; the L8398 diagnosis was wrong;
   dxServerModeUtils was wrongly called a source typo — dcc32 compiles it exit 0).
8. **Root and `pure/` grammars are hand-maintained separately.** There is no generator —
   every root fix must be ported to `pure/grammar.js` by hand.

## Unrelated findings handed to the user (not grammar bugs)

- `C:\Projects\Loader2019\uMICROLCK.pas` (457 B) and `uTIMEBRK.pas` (201 B) are
  **truncated on disk**, cut off mid-identifier. Possible lost content.
- `C:\Projects\MMSRV\uPipeCommon.pas` L1196 stray extra `end;`; `uPipes.Threads.pas`
  L1416/L1422 `Result := ;` ModelMaker stubs. Neither unit compiles.
