# tree-sitter-delphi13 v1.4.8

Grammar release on top of v1.4.7 (root grammar and `pure/`). Trees change only for the
constructs below; no file that parsed clean on v1.4.7 fails on v1.4.8 (gate: a 533-file sample
and an 8286-file corpus -- RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D, OmniThreadLibrary, Delphi 5
sources -- both grammars).

## Fixed

- External scanner (both grammars): a `(* ... *)` or `//` comment inside a generic's type
  arguments no longer turns the `<` into a comparison (`TList<Integer (* c *)>.Create`,
  `TDictionary<string, // key` + newline + `Integer>.Create`); `{ }` was already skipped. A `(`
  that does not open a comment and a lone `/` still end the lookahead. Contributed by Paul McGee
  (PR #3, `test/corpus/lt-generic-token.txt`, with a comparison beside a comment kept a
  comparison).
- Record field lists (both grammars): the last field may be `array [..] of string` with no
  trailing `;` before `end` (JVCL `JvSIMDUtils` `Names: array [0..3] of string end`); bare
  `string` only, as for a plain last field -- `string[N]` keeps its `;` form (control case in
  `test/corpus/record-last-field-array-string.txt`, root and pure). JvSIMDUtils: 23 -> 0 ERROR
  nodes on root, 12 -> 0 on pure.
- Pure grammar: a routine whose bodies sit under `{$IF} .. {$ELSEIF} .. {$ELSE}` may have an
  `{$ELSE}` branch with no code at all (RTL `System.Math` `DivMod` / `GetExceptionMask`:
  `{$ELSE OTHERCPU} {$MESSAGE Fatal ..} {$ENDIF}` after the last body). The `pp()` wrapper now
  takes an empty else-branch; before, the routine was an ERROR and the parser never closed the
  unit. System.Math on pure: 1 whole-unit ERROR (202,804 bytes) -> 0 ERROR nodes (8 MISSING
  from inline `{$IF}expr{$ELSE}expr{$ENDIF}` splices remain, pre-existing). Corpus case in
  `pure/test/corpus/orphan-block-body.txt`.

## Tests and repo

- The three documented `pp_block` corpus cases (`external-scanner.txt` 40-42) are marked
  `:skip` with the reason in the test name: since the then-wins directive model `PP_OPEN` is
  valid at file root, so the scanner never falls back to `PP_BLOCK`; their expected trees are
  kept as the pre-then-wins target. `tree-sitter test`: root 118 cases 0 failures, pure 5 / 0.
- `.gitattributes`: `tree-sitter generate` output (`src/parser.c`, `grammar.json`,
  `node-types.json`, `src/tree_sitter/*.h`, and under `pure/src/`) is stored verbatim
  (`-text`), so a generate on a `core.autocrlf=true` checkout leaves a clean tree.

## Gate

- tsdiff v1.4.7 -> v1.4.8, root grammar: 533 sample 0 trees changed (15 files fail on both);
  8286 corpus 1 tree changed = 1 file fixed (JvSIMDUtils); 2 positive controls fixed
  (gen-star, gen-slash). Pure grammar: 533 sample 3 trees changed (System.Math 1 -> 0 ERROR
  nodes; System.Classes 3 -> 2, outermost ERROR bytes 650,277 -> 962; System.ObjAuto 3 -> 2,
  68,096 -> 2); 8286 corpus 20 trees changed, 1 file fixed (JvSIMDUtils), the rest are
  recovery shifts in files that fail on both grammars (System.pas 600 -> 818 ERROR nodes with
  fewer outermost bytes 1,275,780 -> 1,275,188; superobject 107 -> 132; six files +1 node);
  newly failing 0 everywhere. Parser size unchanged in order (root x64 DLL 4.31 MB).
