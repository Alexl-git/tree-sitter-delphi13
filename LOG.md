---
title: tree-sitter-delphi13 — Decision Log
project: tree-sitter-delphi13
type: append-only-log
mirror: C:\Projects\claude-obsidian\sessions\tree-sitter-delphi13\LOG.md
---

# tree-sitter-delphi13 — Decision Log

Append-only. Each entry documents one iteration / commit / decision.

---

## 2026-05-24 06:00  Iter 0 — Initial scaffold

**Goal**: fresh Delphi-13-only project derived from Isopod/tree-sitter-pascal (MIT). Address the architectural limitations that capped tree-sitter-pascal at ~90% by designing the right architecture from day 1.

**Created**:
- Project at `C:\Projects\tree-sitter-delphi13`. MIT license crediting Isopod / Philip Zander.
- Grammar.js forked from tree-sitter-pascal with all 22 proven fixes + Delphi-13-only flag lock-in (`fpc = false`, `objc = false`, etc.).
- Asm body as **opaque token** (asm-as-comment) — no asm sub-grammar.
- External scanner skeleton (`src/scanner.c`) declaring `pp_block` and `char_literal`. Currently no-op (returns false → grammar falls back to regex pp).
- Harness (`tools/parse-corpus.js`) with day-1 filtering for non-Delphi files.
- `tools/import-delphi-paths.ps1`: reads HKCU\Software\Embarcadero\BDS\37.0\Library\{Win32,Win64} for Library Path + Browsing Path, expands `$(BDS)`/`$(DXVCL)`/`$(BDSPROJECTSDIR)`/etc. macros, outputs unique existing Pascal-source dirs.
- Curated corpus: 17,081 files = hand-picked roots (ORM3, TableTools, Spring4D, OmniThreadLibrary, etc.) + 121 dirs auto-imported from registry + AsyncPro + Orpheus + DEMOSDIR.

**Baseline**:
- 17,081 files total
- 14,752 OK (86.42%)
- 2,320 FAIL
- 9 skip (template/fragment/binary)

**Notable: lower than tree-sitter-pascal's 90.70%** because the curated corpus is denser (Embarcadero RTL/VCL + full DevExpress + registry-imported component sources). It's the honest number for "what real Delphi-13 developers actually compile."

**Decisions**:
- Scanner is a skeleton; will be implemented next iteration with proper unit tests in `test/corpus/`.
- Preprocessor (`{$I X.inc}` expansion) deferred to optional companion library.
- Logs kept here AND mirrored to `C:\Projects\claude-obsidian\sessions\tree-sitter-delphi13\` for cross-session findability.

**Commit**: scaffold commit (see git log).

---

## 2026-05-24 07:00  Iter 1 — External scanner (pp_block + char_literal)

**Implementation**: `src/scanner.c` ~190 lines. Provides two external tokens:

- `pp_block`: consumes whole `{$IF*}...{$END*}` blocks with depth-counter
  nesting support. REFUSES blocks whose body starts with a structural keyword
  (unit/program/library/package/interface/implementation) — letting the
  parser see the wrapped declaration via the regex-pp fallback.
- `char_literal`: Delphi's `^X` control-char literal. Requires the next char
  NOT be an identifier-continuation char so `^M:` parses but `^TFoo` still
  parses as kHat + identifier.

**Key API insight verified**: tree-sitter rolls back the lexer position when
scan() returns false after calling advance(). My previous iter-15 in tree-sitter-pascal
failed because I conflated this with cooperative rollback in the structure
of the scanner; the API actually handles it cleanly when used correctly.

**Reverted** the iter-14 greedy regex pp from tree-sitter-pascal — the scanner
is now the single source of truth for `{$IF*}` blocks. The 89-file regression
that the greedy regex caused is dodged here.

**Probe results**:
- JvCaretEdit (IFDEF wraps free text) → PASS
- SynEditKeyConst (IFDEF wraps unit decl) → PASS (scanner refuses, regex pp handles directives separately)

**Full corpus delta**:
- 14,752 → 14,882 OK (+130 files, +0.76pp → 87.18%)

---

## 2026-05-24 07:30  Iter 2 — Keyword fixes (sealed/final/readonly/platform)

**Bugs found** in inherited grammar:
- `kSealed: $ => /seled/i` — TYPO, missing 'a'. Same kind of bug as the
  iter-3 `/safecal/` → `/safecall/` fix from tree-sitter-pascal.
- `kFinal` keyword not defined at all (used as method modifier).
- `kReadonly` not defined (used as OLE dispinterface property modifier).
- `kPlatform` was in `enable_if(fpc, ...)` only — needed in Delphi mode too.

**Grammar diff**:
- Fixed `/seled/i` → `/sealed/i`
- Added `kFinal: $ => /final/i`, `kReadonly: $ => /readonly/i`
- Added `$.kFinal, $.kPlatform` to procAttribute choice
- Added `$.kReadonly` to declProp accessor choice

**Full corpus delta**:
- 14,882 → 15,157 OK (+275 files, +1.61pp → **88.78%**)

The typo and missing keywords were responsible for blocking a couple of full
codebases (DevExpress, FireDAC RTL, Spring4D) — most of those files had
just one bad keyword each.

---

