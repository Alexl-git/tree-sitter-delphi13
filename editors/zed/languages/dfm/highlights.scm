; highlights.scm -- tree-sitter-dfm
;
; Syntax highlighting queries for Delphi DFM / FMX form definition files.
; Consumed by Zed, Neovim, Helix and anything else using tree-sitter-highlight.
;
; DFM is a small declarative format:
;
;   object Form1: TForm1
;     Left = 0
;     Caption = 'Hello'
;     object Button1: TButton
;       Anchors = [akLeft, akTop]
;     end
;   end

; ---------------------------------------------------------------------------
; Comments
; ---------------------------------------------------------------------------

(comment) @comment

; ---------------------------------------------------------------------------
; Structural keywords
; ---------------------------------------------------------------------------

[
  "object"
  "inherited"
  "inline"
  "item"
  "end"
] @keyword

; ---------------------------------------------------------------------------
; Components:   object Form1: TForm1
;                      ^name  ^class
; ---------------------------------------------------------------------------

(object class: (identifier) @type)
(object name: (identifier) @variable)

; ---------------------------------------------------------------------------
; Property names:   Caption = 'Hello'   /   Font.Height = -11
; ---------------------------------------------------------------------------

(property name: (qualified_identifier) @property)

; ---------------------------------------------------------------------------
; Set members:   Anchors = [akLeft, akTop]
; ---------------------------------------------------------------------------

(set (qualified_identifier) @constant)

; ---------------------------------------------------------------------------
; Values
; ---------------------------------------------------------------------------

(quoted_string) @string
(string) @string
(char_code) @string.escape
(binary_blob) @string.special
(datetime_literal) @constant

; (number) is a wrapper around the leaf types below -- capture the leaves only,
; otherwise every numeric literal is captured twice.
[
  (integer)
  (float)
  (hex_literal)
] @number

[
  (boolean)
  "true"
  "false"
] @boolean

; Symbolic / enumerated values -- alClient, akLeft, clBtnFace ...
(identifier_value) @constant

; ---------------------------------------------------------------------------
; Operators and punctuation
; ---------------------------------------------------------------------------

[
  "="
  "+"
  "<"
  ">"
] @operator

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ":"
  "."
] @punctuation.delimiter
