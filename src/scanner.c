// External scanner for tree-sitter-delphi13.
//
// Provides two external tokens that tree-sitter regex can't handle:
//
//   pp_block      Entire `{$IF*} ... {$END*}` block consumed as ONE token,
//                 EXCEPT when the body begins with a structural keyword
//                 (unit/program/library/package/interface/implementation),
//                 in which case the scanner refuses so the parser can see
//                 the wrapped declaration. Handles single-level (nested
//                 IFDEF pairs close at the first matching ENDIF — tracked
//                 with a depth counter so true nesting is supported).
//
//   char_literal  Delphi's `^X` control-character literal (`^M` = #13,
//                 `^I` = #9, etc.) where X is in `@A-Z[\]^_` and is NOT
//                 followed by an identifier-continuation char. The
//                 lookahead requirement disambiguates from `^TFoo`
//                 pointer-to-type.
//
// Contract (tree-sitter scanner):
//   - Returning false rolls back the lexer to the position from BEFORE
//     scan() was called. Free to probe via advance().
//   - On true return, mark_end(lexer) determines token end.

#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>
#include <ctype.h>

enum TokenType {
    PP_BLOCK,
    CHAR_LITERAL,
    TRAILING_DOT_FLOAT,  // `100.` form — float with trailing dot, no fraction.
                         // Distinct from regex `_literalFloat` because tree-sitter
                         // regex can't disambiguate `100.` (float) from `100..N`
                         // (int + range op). The scanner peeks the char after `.`
                         // and only emits if it isn't `.` or a digit.

    // ---- THEN-wins refactor (DESIGN-ifdef-then-wins.md) ----
    // Order MUST match grammar.js externals list.
    // Phase 1: declared only; not yet emitted.
    PP_OPEN,             // {$IF X} / {$IFDEF X} / {$IFNDEF X} / {$IFOPT ...}
    PP_ELSE_TAIL,        // {$ELSE} ... opaque ... {$ENDIF | $IFEND}
    PP_END_ONLY,         // {$ENDIF} / {$IFEND}   (no preceding else branch)
};

void *tree_sitter_delphi13_external_scanner_create(void) { return NULL; }
void  tree_sitter_delphi13_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_delphi13_external_scanner_serialize(void *p, char *b) {
    (void)p; (void)b; return 0;
}
void tree_sitter_delphi13_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    (void)p; (void)b; (void)n;
}

// ---- helpers ----

static inline bool is_ident_cont(int32_t c) {
    return (c >= 'a' && c <= 'z')
        || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9')
        || c == '_';
}

static inline int32_t to_lower(int32_t c) {
    return (c >= 'A' && c <= 'Z') ? c + 32 : c;
}

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

// Try to consume the literal keyword `kw` (case-insensitive) from the current
// lookahead. On success the lookahead is past the keyword AND we've verified
// the next char is NOT an identifier-continuation char (so it's word-bounded).
// On failure, characters MAY have been consumed (caller handles rollback by
// returning false from scan()).
static bool try_consume_keyword(TSLexer *lexer, const char *kw) {
    for (const char *p = kw; *p; p++) {
        if (to_lower(lexer->lookahead) != *p) return false;
        advance(lexer);
    }
    if (is_ident_cont(lexer->lookahead)) return false;
    return true;
}

// Look at the current lookahead and CONDITIONALLY consume a refused keyword.
// Returns true if any of these matches at a word boundary:
//   unit / program / library / package / interface / implementation  (structural)
//   packed                                                          (type modifier;
//     refused so `{$IFDEF X}packed{$ENDIF} record` parses as
//     [pp]packed[pp] record rather than swallowing `packed` into the pp_block.)
//
// Hand-coded char-by-char prune: try_consume_keyword can't be cascaded for
// candidates that share a prefix (e.g. packed vs package both start with `pack`),
// because it consumes chars on failure without rolling back.
static bool starts_with_structural_keyword(TSLexer *lexer) {
    int32_t la = to_lower(lexer->lookahead);
    if (la == 'u') return try_consume_keyword(lexer, "unit");
    if (la == 'l') return try_consume_keyword(lexer, "library");
    if (la == 'p') {
        advance(lexer); // consume 'p'
        int32_t la2 = to_lower(lexer->lookahead);
        if (la2 == 'r') return try_consume_keyword(lexer, "rogram");
        if (la2 == 'a') {
            // package OR packed — both start with 'pack', diverge at 5th char.
            advance(lexer); if (to_lower(lexer->lookahead) != 'c') return false;
            advance(lexer); if (to_lower(lexer->lookahead) != 'k') return false;
            advance(lexer);
            int32_t la5 = to_lower(lexer->lookahead);
            if (la5 == 'e') {
                advance(lexer); if (to_lower(lexer->lookahead) != 'd') return false;
                advance(lexer);
                if (is_ident_cont(lexer->lookahead)) return false;
                return true; // packed
            }
            if (la5 == 'a') {
                advance(lexer); if (to_lower(lexer->lookahead) != 'g') return false;
                advance(lexer); if (to_lower(lexer->lookahead) != 'e') return false;
                advance(lexer);
                if (is_ident_cont(lexer->lookahead)) return false;
                return true; // package
            }
        }
        return false;
    }
    if (la == 'i') {
        advance(lexer); // consume 'i'
        int32_t la2 = to_lower(lexer->lookahead);
        if (la2 == 'n') return try_consume_keyword(lexer, "nterface");
        if (la2 == 'm') return try_consume_keyword(lexer, "mplementation");
        return false;
    }
    return false;
}

// ---- THEN-wins refactor (phase 2) ----
//
// The refactor reads THROUGH IFDEFs: directive markers become tokens (in
// `extras` from the parser's POV — like comments), THEN-branch content flows
// out as regular tokens, ELSE-branch is consumed as one opaque tail.
//
// See DESIGN-ifdef-then-wins.md for the full plan.

// Classify the directive starting at lookahead (which must be at the char
// just after `{$`). Consumes 0..N chars of lookahead while classifying.
// Caller MUST be inside a fresh scan() call (any consumed chars are rolled
// back by tree-sitter if the scan() returns false).
typedef enum {
    DIR_OPEN,    // if / ifdef / ifndef / ifopt / ifexists / ifabbrevdef ...
    DIR_ELSE,    // else / elseif
    DIR_END,     // endif / ifend
    DIR_OTHER,   // any other {$X} directive — not an if-block boundary
} DirectiveKind;

static DirectiveKind classify_directive(TSLexer *lexer) {
    int32_t c1 = to_lower(lexer->lookahead);
    if (c1 == 'i') {
        advance(lexer);
        if (to_lower(lexer->lookahead) != 'f') return DIR_OTHER;
        advance(lexer);
        // `if<X>`: if it's `ife` followed by `nd`, that's `ifend` (DIR_END).
        // Otherwise it's an `if`-family opener (`if`, `ifdef`, `ifndef`,
        // `ifopt`, `ifexists`, etc.) — DIR_OPEN.
        if (to_lower(lexer->lookahead) == 'e') {
            advance(lexer);
            if (to_lower(lexer->lookahead) == 'n') {
                advance(lexer);
                if (to_lower(lexer->lookahead) == 'd') {
                    advance(lexer);
                    return DIR_END;
                }
            }
            return DIR_OTHER;
        }
        return DIR_OPEN;
    }
    if (c1 == 'e') {
        advance(lexer);
        int32_t c2 = to_lower(lexer->lookahead);
        if (c2 == 'l') {
            // else / elseif
            advance(lexer);
            if (to_lower(lexer->lookahead) == 's') {
                advance(lexer);
                if (to_lower(lexer->lookahead) == 'e') {
                    advance(lexer);
                    return DIR_ELSE;
                }
            }
            return DIR_OTHER;
        }
        if (c2 == 'n') {
            // end / endif — both close the IFDEF
            advance(lexer);
            if (to_lower(lexer->lookahead) == 'd') {
                advance(lexer);
                return DIR_END;
            }
            return DIR_OTHER;
        }
        return DIR_OTHER;
    }
    return DIR_OTHER;
}

// Consume the rest of the current directive up through the closing `}`.
// Called after classify_directive; lookahead is somewhere inside the
// directive body.
static bool consume_directive_to_close(TSLexer *lexer) {
    while (lexer->lookahead != 0 && lexer->lookahead != '}') {
        advance(lexer);
    }
    if (lexer->lookahead != '}') return false;
    advance(lexer);
    return true;
}

// Look at the upcoming directive WITHOUT advancing past `{$`. Used by
// pp_else_tail to decide whether to keep consuming (nested IFDEF) or stop
// (matched {$END*}). Returns DIR_* and ALWAYS advances past the `{$XXX`
// keyword portion of the directive (regardless of return value) — the
// caller then calls consume_directive_to_close() to finish.
static DirectiveKind peek_and_consume_directive_kw(TSLexer *lexer) {
    if (lexer->lookahead != '{') return DIR_OTHER;
    advance(lexer);
    if (lexer->lookahead != '$') return DIR_OTHER;
    advance(lexer);
    return classify_directive(lexer);
}

// ---- THEN-wins unified dispatch ----
//
// Single function that classifies the directive at lookahead, then commits
// to ONE of: PP_OPEN, PP_END_ONLY, PP_ELSE_TAIL (or returns false). Must be
// called from a fresh scan() — within a single scan() call we cannot roll
// back consumed lookahead, so the classification + commit must happen
// linearly.
//
// On entry: lookahead = '{', at least one of PP_OPEN / PP_END_ONLY /
// PP_ELSE_TAIL is in valid_symbols.
//
// Returns true and sets result_symbol on success.
static bool scan_pp_then_wins(TSLexer *lexer, const bool *valid_symbols) {
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    if (lexer->lookahead != '$') return false;
    advance(lexer);

    DirectiveKind k = classify_directive(lexer);

    if (k == DIR_OPEN && valid_symbols[PP_OPEN]) {
        if (!consume_directive_to_close(lexer)) return false;
        lexer->result_symbol = PP_OPEN;
        lexer->mark_end(lexer);
        return true;
    }

    if (k == DIR_END && valid_symbols[PP_END_ONLY]) {
        if (!consume_directive_to_close(lexer)) return false;
        lexer->result_symbol = PP_END_ONLY;
        lexer->mark_end(lexer);
        return true;
    }

    if (k == DIR_ELSE && valid_symbols[PP_ELSE_TAIL]) {
        if (!consume_directive_to_close(lexer)) return false;
        // Consume opaque ELSE body up to the matching {$END*}, depth-tracking
        // nested {$IF*}/{$END*} pairs.
        int depth = 1;
        int safety = 8 * 1024 * 1024;
        while (lexer->lookahead != 0 && safety-- > 0) {
            if (lexer->lookahead != '{') { advance(lexer); continue; }
            DirectiveKind dk = peek_and_consume_directive_kw(lexer);
            if (dk == DIR_OPEN) {
                consume_directive_to_close(lexer);
                depth++;
                continue;
            }
            if (dk == DIR_END) {
                consume_directive_to_close(lexer);
                if (--depth == 0) {
                    lexer->result_symbol = PP_ELSE_TAIL;
                    lexer->mark_end(lexer);
                    return true;
                }
                continue;
            }
            // DIR_ELSE inside else body or DIR_OTHER — just skip the directive.
            consume_directive_to_close(lexer);
        }
        return false;
    }

    // Directive doesn't match any requested token type.
    return false;
}

// ---- pp_block ----
//
// On entry: lookahead = '{'. Try to consume the entire `{$IF*}...{$END*}`
// block as one token. Returns true on success.
static bool scan_pp_block(TSLexer *lexer) {
    // Opening `{$if...` check.
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    if (lexer->lookahead != '$') return false;
    advance(lexer);
    if (to_lower(lexer->lookahead) != 'i') return false;
    advance(lexer);
    if (to_lower(lexer->lookahead) != 'f') return false;
    advance(lexer);

    // Consume rest of opening directive up to '}'.
    while (lexer->lookahead != 0 && lexer->lookahead != '}') {
        advance(lexer);
    }
    if (lexer->lookahead != '}') return false;
    advance(lexer);

    // Skip whitespace.
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t'
        || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        advance(lexer);
    }

    // Refuse if body begins with a structural keyword — let the parser see
    // the wrapped declaration via the regex-pp fallback.
    if (starts_with_structural_keyword(lexer)) return false;

    // Scan body, tracking nested {$if*}/{$end*}/{$ifend*} pairs.
    int depth = 1;
    int safety = 8 * 1024 * 1024;  // 8 MiB hard cap
    while (lexer->lookahead != 0 && safety-- > 0) {
        if (lexer->lookahead != '{') { advance(lexer); continue; }
        advance(lexer);
        if (lexer->lookahead != '$') continue;
        advance(lexer);

        int32_t c1 = to_lower(lexer->lookahead);
        if (c1 == 'i') {
            advance(lexer);
            int32_t c2 = to_lower(lexer->lookahead);
            if (c2 == 'f') {
                advance(lexer);
                // Could be `{$if...}` (open, depth++) or `{$ifend...}` (close).
                int32_t c3 = to_lower(lexer->lookahead);
                if (c3 == 'e') {
                    advance(lexer);
                    if (to_lower(lexer->lookahead) == 'n') {
                        advance(lexer);
                        if (to_lower(lexer->lookahead) == 'd') {
                            advance(lexer);
                            // {$ifend...} — consume to '}', decrement.
                            while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
                            if (lexer->lookahead != '}') return false;
                            advance(lexer);
                            if (--depth == 0) {
                                lexer->result_symbol = PP_BLOCK;
                                lexer->mark_end(lexer);
                                return true;
                            }
                            continue;
                        }
                    }
                    // {$ife...} but not ifend; treat as a stray directive,
                    // consume to '}' and don't change depth.
                    while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
                    if (lexer->lookahead == '}') advance(lexer);
                    continue;
                }
                // {$if...} — open another nesting level.
                while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
                if (lexer->lookahead != '}') return false;
                advance(lexer);
                depth++;
                continue;
            }
            // {$i...} but not {$if...} — some other directive.
            while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
            if (lexer->lookahead == '}') advance(lexer);
            continue;
        }
        if (c1 == 'e') {
            advance(lexer);
            if (to_lower(lexer->lookahead) == 'n') {
                advance(lexer);
                if (to_lower(lexer->lookahead) == 'd') {
                    advance(lexer);
                    // {$end...} — consume to '}', decrement depth.
                    while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
                    if (lexer->lookahead != '}') return false;
                    advance(lexer);
                    if (--depth == 0) {
                        lexer->result_symbol = PP_BLOCK;
                        lexer->mark_end(lexer);
                        return true;
                    }
                    continue;
                }
            }
            // {$e...} but not {$end} — other directive, consume.
            while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
            if (lexer->lookahead == '}') advance(lexer);
            continue;
        }
        // Some other {$X...} directive — consume.
        while (lexer->lookahead != 0 && lexer->lookahead != '}') advance(lexer);
        if (lexer->lookahead == '}') advance(lexer);
    }
    return false;
}

// ---- char_literal ----
//
// `^X` where X is in @A-Z[\]^_ (case-insensitive) and is NOT followed by an
// identifier-continuation character (so `^Tx` parses as kHat + identifier,
// while `^M:` parses as char_literal then ':').
static bool scan_char_literal(TSLexer *lexer) {
    if (lexer->lookahead != '^') return false;
    advance(lexer);
    int32_t c = lexer->lookahead;
    // Accept @ A-Z [ \ ] ^ _ and lowercase variants.
    bool valid_char =
        c == '@' || c == '[' || c == '\\' || c == ']' ||
        c == '^' || c == '_' ||
        (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    if (!valid_char) return false;
    advance(lexer);
    // Critical: the NEXT char must not be an identifier-continuation char.
    // Otherwise this is `^TFoo` pointer-to-type, not a char literal.
    if (is_ident_cont(lexer->lookahead)) return false;
    lexer->result_symbol = CHAR_LITERAL;
    lexer->mark_end(lexer);
    return true;
}

// ---- trailing_dot_float ----
//
// `123.` style float literal — digits followed by a dot followed by ANYTHING
// other than a dot or digit. Disambiguates from `123..N` (int + range op)
// because tree-sitter regex can't peek-without-consuming.
//
// Examples:
//   100. * x      -> trailing_dot_float
//   6. ;          -> trailing_dot_float
//   100..200      -> NOT matched (followed by another `.`)
//   100.5         -> NOT matched (followed by digit)
static bool scan_trailing_dot_float(TSLexer *lexer) {
    // Must start with a digit.
    if (lexer->lookahead < '0' || lexer->lookahead > '9') return false;
    // Consume all leading digits.
    while (lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        advance(lexer);
    }
    // Must see `.`
    if (lexer->lookahead != '.') return false;
    advance(lexer);
    // The next char must NOT be `.` (range) or a digit (regular float `.N`).
    if (lexer->lookahead == '.') return false;
    if (lexer->lookahead >= '0' && lexer->lookahead <= '9') return false;
    // Confirmed trailing-dot float.
    lexer->result_symbol = TRAILING_DOT_FLOAT;
    lexer->mark_end(lexer);
    return true;
}

// ---- entry point ----

bool tree_sitter_delphi13_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols)
{
    (void)payload;

    // Skip leading whitespace before trying any external token.
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t'
        || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        skip(lexer);
    }

    // THEN-wins refactor: unified dispatch on `{$...` directives.
    //
    // Single classification step then commits to one of PP_OPEN /
    // PP_END_ONLY / PP_ELSE_TAIL. If none of those are valid (or the
    // directive shape doesn't match), falls back to legacy PP_BLOCK
    // — which is itself dead code once the new tokens are in extras,
    // but kept as belt-and-braces for now.
    if (lexer->lookahead == '{') {
        bool new_token_valid = valid_symbols[PP_OPEN]
                            || valid_symbols[PP_END_ONLY]
                            || valid_symbols[PP_ELSE_TAIL];
        if (new_token_valid) {
            if (scan_pp_then_wins(lexer, valid_symbols)) return true;
            // If dispatch returned false, the lexer state is undefined
            // (we may have consumed chars). Tree-sitter rolls back on
            // false-return, so we cannot then try PP_BLOCK in this call.
            // That's fine: in the new model PP_BLOCK is never the
            // expected token when the new ones are valid.
            return false;
        }
        if (valid_symbols[PP_BLOCK]) {
            if (scan_pp_block(lexer)) return true;
        }
    }
    if (valid_symbols[CHAR_LITERAL] && lexer->lookahead == '^') {
        if (scan_char_literal(lexer)) return true;
    }
    if (valid_symbols[TRAILING_DOT_FLOAT] &&
        lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        if (scan_trailing_dot_float(lexer)) return true;
    }
    return false;
}
