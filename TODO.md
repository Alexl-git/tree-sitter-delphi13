# TODO

Living list of follow-up work. Items move from here to commits or to FUTURE.md as they're addressed or deferred.

## Current focus

- [ ] **Phase 3b: refuse-read-through heuristic.** When the scanner detects an IFDEF whose THEN body would unbalance the parse (mismatched begin/end, stray top-level `;`, or non-Pascal free text), fall back to legacy `pp_block` opaque-token behavior for that one IFDEF. Estimated +200-400 files toward the 99% with-opaque ceiling.

- [ ] **Phase 4: drop legacy `pp_block` token.** Once Phase 3b's fallback path is the only consumer of pp_block, decide whether to keep it as belt-and-braces or remove the code entirely. Probably keep — it's small and the safety net is cheap.

## Near term

- [ ] **Reach 99% on the curated corpus.** Target: every file produces a tree with zero ERROR nodes (some IFDEFs opaque, all else parsed). True 100% requires the preprocessor package.

## Companion packages (not yet started)

- [ ] **delphi13-ifdef-resolver** — post-pass that re-parses opaque `pp_else_tail` text *in-context* to recover symmetric IFDEF branches. Full design in [FUTURE.md](FUTURE.md).
  - Implementation order: prototype **Approach 3** first (`ts_parser_set_included_ranges`) — same parser, same grammar, range-substitution gives the ELSE-side the same surrounding tokens the THEN-side had. Fall back to Approach 1 (wrap-and-extract) only if range-based reparse can't handle some context.

- [ ] **delphi13-preprocessor** — expands `{$I X.inc}` includes and evaluates `{$DEFINE}` / `{$IF defined(X)}` chains, producing a virtual buffer + source map. Unblocks the last ~1-2% of the corpus the THEN-wins refactor structurally cannot handle.
