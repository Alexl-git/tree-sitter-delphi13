# Future work

Notes on planned companion packages and known limitations of the current grammar.

## delphi13-ifdef-resolver (planned, not started)

A separate package that runs as a **second pass** over a parsed tree-sitter-delphi13 tree to recover information the THEN-wins refactor intentionally drops.

### Why

The grammar uses a "THEN wins" strategy (see [DESIGN-ifdef-then-wins.md](DESIGN-ifdef-then-wins.md)): the scanner reads through `{$IF*}` directives, the THEN-branch flows as normal tokens, the ELSE-branch is consumed as opaque `pp_else_tail` text. This trades full ELSE awareness for a simpler grammar that parses ~96.8% of the corpus cleanly.

Some downstream tools (refactoring, semantic analysis, completion) want both branches.

### How it would work

1. Walk the tree, find every `pp_else_tail` node.
2. Read the raw ELSE-branch text from the node's source range.
3. Identify the parent grammar rule of the `pp_open` boundary that opened this IFDEF — that tells us what context the ELSE was in (callconv vs identifier vs expression vs statement, etc.).
4. Re-parse the ELSE text *in that context*. Tree-sitter doesn't expose a "start at rule X" entry point natively, so the implementation chooses from three patterns. **Approach 3 is the recommended starting point** — it leverages tree-sitter's own range-based reparse machinery instead of fighting it:

   **Approach 3 (recommended) — `ts_parser_set_included_ranges`:** tree-sitter's C API lets the parser see only specific byte ranges of an input. To re-parse symmetrically:
   - Build a *virtual* source view of the original file with the THEN-range bytes replaced by the ELSE-range bytes at the same position.
   - Or: feed the parser two ranges — everything *before* the IFDEF + the ELSE text + everything *after* the `{$ENDIF}`.
   - The parser sees the same surrounding tokens the THEN-side had, just with the IFDEF position filled by ELSE bytes. Same parser, same grammar, no synthetic stubs, no second compiled grammar.
   - Node bindings: `tree-sitter` npm package exposes this as `parser.parse(input, oldTree, { includedRanges: [...] })`. The Python and Rust bindings have equivalents.

   **Approach 1 — wrap-and-extract:** prepend a synthetic stub that creates the context (e.g. `program X; var Y: T = <ELSE>;` for an expression-position IFDEF), parse the whole thing, take the relevant subtree. Simple but requires per-context stub templates.

   **Approach 2 — second mini-grammar:** a separate compiled tree-sitter grammar whose top rule IS the target context (e.g. an "expression-only" grammar). Pure but doubles maintenance.
5. If the ELSE parses cleanly and has the same shape as the parsed THEN sibling → "symmetric IFDEF detected" → attach to the augmented tree as an alternative branch.
6. If it doesn't → leave as opaque (no change).

### Cost knobs

- One mini-parse per `pp_else_tail`. ~107k IFDEFs in the curated Delphi 13 corpus we benchmark against. Reasonable for a refactoring tool to invoke on the files it cares about; not free for whole-corpus scans.
- "Same shape" can be **strict** (identical token-type sequence) or **loose** (both produce valid trees of any kind). Strict is cheaper and catches the practical wins: callconv-vs-callconv, ident-vs-ident, expr-vs-expr.

### Why this lives downstream, not in the grammar

Tree-sitter scanners don't have grammar-rule context — they see characters, not "we are inside an exprBinary right now." So the symmetry check fundamentally cannot happen at scan time; it needs the tree.

## delphi13-preprocessor (planned, not started)

A package that expands `{$I X.inc}` include directives and evaluates `{$DEFINE}` / `{$IF defined(X)}` chains, producing a virtual buffer + source map. tree-sitter-delphi13 would then parse the expanded buffer with full preprocessor accuracy. Mentioned in [STATUS.md](STATUS.md).

Unblocks the last ~1-2% of the corpus that the THEN-wins refactor can't handle (asymmetric IFDEFs where the THEN side alone isn't grammatically complete).
