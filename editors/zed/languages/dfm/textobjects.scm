; textobjects.scm -- tree-sitter-dfm
;
; Structural selection (Zed: "select inside/around class", vim `vic` / `vac`).
;
; A DFM component is the closest thing this format has to a class body, so each
; `object ... end` is exposed as a class text object: `inside` is its properties
; and nested components, `around` includes the `object` header and the `end`.

(object
  kind: _
  (_)* @class.inside
  "end") @class.around

; <item ... end item ... end> collections
(items) @class.around

(comment)+ @comment.around