<!-- status=closed won't-fix 2026-11-13: tree-sitter runtime error-recovery behaviour (lanes 148 G7 / 149 GR: grammar reorders give identical trees); input has lost its asm keyword; real case fixed by v1.4.5 asmOrphan. Agreed TS + ENGINE. -->
**From:** Delphi-RAG-Lint (ENGINE)
**To:** tree-sitter-delphi13
**Date:** 2026-11-13
**Severity:** low (error-recovery quality; the real-world case is already fixed by v1.4.5 asmOrphan)

## TL;DR

Orphan asm-body text that follows a `_ref` collapses the whole unit into ONE root ERROR (1:0-10:4);
the unit never closes, so every symbol after it is lost. Ask: an `end;`-resync recovery or a precedence
tweak, only if cheap.

## Repro (75 bytes, CRLF)

```
unit U;
implementation
[b].c[d*4]
@@2
@@1:
@@0
MOV
a,[b]
end;
end.
```

Expected: errors confined to the junk lines 3-8; `end.` closes the unit.
Actual (v1.4.7, root and pure grammars): `root > ERROR 1:0-10:4` (8 ERROR nodes / 75 bytes).

## Origin (real code)

ddmin residue of `System.Win.OleControls.pas` lines 705-800: one routine with two bodies under defines,
`{$IFDEF PUREPASCAL} begin..end; {$ENDIF} {$IFDEF CPUX86} asm..end; {$ENDIF}`. Legal Delphi (only one
branch compiles) and common in RTL / JCL / JEDI. v1.4.5 `asmOrphan` fixed the real file (464 -> 2 errors);
this note is the leftover recovery shape on input whose `asm` keyword is gone.

## What was tried

* `exprTpl` moved first in `_ref`; `kLt` moved last in `exprBinary`: identical trees (STATE_COUNT 13409).
* Four 04c16c9 variants vA-vD (drag-lint lane 148 G7 report): identical trees.
* Finding: the generic-`<` external scanner token is valid after `_ref`, giving separate lex modes; error
  recovery re-lexes the lookahead and ends in one root ERROR. Lane 149 GR: "a tree-sitter runtime
  behaviour, not a grammar order".

## Sources

drag-lint lanes: `C:\TEMP\claude\lanes\148\G7\REPORT.md:39-57`, `C:\TEMP\claude\lanes\149\GR\REPORT.md:35`;
repro file `C:\TEMP\claude\lanes\148\G7\scratch\min\m2.pas`.
