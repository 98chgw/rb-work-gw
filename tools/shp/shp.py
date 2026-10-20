import struct, numpy as np
def read_shp(path):
    b=open(path,'rb').read()
    stype=struct.unpack_from('<i',b,32)[0]; bbox=struct.unpack_from('<4d',b,36)
    o=100; out=[]
    while o<len(b):
        num,ln=struct.unpack_from('>2i',b,o); o+=8; rec=b[o:o+ln*2]; o+=ln*2
        st=struct.unpack_from('<i',rec,0)[0]
        if st==0: out.append(None); continue
        if st in (5,15,25):
            npart,npt=struct.unpack_from('<2i',rec,36)
            parts=list(struct.unpack_from('<%di'%npart,rec,44))
            pts=np.frombuffer(rec,dtype='<f8',count=npt*2,offset=44+4*npart).reshape(npt,2)
            parts.append(npt); out.append([pts[parts[i]:parts[i+1]] for i in range(npart)])
        elif st in (1,11,21):
            out.append(np.array(struct.unpack_from('<2d',rec,4)))
    return stype,bbox,out
