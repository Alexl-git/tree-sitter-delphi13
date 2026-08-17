; indents.scm -- tree-sitter-delphi13
;
; Auto-indent behaviour. This is the query users actually *feel*: it decides
; where the caret lands after `begin`, `case`, `try`, `record`, `class`.
;
; Convention (matches Zed's own language extensions):
;   @indent  the node whose body should be indented
;   @start   the token that opens the indented region
;   @end     the token that closes it (dedents the line it appears on)

; --- begin ... end -------------------------------------------------------
(block
  (kBegin) @start
  (kEnd)? @end) @indent

; --- try ... except / finally ... end ------------------------------------
(try
  (kTry) @start
  (kEnd)? @end) @indent

; --- case ... of ... end -------------------------------------------------
(case
  (kCase) @start
  (kEnd)? @end) @indent

; --- record ... end ------------------------------------------------------
(declClass
  (kEnd)? @end) @indent

(declIntf
  (kEnd)? @end) @indent

(declHelper
  (kEnd)? @end) @indent

; --- asm ... end ---------------------------------------------------------
(asm
  (kAsm) @start
  (kEnd)? @end) @indent

; --- repeat ... until ----------------------------------------------------
(repeat
  (kRepeat) @start
  (kUntil)? @end) @indent

; --- declaration sections: the names under type/var/const line up --------
(declTypes) @indent
(declVars) @indent
(declConsts) @indent

; --- bracketed continuations --------------------------------------------
(exprParens
  "(" @start
  ")" @end) @indent

(declArgs
  "(" @start
  ")" @end) @indent
