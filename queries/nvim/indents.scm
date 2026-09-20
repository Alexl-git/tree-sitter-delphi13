; indents.scm -- tree-sitter-delphi13, NEOVIM flavour
;
; Auto-indent queries are NOT portable between editors. Three conventions exist
; and they share almost no capture names:
;
;   Zed     @indent  @start  @end                    <- queries/indents.scm
;   Neovim  @indent.begin  @indent.end  @indent.branch  @indent.dedent
;           @indent.align  @indent.auto  @indent.zero  @indent.ignore
;   Helix   @indent  @outdent  @align  @opaque       <- queries/helix/indents.scm
;
; The repository's top-level queries/indents.scm uses Zed's convention, so in
; Neovim it compiles cleanly and then does nothing. This file is the Neovim one.
;
; INSTALL: copy to ~/.config/nvim/queries/delphi13/indents.scm
; Query files earlier in 'runtimepath' win, so a copy in your own config
; overrides whatever nvim-treesitter installed with the parser.

; --- constructs whose body is indented ------------------------------------
[
  (block)          ; begin ... end
  (asm)            ; asm ... end
  (try)            ; try ... except/finally ... end
  (case)           ; case ... of ... end
  (caseCase)       ; a single case arm with a compound body
  (repeat)         ; repeat ... until
  (while)
  (for)
  (foreach)
  (with)
  (declClass)      ; class / record / object ... end
  (declIntf)       ; interface / dispinterface ... end
  (declHelper)     ; class helper for T ... end
  (declEnum)
  (declSection)    ; private / protected / public / published
  (declTypes)      ; the names under `type`
  (declConsts)     ; ... under `const`
  (declVars)       ; ... under `var`
  (declArgs)       ; wrapped parameter lists
  (exprParens)     ; bracketed continuations
] @indent.begin

; --- tokens that close an indented region ---------------------------------
[
  (kEnd)
  (kUntil)
] @indent.end

; --- tokens that dedent their own line but keep the block open ------------
[
  (kElse)
  (kExcept)
  (kFinally)
  (kPrivate)
  (kProtected)
  (kPublic)
  (kPublished)
] @indent.branch

(comment) @indent.auto