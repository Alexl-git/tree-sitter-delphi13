# tree-sitter-delphi13 v1.1.2 / tree-sitter-delphi13-pure v1.1.1

**Date:** 2026-07-16

Three grammar fixes, one measurement-integrity fix, and a full diagnosis of every
remaining corpus failure. No breaking changes; all node types are additive.

---

## Grammar fixes (root + pure, in lockstep)

### 1. `Local` as a variable name after a prior declaration

`local` is a `procAttribute` (an FPC directive), so after a preceding `declVar` the
parser consumed `Local` as a trailing directive on the *previous* variable and then
choked on the dangling `: <type>;`.

```pascal
procedure P;
var
  X: Integer;
  Local: Integer;   // <-- errored at the ':', but ONLY when not the first decl
begin
end;
```

Fix: `alias($.kLocal, $.identifier)` in `declVar`'s name list — the same treatment
`f85b412` gave `platform`/`deprecated`/`experimental`/`register`. A name is followed by
`:`, a directive by `;`, so GLR forks and resolves cleanly.

**This closes the error `f85b412` recorded as _"the last CLI.pas error (L8398,
DoSelfTestManifestMerge) resisted synthetic isolation; not the keyword-name family"_.**
It *was* that family — the earlier isolation attempt never tried `Local` as the offending
name (`Global` on the preceding line was a red herring).

Impact: **drag-lint `src/` 99.12% → 100%** (`DRagLint.CLI.pas`: 7 → 0 syntax errors).

### 2. `DispID` as a variable name after a prior declaration

Identical family — `dispid` is a property/method directive. Recovers
`System.Win.ObjComAuto.pas` and `Vcl.OleCtrls.pas` from the Embarcadero RTL.

### 3. asm: a bare `end` inside a comment no longer terminates the block

`asmBody` is one opaque token that runs to the next word-boundary `end`. It did not skip
comments, so this closed the block early:

```pascal
asm
  add edi,ecx {point EDI to end of destination}   // <-- block ended here
  mov eax,1
end;
```

`{$IFDEF}`/`{$ENDIF}` were already safe (the `end[A-Za-z0-9_]` alternative covers
`endif`), but a comment containing the bare *word* `end` was not. Fix: consume `{...}`
and `//...` comments as single chunks, ahead of the single-char alternatives.

Impact: **+4 files** — `AwFView.pas` (×2 copies) plus EurekaLog `ECompatibility.pas` and
`EInject.pas`, which turned out to be blocked by this rather than by their IFDEF chains.

## Tooling fix — the corpus counted ~31% of files twice

`tools/build-manifest.ps1` emitted **17,081 rows for 11,722 real files** (5,359
duplicates). Two causes:

- **Overlapping roots** — `corpus-roots.txt` lists whole trees (`...\DevExpress\VCL`)
  while the registry-imported `delphi13-roots.txt` lists *subdirectories of those same
  trees*. `$roots | Sort-Object -Unique` dedupes root strings but cannot see nesting.
- **Case-variant paths** — `...\SOURCE\RTL\SYS\...` vs `...\source\rtl\sys\...` are the
  same file on Windows.

Fixed by deduping emitted files on the case-insensitive full path (5,077 rows
suppressed, 0 remaining). **Consequence: published rates shift slightly — the old
denominator was padded with duplicate _passing_ files, which flattered the ratio. Nothing
regressed.**

## Measurements

| Path | ok / readable | rate | gap |
|---|---|---|---|
| master (raw → full grammar) | 16,251 / 16,508 | 98.443% | 1.557% |
| master, deduped | 11,161 / 11,322 | 98.578% | 1.422% |
| orchestrated (preprocessor → pure) | 16,426 / 16,508 | **99.503%** | **0.497%** |
| orchestrated, deduped | 11,259 / 11,322 | **99.444%** | **0.556%** |
| orchestrated, deduped + Delphi-13-only | 11,259 / 11,286 | **99.761%** | **0.239%** |

Session delta, **zero regressions on either path**: master `ok` 16,242 → 16,251 (+9),
orchestrated `ok` 16,416 → 16,426 (+10). On the raw basis previously published, the
orchestrated gap moved **0.557% → 0.497%**.

The asm-comment fix over-delivered: predicted +2 files, actually **+6 unique on master**
(`System.Rtti.pas`, `AwFaxCvt.pas` ×2, `CADtoHPGL.pas`, `AwFView.pas` ×2) and +4 on the
orchestrated path.

Own projects (master path, no preprocessor): **drag-lint `src/` 100%** (139/139),
**drag-lint-graph 100%** (31/31), ORM3 99.74%.

`Delphi-RAG-lint` and `Delphi-RAG-Lint-Graph` are now permanent corpus roots — their
absence is precisely why the `Local` gap survived: no other file in 11,722 names a
variable `Local`.

## Also in this release

- **[CORPUS-CEILING-REPORT.md](CORPUS-CEILING-REPORT.md)** — every remaining failure
  individually diagnosed and dcc32-verified, with the ranked path to 0.1%.
- Corrected stale records in `TODO.md`: two gaps listed open were already fixed; the
  `L8398` diagnosis was wrong; and DevExpress `dxServerModeUtils` was recorded as a
  *source typo* — dcc32 compiles it **exit 0**, so it is a real gap.
- Documented, in-grammar, why three attempted fixes were reverted (see below).

## Known gaps (documented, with the exact blocker)

Attempted and reverted this cycle — each is recorded inline in `grammar.js` with the
precise conflict and what a real fix requires:

- **Implicit `begin..end.` initialization** (4 files). Needs a declared conflict on
  `implementation`, which cascades into `_statementsTr` internals. The cheap alternative
  (accept a bare `.`) would make the unit's `end` effectively optional, so a genuinely
  missing `end` would parse clean — unacceptable for a linter consumer.
- **Final directive group with no trailing `;`** (3 DevExpress files) — *verified valid*
  (dcc32 exit 0). The with-`;` and no-`;` forms share their entire prefix, and the fork
  lands between two auto-generated hidden repeat rules that cannot be named in
  `conflicts`.
- **Nested generic in a method resolution clause** — root cause identified:
  `genericArg`'s name is `delimited1($.identifier)`, i.e. bare identifiers only.

Still open and unchanged: `array[..] of T` as an unterminated last record field
(architecturally blocked), labeled statements as loop bodies, `Register` as a record
field name (2 files vs. parser-table blow-up — judged not worth it).
