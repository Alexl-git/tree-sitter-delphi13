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
;
; NO INLINE `(?i)` FLAG -- THIS IS LOAD-BEARING, DO NOT "SIMPLIFY" IT.
; Native tree-sitter matches #match? with the Rust regex crate, which supports
; the inline `(?i)` group. web-tree-sitter (the WASM build that VS Code, Cursor
; and every browser host use) hands the pattern to JavaScript's RegExp, which
; rejects `(?i)` outright with "Invalid group" -- and a query that throws on
; compile takes the WHOLE injections file down with it, silently, in exactly
; the editors this grammar is meant to ship in. Case-insensitivity is therefore
; spelled out as [Ss][Ee][Ll]... character classes, which both engines accept.
((literalString) @injection.content
  (#match? @injection.content "^'\\s*([Ss][Ee][Ll][Ee][Cc][Tt]\\b[\\s\\S]*\\b[Ff][Rr][Oo][Mm]\\b|[Ii][Nn][Ss][Ee][Rr][Tt]\\s+[Ii][Nn][Tt][Oo]\\b|[Uu][Pp][Dd][Aa][Tt][Ee]\\b[\\s\\S]*\\b[Ss][Ee][Tt]\\b|[Dd][Ee][Ll][Ee][Tt][Ee]\\s+[Ff][Rr][Oo][Mm]\\b|[Cc][Rr][Ee][Aa][Tt][Ee]\\s+([Oo][Rr]\\s+[Aa][Ll][Tt][Ee][Rr]\\s+)?([Tt][Aa][Bb][Ll][Ee]|[Vv][Ii][Ee][Ww]|[Ii][Nn][Dd][Ee][Xx]|[Pp][Rr][Oo][Cc][Ee][Dd][Uu][Rr][Ee]|[Tt][Rr][Ii][Gg][Gg][Ee][Rr]|[Gg][Ee][Nn][Ee][Rr][Aa][Tt][Oo][Rr]|[Ss][Ee][Qq][Uu][Ee][Nn][Cc][Ee]|[Dd][Oo][Mm][Aa][Ii][Nn]|[Ee][Xx][Cc][Ee][Pp][Tt][Ii][Oo][Nn])\\b|[Aa][Ll][Tt][Ee][Rr]\\s+([Tt][Aa][Bb][Ll][Ee]|[Vv][Ii][Ee][Ww]|[Ii][Nn][Dd][Ee][Xx]|[Pp][Rr][Oo][Cc][Ee][Dd][Uu][Rr][Ee]|[Tt][Rr][Ii][Gg][Gg][Ee][Rr]|[Dd][Aa][Tt][Aa][Bb][Aa][Ss][Ee])\\b|[Dd][Rr][Oo][Pp]\\s+([Tt][Aa][Bb][Ll][Ee]|[Vv][Ii][Ee][Ww]|[Ii][Nn][Dd][Ee][Xx]|[Pp][Rr][Oo][Cc][Ee][Dd][Uu][Rr][Ee]|[Tt][Rr][Ii][Gg][Gg][Ee][Rr]|[Gg][Ee][Nn][Ee][Rr][Aa][Tt][Oo][Rr]|[Ss][Ee][Qq][Uu][Ee][Nn][Cc][Ee]|[Dd][Oo][Mm][Aa][Ii][Nn]|[Ee][Xx][Cc][Ee][Pp][Tt][Ii][Oo][Nn])\\b|[Ee][Xx][Ee][Cc][Uu][Tt][Ee]\\s+([Pp][Rr][Oo][Cc][Ee][Dd][Uu][Rr][Ee]|[Bb][Ll][Oo][Cc][Kk]|[Ss][Tt][Aa][Tt][Ee][Mm][Ee][Nn][Tt])\\b|[Mm][Ee][Rr][Gg][Ee]\\s+[Ii][Nn][Tt][Oo]\\b)")
  (#set! injection.language "sql"))

; Inline assembler blocks.
((asmBody) @injection.content
  (#set! injection.language "asm"))