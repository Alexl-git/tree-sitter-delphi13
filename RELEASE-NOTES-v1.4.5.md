# tree-sitter-delphi13 v1.4.5

Both grammars (root + pure), lockstep.

## Fixes by Paul McGee (pmcgee69)

Seven grammar fixes contributed by Paul McGee, each with its own corpus test (author kept on
every fix commit, 075dc43..588e1ec):

1. A subrange's bounds may be quoted characters (`'A'..'Z'` in a set and a subrange).
2. A variable may carry several hint directives (`platform deprecated`).
3. A procedural-type field's calling conventions may be chained (`cdecl varargs`).
4. A code-page string's code page may be a named constant.
5. A program's header is optional (declarations and statements with no `program` line).
6. The right of `is` is a type, not any expression (`is` binds tighter than `and`; `is` with
   a generic).
7. A generic's `<` in an expression is its own token (external scanner); `<` now groups as
   the other comparisons do (`a < b - 1` is `a < (b - 1)`).

## Repair: asmOrphan

- An `asm ... end;` with no routine header (a routine's second body under another `{$IFDEF}`,
  as in System.Win.OleControls) is a definition-level recovery node (`asmOrphan`, aliased
  `asm`, prec -1), both grammars. Fix 7's token changed error recovery after a `_ref`; in
  System.Win.OleControls the pre-existing error then grew to one whole-unit ERROR
  (46 -> 464 errors). With the orphan asm body accepted: 46 -> 2 errors. New corpus test
  `test/corpus/orphan-asm-body.txt` (orphan case + a `procedure P; asm..end;` control).

## What changed

- Version 1.4.5 in package.json, package-lock.json, pure/package.json, tree-sitter.json,
  pure/tree-sitter.json, DISTRIBUTION.md.
- Both grammars regenerated with tree-sitter-cli 0.24.7 (04c16c9, dc7ea20).
- `.node` prebuilds and both `.wasm` files are NOT rebuilt in this commit (they are not
  tracked); rebuild them from this commit before `npm publish`.

## Checks

- `tree-sitter test` (root, 119 cases): green except the 3 documented pp_block failures; all
  9 of Paul's cases and both asmOrphan cases pass. Every fix failed its corpus case on
  v1.4.4 first. Pure has no corpus; its check is the tree parity below.
- v1.4.4 vs v1.4.5, tree by tree: 8 control files 5 -> 0 failing; 533-file sample root
  15 -> 15, pure 89 -> 88; 8286-file corpus root 305 -> 300, pure 967 -> 961.
  0 newly failing anywhere. Clean-parse changes are the intended regroupings (`is`, `<`);
  the rest are error-recovery shifts in files that fail on both.