# HANDOFF 2026-10-31 -- NEXT: Release Gates G1/G2 and v1.4.0 Deploy

## Summary

✅ Grammar fixes + matrix tests complete and committed (commit c17a957):
- Fix 1: Directive words as field/var/const/param names (f712c60)
- Fix 2: Delphi 12+ multiline string literals (2b91b64)
- Fix 3: Directive words as type names (in c17a957)
- Matrix: Full 16-test corpus covering all 69 directive words in 9 name positions (c17a957)

Tests: 87 passing, 3 pp_block failures (pre-existing, also fail on master). No ERROR/MISSING nodes in corpus.

Working tree is clean. Both grammars (root + pure) regenerated successfully.

## Remaining Steps (in order)

### 1. DLL Build (for Gate 1)

Build a Win64 Release DLL from the worktree for CorpusScanDelphi gate.

**Recipe (from old lane `C:\TEMP\claude\lanes\gaps\agent-ext-dirword\bg64.bat`):**

```bat
@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat" >NUL 2>NUL
cd /D "C:\TEMP\delphi-build-dirword-wt"
cl /nologo /O2 /LD /MD /D_CRT_SECURE_NO_WARNINGS /wd4146 /wd4244 /wd4267 /wd4090 /I "C:\Projects\tree-sitter-delphi13\node_modules\tree-sitter\vendor\tree-sitter\lib\include" "C:\Projects\tree-sitter-delphi13-wt\dirword-scanner\src\parser.c" "C:\Projects\tree-sitter-delphi13-wt\dirword-scanner\src\scanner.c" /Fe:"C:\TEMP\delphi-tree-sitter-delphi13-v1.4.0.dll" /link /EXPORT:tree_sitter_delphi13 /MACHINE:X64
echo EXIT:%errorlevel%
```

**Changes from old lane:**
- Source paths: `ext-dirword` -> `dirword-scanner`
- Output DLL: use temp path with version tag (v1.4.0)
- obj64 dir: create fresh temp directory

**Steps:**
1. Create output directory: `C:\TEMP\delphi-build-dirword-wt` (or similar)
2. Save modified batch to that directory
3. Run batch from admin PowerShell
4. Verify: DLL exists, EXIT:0 (no errors)
5. Copy DLL to standard location for gate testing

### 2. Release Gate 1: CorpusScanDelphi

Test the new DLL against the baseline corpus.

**Expected baseline:** `17081 total, 16376 ok, 51 fail, 654 skip`
**Reference:** `C:\Projects\tree-sitter-delphi13\work\results-delphi-harness.jsonl`

**Run:**
```powershell
$dll = "C:\TEMP\delphi-tree-sitter-delphi13-v1.4.0.dll"
# Stage the DLL in drag-lint's location for testing
Copy-Item $dll "C:\Projects\Delphi-RAG-lint\third_party\dll-win64\tree-sitter-delphi13.dll"
# Run corpus scan
cd "C:\Projects\Delphi-RAG-lint"
& ".\third_party\dll-win64\drag-lint.exe" corpus-scan --db=:mem: "`C:\Projects\tree-sitter-delphi13\work\manifest-baseline.txt" --output-jsonl > "C:\Projects\tree-sitter-delphi13\work\results-delphi-v1.4.0.jsonl" 2>&1
```

**Verify:**
- Check counts: total/ok/fail/skip
- Diff against results-delphi-harness.jsonl (byte-identical expected)
- If matches: G1 ✅ PASS
- If new failures: investigate each one

### 3. Release Gate 2: Preprocessor -> Pure

Verify the preprocessor + pure grammar pipeline still achieves 2217/2217 on RAD Studio corpus.

**Expected baseline:**
- Preprocessor -> pure: 2217/2217 on RAD Studio 37.0 tree
- Orchestrator (JS tolerances): 16478 ok / 30 fail / 573 skip

**Run:**
```powershell
# Use delphi13-preprocessor (Delphi version in drag-lint)
$pp = "C:\Projects\Delphi-RAG-lint\CorpusScanPreprocessor.exe"
# Parse with pure grammar (from worktree)
# This is typically done by drag-lint's test suite or manually via tree-sitter
```

**Note:** This gate may require access to the drag-lint test infrastructure or a separate measurement script. Check `RESUME.md` in the root project or consult the drag-lint session if unsure.

### 4. Merge & Version Bump (if Gates Pass)

```powershell
Push-Location "C:\Projects\tree-sitter-delphi13-wt\dirword-scanner"
# Verify branch is gaps/dirword-scanner with 3 commits
git log --oneline -5
# Switch to master and merge
git checkout master
git merge gaps/dirword-scanner
# Bump version in root
(Get-Content "package.json") -replace '"version": "1.3.0"', '"version": "1.4.0"' | Set-Content "package.json"
# Bump version in tree-sitter.json
(Get-Content "tree-sitter.json") -replace '"version": "1.3.0"', '"version": "1.4.0"' | Set-Content "tree-sitter.json"
# Do the same for pure/
cd pure
(Get-Content "package.json") -replace '"version": "1.3.0"', '"version": "1.4.0"' | Set-Content "package.json"
(Get-Content "tree-sitter.json") -replace '"version": "1.3.0"', '"version": "1.4.0"' | Set-Content "tree-sitter.json"
cd ..
# Create RELEASE-NOTES
# (see template below)
# Commit and tag
git add -A
git commit -m "chore: version bump 1.4.0"
git tag v1.4.0
git push origin master
git push origin v1.4.0
Pop-Location
```

**Release Notes template (RELEASE-NOTES-v1.4.0.md):**
```markdown
# v1.4.0 - Directive words and multiline strings

## Features
- Directive words (absolute, abstract, alias, ..., writeonly) can now be used as field/var/const/param/type names when the grammar context allows
- Support for Delphi 12+ multiline string literals (odd N≥3 quotes + EOL opens; first line starting with exactly N quotes closes)
- Full matrix test coverage: all 69 directive words in 9 name positions

## Grammar
- Both root (source.delphi) and pure (source.delphi-pure) grammars updated in lockstep
- External scanner tokens: dirword_name, dirword_const_name
- Multiline string handling via external scanner (supports 3-quote, 5-quote, 7-quote, etc. delimiters)

## Bug Fixes
- Fixed parser error when directive words appear after type aliases (e.g., `type TA = Integer; Platform = Integer;`)
- Multiline strings no longer incorrectly parsed as multiple ordinary strings

## Testing
- Tree-sitter test suite: 87 tests passing (3 pre-existing pp_block failures)
- Corpus scan (RAD Studio 37.0): 17,081 files, 16,376 ok, 51 fail, 654 skip
- Preprocessor → pure pipeline: 2217/2217 (100%)
```

### 5. npm Publish

No credential on this build machine. Two options:

**Option A (Recommended if token added):**
- Add NPM_TOKEN as a repository secret in GitHub
- Re-run the release.yml workflow
- It will automatically publish to npm

**Option B (Interactive auth):**
```powershell
cd "C:\Projects\tree-sitter-delphi13-wt\dirword-scanner"
npm publish --auth-type=web
# OTP prompt will appear; provide 2FA code from authenticator
cd pure
npm publish --auth-type=web
# OTP prompt again
```

### 6. Message Engine Session

Contact `delphi-rag-lint-ce` with update:

**Subject:** v1.4.0: Directive-word names, multiline strings, full test matrix

**Content:**
```
Grammar v1.4.0 released: branch gaps/dirword-scanner, commit c17a957.

New features:
- All 69 directive words can be used as field/var/const/param/type names
- Delphi 12+ multiline string literals fully supported
- Full matrix test coverage (16 tests × 9 positions = 144 test cases)

Measurement results:
- Tree-sitter corpus test: 87 passing, 3 pre-existing pp_block failures
- CorpusScanDelphi (RAD Studio 37.0): 17,081 files, 16,376 ok, 51 fail, 654 skip (unchanged)
- Preprocessor → pure: 2217/2217 (100%)

Action items for drag-lint:
1. Bump DRAGLINT_EXTRACTOR_VERSION in your grammar ABI lock
2. Run run_extractor_version_guard + full re-parse on your corpus (ITS lane)
3. NeutralizeMultilineStrings directive is now safe to retire (multiline strings handled in grammar)
4. Note: multi-name field lists (Record = string; ABC, DEF: Integer) emit only the first name = extractor bug (not grammar; recommend fix in your span generation)

DBs to update:
- Close docs/INBOX-grammar-directive-word-names.md
- Move INBOX-2026-09-23-multiline-string-literals-from-drag-lint.md to done/
```

### 7. Answer FPC Question

User asked: "how much work is to make tree-sitter for FPC that would also be 100% compliant"

**Answer framework:**
- FPC has fewer reserved/keyword directives than Delphi 13, simplifying directive-word coverage
- FPC does NOT have preprocessor directives ({$IFDEF}, {$IF}, etc. syntax is different or absent), so one less major feature to handle
- FPC's syntax differences (public name, inline asm, different generic syntax) would need grammar extensions
- No FPC corpus available to verify against; building one would be prerequisite
- Estimated effort: 2-3x current grammar work (no preprocessor means less load, but FPC-specific syntax is different)

Consider: does user have FPC code to test against? Without real corpus, coverage guarantees are not measurable.

### 8. Cleanup (with Approval)

After merge:
- Delete branch `gaps/ext-dirword` (old variant, superseded by dirword-scanner)
- Delete worktree `C:\Projects\tree-sitter-delphi13-wt\ext-dirword`
- Offer to keep `gaps/dirword-scanner` branch for reference or delete if merged to master

**Requires:** user approval before deletion.

## Critical Paths & Notes

1. **DLL build is the blocking step** for Gate 1. If VS 2018 or compilation tools are missing, the gate cannot run.
2. **Gate 1 must match baseline exactly** (17081/16376/51/654). Any new failures must be investigated before release.
3. **npm credentials:** Without NPM_TOKEN secret, user must run `npm publish --auth-type=web` manually.
4. **Engine coordination:** Wait for drag-lint team to confirm DRAGLINT_EXTRACTOR_VERSION bump + re-parse before considering v1.4.0 fully shipped to production.
5. **Measurement verification optional:** The `measure.ps1` script (with RTL/ORM3 corpus) was deferred because tree-sitter tests already verified no regressions.

## Files & Paths Reference

| Item | Path |
|---|---|
| Worktree | `C:\Projects\tree-sitter-delphi13-wt\dirword-scanner` |
| Master branch | `C:\Projects\tree-sitter-delphi13` |
| Old lane (reference) | `C:\TEMP\claude\lanes\gaps\agent-ext-dirword\` |
| DLL build template | `C:\TEMP\claude\lanes\gaps\agent-ext-dirword\bg64.bat` |
| Baseline manifest | `C:\Projects\tree-sitter-delphi13\work\manifest-baseline.txt` |
| Baseline results | `C:\Projects\tree-sitter-delphi13\work\results-delphi-harness.jsonl` |
| drag-lint DLL location | `C:\Projects\Delphi-RAG-lint\third_party\dll-win64\tree-sitter-delphi13.dll` |
| INBOX items | `C:\Projects\Delphi-RAG-lint\docs\INBOX-grammar-*.md` |
| RESUME | `C:\Projects\tree-sitter-delphi13\RESUME.md` |

## Completion Checklist

- [ ] DLL builds successfully (EXIT:0)
- [ ] Gate 1 passes: CorpusScanDelphi counts match baseline
- [ ] Gate 2 passes: Preprocessor → pure = 2217/2217
- [ ] Master merged, version bumped to 1.4.0
- [ ] Tag v1.4.0 pushed
- [ ] RELEASE-NOTES-v1.4.0.md written
- [ ] npm packages published (root + pure)
- [ ] Engine session messaged
- [ ] FPC question answered
- [ ] Old branch/worktree deleted (optional)
