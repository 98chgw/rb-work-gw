"""읍면별 특화지구 후보 선정(표시용 번호 부여) + 지도 PNG"""
import json, sys, numpy as np, pandas as pd
sys.path.insert(0, '/tmp/claude-0/shp')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm, patheffects as pe
from matplotlib.patches import Patch
from matplotlib.lines import Line2D
from scipy import ndimage as ndi

for f in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc']:
    try: fm.fontManager.addfont(f)
    except Exception: pass
plt.rcParams['font.family'] = 'Noto Sans CJK JP'
plt.rcParams['axes.unicode_minus'] = False

R = json.load(open('results.json')); OL = json.load(open('outlines.json')); DEV = json.load(open('dev.json'))
df = pd.read_pickle('parcels.pkl'); lab = np.load('lab10.npy'); G = json.load(open('grid.json'))
EMD = sorted(df.emd.unique()); emd_code = np.zeros(len(df) + 1, np.int8)
emd_code[1:] = df.emd.map({e: i + 1 for i, e in enumerate(EMD)}).values
E = emd_code[lab]

ZC = {'도시(주거·상업·공업)': 1, '녹지': 2, '관리': 3, '농림': 4, '자연환경보전': 5, '기타': 0}
URB = {'제1종일반주거지역', '제2종일반주거지역', '제3종일반주거지역', '준주거지역', '일반상업지역', '근린상업지역', '준공업지역', '일반공업지역'}
def zc(z):
    if z in URB: return 1
    if z in ('자연녹지지역', '생산녹지지역', '보전녹지지역'): return 2
    if z in ('계획관리지역', '생산관리지역', '보전관리지역'): return 3
    if z == '농림지역': return 4
    if z == '자연환경보전지역': return 5
    return 0
zarr = np.zeros(len(df) + 1, np.int8); zarr[1:] = df.zone.map(zc).values
farm = np.zeros(len(df) + 1, bool); farm[1:] = df.jimok.isin(['전', '답', '과수원']).values
PAL = {0: (1, 1, 1), 1: (0.93, 0.80, 0.80), 2: (0.83, 0.92, 0.80), 3: (0.97, 0.94, 0.80), 4: (0.90, 0.94, 0.90), 5: (0.80, 0.90, 0.93)}
TYPES = {
    'village': ('M', '농촌마을보호지구', '#d62728'),
    'industry': ('I', '농촌산업지구', '#7b3fa0'),
    'livestock': ('L', '축산지구', '#8c564b'),
    'energy': ('E', '재생에너지지구', '#e3a008'),
    'farm': ('F', '특성화농업·경관 (연접 농경지)', '#1f9e4a'),
    'fusion': ('U', '농촌융복합산업지구 (체험휴양마을)', '#1f77b4'),
}

def select(e):
    s = R[e]; out = {}
    v = [x for x in s.get('village', []) if x['n_res'] >= 30]
    v = sorted(v, key=lambda x: (not x['ok'], -x['n_res']))[:6]
    out['village'] = v
    ind = s.get('industry', [])
    out['industry'] = [x for x in ind if x['ok']] + [x for x in ind if not x['ok'] and x['area'] >= 15000][:3]
    out['livestock'] = [x for x in s.get('livestock', []) if x['ok']][:3]
    out['energy'] = [x for x in s.get('energy', []) if x['area'] >= 10000][:4]
    fb = [x for x in s.get('farm', []) if x['area'] >= 100000 and x['elig_share'] >= 50]
    out['farm'] = fb[:5]
    out['fusion'] = s.get('fusion', [])
    # 원래 인덱스(외곽 키) 보존
    for t in ('village', 'industry', 'livestock', 'energy'):
        allx = s.get(t, [])
        for x in out[t]: x['_k'] = f"{t}|{e}|{allx.index(x)}"
    for x in out['farm']: x['_k'] = f"farm|{e}|{x['blk']}"
    for t, lst in out.items():
        p = TYPES[t][0]
        for i, x in enumerate(lst): x['id'] = f'{p}{i + 1}'
    return out

def draw(e, sel, path, window=None, title_sfx=''):
    k = EMD.index(e) + 1
    rows, cols = np.where(E == k)
    r0, r1, c0, c1 = rows.min(), rows.max(), cols.min(), cols.max()
    pad = 40; r0 = max(r0 - pad, 0); c0 = max(c0 - pad, 0); r1 = min(r1 + pad, lab.shape[0] - 1); c1 = min(c1 + pad, lab.shape[1] - 1)
    if window: r0, r1, c0, c1 = window
    L = lab[r0:r1 + 1, c0:c1 + 1]; Ek = E[r0:r1 + 1, c0:c1 + 1] == k
    img = np.ones(L.shape + (3,), np.float32)
    Z = zarr[L]
    for z, col in PAL.items(): img[Z == z] = col
    F = farm[L] & Ek
    img[F] = img[F] * 0.93
    out_mask = ~Ek & (L > 0)
    img[out_mask] = img[out_mask] * 0.35 + 0.65
    img[L == 0] = (1, 1, 1)
    fig_w = 11; h = fig_w * L.shape[0] / L.shape[1]
    fig, ax = plt.subplots(figsize=(fig_w, max(h, 6)), dpi=130)
    ax.imshow(img, interpolation='nearest')
    # 읍면 경계
    edge = Ek & ~ndi.binary_erosion(Ek, iterations=2, border_value=1)
    em = np.zeros(L.shape + (4,), np.float32); em[edge] = (0.2, 0.2, 0.2, 1); ax.imshow(em, interpolation='nearest')
    # 리 이름
    sub = df[(df.emd == e)]
    for ri, g in sub.groupby('ri'):
        x = (np.average(g.cx, weights=g.area) - G['X0']) / 10 - c0; y = (G['Y1'] - np.average(g.cy, weights=g.area)) / 10 - r0
        if 0 <= x < L.shape[1] and 0 <= y < L.shape[0]: ax.text(x, y, ri, clip_on=True, fontsize=8, color='#666', ha='center', va='center', alpha=.85, path_effects=[pe.withStroke(linewidth=2.5, foreground='white')])
    # 개발진흥지구
    for d in DEV:
        if d.get('emd') != e: continue
        a = np.array(d['ring']); ax.plot((a[:, 0] - G['X0']) / 10 - c0, (G['Y1'] - a[:, 1]) / 10 - r0, ls='--', lw=.9, color='#555')
    # 후보 채우기 (한 장의 덧씌움 이미지로)
    ov = np.zeros(L.shape + (4,), np.float32); bdm = np.zeros(L.shape + (4,), np.float32); labels = []
    for t in ('farm', 'energy', 'livestock', 'industry', 'village'):
        col = matplotlib.colors.to_rgb(TYPES[t][2])
        for x in sel.get(t, []):
            ids = np.array(x.get('pids', []), int) + 1
            m = np.isin(L, ids)
            if not m.any(): continue
            m = ndi.binary_closing(m, iterations=2) | m
            al = .32 if t == 'farm' else (.22 if (t == 'village' and not x.get('ok')) else .55)
            ov[m] = (*col, al)
            bd = m & ~ndi.binary_erosion(m, border_value=1)
            bd = ndi.binary_dilation(bd)
            bdm[bd] = (*col, .95)
            cy, cx = np.argwhere(m).mean(0); labels.append((cx, cy, x['id'], TYPES[t][2]))
    ax.imshow(ov, interpolation='nearest'); ax.imshow(bdm, interpolation='nearest')
    for cx, cy, t_, c_ in labels:
        ax.text(cx, cy, t_, clip_on=True, fontsize=9.5, fontweight='bold', color=c_, ha='center', va='center', path_effects=[pe.withStroke(linewidth=3, foreground='white')])
    for x in sel.get('fusion', []):
        px = (x['cx'] - G['X0']) / 10 - c0; py = (G['Y1'] - x['cy']) / 10 - r0
        if not (0 <= px < L.shape[1] and 0 <= py < L.shape[0]): continue
        if not (0 <= px < L.shape[1] and 0 <= py < L.shape[0]): continue
        ax.scatter([px], [py], s=120, marker='*', c=TYPES['fusion'][2], edgecolors='white', linewidths=1, zorder=5)
        ax.text(px + 25, py, f"{x['id']} {x['name']}", clip_on=True, fontsize=8.5, color=TYPES['fusion'][2], fontweight='bold', va='center', path_effects=[pe.withStroke(linewidth=3, foreground='white')])
    # 축척
    km = 2 if L.shape[1] > 2500 else (1 if L.shape[1] > 600 else 0.5); sb = 100 * km
    x0, y0 = 30, L.shape[0] - 40
    ax.plot([x0, x0 + sb], [y0, y0], color='#222', lw=3); ax.text(x0 + sb / 2, y0 - 14, f'{km:g} km', ha='center', fontsize=8)
    ax.set_xlim(0, L.shape[1]); ax.set_ylim(L.shape[0], 0); ax.axis('off')
    hs = [Patch(facecolor=PAL[1], label='도시지역(주거·상업·공업)'), Patch(facecolor=PAL[2], label='녹지지역'), Patch(facecolor=PAL[3], label='관리지역'),
          Patch(facecolor=PAL[4], label='농림지역'), Patch(facecolor=PAL[5], label='자연환경보전지역')]
    for t in ('village', 'industry', 'livestock', 'energy', 'farm'):
        if sel.get(t): hs.append(Patch(facecolor=TYPES[t][2], alpha=.6, label=f"{TYPES[t][0]} {TYPES[t][1]}"))
    if sel.get('fusion'): hs.append(Line2D([], [], marker='*', ls='', color=TYPES['fusion'][2], markersize=11, label=f"U {TYPES['fusion'][1]}"))
    if any(d.get('emd') == e for d in DEV): hs.append(Line2D([], [], ls='--', color='#555', label='개발진흥지구(용도지구)'))
    ax.legend(handles=hs, loc='upper left', fontsize=7.5, framealpha=.92, borderpad=.6)
    ax.set_title(f'{e} 농촌특화지구 후보지{title_sfx} (필지 토지특성정보 2024.8 기준 분석)', fontsize=12, fontweight='bold', loc='left')
    fig.tight_layout(); fig.savefig(path, dpi=130, bbox_inches='tight', facecolor='white'); plt.close(fig)

if __name__ == '__main__':
    import os
    os.makedirs('maps', exist_ok=True)
    SEL = {}
    for e in EMD:
        sel = select(e); SEL[e] = sel
        draw(e, sel, f'maps/{e}.png')
        # 확대도: 마을·산업·축산·재생·체험마을 후보가 모인 범위
        pts = []
        for t in ('village', 'industry', 'livestock', 'energy'):
            for x in sel.get(t, []):
                ids = np.array(x.get('pids', []), int)
                if len(ids): pts += list(zip(df.cx.values[ids], df.cy.values[ids]))
        pts += [(x['cx'], x['cy']) for x in sel.get('fusion', [])]
        if pts:
            a = np.array(pts); xs, ys = np.percentile(a[:, 0], [3, 97]), np.percentile(a[:, 1], [3, 97])
            c0 = int((xs[0] - G['X0']) / 10) - 60; c1 = int((xs[1] - G['X0']) / 10) + 60
            r0 = int((G['Y1'] - ys[1]) / 10) - 60; r1 = int((G['Y1'] - ys[0]) / 10) + 60
            w, h = c1 - c0, r1 - r0
            if w < 250: c0 -= (250 - w) // 2; c1 = c0 + 250
            if h < 250: r0 -= (250 - h) // 2; r1 = r0 + 250
            draw(e, sel, f'maps/{e}_zoom.png', window=(max(r0, 0), r1, max(c0, 0), c1), title_sfx=' — 확대')
        print('map', e)
    [x.pop('pids', None) for v in SEL.values() for l in v.values() for x in l]
    json.dump(SEL, open('selected.json', 'w'), ensure_ascii=False, indent=1, default=float)
