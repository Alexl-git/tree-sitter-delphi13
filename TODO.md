# TODO

Living list of follow-up work. Items move from here to commits or to FUTURE.md as they're addressed or deferred.

## Current focus

- [ ] **Push orchestrator past 99% on full corpus.** Currently at 98.43% (master: 98.22%). 65 master-pass-but-orch-fail regressions remain — mostly Indy .NET .dpk patterns, EurekaLog defaultValue IFDEF chains, Embarcadero RTL files with specific defines needs. Each defines-tuning iter recovers 10-30 files.

- [ ] **Tighten declared() resolution.** Currently returns false (no symbol table). Files using `{$IF declared(SymName)}` get the wrong branch. Lightweight symbol pre-scan (TYPE/CONST/VAR/FUNCTION/PROCEDURE declarations in the same unit) would close most cases.

- [ ] **Include-file resolution beyond same directory.** Some `{$I X.inc}` references live in sibling directories; need a search-path option per project.

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
