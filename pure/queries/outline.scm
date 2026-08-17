; outline.scm -- tree-sitter-delphi13
;
; Drives Zed's outline panel (Ctrl-Shift-O / the breadcrumb symbol list).
;
; Convention:
;   @item    the whole entry
;   @name    the text shown for it
;   @context surrounding keywords shown greyed next to the name

; Types:  type TFoo = class ... end;
(declType
  (kType)? @context
  name: [(identifier) (genericDot) (genericTpl)] @name) @item

; Routines in the interface section and standalone declarations:
;   procedure Foo(const X: Integer);
(declProc
  [
    (kProcedure)
    (kFunction)
    (kConstructor)
    (kDestructor)
    (kOperator)
  ] @context
  name: [(identifier) (genericDot) (genericTpl)] @name) @item

; NOTE: implemented routines (procedure TFoo.Bar; begin ... end;) are NOT given
; their own pattern. A defProc's `header:` IS a declProc, so the pattern above
; already matches it -- adding a defProc pattern here produced every
; implementation twice in the outline.

; Properties:  property Count: Integer read FCount;
(declProp
  (kProperty) @context
  name: (identifier) @name) @item
