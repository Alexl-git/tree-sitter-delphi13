unit Smoke;

// Compact Delphi 13 unit used by `npm test` and tools/validate-queries.js.
// It is deliberately dense: every construct here is one the queries in
// queries/*.scm are expected to match. Keep it strict 7-bit ASCII with CRLF
// line endings.

interface

uses
  System.SysUtils, System.Classes, Spring.Collections;

type
  EMyError = class(Exception);

  /// <summary>Minimal interface, exercised by tags.scm definition.interface.</summary>
  IThing = interface(IInvokable)
    ['{11111111-2222-3333-4444-555555555555}']
    function GetName: string;
    property Name: string read GetName;
  end;

  TMyRec = record
    X: Integer;
    procedure Reset;
  end;

  TColor = (clRed, clGreen, clBlue);

  TColors = set of TColor;

  TNameArray = array of string;

  TNotify = procedure(pSender: TObject) of object;

  TBase<T: class> = class(TInterfacedObject, IThing)
  strict private
    FName: string;
    FList: IList<T>;
  protected
    function GetName: string; virtual;
  public
    constructor Create(const pName: string); overload;
    destructor Destroy; override;
    class function Make: TBase<T>; static;
    procedure Go; virtual; abstract;
    property Name: string read GetName write FName;
  end;

  TBaseHelper = class helper for TObject
    function Describe: string;
  end;

const
  MaxItems = 10;

var
  GlobalThing: IThing;

function Helper(const A: Integer): Boolean;

implementation

function Helper(const A: Integer): Boolean;
begin
  Result := A > 0;
end;

constructor TBase<T>.Create(const pName: string);
begin
  inherited Create;
  FName := pName;
  FList := TCollections.CreateList<T>;
end;

destructor TBase<T>.Destroy;
begin
  inherited;
end;

function TBase<T>.GetName: string;
begin
  var Temp := FName;
  Result := Temp;
end;

class function TBase<T>.Make: TBase<T>;
begin
  Result := TBase<T>.Create('made');
end;

function TBaseHelper.Describe: string;
begin
  Result := ClassName;
end;

procedure TMyRec.Reset;
begin
  X := 0;
end;

procedure Demo;
var
  Q: TStringList;
  I: Integer;
begin
  Q := TStringList.Create;
  try
    // injections.scm: these are SQL, the ShowMessage strings below are not.
    Q.Text := 'select ID, NAME from CUSTOMER where ID = :ID';
    Q.Text := 'update CUSTOMER set NAME = :NAME';
    for I := 0 to Q.Count - 1 do
      if Q[I] <> '' then
        Writeln(Q[I])
      else
        Writeln('(blank)');
    case I of
      0: Writeln('none');
      1: Writeln('one');
    else
      Writeln('many');
    end;
  finally
    Q.Free;
  end;
end;

end.