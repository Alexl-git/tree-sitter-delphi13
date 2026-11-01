<!-- status=done 2026-10-31: multi-line literals fixed in v1.4.0 (2b91b64), both grammars -->
<!-- filed by drag-lint engine session 2026-09-23; drag-lint side neutralises this in its preprocessor (extractor 1.19.0-alpha), but the literal text it harvests is lossy until the grammar handles it -->
# Grammar request -- tree-sitter-delphi13: Delphi 12+ multi-line string literals

Status on the drag-lint side: NEUTRALISED in the preprocessor (extractor 1.19.0-alpha,
`DRagLint.Preprocess.Tolerance.NeutralizeMultilineStrings`), so drag-lint no longer fails on these
units. The neutralisation blanks apostrophes / open-braces inside the body, so the harvested literal
text is lossy and `--no-preprocess` still fails. The proper fix is in the grammar.

## What already works

`grammar.js` `_literalString` has `token(prec(2, /'''[\s\S]*?'''/))`. A body with no apostrophe
parses, and two literals in one unit stay two tokens (the lazy quantifier holds).

## Repro 1 -- apostrophe in the body (the common case: HTML/SQL/JS templates)

```pascal
unit uV;
interface
implementation
function Page: string;
begin
  Result := '''
    it's here
    ''';
end;
end.
```

`drag-lint lint uV.pas --no-preprocess` -> `syntax-error` at 1:1. Same for `a 'b' c` in the body
(10:8). A doubled `''` in the body parses. Likely cause: the single-quoted token
`/'([^']|'')*'/` admits newlines (`[^']`), so `'''<EOL>    it'` is a complete single-quoted string
and wins over the triple-quote token.

## Repro 2 -- 5-quote delimiter (dcc accepts any odd count >= 3, so ''' may appear inside)

```pascal
  Result := '''''
    holds ''' inside
    ''''';
```

-> `syntax-error` at 1:1. No token for it.

## Expected

* Both parse as ONE `literalString` node spanning opener to closer, children as today for the
  triple-quote form (a single `_literalString` token).
* Delphi rule (for reference): opener = an odd run of N >= 3 quotes followed only by whitespace to
  end of line; closer = the first later line whose first non-blank characters are exactly N quotes;
  the body is verbatim (no doubling). An external scanner is probably the clean way to do the
  "same N on its own line" match.
* Suggested companion change: exclude `\r` / `\n` from the single-quoted token body
  (`/'([^'\r\n]|'')*'/`) -- Pascal ordinary strings cannot span lines, and this alone likely fixes
  Repro 1.

Source of the report: `C:\Projects\Delphi-RAG-lint\stats\draglint-gaps.log` 2026-09-23T12:12:55
(`DragLint.Graph.Export.pas`, 34 parser-error sites before the file was rewritten as string arrays).
Fixtures: `tests\preprocess\run_multiline_string.ps1` in Delphi-RAG-lint (branch
feat/fix-extractor-batch).
