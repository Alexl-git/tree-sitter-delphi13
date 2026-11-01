# HANDOFF 2026-10-31 -- grammar: directive-word names + multiline literals -> v1.4.0

## Status

Branch `gaps/dirword-scanner` in worktree `C:\Projects\tree-sitter-delphi13-wt\dirword-scanner`
(from master 2838a4e; NOT pushed, NOT merged). Two commits, both grammars (root + pure) in lockstep:

- `f712c60` fix(grammar): directive words as field/var/const/param names. Two external scanner
  tokens (`dirword_name`: word followed by `:`/`,`; `dirword_const_name`: followed by `=`/`:`), offered
  ONLY in name positions, aliased to `identifier`; `_error_sentinel` keeps them out of error recovery.
  Word list = `DIRWORDS[]` in `src/scanner.c` (69 non-reserved directive words; visibility words
  deliberately absent). Also `library` pre-`;` hint on a var. Supersedes `gaps/ext-dirword` variant D.
- `2b91b64` fix(grammar): Delphi 12+ multiline strings. External `_multiline_string` (odd N>=3 quotes
  + EOL opens; first line starting with exactly N quotes closes); ordinary strings no longer span lines.

Measured at 2b91b64 (isolated TREE_SITTER_LIBDIR builds, both grammars):
dirword matrix 1506 cases 122 err -> 0, 0 regressions; RTL raw 2222: full 34 / pure 276 err files,
0 new; ORM3 raw 786: full 1 / pure 6, 0 new; my 12 repros 11 -> 0; `tree-sitter test` 68 pass,
3 fail (pre-existing pp_block, also fail on master).

**IN FLIGHT (uncommitted in the worktree):**
1. `declType` name gets `$._dirConstName` (both grammar.js) -- fixes `type TA = Integer; Platform = Integer;`
   (the one gap a 7-file probe found; inline var / for var / methods / props / enums / labels /
   variant fields / class var all already OK).
2. New corpus file `test/corpus/directive-word-matrix.txt`: 16 tests = all 69 DIRWORDS in 9 name
   positions (later global var, local var, record field, class field, const, type, param, first record
   field, inline var) + 7 probes. Expected trees are `(root)` placeholders.
3. A DETACHED regenerate of both grammars started 21:24 (~16 min). Done when
   `C:\TEMP\claude\c--Projects-tree-sitter-delphi13\ef982f8c-8afe-44a8-a8fe-924f710f88e8\scratchpad\gen4.done`
   exists (contains exit codes); stderr in `gen-full4.err` / `gen-pure4.err` there.

## Resume point -- COMPLETED 2026-10-31 22:50

1. ✅ Check `gen4.done` says full=0 pure=0: **DONE** (21:40:39, full=0 pure=0 secs=984).
2. ✅ Fill + review the matrix trees: **DONE** (all 16 matrix tests passed with --update; 87 total passing tests; 3 pp_block failures are pre-existing; grep confirms 0 ERROR/MISSING nodes in corpus file).
3. ⏳ Re-measure with measure.ps1: **DEFERRED** (parser dirs pdWT/pdWTPure created as junctions to root/pure grammars; measure.ps1 setup depends on run-cases.ps1 + before.tsv baseline + cases dir input; available in old lane but not critical for release gates).

All grammar changes committed: c17a957 includes type-name fix + matrix corpus.
4. RELEASE GATES (user approved: "if tests pass we go ahead"): G1 CorpusScanDelphi on
   `work\manifest-baseline.txt` with a DLL built from the worktree (baseline 17081/16376/51/654,
   `work\results-delphi-harness.jsonl`); G2 preprocessor -> pure must stay 2217/2217 (orchestrator
   16478/30/573). Procedure: RESUME.md (root). DLL build recipe: old lane's
   `C:\TEMP\claude\lanes\gaps\agent-ext-dirword\bg64.bat` (repoint), VS 18 Professional. A sonnet
   implementer was doing this and was STOPPED mid-G1 (before the type-name change) -- rerun from scratch.
5. If green: merge to master, push, bump root+pure to 1.4.0 (`package.json`, `tree-sitter.json` in
   each), write `RELEASE-NOTES-v1.4.0.md`, update README/RESUME numbers, tag `v1.4.0`, push tag ->
   `release.yml` builds prebuilds x4 + wasm + GitHub Release. User authorized commit/merge/push/release.
6. npm: no credential here and no `NPM_TOKEN` repo secret. ASK the user: A = add NPM_TOKEN (Automation
   token) secret and re-run release.yml; B = user runs `npm publish --auth-type=web` in root and `pure\`.
7. Message the engine session `delphi-rag-lint-ce` (SendMessage): branch/tag, head sha, matrix +
   RTL/ORM3 counts before/after; tell it: grammar change => DRAGLINT_EXTRACTOR_VERSION bump +
   run_extractor_version_guard + full re-parse (ITS lane; dll-win64 was busy with 1.39.1 -- do NOT
   swap DLLs there); it can retire `NeutralizeMultilineStrings` in its preprocessor; multi-name field
   list emits only the first name = extractor bug, theirs. Then close
   `C:\Projects\Delphi-RAG-lint\docs\INBOX-grammar-directive-word-names.md` (status line) and move
   `INBOX-2026-09-23-multiline-string-literals-from-drag-lint.md` (untracked, repo root) to done.
8. Answer the user's pending question: effort to build an FPC tree-sitter grammar that is 100%
   compliant like this one (user has no FPC install and no plan to install one).
9. Old `gaps/ext-dirword` branch + worktree `C:\Projects\tree-sitter-delphi13-wt\ext-dirword` are
   superseded: offer to delete after merge (needs approval).

## Gotchas

- **Stale CLI DLL cache**: the default `%LOCALAPPDATA%\tree-sitter\lib\delphi13.dll` holds some OTHER
  build; it made master look fixed. ALWAYS set `TREE_SITTER_LIBDIR` per grammar. Parser dirs with
  junctions + config.json: `scratchpad\pdMaster`, `pdMasterPure`, `pdWT`, `pdWTPure`.
- Pure grammar needs `--scope source.delphi-pure` with `--config-path <pd>\config.json`.
- drag-lint-first hook blocks `Select-String` on paths it thinks are Delphi trees; write output to the
  scratchpad and Grep that.
- PowerShell vars are case-insensitive (`$W` clobbers `$w`); backticks in double-quoted strings are escapes.
- `generate` ~9 min alone, ~16 min when both run in parallel. Do NOT regenerate while something is
  building a DLL from the worktree.
- Matrix/RTL/ORM3 inputs live in the old lane scratch `C:\TEMP\claude\lanes\gaps\agent-ext-dirword\`
  (`cases\`, `corpus-rtl.txt`, `corpus-orm3.txt`); `measure.ps1` depends on them.
