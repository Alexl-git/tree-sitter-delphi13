# tree-sitter-delphi13 v1.4.13

Grammar release on top of v1.4.12 (root grammar and `pure/`). One fix, contributed by
Paul McGee (@pmcgee69, PR #10): a quote that opens no string no longer swallows the rest of the
file. No file that parsed clean on v1.4.12 fails or changes its tree on v1.4.13. The gate covered
an 8286-file corpus (RTL, VCL, FMX, JEDI JCL/JVCL, Spring4D, OmniThreadLibrary, Delphi 5
sources), two production Delphi projects (671 units), the current drag-lint sources
(2359 units), and `tree-sitter test` for root and pure.

## Fixed

- **A stray quote swallowed the rest of the file** (PR #10, both grammars). This happens while
  you type a string that isn't closed yet, or with a `"`, which Delphi doesn't use:

  ```pascal
  const
    MyRec : TMyRec = (Name: ');
  ```

  A quote that opens no complete string matches no ordinary token. In error recovery the lexer
  fell back to one of the two catch-all tokens, `trailingText` (meant for text after the final
  `end.`, runs to end of file) or `asmBody` (runs to the next `end`), and the rest of the file
  became ONE token. In an editor the whole file turned into a single ERROR, and in Zed it could
  freeze the editor. Neither catch-all token can now start with a quote, and a quote inside an
  `asm` block is still part of it. The stray quote is now a small local error, and the parser
  carries on.

## Behaviour change

Text after the final `end.` that begins with a quote is now an ERROR instead of `trailingText`.
The compiler ignores that text either way.

## Tree shape

No new node types. An unclosed string is still reported as an ERROR (intentionally: tools such
as drag-lint rely on ERROR nodes to report broken code). The PR's alternative, a dedicated
`unclosedString` token that leaves the tree error-free, was not taken.

## Measured (lane 155, 2026-11-17)

Parsers regenerated with tree-sitter-cli 0.24.7 (ABI 14, unchanged).

- `tree-sitter test`: root 146/146 (incl. the 2 new `stray-quote` tests), pure 26/26.
- Corpus, 8286 files: root 289 -> 289 files with an ERROR / MISSING node, pure 892 -> 892,
  0 newly failing in either grammar, 0 clean files changed. 3 files have a different tree in each
  grammar (JVCL `pnglang.pas` and two `outro.inc` fragments, all of which already failed), and all
  3 have LESS ERROR coverage. None has more.
- Delphi 5 tree (279 files) and the two production projects (671 units): 0 tree changes.
- drag-lint sources (2359 units): 0 newly failing, 0 clean changed. The only 2 tree changes are
  its stray-quote / asm-quote test fixtures, both with less ERROR coverage.
