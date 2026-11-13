# tree-sitter-delphi13 v1.4.12

Grammar release on top of v1.4.11 (root grammar and `pure/`). One fix: bare routine headers in
an include file. No file that parsed clean on v1.4.11 fails or changes its tree on v1.4.12
(gate: an 8286-file corpus -- RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D, OmniThreadLibrary,
Delphi 5 sources -- plus the drag-lint sources (489 units) and two production Delphi projects
(671 units); `tree-sitter test` root and pure).

## Fixed

- **Bare routine headers at the include-file root** (drag-lint RINC2 / OQ17, both grammars).
  An include file that is pasted into an interface section holds headers with no body and no
  `forward` / `external`:

  ```pascal
  type
    TFoo = class
    end;

  procedure P;
  function F: Integer;
  ```

  Such a file was always an ERROR, and error recovery dropped the last paramless header before
  EOF. Each header is now a `declProc` directly under `root`. A header followed by a body is
  still a `defProc`, and `forward` / `external` headers are unchanged. Routine-local
  declarations are not affected: the lenient form is allowed only at the include root and in
  a headerless program, which shares that definition list.

## Tree shape

No new node types. The bare header is a `declProc`, the same node as an interface-section
declaration. Its internal rule `declProcInc` is aliased to `declProc` and carries dynamic
precedence -1, so any reading without a bare header wins:
`procedure Outer; procedure Inner; begin end; begin end;` is still one `defProc` with a nested
`defProc`.

## Measured (lane 154, 2026-11-13)

Corpus 8286 files: root 289 -> 289 files with an ERROR / MISSING node, pure 892 -> 892, 0 newly
failing in either grammar, 0 clean files changed. Two files have a different tree in each
grammar, and none has more ERROR coverage. `CoreServicesAPIs.inc` (RTL) gains a `declProc`
where it had an ERROR. JclRegistry (root), which already failed, recovers with a smaller
ERROR. Vcl.Dialogs (pure) changes only inside its existing ERROR, with the same coverage. The Delphi 5 tree, the two production projects, the drag-lint sources and the
11 positive controls show 0 tree changes. The 4 new corpus tests fail on v1.4.11 and pass on
v1.4.12 (root and pure); the 2 controls pass on both.
