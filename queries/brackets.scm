; brackets.scm -- tree-sitter-delphi13
;
; Matching-delimiter pairs, used for bracket highlighting, jump-to-match and
; auto-surround. `@open` / `@close` is Zed's convention.
;
; Pascal's real block delimiters are KEYWORDS, not punctuation: `begin`/`end`,
; `try`/`end`, `case`/`end`, `class`/`end`, `repeat`/`until`. Those matter far
; more here than parentheses do, because they are what nest and what people lose
; track of in a long unit. They are named nodes in this grammar (kBegin, kEnd,
; ...), not anonymous tokens, so each pair is written against its parent rule.

; --- punctuation -----------------------------------------------------------
("(" @open
  ")" @close)

("[" @open
  "]" @close)

; --- begin ... end ---------------------------------------------------------
(block
  (kBegin) @open
  (kEnd) @close)

; --- asm ... end -----------------------------------------------------------
(asm
  (kAsm) @open
  (kEnd) @close)

; --- try ... except/finally ... end ----------------------------------------
(try
  (kTry) @open
  (kEnd) @close)

; --- case ... of ... end ---------------------------------------------------
(case
  (kCase) @open
  (kEnd) @close)

; --- repeat ... until ------------------------------------------------------
(repeat
  (kRepeat) @open
  (kUntil) @close)

; --- class / record / object ... end ---------------------------------------
(declClass
  [
    (kClass)
    (kRecord)
    (kObject)
  ] @open
  (kEnd) @close)

; --- interface / dispinterface ... end -------------------------------------
(declIntf
  [
    (kInterface)
    (kDispInterface)
  ] @open
  (kEnd) @close)

; --- class helper for T ... end --------------------------------------------
(declHelper
  [
    (kClass)
    (kRecord)
  ] @open
  (kEnd) @close)