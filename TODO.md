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

- [ ] **NEW GAP (isolated 2026-07-06): `expr < SoftKeyword` misparses as generic instantiation.**
  Found while parsing the full `Delphi-RAG-lint` tree — `DragLint.Plugin.AutoComplete.pas` and
  `DragLint.Plugin.Editor.pas` each fail with a MISSING `>` (kGt), NOT an ERROR node (so the
  corpus first_error sampler shows null — check `missing_count`). Minimal repro:
  ```pascal
  procedure P;
  begin
    while (EolIdx < Read) do Inc(EolIdx);   // <-- MISSING kGt inserted
  end;
  ```
  `a < Foo` (ordinary ident RHS) is clean; `a < Read` / `a < Write` / `a < Name` misparse because
  the RHS is a SOFT KEYWORD (`kRead`/`kWrite`/`kName`, aliased to identifier). The `typerefTpl`
  generic production (`op.args(1, $._typeref, $.kLt, $.typerefArgs, $.kGt)`) wins the GLR conflict
  and treats `a<Read>` as a generic-args list, demanding `>`. Fix idea: raise precedence of the
  binary `<` comparison over `typerefTpl` when the RHS is a bare soft-keyword-as-identifier in
  expression position, OR gate `typerefTpl` so it doesn't fire in pure-expression context. Delicate
  GLR area — verify with a full pre/post corpus diff. Blast radius: contributes to the ~31 unique
  MISSING-node-only failures in the full corpus (that bucket also contains other distinct causes,
  see below).

- [ ] **NEW GAP FAMILY (isolated 2026-07-06): declaration-hint / callconv keyword as a var/field
  name after a prior declaration.** Superset of the CLI.pas `Platform` case below. Same root
  cause seen in RTL: `Winapi.D3D10.pas` has `Register: UINT;` as a struct field (`Register` =
  `kRegister` callconv), erroring only because a field precedes it. The keywords that collide when
  used as a NON-FIRST decl name: `platform`, `deprecated`, `experimental` (trailing decl hints)
  and `register` (callconv). Likely fix: extend `declVar`/`declField`'s name-alias list (which
  already aliases `kMessage`/`kName`/`kIndex`/`kDefault`/`kOperator`/`kFinal`) to include these,
  guarded so the trailing-hint slot still works when the keyword is genuinely a hint. Verify via
  full corpus diff.

- [ ] **NEW GAP (isolated 2026-07-06): type alias with trailing hint on a dotted RHS.**
  `ToolsAPI.pas` L1164: `TOTAThreadContext = Winapi.Windows.TContext deprecated;` inserts a
  MISSING `identifier`. The `deprecated` hint after a fully-qualified (dotted) type-alias RHS
  isn't accepted. Minimal-repro + fix TBD; lower priority (1 known file).

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

### Corpus survey 2026-07-06 (post array-of-T fix) — where the remaining misses are

Ran the master (THEN-wins) parser against two targeted trees to see what stands between us and 99%+.

- **Delphi-RAG-lint tree (448 files): 98.65%.** `src/` 110/113 (97.3%) — the 3 fails are the two
  new gaps above (`< Read` MISSING-kGt x2, `Platform` var-name x1). `tests/` 319/322 real (99.1%) —
  all 3 fails are INTENTIONAL fixtures (`BrokenSyntax.pas` `:= 42`, `syntax-error-ifend.pas`
  `;;;garbage@@@`, `Docs.pas` doc-comment stress fixture). `third_party`/`scratchpad`/`build` 100%.
- **RTL (Studio 37 `source/` tree, 2397 unique files): 97.9%** (50 unique fails). Classified:
  - **~26 (52%) `{$IFDEF}` cross-branch** — a statement/decl split across IFDEF arms
    (`{$IFDEF POSIX} sDB := ... {$ENDIF};`). NOT a grammar gap — this is exactly what the
    `delphi13-preprocessor` + orchestrator exist to resolve. Counts toward the orchestrator goal
    (top of file), not the master grammar.
  - **~5 asm / .NET** — inline `asm` (MOV/CALL) and DOTNET-only branches. Already "does NOT count"
    (see below).
  - **~10 MISSING-node** — REAL grammar gaps, several distinct causes: the `< SoftKeyword` gap,
    `class function F: TObject {$IFDEF} unsafe {$ENDIF}` (hint-in-ifdef after return type),
    `TAlias = Dotted.Type deprecated;`, etc. **This bucket is the highest-value lever for the
    master grammar** — ~31 unique MISSING-only files corpus-wide, all genuine gaps.
  - **~4 non-Pascal-ish unit headers** (`SHDocVw.pas`, `bdemts.pas`) + a few `Register:`/field-name
    cases (the new gap family above).

**Takeaway on "99%+ on RTL":** the master grammar alone is near its ceiling on RTL (~98%) because
half the RTL misses are IFDEF-cross-branch by design. Two paths raise it: (1) run RTL through the
**orchestrator** (resolves the IFDEF half — this is the existing top-of-file goal), and (2) close
the **MISSING-node grammar gaps** above (recovers ~10 RTL + ~20 more corpus-wide, no defines
needed). The gaps in (2) are the concrete, self-contained follow-ups; the IFDEF half is orchestrator
work, not grammar work.

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
