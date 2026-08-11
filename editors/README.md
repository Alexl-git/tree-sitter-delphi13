# Delphi in Zed and VS Code

This directory provides Delphi 13 (Object Pascal) and DFM/FMX support for editors
outside RAD Studio, built on two tree-sitter grammars plus an optional language
server.

| Piece | What it gives you | Source |
|---|---|---|
| `tree-sitter-delphi13` | syntax tree for `.pas` `.dpr` `.dpk` `.inc` | [Alexl-git/tree-sitter-delphi13](https://github.com/Alexl-git/tree-sitter-delphi13) |
| `tree-sitter-dfm` | syntax tree for `.dfm` `.fmx` | [Alexl-git/tree-sitter-dfm](https://github.com/Alexl-git/tree-sitter-dfm) |
| `drag-lint lsp` | go-to-definition, find-references, workspace symbols, hover, completion, signature help | drag-lint (separate project) |

## Support matrix -- read this first

Editors differ in what they can actually consume. This table is the honest state,
not the aspiration:

| Capability | Zed | VS Code |
|---|---|---|
| tree-sitter highlighting | **Yes** -- see below | **No.** VS Code highlights with TextMate grammars; tree-sitter is not user-pluggable. A TextMate grammar would be a separate piece of work. |
| tree-sitter outline / symbols | **Yes** (`outline.scm`) | No (same reason) |
| drag-lint language server | Needs a Rust/WASM extension -- **not built yet**, see [Status](#status) | Needs a client extension -- **not built yet** |

If you only take one thing from this page: **Zed gets working Delphi and DFM
highlighting today.** The language-server half is unfinished in both editors and
is tracked below.

---

## Zed

### What you get

* Syntax highlighting for `.pas`, `.dpr`, `.dpk`, `.inc` (Delphi) and `.dfm`, `.fmx` (DFM).
* Outline panel entries (Ctrl-Shift-O) for types, routines and properties.
* Bracket matching and comment toggling appropriate to each language.

### Install

Zed compiles grammars from GitHub itself, so there is nothing to build locally.

1. Clone this repository (or just copy the `editors/zed` directory somewhere stable --
   Zed reads a dev extension from wherever you point it, and keeps reading from
   that path, so do not delete it afterwards).
2. In Zed, open the command palette (Ctrl-Shift-P) and run
   **`zed: install dev extension`**.
3. Select the `editors/zed` directory.

Zed will fetch both grammars at the revisions pinned in `extension.toml`, compile
them to WASM, and register the two languages. Open any `.pas` or `.dfm` file to
confirm.

### Layout

```
editors/zed/
  extension.toml                     ; extension id, and the two pinned grammars
  languages/delphi/config.toml       ; file suffixes, comments, brackets
  languages/delphi/highlights.scm    ; syntax highlighting queries
  languages/delphi/outline.scm       ; outline-panel queries
  languages/dfm/config.toml
  languages/dfm/highlights.scm
```

The `.scm` query files are duplicated here from each grammar repo's `queries/`
directory. That duplication is required: Zed loads queries from the **extension**,
not from the grammar repository. The copies in `queries/` are what Neovim, Helix
and other tree-sitter consumers read.

### Updating to a new grammar release

1. Push the grammar change and note the commit SHA.
2. Bump `rev` for that grammar in `editors/zed/extension.toml`.
3. Bump `version` in the same file.
4. If the queries changed, re-copy them into `languages/<lang>/`.
5. Reinstall the dev extension in Zed.

Zed caches compiled grammars by revision, so step 2 is what actually triggers a
rebuild. Forgetting it means your change silently does not appear.

---

## VS Code

### Highlighting

**VS Code cannot use these tree-sitter grammars for highlighting.** Its syntax
highlighting is driven by TextMate grammars; tree-sitter is used internally for a
handful of built-in languages and is not exposed to extensions. Delivering
highlighting here means authoring a TextMate grammar (`.tmLanguage.json`) -- a
genuinely separate artifact that would live beside this file, not a repackaging of
what already exists.

This is a real limitation, not a configuration mistake. Do not spend time looking
for the setting; there isn't one.

### Language server

`drag-lint lsp` speaks standard LSP over stdio and is ready to be consumed, but VS
Code needs an extension acting as the client -- there is no built-in way to point
VS Code at an arbitrary LSP binary from `settings.json`. That extension is not
written yet; see [Status](#status).

---

## The language server

`drag-lint lsp` runs as a stock stdio LSP server and needs no modification. Verified
by driving it directly with an `initialize` request:

```
drag-lint lsp --db <path-to-index.sqlite>
```

Advertised capabilities:

```json
{
  "definitionProvider": true,
  "referencesProvider": true,
  "workspaceSymbolProvider": true,
  "hoverProvider": true,
  "completionProvider":    { "triggerCharacters": [".", "(", ","], "resolveProvider": false },
  "signatureHelpProvider": { "triggerCharacters": ["(", ","] }
}
```

Worth knowing: Embarcadero's own `DelphiLSP.exe` advertises **neither
`referencesProvider` nor `workspaceSymbolProvider`**. Find-references and workspace
symbols are things drag-lint's index provides and the vendor's compiler-backed
server does not.

Requires a built index. See the drag-lint documentation for `drag-lint index`.

---

## Status

| Item | State |
|---|---|
| Delphi highlighting queries | Done -- validated with `tree-sitter query` |
| DFM highlighting queries | Done -- validated with `tree-sitter query` |
| Delphi outline queries | Done -- validated |
| Zed extension (grammars + languages) | Done |
| Zed language-server registration | **Blocked.** Zed requires an extension with `[lib] kind = "Rust"` compiled to `wasm32-wasip1`; no Rust toolchain on the build machine. |
| VS Code LSP client extension | **Not started.** Node is available, so this is buildable -- it needs `vscode-languageclient` and a small activation shim. |
| VS Code TextMate grammar | **Not started.** Separate artifact, see above. |

### Validating query changes

Any edit to a `.scm` file should be validated before committing -- a malformed
query fails the whole language, not just the offending rule:

```
tree-sitter query queries/highlights.scm <some-file.pas>
```

Exit code 0 means the query compiles and matches. This catches impossible patterns
(a child that cannot occur under that parent), which are silent in the editor and
otherwise only show up as "highlighting stopped working".
