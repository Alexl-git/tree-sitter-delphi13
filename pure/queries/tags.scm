; tags.scm -- tree-sitter-delphi13-pure
;
; Symbol extraction in the standard tree-sitter "tags" format. This is the file
; code-intelligence consumers read to build a symbol index: GitHub's tree-sitter
; tags CLI, nvim-treesitter, and the VS Code / Cursor codebase indexers.
;
; Capture convention (tree-sitter-tags):
;   @name               the identifier indexed for the symbol
;   @definition.<kind>  the node the symbol spans
;   @reference.<kind>   a use site
; Every @name MUST sit inside its @definition node.
;
; NODE NAMES ARE DELPHI-SHAPED
; This grammar uses declType / declClass / declIntf / declHelper / declProc /
; defProc / declProp -- NOT the class_declaration / procedure_declaration names
; of the generic Pascal grammars. A tags query copied from a Pascal grammar
; compiles here but matches nothing.
;
; GENERICS
; `TFoo<T: class>` parses as (genericTpl entity: (identifier) args: ...), so every
; declaration pattern below is written twice: once for a plain or dotted name,
; once unwrapping `entity:` out of a generic. Without the second form the indexed
; symbol would be the literal text `TFoo<T: class>` rather than `TFoo` -- which
; matters a great deal in Spring4D-heavy code.
;
; Qualified implementation names (`TFoo<T>.Bar`) are captured whole, matching
; queries/outline.scm, so the indexed symbol stays unambiguous.

;; ---------------------------------------------------------------- modules --

(unit    (moduleName) @name) @definition.module
(program (moduleName) @name) @definition.module
(library (moduleName) @name) @definition.module
(package (moduleName) @name) @definition.module

(declUsesUnit (moduleName) @name) @reference.module

;; ------------------------------------------------------------------ types --

; type TFoo = class(TBar, IBaz) ... end;   /   = object ... end;
(declType
  name: [(identifier) (genericDot)] @name
  type: [(declClass (kClass)) (type (declClass (kClass)))]) @definition.class
(declType
  name: (genericTpl entity: [(identifier) (genericDot)] @name)
  type: [(declClass (kClass)) (type (declClass (kClass)))]) @definition.class

(declType
  name: [(identifier) (genericDot)] @name
  type: [(declClass (kObject)) (type (declClass (kObject)))]) @definition.class
(declType
  name: (genericTpl entity: [(identifier) (genericDot)] @name)
  type: [(declClass (kObject)) (type (declClass (kObject)))]) @definition.class

; type TFoo = record ... end;
(declType
  name: [(identifier) (genericDot)] @name
  type: [(declClass (kRecord)) (type (declClass (kRecord)))]) @definition.struct
(declType
  name: (genericTpl entity: [(identifier) (genericDot)] @name)
  type: [(declClass (kRecord)) (type (declClass (kRecord)))]) @definition.struct

; type IFoo = interface / dispinterface ... end;
(declType
  name: [(identifier) (genericDot)] @name
  type: (declIntf)) @definition.interface
(declType
  name: (genericTpl entity: [(identifier) (genericDot)] @name)
  type: (declIntf)) @definition.interface

; type TFooHelper = class helper for TFoo ... end;
(declType
  name: [(identifier) (genericDot)] @name
  type: (declHelper)) @definition.class
(declType
  name: (genericTpl entity: [(identifier) (genericDot)] @name)
  type: (declHelper)) @definition.class

; type TColor = (clRed, clGreen);
(declType
  name: [(identifier) (genericDot)] @name
  type: (type (declEnum))) @definition.enum

(declEnumValue name: (identifier) @name) @definition.constant

; aliases, sets, arrays, strings, files, procedural types, metaclasses, subranges
(declType
  name: [(identifier) (genericDot)] @name
  type: [
    (identifier)
    (subrangeType)
    (type (typeref))
    (type (declSet))
    (type (declArray))
    (type (declString))
    (type (declFile))
    (type (declProcRef))
    (type (declMetaClass))
  ]) @definition.type
(declType
  name: (genericTpl entity: [(identifier) (genericDot)] @name)
  type: [
    (identifier)
    (subrangeType)
    (type (typeref))
    (type (declSet))
    (type (declArray))
    (type (declString))
    (type (declFile))
    (type (declProcRef))
    (type (declMetaClass))
  ]) @definition.type

;; ---------------------------------------------------------------- methods --
;
; Routines declared inside a class / record / interface / helper body, either
; directly or under a visibility section (private / protected / public /
; published / strict private ...).

(declClass (declProc name: (identifier) @name) @definition.method)
(declClass (declProc name: (genericTpl entity: (identifier) @name)) @definition.method)
(declClass (declSection (declProc name: (identifier) @name) @definition.method))
(declClass (declSection (declProc name: (genericTpl entity: (identifier) @name)) @definition.method))

(declIntf (declProc name: (identifier) @name) @definition.method)
(declIntf (declProc name: (genericTpl entity: (identifier) @name)) @definition.method)
(declIntf (declSection (declProc name: (identifier) @name) @definition.method))
(declIntf (declSection (declProc name: (genericTpl entity: (identifier) @name)) @definition.method))

(declHelper (declProc name: (identifier) @name) @definition.method)
(declHelper (declProc name: (genericTpl entity: (identifier) @name)) @definition.method)
(declHelper (declSection (declProc name: (identifier) @name) @definition.method))
(declHelper (declSection (declProc name: (genericTpl entity: (identifier) @name)) @definition.method))

; property Name: string read GetName write SetName;
(declProp name: (identifier) @name) @definition.property

; FName: string;   (only ever occurs in a class-like body)
(declField name: (identifier) @name) @definition.field

;; -------------------------------------------------------------- functions --
;
; Free routines: declared in the interface section, forward-declared in the
; implementation section, or written straight into a program / library /
; package / bare include fragment.

(interface      (declProc name: (identifier) @name) @definition.function)
(implementation (declProc name: (identifier) @name) @definition.function)
(program        (declProc name: (identifier) @name) @definition.function)
(library        (declProc name: (identifier) @name) @definition.function)
(package        (declProc name: (identifier) @name) @definition.function)
(root           (declProc name: (identifier) @name) @definition.function)

(interface      (declProc name: (genericTpl entity: (identifier) @name)) @definition.function)
(implementation (declProc name: (genericTpl entity: (identifier) @name)) @definition.function)
(program        (declProc name: (genericTpl entity: (identifier) @name)) @definition.function)
(library        (declProc name: (genericTpl entity: (identifier) @name)) @definition.function)
(package        (declProc name: (genericTpl entity: (identifier) @name)) @definition.function)
(root           (declProc name: (genericTpl entity: (identifier) @name)) @definition.function)

; Implemented bodies.
;   procedure TFoo.Bar;   begin ... end;   -> a method implementation
;   function Helper(...); begin ... end;   -> a free routine implementation
(defProc header: (declProc name: (genericDot) @name)) @definition.method
(defProc header: (declProc name: (identifier) @name)) @definition.function
(defProc header: (declProc name: (genericTpl entity: (identifier) @name))) @definition.function

;; ------------------------------------------------------ constants and vars --

(declConst name: (identifier) @name) @definition.constant
(declVar   name: (identifier) @name) @definition.variable

;; ------------------------------------------------------------- references --

; Foo(...), Unit.Foo(...) / Obj.Foo(...), Foo<T>(...)
(exprCall entity: (identifier) @name) @reference.call
(exprCall entity: (exprDot rhs: (identifier) @name)) @reference.call
(exprCall entity: (exprTpl entity: (identifier) @name)) @reference.call

; Ancestor class and implemented interfaces.
(declClass  parent: (typeref (identifier) @name) @reference.implementation)
(declIntf   parent: (typeref (identifier) @name) @reference.implementation)
(declHelper parent: (typeref (identifier) @name) @reference.implementation)