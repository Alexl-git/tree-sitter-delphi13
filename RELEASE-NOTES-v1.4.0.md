# tree-sitter-delphi13 v1.4.0

Two grammar fixes, applied identically to both grammars (`tree-sitter-delphi13`
and `tree-sitter-delphi13-pure`). No query or binding changes.

## Directive words as names

Delphi's directive words -- `platform`, `message`, `index`, `name`, `default`,
`read`, `write`, `absolute`, `deprecated` and 60 more -- are not reserved: the
compiler accepts them as ordinary identifiers. Earlier releases turned many of
them into parse errors when they appeared as a name, e.g.

```pascal
type
  TRec = record
    Kind: Integer;
    Message: string;      // ERROR before 1.4.0
  end;
  TA = Integer;
  Platform = Integer;     // ERROR before 1.4.0
```

An external-scanner token now recognises a directive word **only in a name
position** (field, variable, constant, type, parameter, inline `var`) and only
when the next token makes it a name (`:` / `,` for declarations, `=` / `:` for
constants and types). It is aliased to `identifier`, so trees and queries see
an ordinary name. Everywhere else the words keep their directive meaning. The
visibility words (`private`, `public`, ...) are deliberately not in the list.

`test/corpus/directive-word-matrix.txt` puts all 69 words in 9 name positions.

## Multi-line string literals (Delphi 12+)

```pascal
const
  Sql = '''
    select *
    from T
    ''';
```

An odd run of three or more quotes followed by end-of-line opens a multi-line
literal; the first line that starts (after indentation) with the same number of
quotes closes it. Ordinary `'...'` strings no longer run past end-of-line, so an
unterminated string is now a local error instead of swallowing the rest of the
file.

## Measurements

Zero regressions on every corpus, checked file by file rather than by totals:

| Corpus | Before | After |
|---|---|---|
| Directive-word matrix (1,506 cases), error files | 122 | **0** |
| RAD Studio RTL raw (2,222 files), full / pure error files | 34 / 276 | 34 / 276 |
| ORM3 raw (786 files), full / pure error files | 1 / 6 | 1 / 6 |
| All-Delphi harness, 17,081 files | -- | 0 files worse, 2 better |
| `delphi13-preprocessor` -> pure, RAD Studio 37.0 (2,218 files) | 2217 / 2217 | **2217 / 2217** |

The headline numbers stand: **98.47%** for the master grammar alone on raw
RAD Studio source, **100.000%** for preprocessor -> pure.

## For downstream consumers

* Directive words used as names appear as `identifier`; the new scanner tokens
  are hidden. The one node-types change: a variable declaration may now carry a
  `kLibrary` child, for the `library` portability hint
  (`var X: Integer library;`), alongside the existing `kPlatform` /
  `kDeprecated` / `kExperimental`.
* Tools that pre-processed multi-line strings away before parsing can stop
  doing so.
