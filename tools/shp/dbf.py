import struct
def read_dbf(path, enc='utf-8', limit=None):
    f=open(path,'rb'); hdr=f.read(32)
    n,hl,rl=struct.unpack('<IHH',hdr[4:12])
    fields=[]
    while True:
        d=f.read(32)
        if d[0]==0x0D: break
        name=d[:11].split(b'\0')[0].decode(enc,'replace'); t=chr(d[11]); ln=d[16]; dc=d[17]
        fields.append((name,t,ln,dc))
    f.seek(hl); rows=[]
    for i in range(n if limit is None else min(n,limit)):
        r=f.read(rl); p=1; row={}
        for name,t,ln,dc in fields:
            v=r[p:p+ln]; p+=ln
            s=v.decode(enc,'replace').strip()
            if t in 'NF':
                try: s=float(s) if s else None
                except: pass
            row[name]=s
        rows.append(row)
    return n,fields,rows
