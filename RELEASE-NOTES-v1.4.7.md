# tree-sitter-delphi13 v1.4.7

Grammar release on top of v1.4.6 (root grammar and `pure/`). Trees change only for the
constructs below; no file that parsed clean on v1.4.6 fails on v1.4.7 (gate: a 533-file sample
and an 8286-file corpus -- RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D, OmniThreadLibrary, Delphi 5
sources -- both grammars).

## Fixed

- `external` declarations may omit the final `;` in every short form, not only after
  `name '<string>'` (v1.4.3): `procedure P; external lib`, `external 'lib' index 5`,
  `external lib name SomeConst` -- before the next declaration or `end.`. dcc accepts them;
  Borland shipped them (Delphi 5 `windows.pas` / `shlobj.pas`, JVCL `JvShDlg.pas`). The lenient
  `name` / `index` argument is one token (string, number or identifier); a bare `external` with
  no library still needs its `;`. Corpus: `test/corpus/proc-external-no-semi.txt`.
- Pure grammar: a `begin ... end;` with no routine header (the third body of a routine whose
  other bodies sit under other `{$IFDEF}` branches -- RTL `System.Math` has dozens) is now a
  definition-level `block` node, like the orphan `asm ... end;` of v1.4.5. Before, the block
  was taken but its `;` was an ERROR (System.Math: 6 -> 1 ERROR nodes; the one left is a
  pre-existing whole-unit recovery from another construct). The root grammar is unchanged (its
  `pp_block` token hides the case). First corpus file for the pure grammar:
  `pure/test/corpus/orphan-block-body.txt`.
- `tree-sitter generate` no longer warns `unnecessary conflicts: declProcFwd` (the entry
  left the RTTI conflict list; it had been redundant since v1.4.3).

## Tooling

- `tools/check-corpus-tail.js`: refuses a corpus file whose last test has an empty expected
  tree. `tree-sitter test` 0.24 silently drops such a last test (an `:error` case at the end
  of a file) and `--update` then deletes it. Runs first in `npm test`; `pure/` gets a `test`
  script.

## Gate

- `tree-sitter test`: root 94 cases, 3 failures = the three documented `pp_block` cases
  (unchanged since v1.4.3); pure 2 cases, 0 failures (its first corpus file).
- tsdiff v1.4.6 -> v1.4.7, root grammar: 533 sample 0 trees changed (15 files fail on both);
  8286 corpus 1 tree changed = 1 file fixed (`JvShDlg.pas`, Delphi-5-era `external ... name`
  lines, 4 -> 0 errors). Pure grammar: 533 sample 18 trees changed, 3 files fixed
  (Spring.Cryptography.Utils, System.Win.OleControls, Vcl.OleCtrls), 8 with fewer ERROR bytes,
  7 unchanged, 0 worse; 8286 corpus 187 trees changed, 63 files fixed, 92 with fewer ERROR
  bytes, 31 unchanged, 1 worse (`JvSIMDUtils.pas`: 23 -> 12 ERROR nodes but the outermost
  ERROR grew 639 -> 26909 bytes, a recovery that popped higher in a file broken on both).
  Every changed file fails on at least one grammar (error-recovery shifts) or is a fix.
  Newly failing: 0 everywhere.
- Parser size: root 13409 states (v1.4.6: 12042, +11%), pure 13295 (11902); x64 DLL 4.3 MB
  (3.6 MB). The `external L` alternative without `;` puts the declaration starts into the
  follow set of `_expr` there.
