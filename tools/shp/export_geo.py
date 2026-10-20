"""특화지구 후보 → GeoJSON(EPSG:5179) : QGIS에서 바로 열기"""
import json, sqlite3, sys, numpy as np, pandas as pd
sys.path.insert(0, '/tmp/claude-0/shp')
from gpkg_geom import gpkg_geom
import maps
df = pd.read_pickle('parcels.pkl')
c = sqlite3.connect('file:/mnt/user-data/uploads/용도지역.gpkg?mode=ro', uri=True)
TL = {k: v[1] for k, v in maps.TYPES.items()}
def judge(t, x):
    if t == 'village': return '충족(45m 경계)' if x['ok'] else ('경계 좁히면 충족(25m)' if x['ok25'] else '밀도 미달')
    if t == 'industry': return '면적·용도지역 충족' if x['ok'] else '면적 또는 용도지역 미달'
    if t == 'livestock': return '축사 집적(면적비는 건축물 확인 필요)'
    if t == 'energy': return x['scale']
    if t == 'farm': return ' / '.join(k for k, f in [('10ha↑(과수·전략작물)', x['t10']), ('20ha↑(친환경)', x['t20']), ('답 50ha↑(친환경 쌀)', x['t50rice']), ('답 100ha↑(고품질쌀)', x['t100rice'])] if f)
    if t == 'fusion': return '반경 300m 관리·농림 3ha↑' if x['ok'] else '체험마을 필지가 도시·녹지지역'
    return ''
def geom_of(pids):
    polys = []
    for fid in df.fid.values[pids]:
        g = c.execute('select geom from "용도지역" where fid=?', (int(fid),)).fetchone()[0]
        for p in gpkg_geom(g): polys.append([np.round(r, 2).tolist() for r in p])
    return {'type': 'MultiPolygon', 'coordinates': polys}
allf = []
for e in maps.EMD:
    sel = maps.select(e); feats = []
    for t, lst in sel.items():
        for x in lst:
            props = dict(읍면=e, 번호=x['id'], 유형=TL[t], 리=('·'.join(x['ri']) if isinstance(x.get('ri'), list) else x.get('ri', '')),
                         대표지번=x.get('rep') or x.get('addr', ''), 판정=judge(t, x))
            if t == 'village': props.update(주거필지=x['n_res'], 지구면적_m2=x['area'], 대지비율_45m=x['ratio'], 호밀도_45m=x['dens'], 대지비율_25m=x['ratio25'], 호밀도_25m=x['dens25'])
            elif t == 'fusion': props.update(명칭=x['name'], 반경300m_관리농림_m2=x['ma_area'])
            elif t == 'livestock': props.update(축사필지=x['n'], 축사필지면적_m2=x['liv_area'])
            elif t == 'farm': props.update(면적_m2=x['area'], 답_m2=x['dap'])
            else: props.update(필지=x.get('n'), 면적_m2=x.get('area'))
            if t == 'fusion': g = {'type': 'Point', 'coordinates': [round(x['cx'], 2), round(x['cy'], 2)]}
            else: g = geom_of(np.array(x['pids'], int))
            feats.append({'type': 'Feature', 'properties': props, 'geometry': g})
    fc = {'type': 'FeatureCollection', 'name': f'{e}_특화지구후보', 'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::5179'}}, 'features': feats}
    json.dump(fc, open(f'geo/{e}_특화지구후보.geojson', 'w'), ensure_ascii=False)
    allf += feats; print(e, len(feats))
json.dump({'type': 'FeatureCollection', 'name': '정선군_특화지구후보', 'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::5179'}}, 'features': allf}, open('geo/정선군_특화지구후보.geojson', 'w'), ensure_ascii=False)
