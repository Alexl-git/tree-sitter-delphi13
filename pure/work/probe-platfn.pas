unit ProbePlatFn;
interface
function CMSG_DATA(cmsg: Pointer): PByte; platform;
function CMSG_NXTHDR(mhdr: Pmsghdr; cmsg: Pcmsghdr): Pcmsghdr; platform;
implementation
end.
