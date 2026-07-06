# TODO

Living list of follow-up work. Items move from here to commits or to FUTURE.md as they're addressed or deferred.

## Current focus

- [ ] **Push orchestrator past 99% on full corpus.** Currently at 98.43% (master: 98.22%). 65 master-pass-but-orch-fail regressions remain — mostly Indy .NET .dpk patterns, EurekaLog defaultValue IFDEF chains, Embarcadero RTL files with specific defines needs. Each defines-tuning iter recovers 10-30 files.

- [ ] **Tighten declared() resolution.** Currently returns false (no symbol table). Files using `{$IF declared(SymName)}` get the wrong branch. Lightweight symbol pre-scan (TYPE/CONST/VAR/FUNCTION/PROCEDURE declarations in the same unit) would close most cases.

- [ ] **Include-file resolution beyond same directory.** Some `{$I X.inc}` references live in sibling directories; need a search-path option per project.

## Statement-level grammar gaps (found 2026-07-06 via Delphi-RAG-lint indexing)

Surfaced while indexing `Delphi-RAG-lint/src/cli/DRagLint.CLI.pas` (a real, compiler-clean
unit). These are **grammar rule gaps**, a different class from the defines/orchestrator work
above — specific *valid* Delphi-13 constructs that the master grammar errors on mid-file. Each
undercuts the "parses ~99.9% of real code" claim at the statement level, and a recovering
error still drops the local symbols in that scope from a consumer's index.

**FIRST STEP before any grammar edit — rule out staleness.** The DLL shipped in Delphi-RAG-lint
(`third_party/dll-win64/tree-sitter-delphi13.dll`, dated **May 29**) is OLDER than the current
grammar HEAD (**June 7, v1.0.0**). Rebuild the DLL from current `master`, drop it into the lint
project, and re-index CLI.pas — some of the reported errors may already be fixed. Only the gaps
that still reproduce against a freshly-built parser are real.

Verified against the CURRENT grammar (`npx tree-sitter parse`, tree-sitter 0.24.7), isolated:

- [x] **FIXED 2026-07-06: inline `var` with an anonymous `array of T` type.**
  `var Y: array of Integer;` errored (ERROR at the `array of` span). Root cause: BOTH inline-var
  rules — `varDef` (no initializer) and `varAssignDef` (the `var X: T := e` initializer form,
  LHS of `assignment`) — restricted their type slot to a bare `$.typeref`, so any anonymous type
  (`array of T`, record, enum) was rejected. Fix: widened both type slots to
  `choice($.type, $.subrangeType)` — the same production the var-section `declVar` already uses.
  **Critical gotcha (cost one regressing corpus run):** the two rules share the `var X: <type>`
  prefix, so widening only `varDef` made the GLR parser mis-disambiguate and regress 156 files
  using the far more common `var S: string := expr;` form. They MUST be widened in lockstep.
  Verified: minimal repro clean; `DRagLint.CLI.pas` array-of-T hits (1091/1092/1100) clean
  (CLI.pas leaf errors 39 -> 4); full corpus 0 regressions, +2 files (IBX.IBScript.pas
  `var oldParams: Array of Variant;`), 98.240% -> 98.257%. Regression tests in
  `test/corpus/inline-var.txt`. Staleness ruled out first: committed `src/parser.c` was already
  current with `grammar.js`, and the gap reproduced against a freshly-generated parser.

- [ ] **NOT a gap (hypothesis debunked, recorded so nobody re-chases it):** dot-qualified type
  names in a var decl (`Resolver: DRagLint.Project.Resolver.TProjectResolver;`, and 2-level
  `R: System.SysUtils.TStringHelper;`) both parse CLEAN in the current grammar. Confirmed again
  2026-07-06 — a dotted-name line parses clean both alone and inside a full var block once the
  actual trigger (below) is removed. The reported line was downstream error-recovery noise.

- [ ] **ISOLATED GAP (2026-07-06): declaration-hint keyword as a var name after a prior decl.**
  This is the true root cause of the CLI.pas 8236/8293/8362/8398 quartet (the array-of-T fix
  cleared the OTHER 35 of CLI.pas's 39 leaf errors; exactly these 4 survive). The failing region
  is `ResolveConsumerDbs`'s var section, which declares a variable named `Platform`. Minimal repro:
  ```pascal
  procedure P;
  var
    X: string;
    Platform : string;   // <-- ERROR here (col 11), NOT on X
  begin
  end;
  ```
  Mechanism (from the parse tree): after the first `declVar` (`X: string`), the parser greedily
  consumes `Platform` as a trailing `procAttribute (kPlatform)` declaration hint on `X` (the
  `CmdShow: Integer platform;` production), then chokes on the dangling `: string;`. `Platform`
  as the FIRST decl in the section parses clean — the ambiguity only bites mid-section. Same bug
  for the other two hint keywords used as var names after a prior decl: **`Deprecated`** and
  **`Experimental`**. Likely fix: add `kPlatform`/`kDeprecated`/`kExperimental` to `declVar`'s
  name-alias list (like the existing `kMessage`/`kName`/`kDefault` aliases) AND/OR make the
  trailing-hint slot require the hint not be followed by `:` — but this is a delicate GLR area
  (the hint and the next-var-name genuinely collide), so verify against the full corpus with a
  pre/post diff exactly as the array-of-T fix did. NOT bundled with the array-of-T fix.

## Near term — finish the orchestrator

- [ ] **Reach 99%+ on full corpus.** Realistic ceiling once defines are tuned: ~99.5% (the last ~50 files are intentional broken-test cases, vendor source typos, files with `{$IF declared(...)}` that need full symbol awareness, and a handful of pathologically large auto-generated TypeLib units).

- [ ] **What does NOT count toward 100%:**
  - Inline `asm` blocks (treated as opaque text — by design, this isn't tree-sitter-asm).
  - Files with actual Delphi-compiler syntax errors (DUnitX has intentionally broken test cases; DevExpress has a couple of vendor `;` typos).
  - C-language code mistakenly placed in `.pas` files (fibplus TREES.PAS has literal `#if defined(...)` C preprocessor lines).

## Publishing plan (once we hit ~99%)

- [ ] **Publish `tree-sitter-delphi13` to npm.** The master grammar (98.22% self-contained THEN-wins parser).

- [ ] **Publish `tree-sitter-delphi13-pure` to npm.** The simpler sub-grammar that drops `pp_*` tokens — paired with the preprocessor.

- [ ] **Publish `delphi13-preprocessor` to npm.** Standalone text-transformation tool with the directive resolver. Can be consumed by other tools (formatters, refactoring tools, language servers).

- [ ] **Publish `tree-sitter-dfm` to npm.** Companion DFM/FMX form-file grammar (already 100% on real text-DFM).

- [ ] **Reach out to [Isopod / tree-sitter-pascal](https://github.com/Isopod/tree-sitter-pascal)** about the architectural pattern. The preprocessor + pure-grammar split is portable to their grammar — would let them break past their current pp_block-driven ceiling. Offer either a PR upstreaming our pattern OR coordinate a shared `pascal-preprocessor` package both projects consume.

## Optional companion packages (deferred)

- [ ] **delphi13-ifdef-resolver** — post-pass that recovers ELSE-branch parses for tools that need both. See [FUTURE.md](FUTURE.md) for the design (Approach 3 = `ts_parser_set_included_ranges`).

- [ ] **tree-sitter-delphi-plus-fp** — FreePascal-aware variant sharing the preprocessor and pure-grammar core. Separate repo so FP-specific extensions never leak into the Delphi-first quality of this one.
