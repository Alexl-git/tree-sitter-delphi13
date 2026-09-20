# Install Delphi support in your editor

Two grammars, published on npm and MIT licensed:

* **`tree-sitter-delphi13`** -- `.pas` `.dpr` `.dpk` `.inc`
* **`tree-sitter-dfm`** -- `.dfm` `.fmx` (the form half of a Delphi form)

Optionally, **`drag-lint lsp`** on top for go-to-definition, find-references and
workspace symbols. See [Language server](#language-server-drag-lint) below.

## What works where -- read this first

This is the honest state, not the aspiration.

| | Neovim | Helix | Zed | VS Code / Cursor |
|---|---|---|---|---|
| Highlighting | Yes | Yes | Yes | **No** -- see below |
| Folding | Yes | Yes | Yes | No |
| Indent | Yes, with the file below | Yes, with the file below | Yes | No |
| Outline / symbols | Yes | Yes | Yes | No |
| Injections (SQL, asm) | Yes | Yes | Yes | No |
| Language server | Yes | Yes | Not yet | Not yet |

**Auto-indent queries are not portable.** Three editors, three incompatible
conventions, sharing almost no capture names:

| Editor | Captures | File |
|---|---|---|
| Zed | `@indent` `@start` `@end` | `queries/indents.scm` |
| Neovim | `@indent.begin` `@indent.end` `@indent.branch` `@indent.dedent` ... | `queries/nvim/indents.scm` |
| Helix | `@indent` `@outdent` `@align` `@opaque` | `queries/helix/indents.scm` |

The top-level `queries/indents.scm` is Zed's. In Neovim it compiles and then does
nothing; in Helix it indents but never dedents, leaving every `end` a level too
deep. So each editor below installs its own. Highlighting, folding and
injections use compatible capture names and need no such treatment.

---

## Neovim

Requires `nvim-treesitter` on its `main` branch (the `master` branch is locked
and no longer developed).

Register the parser, then map it to the `pascal` filetype Neovim already detects
for `.pas`:

```lua
vim.api.nvim_create_autocmd('User', {
  pattern = 'TSUpdate',
  callback = function()
    require('nvim-treesitter.parsers').delphi13 = {
      install_info = {
        url = 'https://github.com/Alexl-git/tree-sitter-delphi13',
        revision = 'v1.3.0',
        queries = 'queries',
      },
    }
    require('nvim-treesitter.parsers').dfm = {
      install_info = {
        url = 'https://github.com/Alexl-git/tree-sitter-dfm',
        revision = 'v1.1.0',
        queries = 'queries',
      },
    }
  end,
})

vim.treesitter.language.register('delphi13', { 'pascal' })
vim.treesitter.language.register('dfm', { 'dfm' })

-- Neovim detects *.pas and *.dpr as `pascal` already; these two are not.
vim.filetype.add({
  extension = {
    dpk = 'pascal',
    dfm = 'dfm',
    fmx = 'dfm',
  },
})
```

Then `:TSInstall delphi13 dfm`.

**Auto-indent.** Copy the Neovim indent query into your own config, where it
takes precedence over the one installed with the parser (earlier entries in
`runtimepath` win):

```sh
mkdir -p ~/.config/nvim/queries/delphi13
curl -o ~/.config/nvim/queries/delphi13/indents.scm \
  https://raw.githubusercontent.com/Alexl-git/tree-sitter-delphi13/v1.3.0/queries/nvim/indents.scm
```

---

## Helix

Add to `~/.config/helix/languages.toml` (this merges with the built-in config):

```toml
[[language]]
name = "delphi13"
scope = "source.delphi"
injection-regex = "^(delphi|pascal)$"
file-types = ["pas", "dpr", "dpk", "inc"]
comment-token = "//"
block-comment-tokens = { start = "{", end = "}" }
indent = { tab-width = 2, unit = "  " }

[[grammar]]
name = "delphi13"
source = { git = "https://github.com/Alexl-git/tree-sitter-delphi13", rev = "v1.3.0" }

[[language]]
name = "dfm"
scope = "source.dfm"
file-types = ["dfm", "fmx"]
indent = { tab-width = 2, unit = "  " }

[[grammar]]
name = "dfm"
source = { git = "https://github.com/Alexl-git/tree-sitter-dfm", rev = "v1.1.0" }
```

Note Helix ships a `pascal` language that already claims `pas` and `inc`. Naming
ours `delphi13` avoids a collision; if you would rather replace Helix's Pascal
support outright, override the `pascal` entry's `[[grammar]]` instead -- but then
you must also replace `runtime/queries/pascal/`, because the node names in this
grammar differ from the one Helix bundles and the stock queries will match
nothing.

Build the grammars:

```sh
hx --grammar fetch
hx --grammar build
```

Install the queries (Helix does not read them from the grammar repo):

```sh
mkdir -p ~/.config/helix/runtime/queries/delphi13 ~/.config/helix/runtime/queries/dfm
BASE=https://raw.githubusercontent.com/Alexl-git/tree-sitter-delphi13/v1.3.0/queries
for q in highlights injections folds textobjects; do
  curl -o ~/.config/helix/runtime/queries/delphi13/$q.scm $BASE/$q.scm
done
curl -o ~/.config/helix/runtime/queries/delphi13/indents.scm $BASE/helix/indents.scm

BASE=https://raw.githubusercontent.com/Alexl-git/tree-sitter-dfm/v1.1.0/queries
for q in highlights folds textobjects indents; do
  curl -o ~/.config/helix/runtime/queries/dfm/$q.scm $BASE/$q.scm
done
```

Check it with `hx --health delphi13`.

---

## Zed

The extension lives in this repository at `editors/zed`. A registry submission is
in progress; until it lands, install it as a dev extension:

1. Clone this repository (Zed reads a dev extension from wherever you point it and
   keeps reading from that path, so do not delete it afterwards).
2. Command palette -> **`zed: install dev extension`**.
3. Select the `editors/zed` directory.

Zed fetches both grammars at the revisions pinned in `extension.toml`, compiles
them to WASM itself, and registers both languages. You get highlighting, outline,
folding, bracket matching, indentation and text objects for `.pas` and `.dfm`.

---

## Emacs

Emacs 29+ can build and load the grammar:

```elisp
(add-to-list 'treesit-language-source-alist
             '(delphi13 "https://github.com/Alexl-git/tree-sitter-delphi13" "v1.3.0"))
(treesit-install-language-grammar 'delphi13)
```

**Be aware there is no `delphi-ts-mode`.** Installing the grammar gives you a
working parser for `treesit-parser-create` and friends, but no font-lock, no
indentation and no imenu, because nobody has written the major mode that binds
those to the grammar. This entry is here for people building their own mode or
driving `treesit` programmatically -- not for turnkey Delphi editing. If you write
one, please open an issue; it would be good to link it here.

---

## VS Code and Cursor

**Neither can use these grammars for syntax highlighting.** VS Code highlights
with TextMate grammars; tree-sitter is used internally for a handful of built-in
languages and is not exposed to extensions. Cursor inherits that. There is no
setting for this -- do not spend time looking for one.

What the WASM build *is* good for in those editors is an extension driving its
own features. Both ship `tree-sitter-<name>.wasm` (ABI 14) loadable through
`web-tree-sitter`, and `queries/tags.scm` is the standard symbol-extraction query
that codebase indexers read:

```js
const Parser = require('web-tree-sitter');
await Parser.init();
const L = await Parser.Language.load('node_modules/tree-sitter-delphi13/tree-sitter-delphi13.wasm');
```

Because `delphi13-preprocessor` is pure JavaScript and `tree-sitter-delphi13-pure`
also ships as WASM, the full preprocessor pipeline runs inside an Electron host --
which is what reaches 100% on real Delphi source, against 98.47% for the grammar
alone. See the coverage table in [DISTRIBUTION.md](../DISTRIBUTION.md).

No such extension exists yet. If you want Delphi support in Cursor, the useful
thing is to say so on their forum -- requests are weighted by demand.

---

## Language server (drag-lint)

[drag-lint](https://github.com/Alexl-git/Delphi-RAG-Lint) is a separate MIT
project by the same author: a symbol-exact index and linter for Delphi that also
speaks LSP over stdio.

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
`referencesProvider` nor `workspaceSymbolProvider`**. Find-references and
workspace symbols are things the index provides and the vendor's compiler-backed
server does not.

**Two caveats before you wire it up:**

* **Windows only.** drag-lint is written in Delphi and releases ship as
  `win32`/`win64` zips. There is no Linux or macOS build.
* **Alpha.** Releases are tagged `-alpha` and it is under active development.

It needs an index built first -- see the drag-lint README for `drag-lint index`.

### Neovim

```lua
vim.api.nvim_create_autocmd('FileType', {
  pattern = 'pascal',
  callback = function(args)
    vim.lsp.start({
      name = 'drag-lint',
      cmd = { 'drag-lint', 'lsp', '--db', 'C:/path/to/_D-RAG/YourProject.sqlite' },
      root_dir = vim.fs.root(args.buf, { '.git' }),
    })
  end,
})
```

### Helix

```toml
[language-server.drag-lint]
command = "drag-lint"
args = ["lsp", "--db", "C:/path/to/_D-RAG/YourProject.sqlite"]

[[language]]
name = "delphi13"
language-servers = ["drag-lint"]
```

(Merge that `language-servers` line into the `[[language]]` block you added
above rather than declaring the language twice.)

### Zed and VS Code

Both need a client extension that registers the server, and neither exists yet.
Zed additionally requires the extension to be Rust compiled to `wasm32-wasip1`.

---

## Verifying a query change

Any edit to a `.scm` should be checked against the **built WASM**, not the CLI:

```sh
npm run build-wasm
npm run validate-queries
```

The CLI cannot catch two real classes of bug. It evaluates `#match?` with the
Rust regex crate while WASM hosts use JavaScript's `RegExp` -- an inline `(?i)`
flag is valid in one and a hard error in the other, and a query that throws on
compile takes the whole file down silently. And it selects the grammar from the
sample file's extension rather than the working directory, so it will happily
validate a query against the wrong parser.