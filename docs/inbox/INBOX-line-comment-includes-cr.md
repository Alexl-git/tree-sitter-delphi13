# tree-sitter-delphi13: a `//` comment node includes the trailing CR on CRLF files

For: C:\Projects\tree-sitter-delphi13 (file as docs\inbox\INBOX-line-comment-includes-cr.md). Lane v1521 TAILS-EXT, 2026-11-19.
drag-lint INBOX: docs\INBOX-comment-span-includes-trailing-cr.md (Delphi-RAG-lint).

## Cause
grammar.js:2497-2501

    comment: $ => token(choice(
        seq('//', /.*/),        // <-- tree-sitter `.` excludes only \n, so \r is consumed
        ...

## Minimal repro (drag-lint 1.52.0-alpha, rule shared-marker-legacy-shape)
File uR.pas, line 4 = `  A = 1;   // note // dl:shared A` (33 chars):

    unit uR;
    interface
    const
      A = 1;   // note // dl:shared A
    implementation
    end.

    drag-lint lint uR.pas --rule shared-marker-legacy-shape --json
    CRLF file: start_col=12 end_col=35   (end = len+2: CR is inside the node)
    LF   file: start_col=12 end_col=34   (end = len+1: correct, exclusive end)

Also tests\lint\shared-marker-legacy-shape.pas (CRLF): line 6 len 38 -> end_col 40, line 7 len 41 -> end_col 43.

## Expected / actual
Expected: the comment node ends before the CR (end column <= line length + 1, node text has no \r).
Actual: node text ends with \r; end column = line length + 2.

## Suggested fix (not applied)
`seq('//', /[^\r\n]*/)`. Then add a corpus test with a CRLF line comment.

## Knock-on for drag-lint once the grammar ships
* Extraction surface (comment spans/text) -> DRAGLINT_EXTRACTOR_VERSION bump + re-parse.
* rules\shared-marker-legacy-shape.scm tolerates `[ \t\r]*` before `$`; harmless after the fix.
* Remove the TrimRight workaround in FixSharedMarkerLegacy and re-check SpanText
  (src\lint\fixers\DRagLint.Fix.Expr.pas) declines no longer happen on CRLF.

## Resolution (2026-11-19, lane 156)

Fixed in both grammars: `seq('//', /[^\r\n]*/)` (grammar.js and pure/grammar.js). tree-sitter-dfm already used `[^\r\n]*` -- no change.
Verified at byte level with the built DLLs: the CRLF repro's comment node was `// note // dl:shared A\r` (v1.4.13) and is now `// note // dl:shared A`; LF output is unchanged.
Corpus: test/corpus/line-comment-crlf.txt and pure/test/corpus/line-comment-crlf.txt (pinned `-text` in .gitattributes so the CRLF bytes survive). A corpus test compares tree shape only, so it guards the structure; the CR itself is checked by the gate's byte check.
