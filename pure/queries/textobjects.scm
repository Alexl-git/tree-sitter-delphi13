; textobjects.scm -- tree-sitter-delphi13-pure
;
; Structural selection and navigation (Zed: "select inside/around function",
; vim-style `vif` / `vaf` / `vic` / `vac`).
;
; Convention:
;   @function.around / @function.inside
;   @class.around    / @class.inside
;   @comment.around
;
; `around` spans the whole construct; `inside` spans its body only. The two must
; appear in the SAME pattern, which is why each block below repeats the parent.

; --- implemented routines --------------------------------------------------
;   procedure TFoo.Bar; begin ... end;
; `inside` is everything between `begin` and `end`.
(defProc
  body: (block
    (kBegin)
    (_)* @function.inside
    (kEnd))) @function.around

; --- routine declarations (interface section, forward decls) ---------------
; No body, so there is nothing to select "inside".
(declProc) @function.around

; --- anonymous methods -----------------------------------------------------
(lambda
  (block
    (kBegin)
    (_)* @function.inside
    (kEnd))) @function.around

; --- class / record / object ----------------------------------------------
(declType
  type: [
    (declClass
      [(kClass) (kRecord) (kObject)]
      (_)* @class.inside
      (kEnd))
    (type
      (declClass
        [(kClass) (kRecord) (kObject)]
        (_)* @class.inside
        (kEnd)))
  ]) @class.around

; --- interface / dispinterface --------------------------------------------
(declType
  type: (declIntf
    [(kInterface) (kDispInterface)]
    (_)* @class.inside
    (kEnd))) @class.around

; --- class helper / record helper -----------------------------------------
(declType
  type: (declHelper
    (_)* @class.inside
    (kEnd))) @class.around

; --- comments --------------------------------------------------------------
(comment)+ @comment.around