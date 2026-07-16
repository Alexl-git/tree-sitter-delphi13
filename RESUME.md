# RESUME — tree-sitter-delphi13

Cold-start pointer. Written 2026-07-16 (b) — supersedes the morning version. Read this
first, then [TODO.md](TODO.md) (ranked gaps + this session's table) and
[CORPUS-CEILING-REPORT.md](CORPUS-CEILING-REPORT.md) (§0 addendum = current state).

---

## Status — coverage sprint DONE (6 commits, unpushed); npm publish of v1.1.2 still NOT done

Two independent threads:

1. **npm publish (from the morning session): still blocked on auth only.**
   `npm whoami` → E401. v1.1.2 (root) / 1.1.1 (pure) are committed, tagged and PUSHED;
   only `npm login && npm publish` in root and `pure/` remain. NOTE: 6 newer commits
   now sit on master past the v1.1.2 tag — publishing the tag content is unaffected,
   but consider whether to cut v1.2.0 with today's work instead.

2. **Coverage sprint 2026-07-16 (b) — COMMITTED, NOT pushed, DLLs NOT yet rebuilt for
   drag-lint** (see "Next actions" below).

## Numbers after the sprint (baseline → now, zero regressions at every step)

| path | before | after | fails |
|---|---|---|---|
| orchestrated (preprocessor → pure), raw | 16,426 / 16,508 = 99.503% | **16,455 / 16,508 = 99.679%** | 82 → **53** |
| master (raw → full grammar), raw | 16,251 / 16,508 = 98.443% | **16,266 / 16,508 = 98.534%** | 257 → 242 |
| orchestrated, deduped + Delphi-13-only | 99.761% (gap 0.239%) | **99.885% (gap 0.115%)** | 27 → **13** rows |

The ceiling report's "path to 0.1%" is effectively executed (0.115%).

## The 6 commits (in order)

| sha | what |
|---|---|
| `6f10463` | preprocessor: include `{$DEFINE}`s PROPAGATE in expand mode (dcc semantics) + nearest-first include search (subdirs, then ≤3 parents each with subdirs). Killed the whole "chained IFDEF arms" cluster — it was never a grammar gap. |
| `f7f590f` | preprocessor: blank decoded UTF-8 BOM, incl. inside spliced includes (Velthuis `bases.inc`) |
| `9bfffa9` | grammar (root+pure): **implicit `begin..end.` unit initialization** — unit-tail restructured (init/final moved into the kEnd arm, library-shaped `tr($,'block')` alternative, ONE declarable `[$.implementation]` conflict; the old flat-repeat cascade is gone) |
| `32766a4` | preprocessor lexer: MASM `"..."` asm strings + quote skips line-bounded (System.AnsiStrings `CMP AL,"'"` swallowed `{$ENDIF}`s) |
| `fa9ce2e` | grammar (root+pure): `trailingText` after final `end.` (W1011) · `genericArgTpl` nested generic in method-resolution clause · `_space` includes `\x00-\x1F` (dcc treats ctrl chars as blanks) |
| `9ce187b` | harness: BOM-sniffing UTF-16 reads + POSIX define profile (replaceBase) for `\rtl\posix\` |

Regression fixtures added: `implicit-init.txt`, `trailing-text.txt`,
`generic-resolution-nested.txt`, `ctrl-char-ws.txt`. Preprocessor tests:
`test-include-resolve.js`, `test-bom.js`, `test-asm-quotes.js` (all suites green).

## Next actions (ranked)

1. **Push master** (6 commits are local-only).
2. **Rebuild drag-lint DLLs + refresh live copies + INBOX note** — drag-lint runs the
   MASTER path from `tree-sitter-delphi13.dll`; nothing lands there until the DLLs are
   rebuilt (recipes: `Delphi-RAG-lint/build/_buildgrammar{32,64}_manual.bat`, run via
   PowerShell `Start-Process -Wait` WITHOUT `-NoNewWindow`). New visible CST nodes for
   consumers: `trailingText`, `genericArgTpl`, and `block` as a direct `unit` child
   (implicit init). Their Delphi preprocessor port must mirror 3 changes to stay
   oracle-green: expand-mode define sharing, nearest-first include search, BOM strip,
   MASM-quote lexing (4, counting the lexer).
3. **npm**: `npm login` then publish — decide v1.1.2-as-tagged vs cutting v1.2.0 with
   today's grammar/preprocessor work (new nodes = minor bump territory).
4. Optional next levers, all parked with recorded reasons (TODO.md session table):
   strict/lenient directive-tail split (3 DevExpress files), labeled-body retry
   (3 rows), the declVar platform-before-init table bomb (System.pas ×2, needs labels
   too), `Register:` field + array-last-field (documented not-worth-it).

## Gotchas that WILL bite a cold start (unchanged ones from the morning still apply)

1. **Rebuild before trusting any measurement** — `build/Release/*.node` AND
   `pure/build/Release/*.node`; drag-lint DLLs never auto-rebuild.
2. **Scoring**: 573 `error`-key rows are intentional exclusions, not failures.
   Dedupe case-insensitively (17,081 rows = 11,722 files). Score `ok/(total-excluded)`.
3. **3 corpus-test failures are PRE-EXISTING** (`pp_block` external-scanner), plus the
   harmless `declProcFwd` unnecessary-conflict warning on generate.
4. **`tree-sitter generate` table explosions**: adding roles to keywords that already
   have several (kPlatform etc.), or pulling the `genericTpl`/`_genericName` web into
   new contexts, can push generate from ~5 min to 20+ min (= abort and redesign; two
   bisect-confirmed cases in TODO.md). A healthy root/pure generate is ~4–5 min.
5. **tree-sitter regex quirk**: `[\s\S]*` compiles to an effectively-empty match —
   use `(.|\s)*` (see `trailingText`).
6. **Root and `pure/` grammars are hand-maintained in lockstep** — port every fix.
7. `work/manifest-baseline.txt` predates the dedup fix; do NOT regenerate it from
   `tools/corpus-roots.txt` (drops ORM3 etc. — see the morning note / backup `.bak`).

## Open decision (carried over)

`tools/corpus-roots.txt` publish policy — starter file vs full root list (would expose
local paths). Undecided deliberately.
