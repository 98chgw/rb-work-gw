import struct
import numpy as np
ENV={0:0,1:32,2:48,3:48,4:64}
def parse_wkb(b, o=0):
    bo=b[o]; e='<' if bo==1 else '>'
    t=struct.unpack_from(e+'I',b,o+1)[0]; o+=5
    base=t%1000; dim=3 if (t//1000)%10 in (1,3) or t&0x80000000 else 2
    if t>1000: dim = {1:3,2:3,3:4}.get(t//1000,2)
    def ring(o):
        n=struct.unpack_from(e+'I',b,o)[0]; o+=4
        a=np.frombuffer(b,dtype=e+'f8',count=n*dim,offset=o).reshape(n,dim)[:,:2]
        return a,o+n*dim*8
    if base==3:
        nr=struct.unpack_from(e+'I',b,o)[0]; o+=4; rings=[]
        for _ in range(nr): r,o=ring(o); rings.append(r)
        return [rings],o
    if base==6:
        np_=struct.unpack_from(e+'I',b,o)[0]; o+=4; polys=[]
        for _ in range(np_):
            p,o=parse_wkb(b,o); polys+=p
        return polys,o
    raise ValueError(base)
def gpkg_geom(blob):
    flags=blob[3]; env=ENV[(flags>>1)&7]
    polys,_=parse_wkb(blob,8+env)
    return polys
def ring_area(r):
    x,y=r[:,0],r[:,1]; return 0.5*abs(np.dot(x,np.roll(y,1))-np.dot(y,np.roll(x,1)))
