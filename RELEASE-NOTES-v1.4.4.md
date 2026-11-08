# tree-sitter-delphi13 v1.4.4

Both grammars (root + pure), lockstep.

## Fix

- An if STATEMENT is no longer read as an if EXPRESSION. `exprIf` gets dynamic precedence -1
  and the `ifElse` statement +1, so where both read the same text the statement wins.
  Before, `if Q then Foo(X) else Bar(Y);` (both branches calls), `if Q then Foo else raise;`
  (a bare `raise` read as an identifier) and `if Q then Foo else N := 1;` (the whole if as an
  assignment target) parsed as `exprIf`; dcc reads all of them as statements. An if
  expression on the right of `:=` or in an argument is unchanged.
  Contributed by pmcgee69 (GitHub PR #2). New corpus test
  `test/corpus/if-statement-not-expression.txt` (3 statement cases + 1 expression control).

## What changed

- Version 1.4.4 in package.json, package-lock.json, pure/package.json, tree-sitter.json,
  pure/tree-sitter.json, DISTRIBUTION.md.
- Both grammars regenerated with tree-sitter-cli 0.24.7.
- `.node` prebuilds and both `.wasm` files are NOT rebuilt in this commit (they are not
  tracked); rebuild them from this commit before `npm publish`.

## Checks

- `tree-sitter test`: root green except the 3 documented pp_block failures; pure green.
  The new corpus file fails its 3 statement cases on v1.4.3 and passes on v1.4.4.
- Old (v1.4.3) vs new parser, tree by tree (types, byte ranges, field names):
  - 533-file Delphi sample: 518/533 clean on both, 104 files changed, all 381 changed
    regions exprIf -> ifElse.
  - 8286-file corpus (RTL 37.0 source, spring4d, OmniThreadLibrary, JEDI, D5 source,
    MMMicronite): root 305 -> 305 failing, 0 newly failing, 1071 files changed; 2764 of 2767
    regions exprIf -> ifElse, the other 3 are error recovery in 3 files that fail on both.
    Pure 967 -> 967 failing, 0 newly failing, 1076 files changed; 2794 of 2801 regions
    exprIf -> ifElse, the other 7 in 6 files that fail on both.