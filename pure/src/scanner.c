// External scanner for tree-sitter-delphi13-pure.
//
// PURE GRAMMAR: knows NO IFDEFs. Designed to parse the virtual text
// emitted by ../preprocessor/cli.js (or equivalent). All compiler
// directives are expected to be resolved upstream.
//
// Provides two external tokens that tree-sitter regex can't handle:
//
//   char_literal  Delphi's `^X` control-character literal (`^M` = #13,
//                 `^I` = #9, etc.) where X is in `@A-Z[\]^_` and is NOT
//                 followed by an identifier-continuation char.
//
//   trailing_dot_float  `100.` form — float with trailing dot, no
//                       fraction. Distinct from regex `_literalFloat`
//                       because tree-sitter regex can't disambiguate
//                       `100.` (float) from `100..N` (int + range op).
//
// Contract (tree-sitter scanner):
//   - Returning false rolls back the lexer to the position from BEFORE
//     scan() was called. Free to probe via advance().
//   - On true return, mark_end(lexer) determines token end.

#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>

enum TokenType {
    CHAR_LITERAL,
    TRAILING_DOT_FLOAT,
    DIRWORD_NAME,        // directive word followed by `:` or `,` -> var/field name
    DIRWORD_CONST_NAME,  // directive word followed by `=` or `:` -> const name
    ERROR_SENTINEL,      // never in a rule; valid only in error recovery
};

void *tree_sitter_delphi13_pure_external_scanner_create(void) { return NULL; }
void  tree_sitter_delphi13_pure_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_delphi13_pure_external_scanner_serialize(void *p, char *b) {
    (void)p; (void)b; return 0;
}
void tree_sitter_delphi13_pure_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    (void)p; (void)b; (void)n;
}

// ---- helpers ----

static inline bool is_ident_cont(int32_t c) {
    return (c >= 'a' && c <= 'z')
        || (c >= 'A' && c <= 'Z')
        || (c >= '0' && c <= '9')
        || c == '_';
}

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

// ---- char_literal ----
//
// `^X` where X is in @A-Z[\]^_ (case-insensitive) and is NOT followed by an
// identifier-continuation character (so `^Tx` parses as kHat + identifier,
// while `^M:` parses as char_literal then ':').
static bool scan_char_literal(TSLexer *lexer) {
    if (lexer->lookahead != '^') return false;
    advance(lexer);
    int32_t c = lexer->lookahead;
    bool valid_char =
        c == '@' || c == '[' || c == '\\' || c == ']' ||
        c == '^' || c == '_' ||
        (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
    if (!valid_char) return false;
    advance(lexer);
    if (is_ident_cont(lexer->lookahead)) return false;
    lexer->result_symbol = CHAR_LITERAL;
    lexer->mark_end(lexer);
    return true;
}

// ---- trailing_dot_float ----
//
// `123.` style float literal — digits followed by a dot followed by ANYTHING
// other than a dot or digit. Disambiguates from `123..N` (int + range op).
static bool scan_trailing_dot_float(TSLexer *lexer) {
    if (lexer->lookahead < '0' || lexer->lookahead > '9') return false;
    while (lexer->lookahead >= '0' && lexer->lookahead <= '9') {
        advance(lexer);
    }
    if (lexer->lookahead != '.') return false;
    advance(lexer);
    if (lexer->lookahead == '.') return false;
    if (lexer->lookahead >= '0' && lexer->lookahead <= '9') return false;
    lexer->result_symbol = TRAILING_DOT_FLOAT;
    lexer->mark_end(lexer);
    return true;
}

// ---- dirword_name / dirword_const_name ----
//
// Directive words are not reserved in Delphi, so `Platform`, `Static`,
// `Stdcall` ... are legal field / var / const names. With `word: identifier`
// tree-sitter lexes such a word as its kX keyword wherever kX is valid, and
// in a name position after `;` (or right after `record`) a directive slot is
// usually valid too. The grammar offers these tokens ONLY in name positions;
// here a directive word becomes a name when the next significant char is
//   DIRWORD_NAME:       `:` (not `:=`) or `,`
//   DIRWORD_CONST_NAME: `=` or `:` (not `:=`)
// A real directive is followed by `;`, an expression, or another directive,
// never by those. The `=` case is const-only: `var F: procedure; stdcall
// = nil;` puts a real callconv before `=`. Any other word is refused, so the
// internal lexer produces the plain identifier / keyword as before.
//
// Reserved words and visibility words (`public:` in a class body is a
// section start) are deliberately absent.

static const char *const DIRWORDS[] = {
    "absolute", "abstract", "alias", "align", "assembler", "at", "cdecl",
    "constref", "contains", "cppdecl", "cvar", "default", "delayed",
    "dependency", "deprecated", "dispid", "dynamic", "experimental",
    "export", "external", "far", "final", "forward", "generic", "hardfloat",
    "helper", "implements", "index", "inline", "interrupt", "iocheck",
    "library", "local", "message", "mwpascal", "name", "near", "nodefault",
    "noreturn", "nostackframe", "operator", "out", "overload", "override",
    "package", "pascal", "platform", "read", "readonly", "reference",
    "register", "reintroduce", "requires", "safecall", "saveregisters",
    "sealed", "softfloat", "specialize", "static", "stdcall", "stored",
    "unimplemented", "unsafe", "varargs", "vectorcall", "virtual", "winapi",
    "write", "writeonly",
};

static bool is_dirword(const char *w) {
    for (unsigned i = 0; i < sizeof(DIRWORDS) / sizeof(DIRWORDS[0]); i++) {
        const char *a = DIRWORDS[i];
        const char *b = w;
        while (*a && *a == *b) { a++; b++; }
        if (*a == 0 && *b == 0) return true;
    }
    return false;
}

// Skips whitespace and `{...}` / `(*...*)` / `//` comments after the word.
// Returns false on a `{$` directive or an unterminated comment (refuse).
static bool skip_name_trivia(TSLexer *lexer) {
    for (;;) {
        int32_t c = lexer->lookahead;
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
            advance(lexer);
        } else if (c == '{') {
            advance(lexer);
            if (lexer->lookahead == '$') return false;
            while (lexer->lookahead != '}') {
                if (lexer->eof(lexer)) return false;
                advance(lexer);
            }
            advance(lexer);
        } else if (c == '/') {
            advance(lexer);
            if (lexer->lookahead != '/') return false;
            while (lexer->lookahead != '\n' && !lexer->eof(lexer)) advance(lexer);
        } else if (c == '(') {
            advance(lexer);
            if (lexer->lookahead != '*') return false;
            advance(lexer);
            for (;;) {
                if (lexer->eof(lexer)) return false;
                if (lexer->lookahead == '*') {
                    advance(lexer);
                    if (lexer->lookahead == ')') { advance(lexer); break; }
                } else {
                    advance(lexer);
                }
            }
        } else {
            return true;
        }
    }
}

static bool scan_dirword_name(TSLexer *lexer, const bool *valid_symbols) {
    char word[16];
    unsigned n = 0;
    while (is_ident_cont(lexer->lookahead)) {
        int32_t c = lexer->lookahead;
        if (c > 127 || n + 1 >= sizeof(word)) return false;
        word[n++] = (char)((c >= 'A' && c <= 'Z') ? c + ('a' - 'A') : c);
        advance(lexer);
    }
    word[n] = 0;
    if (n == 0 || !is_dirword(word)) return false;
    lexer->mark_end(lexer);

    if (!skip_name_trivia(lexer)) return false;
    int32_t c = lexer->lookahead;
    if (c == ':') {
        advance(lexer);
        if (lexer->lookahead == '=') return false;
        lexer->result_symbol = valid_symbols[DIRWORD_NAME]
            ? DIRWORD_NAME : DIRWORD_CONST_NAME;
        return true;
    }
    if (c == ',' && valid_symbols[DIRWORD_NAME]) {
        lexer->result_symbol = DIRWORD_NAME;
        return true;
    }
    if (c == '=' && valid_symbols[DIRWORD_CONST_NAME]) {
        lexer->result_symbol = DIRWORD_CONST_NAME;
        return true;
    }
    return false;
}

// ---- entry point ----

bool tree_sitter_delphi13_pure_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols)
{
    (void)payload;

    while (lexer->lookahead == ' ' || lexer->lookahead == '\t'
        || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
        skip(lexer);
    }

    if ((valid_symbols[DIRWORD_NAME] || valid_symbols[DIRWORD_CONST_NAME])
        && !valid_symbols[ERROR_SENTINEL]
        && ((lexer->lookahead >= 'a' && lexer->lookahead <= 'z')
            || (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z'))) {
        return scan_dirword_name(lexer, valid_symbols);
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
