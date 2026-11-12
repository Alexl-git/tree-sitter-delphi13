# tree-sitter-delphi13 v1.4.10

Grammar release on top of v1.4.9 (root grammar and `pure/`). Trees change only for the
construct below; no file that parsed clean on v1.4.9 fails on v1.4.10 (gate: an 8286-file
corpus -- RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D, OmniThreadLibrary, Delphi 5 sources -- plus
the drag-lint sources (489 units) and two production Delphi projects (671 units), root grammar;
`tree-sitter test` root and pure).

## Fixed

- Record / class fields (both grammars): a visibility word may be a FIELD NAME when a `:` or
  `,` follows it -- `Private: array[1..28] of Byte;` in Delphi 5 `SysUtils.TFileRec`, legal
  before records had visibility sections. `private`, `protected`, `public` and `published` are
  accepted as field names (first field, after a prior field, in a comma list, and inside a
  section: `protected Private: Integer;`); a visibility word followed by anything else still
  opens a section. Corpus test `test/corpus/field-name-visibility.txt` (root and pure) with a
  section control case. Node shape: the name is an `identifier`, as for any other field.

## Measured (drag-lint wave 152b lane GR3, 2026-11-11)

Corpus 8286 files: 294 -> 293 files with an ERROR / MISSING node, 1 tree changed (Delphi 5
`SysUtils`), 0 newly failing. Delphi 5 source tree (279 units, preprocessed as `drag-lint
index --target-compiler 5` parses them): 2 -> 1 unit with a parse error; the remaining one
(`ZLibNEW.pas`) is a Delphi 6+ unit whose `{$IFDEF MSWINDOWS}` external clause drops under
Delphi 5 defines -- the source, not the grammar.
