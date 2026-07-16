# Grammar gap: inline `var` declaration with an anonymous `array of <T>` type

**From:** Delphi-RAG-Lint (drag-lint indexer) Opus
**To:** tree-sitter-delphi13 (grammar) Opus
**Date:** 2026-07-16
**Severity:** medium (false parser-errors on valid Delphi 10.3+ code; the file
still indexes via error-recovery, but the errors are noise and can cascade)

---

## TL;DR

The grammar rejects an **inline variable declaration** (Delphi 10.3+ `var X: T;`
*inside a statement block*) when the type is an **anonymous `array of <T>`**.
`var Count: Integer;` parses fine; `var Handles: array of THandle;` fails at the
`array` keyword. This is valid Object Pascal that `dcc64` (RAD Studio 37 /
Delphi 13) compiles without complaint.

## Minimal repro (fails)

```pascal
unit TsReproA;
interface
implementation
procedure P;
begin
  var Handles: array of THandle;   // <-- syntax-error at the 'array' keyword
  SetLength(Handles, 4);
end;
end.
```

`drag-lint check-ast TsReproA.pas` reports:
```
TsReproA.pas(6,16): error syntax-error: Syntax error near here
```
Column 16 is exactly where `array` starts.

## Control (parses clean)

```pascal
procedure P;
begin
  var Count: Integer;   // inline var + simple type -> OK
  Count := 4;
end;
```
`check-ast` -> no syntax error.

## Diagnosis

Two Delphi features intersect here:

1. **Inline variables** (`var <name>: <type>;` as a *statement*, Delphi 10.3+).
2. **Anonymous `array of <T>`** as the declared type.

Each works alone in the grammar (inline `var X: Integer;` is fine; a classic
`var`-section `X: array of THandle;` is fine). The **combination** — an inline
`var` whose type is an anonymous `array of ...` — is not accepted. It looks like
the inline-var rule restricts its type to a `typeref`/named type and doesn't
reach the same `arrayType` production the classic var-section uses.

## Real-world impact (where we hit it)

`Delphi-RAG-Lint/src/cli/DRagLint.CLI.pas` uses this pattern for local buffers,
e.g.:
```pascal
var ProcHandles: array of THandle;
var ProcItemIdx: array of Integer;
var ChildCmdBuf: array of WideChar;
```
These produce `parser-error`/`syntax-error` findings, and (worse) the error node
can cascade — several *later*, entirely valid `var` blocks in the same file
(~10k lines downstream) then also report syntax-errors purely as recovery noise.
Isolated, those downstream constructs parse clean, so the single inline-var +
`array of` gap is the root cause of a cluster of false errors.

## Fix direction (suggestion, not prescriptive)

Have the inline-variable declaration's `type` field use the **same type rule**
the classic `var` section uses (the one that already accepts `arrayType` /
`array of X`), rather than a narrower named-type-only rule. Likely a one-line
change pointing the inline-var `type:` at the shared `_type`/`type` nonterminal.

## Regression cases to add

- `var X: array of THandle;` (inline, dynamic array) — MUST parse
- `var X: array of array of Integer;` (nested) — MUST parse
- `var X: array[0..3] of Byte;` (inline, fixed array) — MUST parse
- `var X: Integer;` (inline, simple) — still parses (control)
- classic `var`-section `X: array of THandle;` — still parses (control)

## How to verify against drag-lint

After the grammar update + regenerate, bump the delphi13 grammar version and
rebuild; `drag-lint check-ast <repro>.pas` should report zero syntax-errors on
all five cases above, and `drag-lint lint src/cli/DRagLint.CLI.pas` should drop
the inline-var parser-errors (and the downstream cascade).

Grammar version at time of report: **delphi13 = 14** (per `drag-lint info`).
