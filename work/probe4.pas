unit X;
interface
implementation
procedure Bar;
var Key: Char;
begin
  case Key of
    ^M: WriteLn('CR');
  end;
end;
end.
