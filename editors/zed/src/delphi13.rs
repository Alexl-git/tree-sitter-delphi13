//! Zed extension: Delphi 13 (Object Pascal) + DFM form files.
//!
//! The grammars and query files do not need any Rust -- Zed loads those
//! declaratively from extension.toml and languages/. This crate exists for one
//! reason: registering a LANGUAGE SERVER requires a compiled extension, because
//! Zed has to ask it where the server binary is.
//!
//! The server is `drag-lint lsp` (https://github.com/Alexl-git/Delphi-RAG-Lint),
//! a symbol-exact index for Delphi that speaks LSP over stdio and provides
//! go-to-definition, find-references, workspace symbols, hover, completion and
//! signature help.

use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};

struct Delphi13Extension;

/// Must match the `[language_servers.*]` key in extension.toml.
const DRAG_LINT: &str = "drag-lint";

impl zed::Extension for Delphi13Extension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if language_server_id.as_ref() != DRAG_LINT {
            return Err(format!("unknown language server: {language_server_id}"));
        }

        // Settings win, so a user can pin a specific build and pass their own
        // arguments without editing this extension:
        //
        //   "lsp": {
        //     "drag-lint": {
        //       "binary": {
        //         "path": "C:/Projects/Delphi-RAG-lint/third_party/dll-win64/drag-lint.exe",
        //         "arguments": ["lsp", "--db", "C:/Projects/YADF/_D-RAG/YADF.sqlite"]
        //       }
        //     }
        //   }
        let settings = LspSettings::for_worktree(DRAG_LINT, worktree).ok();
        let binary = settings.and_then(|s| s.binary);

        let path = match binary.as_ref().and_then(|b| b.path.clone()) {
            Some(path) => path,
            // Falls back to PATH. NOTE: on a machine with both builds installed,
            // whichever comes first on PATH wins, and the 32-bit build runs out
            // of memory on large indexes -- set an explicit path in settings if
            // that is you.
            None => worktree.which(DRAG_LINT).ok_or_else(|| {
                "drag-lint was not found on PATH. Install it from \
                 https://github.com/Alexl-git/Delphi-RAG-Lint/releases, or set \
                 lsp.drag-lint.binary.path in your Zed settings."
                    .to_string()
            })?,
        };

        // `lsp` with no --db lets drag-lint resolve the index from its own
        // manifest. Override via settings when a project needs a specific one.
        let args = binary
            .and_then(|b| b.arguments)
            .unwrap_or_else(|| vec!["lsp".to_string()]);

        Ok(zed::Command {
            command: path,
            args,
            env: Default::default(),
        })
    }
}

zed::register_extension!(Delphi13Extension);