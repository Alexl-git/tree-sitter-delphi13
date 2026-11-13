# tree-sitter-delphi13 v1.4.11

Grammar release on top of v1.4.10 (root grammar and `pure/`). Five fixes contributed by Paul
McGee (PRs #5-#9) and one error-recovery improvement for issue #4. No file that parsed clean on
v1.4.10 fails on v1.4.11 (gate: an 8286-file corpus -- RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D,
OmniThreadLibrary, Delphi 5 sources -- plus the drag-lint sources (489 units) and two
production Delphi projects (671 units); `tree-sitter test` root and pure).

## Tree-shape changes (consumers, read these)

- **Code-page string types are one node** (PR #6, both grammars). `type AnsiString(1252)` was
  `kType` followed by loose `identifier '(' ... ')'` siblings; it is now `kType` +
  `declStringCodePage(base: identifier, codePage: literalNumber | identifier)`. An integer code
  page is now a named `literalNumber` (was anonymous). `outline.scm` (root, pure, Zed) drops
  `(kType)? @context` from the `declType` pattern.
- **Numeric labels** (PR #9, both grammars). `label 99;`, the statement label `7:` and
  `goto 7` accept an integer; it appears as `literalNumber` where an `identifier` stood. No new
  node types. `case X of 1: ...` is unchanged (control test).
- **`classBodyOrphan`** (issue #4, root grammar only). The root grammar reads the THEN branch of
  a conditional and skips `{$ELSE} ... {$ENDIF}`. In
  `{$IFDEF X} TFoo = class(TOther); {$ELSE} TFoo = class(TBase) {$ENDIF} protected ... end;` the
  members have no header in the THEN reading; they now become a `classBodyOrphan` sibling of
  the THEN-branch `declType` instead of an ERROR. Only a body that starts with a visibility
  section is recovered. The node has dynamic precedence -1: any reading without it wins.
  The pure grammar (preprocessed input) never needs it.

## Fixed (no shape change; ERROR becomes a tree)

- A label may start the `then` branch of an if-else (PR #5, both grammars).
- A procedural typed const may have a calling convention before its `=` (PR #7, both grammars).
- A statement list may end in a label, `quit: end;` (PR #8, root; pure already had it).

## Measured (lane 153, 2026-11-13)

Corpus 8286 files, root: 293 -> 289 files with an ERROR / MISSING node (JvgPage, JvgTab, two
copies each), 0 newly failing; tree changes only in System.pas (two copies) and
System.SysUtils.pas (code-page node) and two JEDI units that fail on both versions.
Pure: 892 -> 892, 0 newly failing; no clean file changed. Delphi 5 tree, two production
projects, the drag-lint sources and 11 positive controls: 0 tree changes. Every new corpus test
fails on v1.4.10 (root 8, pure 4) and passes on v1.4.11.
