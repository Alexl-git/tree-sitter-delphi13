# Upstreaming to microsoft/vscode-tree-sitter-wasm (and on to Cursor)

## Read this first: feasibility

`microsoft/vscode-tree-sitter-wasm` is described by its own README as

> "scripts and build pipelines for building the Tree-Sitter and Tree-Sitter grammar
> WebAssembly files used by VS Code"

-- that is, it builds the grammars **VS Code has already decided to ship**. Every
grammar-adding PR in its history (`#12` regex, `#29` css, `#38` bash, `#39`
powershell) was authored by a VS Code team member. There is no precedent for a
third-party language being added on request.

Two consequences worth being clear-eyed about:

1. **Merging a grammar here does not make VS Code use it.** The extension-to-language
   mapping lives in the `microsoft/vscode` repo, not in this one. The entry shape here
   has no `extensions` field at all (see below) -- any claim that adding one wires up
   `.pas`/`.dpr`/`.dpk`/`.inc` is simply wrong.
2. **VS Code does not expose tree-sitter to extensions for highlighting.** Its
   highlighting is TextMate-based. So even a merged grammar yields nothing
   user-visible without a corresponding, separately-argued VS Code change.

This is still worth doing -- but as *"here is a maintained, verified Delphi grammar,
ready if you want it"*, not as a route that lands Delphi support by itself. Budget it
as a low-probability, low-cost bet, and do [the Isopod route](DISTRIBUTION.md) first.

## The actual entry shape

From `build/main.ts`, verbatim:

```typescript
const treeSitterGrammars: ITreeSitterGrammar[] = [
    {
        name: 'tree-sitter-bash'
    },
    {
        name: 'tree-sitter-c-sharp',
        git: {
            repo: 'https://github.com/tree-sitter/tree-sitter-c-sharp',
            sha: '485f0bae0274ac9114797fc10db6f7034e4086e3'
        },
        filename: 'tree-sitter-c_sharp.wasm' // non-standard filename
    },
```

The fields are `name`, optional `git: { repo, sha }`, optional `filename`, optional
`projectPath`. **There is no `extensions` field and no `config.json`.**

## The patch

```typescript
    {
        name: 'tree-sitter-delphi13',
        git: {
            repo: 'https://github.com/Alexl-git/tree-sitter-delphi13',
            sha: '<the v1.3.0 commit sha>'
        }
    },
    {
        name: 'tree-sitter-dfm',
        git: {
            repo: 'https://github.com/Alexl-git/tree-sitter-dfm',
            sha: '<the v1.1.0 commit sha>'
        }
    },
```

Default naming applies: the outputs are `tree-sitter-delphi13.wasm` and
`tree-sitter-dfm.wasm`, so no `filename` override is needed.

## Commands

Windows users must run this through WSL with Docker integration enabled -- that is
the repo's own instruction.

```bash
git clone https://github.com/microsoft/vscode-tree-sitter-wasm.git
cd vscode-tree-sitter-wasm
npm install
git checkout -b add-delphi13-grammar
# edit build/main.ts, add the two entries above
npm run build-wasm
git commit -am "Add tree-sitter-delphi13 and tree-sitter-dfm grammars"
git push origin add-delphi13-grammar
```

A Microsoft CLA signature is required before the PR can be merged.

## What to put in the PR body

* Both grammars build to **ABI 14** WASM and are verified to load and parse under
  `web-tree-sitter` with zero `ERROR`/`MISSING` nodes.
* Across the 2,218 `.pas` files of the RAD Studio 37.0 source tree: **98.47%** clean
  with the standalone grammar, and **100.000%** (2217/2217) when paired with
  `delphi13-preprocessor` -> `tree-sitter-delphi13-pure`, which also ships as WASM and
  is pure JS, so the full pipeline runs in an Electron/browser host.
* **99.18%** across 8,976 text-format DFMs, with every failure traced to malformed or
  truncated input rather than a grammar defect.
* Full standard query set including `tags.scm` for symbol extraction.
* MIT licensed; derived from `Isopod/tree-sitter-pascal` with attribution carried in
  `tree-sitter.json`.

---

# Cursor integration request

Post under *Feature Requests* at https://forum.cursor.com once the upstream PR is
open, so it can be linked.

**Do not send the "eliminates ERROR node cascading" claim unqualified.** Cursor does
not currently ship a Pascal/Delphi tree-sitter grammar at all, so there is no "legacy
generic Pascal parser" in it to replace -- asserting otherwise in a public request is
the kind of detail that gets a request dismissed. Say what is true: there is no Delphi
grammar today, and here is a verified one.

---

**Title:** Add Delphi / Object Pascal (`.pas`, `.dpr`, `.dpk`, `.inc`) and DFM tree-sitter grammars

Cursor has no tree-sitter grammar for Delphi / Object Pascal, so `.pas`, `.dpr`,
`.dpk` and `.inc` files get no AST-backed symbol indexing -- which is what the
codebase index, go-to-definition and @-symbol search are built on. Delphi codebases
are typically large, long-lived and monolithic: exactly the shape where the index
matters most.

Two maintained, MIT-licensed grammars are published and ready to consume:

* `tree-sitter-delphi13` -- npm: https://www.npmjs.com/package/tree-sitter-delphi13
* `tree-sitter-dfm` -- npm: https://www.npmjs.com/package/tree-sitter-dfm
* source: https://github.com/Alexl-git/tree-sitter-delphi13
* upstream WASM build PR: <link to the microsoft/vscode-tree-sitter-wasm PR>

Both ship a prebuilt ABI 14 `.wasm` plus the full standard query set, including
`tags.scm` for symbol extraction.

Verified coverage on the 2,218 `.pas` files of the RAD Studio 37.0 RTL/VCL/FMX/FireDAC
 source tree:

| Path | rate |
|---|---|
| grammar alone, raw source | **98.47%** |
| `delphi13-preprocessor` -> `tree-sitter-delphi13-pure` | **100.000%** (2217/2217) |

The second row is the one that matters for an indexer. Delphi source is saturated with
`{$IFDEF}`, and any single grammar fed raw source has to guess a branch; the residue is
conditionals that split one statement across mutually exclusive arms. The preprocessor
is pure JS and the pure grammar ships as WASM, so **the 100% pipeline runs inside the
same Electron host Cursor already is** -- no native dependency.

* 8,976 text-format `.dfm` form files: **99.18%** parse clean, with every failure
  traced to a malformed or truncated input rather than a grammar defect.

The grammar targets modern Delphi specifically -- inline variable declarations,
generics with constraints, attributes, class/record helpers, anonymous methods, and
`{$IFDEF}`-heavy real-world source -- and is exercised against DevExpress, Spring4D,
JEDI/JCL and Indy in addition to the vendor RTL.

The DFM grammar is the other half of the story: a Delphi form is a `.pas` unit plus a
`.dfm` component tree, and `tags.scm` there indexes each component as a field of the
form class and each `OnClick = ButtonClick` as a call edge into it -- so
go-to-definition crosses the `.pas`/`.dfm` boundary instead of dead-ending.

Happy to adjust naming, file-type mapping or query contents to fit your integration.