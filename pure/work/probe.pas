unit ProbePure;
interface

const
  COldConst = 'foo' deprecated 'use CNewConst';
  CMaxSize  = 1_000_000_000;

type
  TFoo = class
    function GetX: Integer; inline;
  end;

implementation

function TFoo.GetX: Integer;
begin
  Result := 42;
end;

end.
