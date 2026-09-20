; brackets.scm -- tree-sitter-dfm
;
; Matching-delimiter pairs for bracket highlighting and jump-to-match.
; `@open` / `@close` is Zed's convention.
;
; `object ... end` is the pair that actually matters in a form file: a real VCL
; form nests components dozens of levels deep, and the `end` keywords are
; otherwise indistinguishable from one another.

("[" @open
  "]" @close)

("(" @open
  ")" @close)

("{" @open
  "}" @close)

("<" @open
  ">" @close)

; object / inherited / inline ... end
(object
  kind: _ @open
  "end" @close)