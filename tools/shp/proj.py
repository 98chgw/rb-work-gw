import numpy as np
BES=(6377397.155,1/299.1528128); GRS=(6378137.0,1/298.257222101)
def _tm_inv(x,y,ell,lon0,lat0,k0,fe,fn):
    a,f=ell; e2=f*(2-f); ep2=e2/(1-e2)
    def M(phi):
        return a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*np.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*np.sin(4*phi)-(35*e2**3/3072)*np.sin(6*phi))
    M0=M(np.radians(lat0)); Mm=M0+(y-fn)/k0
    mu=Mm/(a*(1-e2/4-3*e2**2/64-5*e2**3/256)); e1=(1-np.sqrt(1-e2))/(1+np.sqrt(1-e2))
    p1=mu+(3*e1/2-27*e1**3/32)*np.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*np.sin(4*mu)+(151*e1**3/96)*np.sin(6*mu)+(1097*e1**4/512)*np.sin(8*mu)
    C1=ep2*np.cos(p1)**2; T1=np.tan(p1)**2; N1=a/np.sqrt(1-e2*np.sin(p1)**2); R1=a*(1-e2)/(1-e2*np.sin(p1)**2)**1.5; D=(x-fe)/(N1*k0)
    lat=p1-(N1*np.tan(p1)/R1)*(D**2/2-(5+3*T1+10*C1-4*C1**2-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1**2-252*ep2-3*C1**2)*D**6/720)
    lon=np.radians(lon0)+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1**2+8*ep2+24*T1**2)*D**5/120)/np.cos(p1)
    return lat,lon
def _tm_fwd(lat,lon,ell,lon0,lat0,k0,fe,fn):
    a,f=ell; e2=f*(2-f); ep2=e2/(1-e2)
    def M(phi):
        return a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*np.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*np.sin(4*phi)-(35*e2**3/3072)*np.sin(6*phi))
    N=a/np.sqrt(1-e2*np.sin(lat)**2); T=np.tan(lat)**2; C=ep2*np.cos(lat)**2; A=(lon-np.radians(lon0))*np.cos(lat)
    x=fe+k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ep2)*A**5/120)
    y=fn+k0*(M(lat)-M(np.radians(lat0))+N*np.tan(lat)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ep2)*A**6/720))
    return x,y
def _geo2ecef(lat,lon,ell,h=0):
    a,f=ell; e2=f*(2-f); N=a/np.sqrt(1-e2*np.sin(lat)**2)
    return (N+h)*np.cos(lat)*np.cos(lon),(N+h)*np.cos(lat)*np.sin(lon),(N*(1-e2)+h)*np.sin(lat)
def _ecef2geo(X,Y,Z,ell):
    a,f=ell; e2=f*(2-f); p=np.sqrt(X**2+Y**2); lat=np.arctan2(Z,p*(1-e2))
    for _ in range(6):
        N=a/np.sqrt(1-e2*np.sin(lat)**2); lat=np.arctan2(Z+e2*N*np.sin(lat),p)
    return lat,np.arctan2(Y,X)
def bessel_to_5179(x,y):
    """EPSG:5174(Korean 1985 수정 중부원점, towgs84 -115.80,474.99,674.11,1.16,-2.31,-1.63,6.43) → EPSG:5179"""
    x=np.asarray(x,float); y=np.asarray(y,float)
    lat,lon=_tm_inv(x,y,BES,127.0028902777778,38,1.0,200000,500000)
    X,Y,Z=_geo2ecef(lat,lon,BES)
    tx,ty,tz,rx,ry,rz,s=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43
    as_=np.radians(1/3600); rx,ry,rz=rx*as_,ry*as_,rz*as_; m=1+s*1e-6
    X2=tx+m*(X-rz*Y+ry*Z); Y2=ty+m*(rz*X+Y-rx*Z); Z2=tz+m*(-ry*X+rx*Y+Z)  # position vector
    lat2,lon2=_ecef2geo(X2,Y2,Z2,GRS)
    return _tm_fwd(lat2,lon2,GRS,127.5,38,0.9996,1000000,2000000)
def wgs_to_5179(lat,lon):
    return _tm_fwd(np.radians(lat),np.radians(lon),GRS,127.5,38,0.9996,1000000,2000000)
def to_wgs(x,y):
    lat,lon=_tm_inv(np.asarray(x,float),np.asarray(y,float),GRS,127.5,38,0.9996,1000000,2000000); return np.degrees(lat),np.degrees(lon)
