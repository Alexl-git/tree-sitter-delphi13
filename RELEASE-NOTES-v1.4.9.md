# tree-sitter-delphi13 v1.4.9

Grammar release on top of v1.4.8 (root grammar and `pure/`). Trees change only for the
construct below; no file that parsed clean on v1.4.8 fails on v1.4.9 (gate: a 533-file sample
and an 8286-file corpus -- RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D, OmniThreadLibrary, Delphi 5
sources -- both grammars).

## Fixed

- Call arguments (both grammars): an Automation (IDispatch) call may NAME its arguments --
  Delphi's "positional parameters": `Sheet.SetBackgroundPicture(FileName := Path)`,
  `lTable.AutoFormat(Format := WordFormat)` (JVCL `JvgExportComponents`, `JvDBGridExport`,
  one whole-statement ERROR each -> 0). New node `exprArgNamed` with fields `name`
  (`identifier`) and `value` (expression) inside `exprArgs`; a positional argument list keeps
  its shape (control case in `test/corpus/call-named-args.txt`, root and pure).

## Measured (drag-lint lane PS, 2026-11-09)

Engine-path parse success (after `{$IFDEF}` preprocessing, as `drag-lint index` parses) on real
code with v1.4.8: 2806 units (Micronite CLIENT 580, SERVER 472, Loader2025 84, drag-lint 316,
JVCL run 653, Spring4D 176, RTL 405, VCL 120) -> 6 units with a parse error, of which 2 were this
construct; the other 4 are broken source (`JvInspXVCL` extra `)`), a preprocessor profile
matter (`JvMenus` `{$IFDEF SUPPORTS_DEPRECATED}` tail -> `; ;`) and a platform-foreign unit
(`Posix.SysSocket`, no body under a Windows profile). No other real-code grammar gap was found.
