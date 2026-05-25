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
4. Re-parse the ELSE text *in that context*. Tree-sitter doesn't expose a "start at rule X" entry point natively, so the implementation must either:
   - Wrap the ELSE fragment in a synthetic stub that creates the context (e.g. `program X; var Y: T = <ELSE>;` for an expression-position IFDEF), parse the whole stub, extract the relevant subtree; **or**
   - Build a small second tree-sitter grammar whose top-level rule IS the target context, parse fragments with it; **or**
   - Use `ts_parser_set_included_ranges` to re-parse only specific byte ranges of the original source — this carries surrounding context for free and is the simplest prototype path.
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
