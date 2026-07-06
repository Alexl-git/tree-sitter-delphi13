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

- [ ] **CONFIRMED GAP: inline `var` with an anonymous `array of T` type.**
  `var X: Integer;` (inline var, simple type) parses clean; **`var Y: array of Integer;` errors**
  (ERROR at the `array of` span). So the miss is specifically an inline `var` declaration whose
  type is an anonymous dynamic-array (`array of <T>`) — Delphi 13 allows this in a statement
  block. Repro (minimal):
  ```pascal
  procedure P;
  begin
    var Y: array of Integer;   // <-- errors
    SetLength(Y, 2);
  end;
  ```
  Real hits: `DRagLint.CLI.pas` lines ~1091/1092/1100 (`var ProcHandles: array of THandle;`
  etc.). Likely fix: the inline-var rule's type slot needs to accept the anonymous-array-type
  production (whatever a normal `var`-section decl already allows), not just a type identifier.

- [ ] **NOT a gap (hypothesis debunked, recorded so nobody re-chases it):** dot-qualified type
  names in a var decl (`Resolver: DRagLint.Project.Resolver.TProjectResolver;`, and 2-level
  `R: System.SysUtils.TStringHelper;`) both parse CLEAN in the current grammar. The
  CLI.pas errors originally *reported at* those lines (8236/8293/8362/8398) have a different,
  not-yet-isolated root cause — the tree-sitter error node recovers at the next declaration, so
  the reported line is downstream of the actual failing construct.

- [ ] **STILL TO ISOLATE: the remaining CLI.pas errors (reported at 8236/8293/8362/8398).**
  A quick standalone extraction of `ResolveConsumerDbs` introduced its own truncation artifacts,
  so the true failing construct in that region isn't pinned down yet. Do this properly: after the
  DLL rebuild, re-index CLI.pas, note which errors survive, then bisect each surviving error's
  *enclosing scope* (not just the reported line) with `tree-sitter parse` on progressively smaller
  compiler-clean snippets until the minimal failing construct is isolated. File each confirmed one
  as its own checkbox with a minimal repro, mirroring the array-of-T item above.

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
