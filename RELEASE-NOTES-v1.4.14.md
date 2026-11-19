# tree-sitter-delphi13 v1.4.14

Grammar release on top of v1.4.13 (root grammar and `pure/`). One fix, requested by drag-lint
1.52.1: on a CRLF file, a `//` line comment no longer includes the trailing carriage return.
No tree changes shape: no node is added, removed or retyped, and no file that parsed clean
on v1.4.13 fails on v1.4.14. The only change anywhere is the end position of `comment` nodes
(and of nodes that end with such a comment), which now stop before the CR.

## Fixed

- **A `//` comment included the CR of a CRLF line ending** (both grammars). The rule was
  `seq('//', /.*/)`, and tree-sitter's `.` excludes only `\n`, so on Windows line endings the
  comment's text ended in `\r` and its end column was one past the line. It is now
  `seq('//', /[^\r\n]*/)`. LF files are unaffected. tree-sitter-dfm already used `[^\r\n]*`,
  so it is unchanged (still 1.2.0).

  ```pascal
  const
    A = 1;   // note       <- CRLF file: node text was "// note\r", now "// note"
  ```

  A tool that reads comment text (markers such as `// dl:shared`, TODO scanners, doc-comment
  extractors) no longer needs to trim the CR. A tool that caches comment ranges must re-parse.

## Gate (vs v1.4.13)

| corpus | files | newly failing | trees changed | change other than a dropped CR |
|---|---|---|---|---|
| c8286 (root) | 8012 | 0 | 5298 | 0 |
| c8286 (pure) | 8012 | 0 | 5306 | 0 |
| Delphi 5 sources (root / pure) | 279 | 0 | 126 / 126 | 0 (3 files end lines in CR CR LF; both CRs leave the comment) |
| production projects | 671 | 0 | 639 | 0 |
| drag-lint sources | 2359 | 0 | 1027 | 0 |

ERROR coverage: no file better or worse in either grammar. `tree-sitter test`: root 147/147,
pure 27/27, including the new CRLF corpus test `line-comment-crlf.txt` (pinned `-text` in
`.gitattributes` so git keeps its CRLF bytes).