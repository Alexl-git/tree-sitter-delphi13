; folds.scm -- tree-sitter-delphi13-pure
;
; Nodes that may be collapsed to a single line. The `@fold` capture is the
; convention read by nvim-treesitter, Helix and Zed; editors that compute folds
; from the syntax tree use the captured node's span as the foldable region.
;
; Rule of thumb: fold anything with its own `end`, plus the declaration groups
; that routinely run to hundreds of lines in real Delphi units (a `uses` clause,
; a `type` section, a visibility section of a large form class).

[
  ; --- module structure ---
  (interface)
  (implementation)
  (initialization)
  (finalization)

  ; --- declaration groups ---
  (declUses)
  (declTypes)
  (declConsts)
  (declVars)
  (declExports)
  (declLabels)
  (declArgs)

  ; --- type bodies ---
  (declClass)
  (declIntf)
  (declHelper)
  (declEnum)
  (declSection)
  (declVariant)

  ; --- routines ---
  (defProc)
  (block)
  (asm)

  ; --- statements with an `end` / closing keyword ---
  (try)
  (exceptionHandler)
  (case)
  (caseCase)
  (if)
  (ifElse)
  (while)
  (for)
  (foreach)
  (repeat)
  (with)
  (lambda)
] @fold