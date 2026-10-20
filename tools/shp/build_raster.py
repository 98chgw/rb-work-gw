import sqlite3,sys,time,numpy as np, pandas as pd
sys.path.insert(0,'/tmp/claude-0/shp')
from gpkg_geom import gpkg_geom, ring_area
from PIL import Image, ImageDraw
RES=10.0
c=sqlite3.connect('file:/mnt/user-data/uploads/용도지역.gpkg?mode=ro',uri=True)
X0,Y0,X1,Y1=1089000.0,1906280.0,1131720.0,1955730.0
W=int((X1-X0)/RES); Hh=int((Y1-Y0)/RES)
rows=c.execute('select fid,geom,A1,A3,A11,A12,A14,A16,A18,A20,A25 from "용도지역"').fetchall()
recs=[];geoms=[]
for i,(fid,g,pnu,addr,jm,area,z1,z2,use,hgt,price) in enumerate(rows):
    p=gpkg_geom(g)
    ext=max(p,key=lambda pp:ring_area(pp[0]))[0]
    # 면적가중 중심
    x,y=ext[:,0],ext[:,1]; cr=x*np.roll(y,-1)-np.roll(x,-1)*y; A=cr.sum()/2
    cx=((x+np.roll(x,-1))*cr).sum()/(6*A) if A else x.mean(); cy=((y+np.roll(y,-1))*cr).sum()/(6*A) if A else y.mean()
    gar=sum(ring_area(pp[0])-sum(ring_area(h) for h in pp[1:]) for pp in p)
    a=addr.split()
    recs.append(dict(idx=i+1,fid=fid,pnu=pnu,emd=a[2],ri=a[3] if len(a)>3 else '',jimok=jm,area=area,garea=gar,zone=z1,zone2=z2,use=use,hgt=hgt,price=price,cx=cx,cy=cy))
    geoms.append(p)
df=pd.DataFrame(recs); df.to_pickle('parcels.pkl')
order=np.argsort(-df.garea.values)
img=Image.new('I',(W,Hh),0); d=ImageDraw.Draw(img)
t=time.time()
def tr(r): return [((x-X0)/RES,(Y1-y)/RES) for x,y in r]
for k in order:
    for pp in geoms[k]:
        d.polygon(tr(pp[0]),fill=int(k+1))
        for h in pp[1:]: d.polygon(tr(h),fill=0)
lab=np.array(img,dtype=np.int32)
np.save('lab10.npy',lab)
import json; json.dump(dict(X0=X0,Y0=Y0,X1=X1,Y1=Y1,RES=RES,W=W,H=Hh),open('grid.json','w'))
print('done',time.time()-t,(lab>0).mean(), W,Hh)
