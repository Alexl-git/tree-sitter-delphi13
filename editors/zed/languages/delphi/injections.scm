; injections.scm -- tree-sitter-delphi13
;
; Embeds other languages inside Delphi source.
;
; SQL-in-string is the high-value case for this codebase: FireDAC/Firebird
; projects carry a lot of SQL in string literals and assembling it by hand is
; where the bugs live. Highlighting it as SQL makes malformed statements
; visible without running them.
;
; Matching is deliberately conservative -- anchored at the start of the literal
; on a leading SQL verb. A loose pattern would paint ordinary prose strings as
; SQL, which is worse than no injection at all: it makes correct code look
; broken.

; A LEADING VERB ALONE IS NOT ENOUGH. `'Select a file to continue'` starts with
; "Select " and is obviously prose -- an early draft of this query painted it as
; SQL. Every branch below therefore demands a PAIRED keyword (SELECT..FROM,
; UPDATE..SET, INSERT INTO, ...), which prose effectively never satisfies.
((literalString) @injection.content
  (#match? @injection.content "(?i)^'\\s*(select\\b[\\s\\S]*\\bfrom\\b|insert\\s+into\\b|update\\b[\\s\\S]*\\bset\\b|delete\\s+from\\b|create\\s+(or\\s+alter\\s+)?(table|view|index|procedure|trigger|generator|sequence|domain|exception)\\b|alter\\s+(table|view|index|procedure|trigger|database)\\b|drop\\s+(table|view|index|procedure|trigger|generator|sequence|domain|exception)\\b|execute\\s+(procedure|block|statement)\\b|merge\\s+into\\b)")
  (#set! injection.language "sql"))

; Inline assembler blocks.
((asmBody) @injection.content
  (#set! injection.language "asm"))
