; highlights.scm -- tree-sitter-delphi13
;
; Syntax highlighting queries for Delphi 13 (Object Pascal).
; Consumed by Zed, Neovim, Helix and anything else using tree-sitter-highlight.
;
; Capture names follow the common tree-sitter highlight vocabulary that Zed's
; theme syntax keys map directly (keyword, type, function, string, number,
; boolean, comment, operator, property, attribute, preproc, punctuation.*).
;
; NOTE ON ORDER: tree-sitter-highlight resolves the FIRST matching pattern for a
; node, so specific patterns are listed before general ones.

; ---------------------------------------------------------------------------
; Comments
; ---------------------------------------------------------------------------

(comment) @comment

; ---------------------------------------------------------------------------
; Preprocessor / conditional compilation  {$IFDEF} {$R} {$I} ...
; ---------------------------------------------------------------------------

(pp) @preproc
(pp_open) @preproc
(pp_else_tail) @preproc
(pp_end_only) @preproc

; ---------------------------------------------------------------------------
; Literals
; ---------------------------------------------------------------------------

(literalString) @string
(literalChar) @string.special
(char_literal) @string.special
(literalNumber) @number
(trailing_dot_float) @number
(guid) @string.special

[
  (kTrue)
  (kFalse)
] @boolean

(kNil) @constant

; ---------------------------------------------------------------------------
; Attributes -- [Weak], [Ref], custom RTTI attributes
; ---------------------------------------------------------------------------

(rttiAttributes) @attribute
(declAssemblyAttribute) @attribute

; ---------------------------------------------------------------------------
; Module structure
; ---------------------------------------------------------------------------

[
  (kUnit)
  (kProgram)
  (kLibrary)
  (kPackage)
  (kInterface)
  (kImplementation)
  (kInitialization)
  (kFinalization)
  (kUses)
  (kExports)
  (kContains)
  (kRequires)
] @keyword

(moduleName) @type

; ---------------------------------------------------------------------------
; Declaration introducers
; ---------------------------------------------------------------------------

[
  (kType)
  (kVar)
  (kConst)
  (kThreadvar)
  (kResourcestring)
  (kLabel)
  (kAbsolute)
] @keyword

; ---------------------------------------------------------------------------
; Routines
; ---------------------------------------------------------------------------

[
  (kProcedure)
  (kFunction)
  (kConstructor)
  (kDestructor)
  (kOperator)
  (kProperty)
  (kRead)
  (kWrite)
  (kReadonly)
  (kWriteonly)
  (kStored)
  (kDefault)
  (kNodefault)
  (kIndex)
  (kImplements)
] @keyword

; ---------------------------------------------------------------------------
; Type-forming keywords
; ---------------------------------------------------------------------------

[
  (kClass)
  (kRecord)
  (kObject)
  (kArray)
  (kSet)
  (kFile)
  (kString)
  (kHelper)
  (kDispInterface)
  (kPacked)
  (kGeneric)
  (kReference)
  (kOf)
] @keyword

; ---------------------------------------------------------------------------
; Visibility
; ---------------------------------------------------------------------------

[
  (kPrivate)
  (kProtected)
  (kPublic)
  (kPublished)
  (kStrict)
] @keyword

; ---------------------------------------------------------------------------
; Control flow
; ---------------------------------------------------------------------------

[
  (kBegin)
  (kEnd)
  (kEndDot)
  (kIf)
  (kThen)
  (kElse)
  (kCase)
  (kFor)
  (kTo)
  (kDownto)
  (kDo)
  (kWhile)
  (kRepeat)
  (kUntil)
  (kWith)
  (kGoto)
  (kTry)
  (kExcept)
  (kFinally)
  (kRaise)
  (kOn)
  (kInherited)
  (kAsm)
  (kAssembler)
] @keyword

; ---------------------------------------------------------------------------
; Routine directives / modifiers
; ---------------------------------------------------------------------------

[
  (kVirtual)
  (kOverride)
  (kAbstract)
  (kSealed)
  (kFinal)
  (kStatic)
  (kOverload)
  (kReintroduce)
  (kInline)
  (kForward)
  (kExternal)
  (kDynamic)
  (kDelayed)
  (kDispId)
  (kMessage)
  (kName)
  (kDeprecated)
  (kExperimental)
  (kPlatform)
  (kNoreturn)
  (kUnsafe)
  (kVarargs)
  (kLocal)
  (kAlign)
  (kDependency)
  (kOut)
  (kConstref)
] @keyword

; ---------------------------------------------------------------------------
; Calling conventions
; ---------------------------------------------------------------------------

[
  (kCdecl)
  (kStdcall)
  (kSafecall)
  (kRegister)
  (kPascal)
  (kWinapi)
  (kFar)
  (kNear)
  (kExport)
  (kInterrupt)
] @keyword

; ---------------------------------------------------------------------------
; Operator keywords
; ---------------------------------------------------------------------------

[
  (kAnd)
  (kOr)
  (kNot)
  (kXor)
  (kDiv)
  (kMod)
  (kShl)
  (kShr)
  (kIn)
  (kIs)
  (kAs)
  (kAt)
] @operator

; ---------------------------------------------------------------------------
; Symbolic operators
; ---------------------------------------------------------------------------

[
  (kAssign)
  (kAssignAdd)
  (kAssignSub)
  (kAssignMul)
  (kAssignDiv)
  (kEq)
  (kNeq)
  (kLt)
  (kLte)
  (kGt)
  (kGte)
  (kAdd)
  (kSub)
  (kMul)
  (kFdiv)
  (kHat)
  (kAtWord)
] @operator

(kDot) @punctuation.delimiter

; ---------------------------------------------------------------------------
; Types
; ---------------------------------------------------------------------------

(typeref) @type
(typerefDot) @type
(typerefPtr) @type
(typerefTpl) @type
(genericTpl) @type
(genericDot) @type
(declEnumValue) @constant

; ---------------------------------------------------------------------------
; Labels
; ---------------------------------------------------------------------------

(label) @label
(declLabel) @label
(caseLabel) @label

; ---------------------------------------------------------------------------
; Punctuation
; ---------------------------------------------------------------------------

[
  "("
  ")"
  "["
  "]"
] @punctuation.bracket

[
  ","
  ";"
  ":"
  "."
  ".."
] @punctuation.delimiter

; ---------------------------------------------------------------------------
; Declaration names -- more specific than the bare identifier rule below, so
; they must be listed first (tree-sitter-highlight takes the first match).
; ---------------------------------------------------------------------------

(declProc name: (identifier) @function)
(declProc name: (genericDot) @function)
(declProc name: (genericTpl) @function)

(declType name: (identifier) @type)
(declType name: (genericDot) @type)
(declType name: (genericTpl) @type)

(declProp name: (identifier) @property)
(declField name: (identifier) @property)

; ---------------------------------------------------------------------------
; Identifiers -- least specific, listed last
; ---------------------------------------------------------------------------

(identifier) @variable
