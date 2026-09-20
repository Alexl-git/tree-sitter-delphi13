# Testing the Zed extension

Written for someone who has never used Zed. Everything below is already set up on
this machine -- you only need to follow the steps.

**Why this matters:** Zed's registry rules say *"Test your extension within Zed
manually at the submodule commit you are submitting."* Submitting untested would
be a poor first impression on a registry that reviews every entry. So this has to
happen before the PR goes out.

Budget 20-30 minutes. The first install is slow (see step 2).

---

## What you are testing

Two separate things. They can fail independently, so test them in order.

| | What it proves |
|---|---|
| **A. Grammars + queries** | Highlighting, outline, folding, brackets, indent, text objects for `.pas` and `.dfm` |
| **B. drag-lint language server** | Go-to-definition, find-references, hover, workspace symbols |

Part B is new -- the Rust component that registers a language server did not exist
before today. `editors/README.md` used to say this was blocked for want of a Rust
toolchain; Rust 1.98.1 and the `wasm32-wasip2` target are now installed, and the
component compiles.

## Already done for you

* Zed 1.10.3 -- installed
* Rust 1.98.1 + `wasm32-wasip2` -- installed today (`%USERPROFILE%\.cargo\bin`)
* The extension's Rust component -- compiles clean (`cargo build --release --target wasm32-wasip2`)
* drag-lint -- present at `C:\Projects\Delphi-RAG-lint\third_party\dll-win64\drag-lint.exe`

---

## Step 1 -- open a real Delphi project

Launch Zed. Use **File > Open Folder...** and choose:

```
C:\Projects\YADF
```

Picked because it has 12 `.pas` files, 2 `.dfm` files, and an existing drag-lint
index at `C:\Projects\YADF\_D-RAG\YADF.sqlite`, so both halves are testable.

Do **not** open the `tree-sitter-delphi13` folder itself for this -- you want real
Delphi source.

## Step 2 -- install the extension

1. Press **Ctrl+Shift+P** to open the command palette.
2. Type `install dev extension` and choose **`zed: install dev extension`**.
3. In the folder picker, select exactly:

```
C:\Projects\tree-sitter-delphi13\editors\zed
```

Select the `zed` folder itself -- not `languages`, not the repo root.

**This first run takes several minutes and looks like it has hung. It has not.**
Zed is doing three things: compiling the Rust component to WebAssembly, and
cloning + compiling *both* tree-sitter grammars from GitHub. `tree-sitter-delphi13`
has a 17 MB `parser.c`, so its compile is genuinely slow.

Zed reads a dev extension from the path you gave it and keeps reading from there,
so do not move or delete that folder afterwards.

**If it fails:** open the palette, type `open log`, pick **`zed: open log`**, and
send me the last ~50 lines. Do not guess -- the log says exactly what broke.

---

## Part A -- grammars and queries

### A1. Delphi highlighting

Open `uYADFMain.pas` (or any `.pas` in the project).

- [ ] Keywords (`unit`, `interface`, `procedure`, `begin`, `end`) are coloured
- [ ] Strings and comments are coloured differently from code
- [ ] The whole file is **not** one flat colour -- that is what a failed grammar
      load looks like

### A2. SQL injection (the bug we fixed today)

Find a string literal containing SQL -- something like
`'select ID from CUSTOMER where ...'`. If YADF has none, open
`C:\Projects\tree-sitter-delphi13\examples\smoke.pas`, which contains two on purpose.

- [ ] The SQL **inside the quotes** is highlighted as SQL -- keywords like
      `select` / `from` picked out, distinct from a plain string

This is the exact thing that was silently broken in WASM hosts before today. Zed
uses the Rust regex engine so it was never affected, but it confirms the query
loads.

- [ ] A prose string like `'Select a file to continue'` is **not** treated as SQL

### A3. Outline

Palette -> type `outline` -> pick the outline toggle.

- [ ] Types, procedures, functions and properties are listed
- [ ] Clicking one jumps to it
- [ ] Entries are **not** duplicated (each routine appears once, not twice)

### A4. Folding

- [ ] The gutter shows fold arrows next to `begin`, `type`, `class`, `try`
- [ ] Folding a `begin ... end` collapses the whole block

### A5. Brackets and indent (new today)

- [ ] Put the cursor on a `begin` -- its matching `end` highlights.
      This is `brackets.scm`, written today. Pascal's real delimiters are
      keywords, so `begin`/`end` matching is the thing to check, not `()`.
- [ ] Press Enter after a `begin` -- the new line indents one level
- [ ] Type `end` -- the line dedents to match its `begin`

### A6. Text objects (new today)

Zed's vim mode must be on for this (palette -> `toggle vim mode`). **Skip this if
you do not use vim mode** -- it is not worth turning on just to test.

- [ ] Inside a procedure body, `vif` selects the body; `vaf` includes the header

### A7. DFM

Open a `.dfm` file in the project.

- [ ] `object` / `end` and property names are coloured
- [ ] The outline shows the component tree, nested (a form containing panels
      containing buttons)
- [ ] `object ... end` blocks fold

---

## Part B -- drag-lint language server

### B1. Configure it

Palette -> type `open settings` -> **`zed: open settings`**. This opens
`C:\Users\alexanderl\AppData\Roaming\Zed\settings.json`.

Your settings currently have five top-level keys and **no `lsp` block**. Add the
block below as a new top-level key -- do not replace the file, and mind the comma
after the preceding entry:

```json
  "lsp": {
    "drag-lint": {
      "binary": {
        "path": "C:/Projects/Delphi-RAG-lint/third_party/dll-win64/drag-lint.exe",
        "arguments": ["lsp", "--db", "C:/Projects/YADF/_D-RAG/YADF.sqlite"]
      }
    }
  }
```

Two things this deliberately pins:

* **The 64-bit build.** `drag-lint` is on your PATH, but PATH resolves to the
  **32-bit** build in `third_party\dll`, which runs out of memory on large
  indexes. The explicit path avoids that entirely.
* **Forward slashes.** In JSON a backslash is an escape character; `C:\Projects`
  would be invalid. Zed accepts forward slashes on Windows.

Save, then reload: palette -> `reload` -> **`zed: reload`** (or just restart Zed).

### B2. Check the server actually started

Palette -> type `language server logs` -> open them.

- [ ] `drag-lint` appears in the list
- [ ] Its log shows an `initialize` exchange, not an immediate crash

If it is absent, the server never launched -- usually a wrong path in B1. If it
started and died, the log will say why.

### B3. Exercise it

In a `.pas` file, put the cursor on a call to a routine defined elsewhere in the
project.

- [ ] **Go to definition** (palette -> `go to definition`, or F12) jumps to it
- [ ] **Find all references** lists the call sites
- [ ] Hovering a symbol shows a signature

Worth knowing what you are seeing: Embarcadero's own `DelphiLSP.exe` advertises
**neither** `referencesProvider` **nor** `workspaceSymbolProvider`. Find-references
and workspace symbols are things the drag-lint index provides and the vendor's
compiler-backed server does not.

**If definitions do not resolve**, the index is probably stale rather than the
wiring being wrong. Rebuild it and retry:

```powershell
C:\Projects\Delphi-RAG-lint\third_party\dll-win64\drag-lint.exe index --project C:\Projects\YADF\YADF.dproj --db C:\Projects\YADF\_D-RAG\YADF.sqlite
```

---

## After a change to the extension

- Edited a `.scm` under `languages/`? Just reinstall the dev extension. Zed loads
  queries from the extension, so no grammar rebuild happens -- it is quick.
- Edited `src/delphi13.rs` or `extension.toml`? Same, but Zed recompiles the Rust.
- Bumped a grammar `rev`? Zed caches compiled grammars by revision, so that one is
  slow again.

---

## What to tell me

Only three outcomes matter:

1. **Which checkboxes failed** -- the boxes above, by number (`A5 failed`).
2. **For any failure, the log** -- `zed: open log`, or the language server log for
   Part B. Last ~50 lines.
3. **Whether the extension installed at all** -- if step 2 failed, nothing else
   ran, and that is the only thing to report.

If Part A passes and Part B fails, that is still a **green light for the registry
submission**: Zed's registry does not host or require the language server, and
drag-lint is Windows-only anyway. Part B failing would be a bug in our Rust
component, worth fixing but not a blocker.