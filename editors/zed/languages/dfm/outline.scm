; outline.scm -- tree-sitter-dfm
;
; Drives Zed's outline panel (Ctrl-Shift-O) for DFM/FMX form files.
;
; A form IS a nested component tree, so an outline of it is the natural way to
; navigate a large .dfm -- arguably more useful here than in a .pas file.
;
;   object Form1: TForm1        -> Form1     (TForm1)
;     object Panel1: TPanel     ->   Panel1  (TPanel)
;       object Button1: TButton ->     Button1 (TButton)
;
; Nesting comes for free: `object` nodes contain `object` children, and Zed
; derives outline depth from node containment.

(object
  name: (identifier) @name
  class: (identifier) @context) @item

(comment) @annotation
