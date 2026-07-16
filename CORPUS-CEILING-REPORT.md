# Corpus ceiling report — what we cannot parse, and why

**Date:** 2026-07-16
**Grammar:** master @ HEAD + the `Local` / `DispID` fixes of 2026-07-16
**Method:** every unique failure inspected individually; each claimed "valid Delphi"
construct isolated into a minimal repro and **verified against `dcc32` (RAD Studio 37)**.

---

## 0. ADDENDUM 2026-07-16 (b+c, v1.2.0) — the ranked path was executed; gap 0.275% → 0.035%

Eleven commits later (`6f10463`…v1.2.0, same day), the numbers in §1 are superseded:

| Corpus | ok / readable | rate | gap |
|---|---|---|---|
| Master, raw rows | 16,275 / 16,508 | 98.588% | 1.412% |
| Orchestrated, raw rows | 16,470 / 16,508 | **99.770%** | 0.230% |
| Orchestrated, deduped | 11,288 / 11,322 | **99.700%** | 0.300% |
| Orchestrated, deduped + Delphi-13-only | 11,288 / 11,292 | **99.965%** | **0.035%** |

Late-session additions (c): the **dcc-tolerance pass** (preprocessor, opt-in) closed
the no-`;` directive-tail trio AND the "architecturally blocked" `array[..] of T`
last-field trio at the text level; the **label-as-body** and **lenient-directive-tail
(interface lists)** grammar restructures then landed cleanly too — each needed only
NAMED conflicts, defeating both previously-recorded cascades. Remaining real gaps:
**4 rows** — System.pas ×2 (platform-before-initializer, the bisect-confirmed
declVar table bomb; an untried `typeref`-trailing-`platform` angle is noted in
TODO.md) and D3D10 ×2 (`Register:` field, documented not-worth-it).

What changed (full detail in TODO.md "Session 2026-07-16 (b)"):

- **The "chained adjacent IFDEF arms" cluster (§3.3's top lever) was never a grammar
  gap.** The preprocessor discarded `{$DEFINE}`s made inside `{$I}`-included files in
  expand mode and could not resolve includes outside the file's own directory, so
  EurekaLog's `ELDefines.inc` (in `Source\Common\`) never defined `CPU64` — both arms
  blanked. Fixed in the preprocessor (defines propagation + nearest-first search).
- **Implicit `begin..end.` initialization** — fixed via the unit-tail restructure §4
  called for (library-shaped `tr($,'block')` arm + one declarable `[$.implementation]`
  conflict). Also recovered AsyncPro APFPDENG ×2, which §5's stale note had
  mis-attributed.
- **Text after final `end.`**, **nested generic in a method resolution clause**, and a
  new class — **control chars ≤ #31 between tokens** (dcc treats them as blanks;
  dxPDFForm's stray 0x12) — all fixed in the grammar.
- **System.AnsiStrings** was a preprocessor LEXER bug (MASM `"..."` operand in an asm
  arm mis-paired `'`-strings and swallowed `{$ENDIF}`s). **Velthuis.BigIntegers** was a
  BOM spliced mid-unit from an included file. **umlauts** (UTF-16) and
  **Posix.SysSocket** (wrong platform profile) were harness measurement artifacts.

Reclassified out of "real": `TargetB.pas` ×2 (extra `end;` — INVALID_SRC),
`OtlAsyncStreams.Common.pas` (`?` placeholder args — INVALID_SRC), `paswstring.pas`
(FPC `[external name]` exposed once include defines propagate — NOT_DELPHI_FPC).

**The 13 remaining real-gap rows** (all parked with recorded reasons, see TODO.md):
no-`;` final directive group (dxCryptoAPI, dxServerModeUtils, dxGDIPlusAPI), labeled
then/else/loop-body (LFN ×2, superobject), System.pas ×2 (needs BOTH the labeled-body
fix and the `platform`-before-initializer arm — the latter bisect-confirmed to explode
`tree-sitter generate`), `Register:` field (D3D10 ×2), `array[..] of T` last-field-no-`;`
(MongoDBCli, ShlObj, SHX).

---

## 1. Headline

| Corpus | ok / readable | rate | gap |
|---|---|---|---|
| Master (raw → full grammar), **raw rows** | 16,244 / 16,508 | 98.401% | 1.599% |
| Master, **deduped** | 11,155 / 11,322 | 98.525% | 1.475% |
| Orchestrated (preprocessor → pure), **raw rows** | 16,420 / 16,508 | 99.467% | **0.533%** |
| Orchestrated, **deduped** (each physical file once) | 11,255 / 11,322 | **99.408%** | **0.592%** |
| Orchestrated, **deduped + Delphi-13-only** | 11,255 / 11,286 | **99.725%** | **0.275%** |

Session delta (same raw basis, so directly comparable to the previously-published figure):
**orchestrated gap 0.557% → 0.533%**; master `ok` 16,242 → 16,244 with **zero
regressions**. The `Local` and `DispID` fixes recovered 2 unique files corpus-wide
(`System.Win.ObjComAuto.pas`, `Vcl.OleCtrls.pas`) — plus all of drag-lint's own `src/`,
which was never in this corpus.

**The honest headline is 99.725% / 0.275% gap** on real, compilable Delphi 13 — but only
once two measurement defects are corrected and non-Delphi input is excluded. Read §2
before quoting any of these numbers.

## 2. Two measurement defects found (read this first)

### 2.1 The corpus counted ~31% of files twice

`work/manifest-baseline.txt` had **17,081 rows for 11,722 real files** — 5,359 duplicate
rows. Two causes, both now fixed in `tools/build-manifest.ps1`:

- **Overlapping roots.** `tools/corpus-roots.txt` lists whole trees
  (`...\DevExpress\VCL`) while the registry-imported `tools/delphi13-roots.txt` lists
  *subdirectories of those same trees* (`...\DevExpress\VCL\ExpressBars\Sources`). The
  builder did `$roots | Sort-Object -Unique`, which dedupes root *strings* but cannot see
  nesting, so every overlapped file was emitted once per covering root.
- **Case-variant paths.** `...\SOURCE\RTL\SYS\System.pas` and `...\source\rtl\sys\System.pas`
  are the *same file* on Windows, but were counted as two.

Fix: dedupe the emitted file list on the case-insensitive full path. Verified — 5,077
duplicate rows suppressed, 0 remaining.

**Consequence:** the deduped gap (0.592%) is *higher* than the previously-published
0.557%. **Nothing regressed.** The old denominator was padded with duplicate *passing*
files, which flattered the ratio. 0.592% is the more honest number for the same grammar.

### 2.2 The `-2 ok` vs session-4 is DevExpress churn, not a regression

DevExpress ships roughly monthly; 154 manifest paths no longer exist on disk. Those
files leave both numerator and denominator, so the rate is unaffected.

### 2.3 Scoring rule (easy to get wrong)

`parse-corpus*.js` emits an `error` key for files it *intentionally excludes* — 573 rows
here: 410 `inc_fragment` (`.inc` fragments that are not standalone units), 154
`read_failed`, 7 `interpreter_fragment`, 2 `template_placeholder`. **These are not parse
failures.** Score `ok / (total - excluded)`. Counting them as failures yields a bogus
~95%.

## 3. The 67 unique failures, classified

Every row below was opened and diagnosed. Nothing is inferred from filenames.

### 3.1 Excluded — not Delphi 13 source (36 files)

These are removed from the adjusted denominator. **`dcc32` cannot compile any of them.**

| n | class | what they are |
|---|---|---|
| 18 | **INVALID_SRC** | genuine syntax errors — `dcc32` rejects them too |
| 9 | **INTENTIONAL_FIXTURE** | YADF formatter inputs that exist *precisely* to be broken |
| 4 | **HARNESS** | parse clean; only the corpus harness fails them |
| 3 | **NOT_PASCAL** | not Pascal at all |
| 1 | **NOT_DELPHI_DOTNET** | `[assembly: RuntimeRequiredAttribute(...)]` — .NET only |
| 1 | **NOT_DELPHI_FPC** | `is nested` + `{$modeswitch nestedprocvars}` — FreePascal only |

Notable members:

- `Loader2019\NOTREADYLIST.PAS` — a **plain text log** (`NOT READY: 73. READINGS SUM=1...`).
- `Loader2019\FORPROJECT.PAS`, `TABLELIST.PAS` — **headerless fragments** (a `.dpr`
  uses-list; a bare statement list). No `unit`/`program`/`library` header at all.
- `Loader2019\uMICROLCK.pas` (457 B), `uTIMEBRK.pas` (201 B) — **truncated on disk**, cut
  off mid-identifier (`tblTIMEBRKID: TAutoIncFi`). Plus 4 backup copies of the same two.
- `MMSRV\uPipeCommon.pas` — stray extra `end;` at L1196. `MMSRV\uPipes.Threads.pas` —
  `Result := ;` ModelMaker stubs at L1416/L1422. **Neither unit compiles today.**
- `YADF\.private\uStyles_proprietary.pas` — mangled by `//`-based redaction (a `{` inside
  a line comment, dangling `else`).
- `Indy\...\IdStackDotNet.pas`, `IdStackLinux.pas` — plain **missing `)`**, *not* .NET/Linux
  syntax. The grammar handles their .NET code fine.
- **HARNESS**: `umlauts.pas` (UTF-16LE — parses clean), `Velthuis.BigIntegers.pas` and
  `fibplus\...\Zlib.pas` (both pass on the master path), `dxPDFForm.pas` (a single stray
  `0x12` byte; strip it → 100% clean).

### 3.2 By design — documented non-goals (3 files)

| n | class | detail |
|---|---|---|
| 2 | `BY_DESIGN_IFDEF` | one routine header + two alternative bodies under `{$IFDEF}` arms (`System.AnsiStrings`, `Posix.SysSocket`) |
| 1 | `BY_DESIGN_INCLUDE` | routine body supplied by `{$I VarFnc.inc}` — no filesystem include resolution (`fibplus\VariantRtn.pas`) |

### 3.3 Real gaps — valid Delphi 13 we cannot parse (28 files)

All dcc32-verified. **This is the actual remaining work.**

| n | gap | status |
|---|---|---|
| 5 | **Chained adjacent IFDEF arms** — `{$IFDEF A}x{$ENDIF}{$IFDEF B}y{$ENDIF}`. The `{$IFDEF A}x{$ELSE}y{$ENDIF}` form parses; chaining does not. All 5 EurekaLog. | open — best single lever |
| 4 | **Implicit `begin..end.` initialization** — the Turbo-Pascal form of `initialization..end.`, still accepted by dcc 13. | **attempted + reverted** (see §4) |
| 3 | **No trailing `;` after a routine directive** (`stdcall` / `overload` / `deprecated '<msg>'`) in a forward decl. 3 DevExpress files; dcc32 exit 0. | open |
| 3 | **`array[..] of T` as last record field, no `;`** (`MongoDBCli`, `ShlObj`, `SHX`). | architecturally blocked |
| 3 | **Label as a loop/then-branch body** (`while true do redo: case ...`). | previously attempted + reverted |
| 2 | **Record field named after a callconv keyword** (`Register: UINT;`, D3D10/D3D10_1). | open — low value, high risk |
| 2 | **asm scanner ends the block at the word `end` inside a `{}` comment** (`AwFView.pas`). | open — self-contained |
| 2 | **Text after final `end.`** (dcc: `W1011 ... ignored by compiler`). | open |
| 2 | **Nested generic in a method resolution clause** — `function TFunc<T1, IEnumerable<TResult>>.Invoke = Bind;` | open (see §4) |
| 2 | **`platform` hint + initializer** — `X: UInt32 platform = $0;` (`System.pas` + a backup copy; also has IFDEF causes) | open |

## 4. Fixed this session, and what was deliberately not

**Fixed:**

- **`Local` as a var name after a prior decl** — `local` is a `procAttribute`, so
  `var X: Integer; Local: Integer;` had the parser eat `Local` as a trailing directive.
  This closed the `DoSelfTestManifestMerge` error that `f85b412` recorded as *"resisted
  synthetic isolation; not the keyword-name family"* — it **was** that family.
  **drag-lint src: 99.12% → 100%.**
- **`DispID` as a var name after a prior decl** — identical family (`dispid` is a
  property/method directive). Recovers `System.Win.ObjComAuto.pas` and `Vcl.OleCtrls.pas`.

**Attempted and reverted — implicit `begin..end.` initialization (4 files):**

Adding `optional($.initializationImplicit)` to the `unit` rule needs a declared conflict
on `implementation` (whose `_definitions` can start with `begin` via `_definition`'s
`prec(-1)` `blockTr` recovery rule). Resolving that cascades to
`initialization`/`finalization` and then into `_statementsTr` / `_statementsTr_repeat1` —
an unbounded GLR cascade, the same shape as the previously-reverted labeled-loop attempt.

The cheap alternative — accept a bare `.` and let `blockTr` eat the `end` — makes the
unit's `end` effectively **optional**, so a genuinely missing `end` would parse clean.
For a linter consumer that trades 4 files for silently hiding real errors. Rejected.

A real fix restructures the unit tail from `repeat(choice(...))` into an ordered sequence
so `initialization` and `initializationImplicit` are mutually exclusive. That deserves its
own corpus diff. Reasoning is recorded inline at the `unit` rule in `grammar.js`.

**Not attempted — nested generic in a method resolution clause:** root cause found —
`genericArg`'s name is `delimited1($.identifier)`, i.e. **bare identifiers only**, so
`TFunc<T1, TResult>` parses but `TFunc<T1, IEnumerable<TResult>>` cannot. Widening it
risks ambiguating genuine constraint declarations (`<T: class>`); needs its own diff.

## 5. Stale records corrected

Prior notes proved wrong on five counts — all re-verified:

1. `TAlias = Dotted.Type deprecated;` was listed **open**; it was fixed in `a8cb43f`.
2. `class function F: TObject {$IFDEF} unsafe {$ENDIF};` listed **open**; parses clean.
3. `CLI.pas L8398` recorded as **"not the keyword-name family"**; it was exactly that.
4. `dxServerModeUtils` recorded as a **source typo** ("tolerating it would mask real
   errors"); dcc32 compiles it **exit 0** — it is a real gap.
5. `genericinterfacemethoddelegation.pas` assumed **FPC-only**; it is valid Delphi.

Also: the AsyncPro Win9xME files were assumed asm-driven — `APFPDENG.pas` contains **zero**
asm blocks, and `LFN.pas` has 19 that all parse.

## 6. Can we reach 0.1%?

Not by excluding more — the exclusions are already exhausted (§3.1 covers everything that
is not compilable Delphi). Getting from **0.275%** to 0.1% means fixing ~20 of the 28
remaining real-gap files. Ranked by value:

1. **Chained IFDEF arms — 5 files.** Biggest single lever.
2. **Implicit `begin..end.` init — 4 files.** Needs the unit-tail restructure of §4.
3. **Missing `;` after directive — 3 files.** Self-contained.
4. **asm `end`-in-comment — 2 files.** Self-contained scanner fix, low risk.
5. **Text after final `end.` — 2 files.**

Those five ≈ 16 files → roughly **0.13%**. The remainder (`array` last field, labeled
statements, `Register` field) are the documented architecturally-blocked set. **0.1% is
reachable but not free**, and every one of these needs a full-corpus pre/post diff.
