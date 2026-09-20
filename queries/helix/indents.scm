; indents.scm -- tree-sitter-delphi13, HELIX flavour
;
; Helix uses @indent / @outdent / @align / @opaque. The top-level
; queries/indents.scm is written for Zed (@indent / @start / @end), so in Helix
; it half-works: @indent is honoured but nothing ever dedents, which leaves
; every `end` one level too deep.
;
; INSTALL: copy to ~/.config/helix/runtime/queries/delphi13/indents.scm

[
  (block)
  (asm)
  (try)
  (case)
  (caseCase)
  (repeat)
  (while)
  (for)
  (foreach)
  (with)
  (declClass)
  (declIntf)
  (declHelper)
  (declEnum)
  (declSection)
  (declTypes)
  (declConsts)
  (declVars)
  (declArgs)
  (exprParens)
] @indent

[
  (kEnd)
  (kUntil)
  (kElse)
  (kExcept)
  (kFinally)
  ")"
] @outdent