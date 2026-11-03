# tree-sitter-delphi13 v1.4.1

Both grammars (root + pure), lockstep.

## Fix

- The LAST record/class field of an array type may omit its `;` before `end`
  (`padding: array [0 .. 83] of Byte end`, `szInsert: packed array[0..MAX_PATH-1] of WCHAR end`).
  `declFieldNoSemi` gains `_declArrayNoSemi`, a constrained `array [..] of T` whose element
  excludes string types, so `array[0..4] of String[1];` (WITH `;`) stays unambiguous.
  The node is aliased to `declArray` (element aliased to `type`): same tree shape as the `;` form.
  Reported by drag-lint (GRAMMAR-LASTFIELD, docs\INBOX-grammar-last-field-array-no-semi.md).

## Gates (file-by-file vs v1.4.0, RTL 37.0 source *.pas/*.inc + ORM3 *.pas, 3135 files)

- root: 41 -> 39 failing files; fixed FireDAC.Phys.MongoDBCli.pas, Winapi.ShlObj.pas; 0 regressions,
  0 changed error locations elsewhere.
- pure: 290 -> 289; fixed MongoDBCli; ShlObj's first error moved from 11068 to an unrelated
  pp construct at 11602; 0 regressions.
- `tree-sitter test`: new `test/corpus/record-last-field-array.txt` (2 RED on v1.4.0, GREEN now);
  the 3 pre-existing pp_block failures unchanged.