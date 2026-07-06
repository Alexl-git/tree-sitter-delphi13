# tree-sitter-delphi13 v1.1.0

Grammar-coverage release. Closes six real statement- and declaration-level gaps
in the master (`tree-sitter-delphi13`) grammar surfaced by indexing real,
compiler-clean Delphi 13 code with [Delphi-RAG-lint](https://github.com/Alexl-git/Delphi-RAG-lint).
Backward-compatible: no previously-valid parse changes shape except where noted.

## Headline

Full-corpus (17,081-file) self-contained master-grammar pass rate:
**98.22% → 98.32%** (zero ERROR nodes). Every fix was gated on a full pre/post
corpus diff requiring **0 regressions**, and ships with a corpus regression test.

On the Delphi-RAG-lint first-party tree the master grammar went **97.3% → 99.1%**.

## Fixes

| Construct that now parses | Was |
|---|---|
| `unit U platform;` / `experimental;` / `library;` (unit-level hint directive) | only `deprecated` accepted |
| inline `var Y: array of Integer;` (+ initializer form `var Buf: array of Byte := nil;`) | errored on the `array of` span |
| `record ... N: string end` — bare `string` as the last field with no trailing `;` | errored before `end` |
| `class function NewInstance: TObject unsafe; override;` (ARC/AUTOREFCOUNT directive) | `unsafe` unrecognized |
| `while (X < Read) do` — `<` before a soft keyword (`Read`/`Write`/`Name`/`Message`) | mis-parsed as a generic `X<Read>`, inserted a phantom `>` |
| `var X: string; Platform: string;` — a hint/callconv keyword (`Platform`/`Register`/`Deprecated`/`Experimental`) as a variable name after a prior decl | eaten as a trailing hint on the previous var |

## Notes for consumers

- The `unsafe` directive is accepted **inline** (`: T unsafe;`), matching all
  observed corpus usage; the post-`;` form (`: T; unsafe;`) is intentionally not
  added, so `Unsafe` stays usable as a type/identifier name.
- Removing the `Read`/`Write`/`Name`/`Message` aliases from the type-reference
  rule does not affect property accessors (`property X read F write F`) or
  genuine type-name uses — those still parse.

## Known follow-ups (tracked in TODO.md)

- The same keyword-as-name fix for **record/class fields** (`Winapi.D3D10
  Register: UINT;`) is deferred — it destabilizes the parser tables.
- `array of T` as a last record field with no `;`, and `TAlias = A.B.C deprecated;`
  (trailing hint on a dotted type-alias RHS) remain open.
- These grammar fixes live in the **master** grammar (`grammar.js`). To lift the
  preprocessor/orchestrated path (99.33%), they still need porting to
  `pure/grammar.js`.
