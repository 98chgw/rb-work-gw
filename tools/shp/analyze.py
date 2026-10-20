"""정선군 농촌특화지구 후보 분석 (필지 토지특성정보 + 국토통계 인구격자 + 개발진흥지구 + 체험휴양마을)
기준: 농림축산식품부 「농촌 공간의 효율적 활용을 위한 농촌특화지구 활성화 방안」(2026.7) Ⅴ장 유형별 지정 기준(요약)
출력: results.json (읍면별 유형별 후보), lab rasters 재사용"""
import sys, json, numpy as np, pandas as pd
sys.path.insert(0, '/tmp/claude-0/shp')
from scipy.spatial import cKDTree
from scipy import ndimage as ndi
from shp import read_shp
from dbf import read_dbf
from proj import bessel_to_5179, wgs_to_5179

U = '/root/.claude/uploads/1b5324e2-e9c8-5caf-9d2a-2e66dea71522/'
df = pd.read_pickle('parcels.pkl')
lab = np.load('lab10.npy'); G = json.load(open('grid.json'))
RES = G['RES']

# 용도지역 구분
URB = {'제1종일반주거지역', '제2종일반주거지역', '제3종일반주거지역', '준주거지역', '일반상업지역', '근린상업지역', '준공업지역', '일반공업지역'}
GRN = {'자연녹지지역', '생산녹지지역', '보전녹지지역'}
MGT = {'계획관리지역', '생산관리지역', '보전관리지역'}
def zcls(z):
    if z in URB: return '도시(주거·상업·공업)'
    if z in GRN: return '녹지'
    if z in MGT: return '관리'
    if z == '농림지역': return '농림'
    if z == '자연환경보전지역': return '자연환경보전'
    return '기타'
df['zc'] = df.zone.map(zcls)
RES_USE = {'단독', '연립', '다세대', '아파트', '주거기타'}
IND_USE = {'공업용', '공업나지', '공업기타'}
LIV_USE = {'전축사', '답축사', '목장용지'}
FARM_J = {'전', '답', '과수원'}

# 인구격자(100m)
st, bb, pg = read_shp(U + '3c45f319-nlsp_021001001.shp'); n, fl, prow = read_dbf('/mnt/user-data/uploads/nlsp_021001001.dbf', 'utf-8')
pc = np.array([r[0].mean(0) for r in pg]); pv = np.array([r['val'] if isinstance(r['val'], float) else 0.0 for r in prow])
pop_xy = pc[pv > 0]; pop_v = pv[pv > 0]; pop_tree = cKDTree(pop_xy)

# 개발진흥지구(베셀 → 5179)
st, bb, dg = read_shp(U + '1da5af2d-__________.shp'); n, fl, drow = read_dbf(U + '6e5bf287-__________.dbf', 'cp949')
dev = []
seen = set()
for poly, r in zip(dg, drow):
    if r['COL_ADM_SE'] != '51770': continue
    key = (r['ALIAS'], round(r['면적']))
    if key in seen: continue
    seen.add(key)
    ring = max(poly, key=len)
    xs, ys = bessel_to_5179(ring[:, 0], ring[:, 1])
    dev.append(dict(name=r['ALIAS'] or '', kind=r['비고'] or r['개발진흥지'] or '', area=r['면적'], ring=np.c_[xs, ys].tolist()))

def px(x, y):
    return int((G['Y1'] - y) / RES), int((x - G['X0']) / RES)

def parcel_at(x, y):
    r, c = px(x, y)
    if 0 <= r < G['H'] and 0 <= c < G['W'] and lab[r, c] > 0: return df.iloc[lab[r, c] - 1]
    return None

for d in dev:
    a = np.array(d['ring']); p = parcel_at(*a.mean(0))
    # 무게중심이 밖이면 꼭짓점들 중 다수결
    rs = [parcel_at(*v) for v in a[:: max(1, len(a) // 20)]]
    emds = pd.Series([q.emd for q in rs if q is not None] + ([p.emd] if p is not None else []))
    ris = pd.Series([q.ri for q in rs if q is not None] + ([p.ri] if p is not None else []))
    d['emd'] = emds.mode().iat[0] if len(emds) else ''
    d['ri'] = ris.mode().iat[0] if len(ris) else ''
    d['cx'], d['cy'] = a.mean(0).tolist()

def clusters(idx, link):
    """필지 중심점 단일연결 군집 (거리 link m 이하면 같은 군집)"""
    if len(idx) == 0: return []
    xy = df.loc[idx, ['cx', 'cy']].values
    t = cKDTree(xy); pairs = t.query_pairs(link, output_type='ndarray')
    par = np.arange(len(idx))
    def f(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for a, b in pairs:
        ra, rb = f(a), f(b)
        if ra != rb: par[ra] = rb
    roots = np.array([f(i) for i in range(len(idx))])
    out = {}
    for i, r in enumerate(roots): out.setdefault(r, []).append(idx[i])
    return list(out.values())

def comp(sub, w='area'):
    """용도지역 구성비(면적)"""
    s = sub.groupby('zc')[w].sum(); s = s / s.sum() * 100
    return {k: round(float(v), 1) for k, v in s.sort_values(ascending=False).items()}

def zdetail(sub):
    s = sub.groupby('zone')['area'].sum(); s = s / s.sum() * 100
    return {k: round(float(v), 1) for k, v in s.sort_values(ascending=False).head(4).items()}

def where(sub, w=None):
    s = sub.groupby('ri')['area'].sum().sort_values(ascending=False)
    return [k for k in s.index[:3]]

def rep_jibun(sub):
    r = sub.sort_values('area', ascending=False).iloc[0]
    j = r.pnu[10:]
    main, subn = int(j[1:5]), int(j[5:9])
    return f"{r.ri} {'산' if j[0]=='2' else ''}{main}{'-'+str(subn) if subn else ''}"

def pop_near(xy, r=60):
    hits = set()
    for i in pop_tree.query_ball_point(xy, r):
        hits.update(i)
    return int(pop_v[list(hits)].sum()) if hits else 0

ELIG = {  # 유형별 허용 용도지역 구분
    'village': {'녹지', '관리', '농림', '자연환경보전'},
    'industry': {'관리'},  # + 전용·일반공업지역
    'livestock': {'녹지', '관리', '농림'},
    'fusion': {'관리', '농림'},
    'energy': {'녹지', '관리', '농림'},
    'landscape': {'녹지', '관리', '농림', '자연환경보전'},
    'special': {'관리', '농림', '자연환경보전'},
}
lab_flat_parcel = None
res = {e: {} for e in sorted(df.emd.unique())}
outl = {}  # 지도용 외곽 (필지 인덱스 목록)

# ① 농촌마을보호지구 — 녹지·관리·농림·자연환경보전 지역 주거필지 군집
cand_parcel_j = {'대', '전', '답', '과수원', '잡종지', '창고용지', '주차장', '종교용지', '학교용지', '목장용지', '도로', '구거', '공원', '체육용지', '유지'}
resid = df[df.use.isin(RES_USE)]
mask_res = np.zeros(len(df) + 1, bool)
for elig in [True]:
    sub = resid[resid.zc.isin(ELIG['village'])]
    for emd, g in sub.groupby('emd'):
        out = []
        for cl in clusters(g.index.values, 80):
            if len(cl) < 20: continue
            cs = df.loc[cl]
            # 지구 = 군집 주거필지 + 주거필지 30m 안의 작은 필지(5,000㎡ 미만, 임야·하천 제외)
            t = cKDTree(cs[['cx', 'cy']].values)
            near = df[(df.emd == emd) & df.jimok.isin(cand_parcel_j) & (df.area < 5000) & df.zc.isin(ELIG['village'])]
            near = near[(np.abs(near.cx - cs.cx.mean()) < 3000) & (np.abs(near.cy - cs.cy.mean()) < 3000)]
            d, _ = t.query(near[['cx', 'cy']].values, distance_upper_bound=45)
            zone_idx = sorted(set(near.index[d < 45]) | set(cl))
            z25 = df.loc[sorted(set(near.index[d < 25]) | set(cl))]
            a25 = z25.area.sum(); r25 = z25[z25.jimok == '대'].area.sum() / a25 * 100; d25 = len(cl) / a25 * 1e4
            zz = df.loc[zone_idx]
            area = zz.area.sum(); dae = zz[zz.jimok == '대'].area.sum()
            nres = len(cl)
            ratio = dae / area * 100; dens = nres / area * 1e4
            ok30 = nres >= 30; okd = ratio >= 30 or dens >= 10
            urb_share = comp(zz).get('도시(주거·상업·공업)', 0)
            out.append(dict(type='village', emd=emd, ri=where(cs), rep=rep_jibun(cs), n_res=nres, area=round(area), dae=round(dae), ratio=round(ratio, 1), dens=round(dens, 1),
                            zones=comp(zz), zdet=zdetail(zz), cx=float(cs.cx.mean()), cy=float(cs.cy.mean()),
                            ok=bool(ok30 and okd), ok30=bool(ok30), okd=bool(okd), area25=round(a25), ratio25=round(r25, 1), dens25=round(d25, 1), ok25=bool(ok30 and (r25 >= 30 or d25 >= 10)), pids=[int(i) for i in zone_idx]))
            outl[f'village|{emd}|{len(out)-1}'] = zone_idx
        out.sort(key=lambda r: (-r['ok'], -r['n_res']))
        res[emd]['village'] = out
    # 도시지역(주거·상업) 시가지 군집 — 대상 아님 표시용
    subu = resid[resid.zc == '도시(주거·상업·공업)']
    for emd, g in subu.groupby('emd'):
        cl = max(clusters(g.index.values, 80), key=len)
        cs = df.loc[cl]
        res[emd]['urban_core'] = dict(ri=where(cs), n_res=len(cl), zdet=zdetail(cs))

# ② 농촌산업지구 — 공업용 필지 군집, 관리지역 또는 전용·일반공업지역, 30,000㎡ 이상
ind = df[df.use.isin(IND_USE) | (df.jimok == '공장용지')]
for emd, g in ind.groupby('emd'):
    out = []
    for cl in clusters(g.index.values, 120):
        cs = df.loc[cl]; area = cs.area.sum()
        if area < 5000: continue
        zd = zdetail(cs); zc = comp(cs)
        elig_share = sum(v for k, v in zd.items() if k in MGT or k == '일반공업지역')
        out.append(dict(type='industry', emd=emd, ri=where(cs), rep=rep_jibun(cs), n=len(cl), area=round(area), zones=zc, zdet=zd,
                        ok=bool(area >= 30000 and elig_share >= 50), ok_area=bool(area >= 30000), elig_share=round(elig_share, 1), cx=float(cs.cx.mean()), cy=float(cs.cy.mean()), pids=[int(i) for i in cl]))
        outl[f'industry|{emd}|{len(out)-1}'] = list(cl)
    out.sort(key=lambda r: -r['area']); res[emd]['industry'] = out

# ③ 축산지구 — 축사 필지 군집 볼록껍질 면적 30,000㎡ 이상, 축사 면적비 30% 이상
from scipy.spatial import ConvexHull
liv = df[df.use.isin(LIV_USE)]
for emd, g in liv.groupby('emd'):
    out = []
    for cl in clusters(g.index.values, 200):
        cs = df.loc[cl]; la = cs.area.sum()
        if len(cl) < 3: continue
        try: hull = ConvexHull(cs[['cx', 'cy']].values).volume
        except Exception: hull = 0
        out.append(dict(type='livestock', emd=emd, ri=where(cs), rep=rep_jibun(cs), n=len(cl), liv_area=round(la), hull=round(hull), zones=comp(cs), zdet=zdetail(cs),
                        ok=bool(la >= 9000 and comp(cs).get('도시(주거·상업·공업)', 0) < 50), cx=float(cs.cx.mean()), cy=float(cs.cy.mean()), pids=[int(i) for i in cl]))
        outl[f'livestock|{emd}|{len(out)-1}'] = list(cl)
    out.sort(key=lambda r: -r['liv_area']); res[emd]['livestock'] = out

# ④ 재생에너지지구 — 태양광 필지 군집
sol = df[df.use == '태양광']
for emd, g in sol.groupby('emd'):
    out = []
    for cl in clusters(g.index.values, 150):
        cs = df.loc[cl]; area = cs.area.sum()
        zc = comp(cs)
        out.append(dict(type='energy', emd=emd, ri=where(cs), rep=rep_jibun(cs), n=len(cl), area=round(area), zones=zc, zdet=zdetail(cs),
                        scale='영농연계·관리형 규모(5ha 이상)' if area >= 50000 else '마을소득형 규모 검토', farm_share=zc.get('농림', 0), cx=float(cs.cx.mean()), cy=float(cs.cy.mean()), pids=[int(i) for i in cl]))
        outl[f'energy|{emd}|{len(out)-1}'] = list(cl)
    out.sort(key=lambda r: -r['area']); res[emd]['energy'] = out

# ⑤ 농경지 연접 단지 (특성화농업·경관 후보) — 전·답·과수원 래스터 연결(10m 틈 허용)
farm_ids = np.zeros(len(df) + 1, bool); farm_ids[df.index[df.jimok.isin(FARM_J)].values + 1] = True
fm = farm_ids[lab]
# 도로·구거·제방 10m 폭은 이어진 것으로 봄
fm2 = ndi.binary_closing(fm, structure=np.ones((3, 3)), iterations=1)
lbl, nl = ndi.label(fm2)
pl = lab.ravel(); ll = lbl.ravel()
sel = (pl > 0) & farm_ids[pl] & (ll > 0)
pp = pd.DataFrame({'p': pl[sel] - 1, 'l': ll[sel]})
p2l = pp.groupby('p')['l'].agg(lambda s: s.mode().iat[0])
df['farmblk'] = -1; df.loc[p2l.index, 'farmblk'] = p2l.values
fb = df[df.farmblk > 0]
blocks = []
for b, cs in fb.groupby('farmblk'):
    area = cs.area.sum()
    if area < 50000: continue
    dap = cs[cs.jimok == '답'].area.sum(); orch = cs[(cs.jimok == '과수원') | (cs.use == '과수원')].area.sum()
    zc = comp(cs)
    elig = sum(v for k, v in zc.items() if k in ELIG['special'])
    emd = cs.groupby('emd').area.sum().idxmax()
    blocks.append(dict(type='farm', emd=emd, ri=where(cs), rep=rep_jibun(cs), n=len(cs), area=round(area), dap=round(dap), orch=round(orch), zones=zc, zdet=zdetail(cs),
                       elig_share=round(elig, 1), t10=bool(area >= 100000), t20=bool(area >= 200000), t50rice=bool(dap >= 500000), t100rice=bool(dap >= 1000000),
                       cx=float(cs.cx.mean()), cy=float(cs.cy.mean()), blk=int(b), pids=[int(i) for i in cs.index]))
for e in res: res[e]['farm'] = sorted([b for b in blocks if b['emd'] == e], key=lambda r: -r['area'])
for b in blocks: outl[f"farm|{b['emd']}|{b['blk']}"] = list(fb.index[fb.farmblk == b['blk']])

# ⑥ 체험휴양마을(융복합 후보) 주변 300m 용도지역
chm = pd.read_pickle('chm.pkl')
fus = []
for _, r in chm.iterrows():
    x, y = wgs_to_5179(float(r['위도']), float(r['경도']))
    t = df[(np.hypot(df.cx - x, df.cy - y) <= 300)]
    zc = comp(t); ma = t[t.zc.isin(ELIG['fusion'])].area.sum()
    p = parcel_at(x, y)
    fus.append(dict(type='fusion', name=r['체험마을명'], addr=r['소재지지번주소'].replace('강원도 정선군 ', ''), emd=r['소재지지번주소'].split()[2], zone_at=(p.zone if p is not None else ''),
                    zones=zc, ma_area=round(ma), ok=bool(ma >= 30000 and (p is None or p.zc in ELIG['fusion'])), cx=float(x), cy=float(y)))
for e in res: res[e]['fusion'] = [f for f in fus if f['emd'] == e]
for e in res: res[e]['dev'] = [dict(name=d['name'], kind=d['kind'], area=round(d['area']), ri=d['ri']) for d in dev if d['emd'] == e]

# 읍면 개요
for e, g in df.groupby('emd'):
    res[e]['summary'] = dict(parcels=int(len(g)), area_km2=round(g.area.sum() / 1e6, 2), zones=comp(g), res_parcels=int(g.use.isin(RES_USE).sum()),
                             ind_parcels=int((g.use.isin(IND_USE) | (g.jimok == '공장용지')).sum()), liv_parcels=int((g.use.isin(LIV_USE) | (g.jimok == '목장용지')).sum()),
                             sol_parcels=int((g.use == '태양광').sum()), sol_area=round(g[g.use == '태양광'].area.sum()), farm_area_ha=round(g[g.jimok.isin(FARM_J)].area.sum() / 1e4, 1))
json.dump(res, open('results.json', 'w'), ensure_ascii=False, indent=1, default=float)
json.dump({k: [int(i) for i in v] for k, v in outl.items()}, open('outlines.json', 'w'))
json.dump(dev, open('dev.json', 'w'), ensure_ascii=False)
for e in res:
    s = res[e]
    print(e, 'village ok', sum(v['ok'] for v in s.get('village', [])), '/', len(s.get('village', [])), '| ind ok', sum(v['ok'] for v in s.get('industry', [])), '/', len(s.get('industry', [])),
          '| liv ok', sum(v['ok'] for v in s.get('livestock', [])), '| solar', len(s.get('energy', [])), '| farm≥5ha', len(s.get('farm', [])), '| dev', len(s['dev']))
