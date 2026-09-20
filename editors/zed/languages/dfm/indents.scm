; indents.scm -- tree-sitter-dfm
;
; Auto-indent behaviour.
;
; Convention (matches Zed's own language extensions, and queries/indents.scm
; in tree-sitter-delphi13):
;   @indent  the node whose body should be indented
;   @start   the token that opens the indented region
;   @end     the token that closes it (dedents the line it appears on)
;
; DFM is written by the IDE at two spaces per level; these rules reproduce that
; when a human hand-edits a form.

; object / inherited / inline ... end
(object
  "end" @end) @indent

; <item ... end item ... end>
(items
  "<" @start
  ">" @end) @indent

; ('line 1' 'line 2')
(list
  "(" @start
  ")" @end) @indent

; [fsBold, fsItalic]
(set
  "[" @start
  "]" @end) @indent

; { DEADBEEF ... }
(binary_blob
  "{" @start
  "}" @end) @indent