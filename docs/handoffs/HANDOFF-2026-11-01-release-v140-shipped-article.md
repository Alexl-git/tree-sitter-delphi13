# HANDOFF 2026-11-01 -- v1.4.0 shipped; tree-sitter article delivered to www

## Status

- **v1.4.0 SHIPPED** (directive words as names + Delphi 12+ multi-line strings, both grammars).
  master `12088ad` = tag `v1.4.0`, pushed by the user. `release.yml` green (test, 3x prebuild,
  release). GitHub Release v1.4.0 is Latest, with 4 assets. npm `tree-sitter-delphi13` and
  `tree-sitter-delphi13-pure` 1.4.0 are `latest`; both were installed from the registry and
  smoke-parsed OK.
- Gates (file by file, 0 regressions): directive-word matrix 1506 cases, 122 -> 0 error files;
  RTL raw 2222 full 34 / pure 276 unchanged; ORM3 786 full 1 / pure 6 unchanged; CorpusScanDelphi
  17081 = 15979/50/1052 vs a same-day master-DLL run: 0 worse, 2 better; preprocessor -> pure,
  embarc 2218: 2217/2217, 0 per-file changes. Details: root `RESUME.md` top section and
  `RELEASE-NOTES-v1.4.0.md`.
- drag-lint engine (`delphi-rag-lint-ce`) is notified. It integrates 1.4.0 in its NEXT release
  (DLL rebuild + extractor bump + retire `NeutralizeMultilineStrings` + multi-name field fix, one
  re-parse); the owner decides when. Filed for it:
  `C:\Projects\Delphi-RAG-lint\docs\INBOX-extractor-multi-name-field-list.md`. Closed:
  `INBOX-grammar-directive-word-names.md`. Moved: the multiline INBOX -> `docs\inbox\done\`.
- Website article written and handed to the www session (`www-9b`), uncommitted:
  `C:\Projects\Delphi-RAG-lint\WWW\articles\2026-11-01-what-tree-sitter-is\index.html`
  (what tree-sitter is, how drag-lint uses it, why only a preprocessor reaches 100%).
  `build.ps1` exit 0. www reviews, builds and publishes on the owner's go.
- Old worktree `..\tree-sitter-delphi13-wt\ext-dirword` removed (it was clean).

## Resume point

Nothing in flight. Small items left for the user:

1. `git branch -D gaps/ext-dirword` (approved by the owner; autonomous mode blocks `-D`).
2. Optional: give the release a descriptive title:
   `gh release edit v1.4.0 --title "v1.4.0 - directive words as names, Delphi 12+ multi-line strings"`.
3. Optional cleanup: the merged branch `gaps/dirword-scanner` + worktree
   `C:\Projects\tree-sitter-delphi13-wt\dirword-scanner`; and the local `prebuilds.old-20261031225714\`
   folder (pre-1.4.0 prebuilds, set aside, not deleted).

## Not done yet

- **FPC/Lazarus grammar: deferred by the owner (2026-11-01).** Estimate given: 2-4 months. Main
  costs: FPC macros (`{$MACRO ON}`, `{$DEFINE X := ...}`) break the offset-identity preprocessor
  design; `{$mode}` dialects (objfpc generic/specialize, operators, bitpacked, objc); AT&T asm;
  many target profiles; no compiler to define "valid". First step when it resumes: download the
  FPC + Lazarus source, run the current grammar over it, sort failures by cause (about 1 hour).
- Zed PR zed-industries/extensions#7710 is still awaiting a Zed reviewer (no action on our side).

## Gotchas

- **Autonomous mode** blocks push, `npm publish`, `branch -D` and `gh release edit`. The user ran
  push/publish themselves. Publish recipe that worked: `gh release download v1.4.0`, extract both
  prebuilds tarballs into `prebuilds\` and `pure\prebuilds\`, copy both `.wasm`, then the user runs
  `npm login` + `npm publish` in the root and in `pure\` (browser auth). The registry shows the new
  version a few minutes after the publish.
- The recorded 16376/51/654 CorpusScanDelphi baseline no longer reproduces on this machine (+398
  skips = files gone). Always diff against a same-day master-DLL run.
  Gate scripts: `C:\TEMP\claude\c--Projects-tree-sitter-delphi13\ef982f8c-8afe-44a8-a8fe-924f710f88e8\scratchpad\gates\`
  (bg64.bat = full DLL from the worktree, bg2.bat = pure node binding by hand, because node-gyp
  cannot find VS 18; cmp.js = per-file jsonl diff, strips the BOM).
- `HANDOFF-2026-10-31-NEXT-RELEASE-GATES.md` has two errors: it says to stage the DLL into drag-lint's
  `dll-win64` (never do that; that is drag-lint's lane), and it says FPC has no `{$IFDEF}` (it does).
