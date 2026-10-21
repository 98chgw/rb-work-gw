"""읍·면 지역현안 및 발전방향 문서 생성기 — 화암면 문서와 같은 구성·클래스
사용: python3 gen_town.py towns/imgye.py out_dir"""
import sys as _s; _s.path.insert(0, '/tmp/claude-0/iss'); import axes_hubs
import html as H, importlib.util, json, re, sys, os

e = lambda s: s  # 본문은 작성자가 HTML 안전하게 씀(<b> 허용)


def S(src):
    return f'<span class="src">출처: {src}</span>' if src else ''


BADGE = {'ing': 'badge-ing', 'done': 'badge-done', 'plan': 'badge-plan', 'new': 'badge-new'}


def projects(T):
    h = [f'<h2>1. {T["name"]} 지역 사업 추진 현황</h2>', '<table><thead><tr><th style="width:26%">사업명 (상세 위치)</th><th style="width:20%">사업 상태 (기간)</th><th>세부 내용</th></tr></thead><tbody>']
    for p in T['projects']:
        st = '<br>'.join(f'<span class="{BADGE[k]}">{v}</span>' for k, v in p['st'])
        h.append(f'<tr><td>{p["name"]}<br>({p["loc"]})</td><td class="center">{st}<br>({p["period"]})</td><td>'
                 + '<br>'.join('- ' + x for x in p['items']) + S(p['src']) + '</td></tr>')
    h.append('</tbody></table>')
    if T.get('proj_note'): h.append(f'<p class="note">※ {T["proj_note"]}</p>')
    return '\n'.join(h)


def resources(T):
    h = [f'<h2>2. {T["name"]} 주요 관광 및 자연·역사 자원 현황</h2>', '<table><thead><tr><th style="width:15%">분류</th><th style="width:27%">자원명 (위치)</th><th>특성 및 보고서 활용 방안</th></tr></thead><tbody>']
    for cat, rows in T['resources']:
        for i, r in enumerate(rows):
            first = f'<td rowspan="{len(rows)}" class="center">{cat}</td>' if i == 0 else ''
            h.append(f'<tr>{first}<td>{r["name"]}</td><td>' + '<br>'.join('- ' + x for x in r['items']) + S(r.get('src', '')) + '</td></tr>')
    h.append('</tbody></table>')
    return '\n'.join(h)


def bullets(items):
    return '<ul>' + ''.join(f'<li>{t}{S(s)}</li>' for t, s in items) + '</ul>'


def issues(T):
    h = [f'<h2>3 ㅣ {T["name"]} 지역현안 및 잠재력 분석</h2>', '<h3>3-1. 취약점 (지역 문제점)</h3>']
    for i, p in enumerate(T['problems']):
        h.append(f'<h4>{"①②③④⑤⑥"[i]} {p["t"]} <span class="tag">({p["tag"]})</span></h4>' + bullets(p['li']))
    h.append('<h3>3-2. 강점 및 잠재력</h3>')
    for i, p in enumerate(T['potentials']):
        h.append(f'<h4>{"①②③④⑤⑥"[i]} {p["t"]} <span class="tag">({p["tag"]})</span></h4>' + bullets(p['li']))
    return '\n'.join(h)


SECT = ['농촌주거·정주여건 개선 부문', '농촌생활서비스 시설 확충 및 제공 부문', '농촌경제 및 일자리 기반 활성화 부문', '농촌환경·경관 보전 및 관리 부문', '농촌환경중점관리시설 정비·관리 부문']


def direction(T):
    n = T['name']
    h = [f'<h2>4 ㅣ {n} 특화지구 및 발전방향</h2>', '<h3>4-1. 부문별 발전전략</h3>']
    for i, items in enumerate(T['strategies']):
        h.append(f'<h4>{"①②③④⑤"[i]} {SECT[i]}</h4><ul>' + ''.join(f'<li>{x}</li>' for x in items) + '</ul>')
    h.append(f'<h3>4-2. {n} 농촌특화지구 후보지 및 조성방향</h3>')
    if T.get('zone_change'): h.append(f'<div class="check">{T["zone_change"]}</div>')
    for z in T['zones']:
        cls = 'zone caution' if z.get('caution') else 'zone'
        body = f'<span class="k">{z["k"]}</span><br>'
        if z.get('cand'): body += f'📍 후보지: {z["cand"]}<br>'
        if z.get('dir'): body += f'💡 조성방향: {z["dir"]}<br>'
        for mark, txt in z.get('notes', []):
            body += f'{mark} {txt}<br>'
        body = re.sub(r'<br>$', '', body)
        h.append(f'<div class="{cls}">{body}{S(z.get("src", ""))}</div>')
    if T.get('mgmt'):
        h.append(f'<h3>4-3. {n} 중점 농촌환경관리시설 후보(안)</h3>')
        h.append(f'<p style="font-size:14.5px;margin:0 0 12px">{T.get("mgmt_intro", "FGI와 기본계획(안)에서 확인된 생활환경·경관 저해 시설을 중점관리 후보로 정리함. 정비 대상 확정 전 현장조사·소유자 확인이 필요함")}</p>')
        h.append('<table><thead><tr><th style="width:22%">구분 (위치)</th><th style="width:34%">현황 및 문제</th><th>관리 방향</th></tr></thead><tbody>')
        for m in T['mgmt']:
            h.append(f'<tr><td>{m["name"]}<br>({m["loc"]})</td><td>{m["issue"]}{S(m.get("src", ""))}</td><td>{m["dir"]}</td></tr>')
        h.append('</tbody></table>')
    return '\n'.join(h)


def fgi(T):
    f = T['fgi']
    h = [f'<h2>5 ㅣ 주민 의견 (FGI) 핵심 정리</h2>',
         f'<div class="fact-box"><strong>{n_(T)} FGI 개요</strong><br>· 일시: {f["when"]}<br>· 장소: {f["where"]}<br>· 참석: {f["who"]}'
         + (f'<br>· 참고: {f["extra"]}' if f.get('extra') else '') + '</div>']
    for q, pts in f['qa']:
        h.append(f'<h4>{q}</h4><ul>' + ''.join(f'<li>{x}</li>' for x in pts) + '</ul>')
    h.append(f'<p class="note">{S(f["src"])}</p>')
    return '\n'.join(h)


def n_(T): return T['name']


def gis(T):
    g = T['gis']
    n = T['name']
    h = [f'<h2>6 ㅣ {n} 지도(GIS) 표기안</h2>', '<div class="gis">',
         '<p class="note" style="margin-top:0">' + g.get('note', '기존 「현안·발전방향」 도면(2026)의 구성(헤드라인·범례·사업 박스·번호 라벨 / 축·거점·특화지구 후보)을 유지하면서, 이번에 고친 3·4장 본문과 번호·문구를 맞춘 표기안이에요. 도면에 새로 넣거나 고칠 곳은 <span class="tag t-r">수정</span>·<span class="tag t-r">신규</span>, 그대로 두는 곳은 <span class="tag t-g">유지</span>로 표시했어요.') + '</p>',
         '<h3>6-1. 지역현안 지도</h3>', '<h4>① 좌상단 헤드라인</h4>',
         f'<div class="fact-box"><div class="head">{g["head"]}</div><p class="src">근거: {g["head_src"]}</p></div>',
         '<h4>② 사업 박스 (파란 박스, 지점에 연결)</h4>', '<table><tr><th>위치</th><th>지도 표기 문구</th><th>비고</th></tr>']
    for loc, lab, note in g['boxes']:
        h.append(f'<tr><td>{loc}</td><td class="lab">{lab}</td><td class="src">{note}</td></tr>')
    h.append('</table><h4>③ 문제점·잠재력 번호 라벨 (본문 3-1·3-2 번호와 맞춤)</h4><div class="scroll"><table><tr><th>번호</th><th>지도 표기 문구</th><th>놓을 위치</th></tr>')
    for k, lab, where in g['labels']:
        cls = 't-r' if k.startswith('문제') else 't-g'
        h.append(f'<tr><td><span class="tag {cls}">{k}</span></td><td class="lab">{lab}</td><td>{where}</td></tr>')
    h.append('</table></div><h3>6-2. 발전방향 지도</h3>')
    rec = axes_hubs.html(T['name'])
    if rec:
        h.append(rec)
    else:
        h.append('<h4>① 축</h4><table><tr><th>축</th><th>노선</th><th>지도 표기</th></tr>')
        for a, r, l in g['axes']:
            h.append(f'<tr><td class="lab">{a}</td><td>{r}</td><td>{l}</td></tr>')
        h.append('</table><h4>② 거점 원</h4><table><tr><th>거점</th><th>위치</th><th>역할</th></tr>')
        for a, r, l in g['hubs']:
            h.append(f'<tr><td class="lab">{a}</td><td>{r}</td><td>{l}</td></tr>')
        h.append('</table>')
    h.append('<h4>③ 농촌특화지구 후보 원 (4-2 번호와 맞춤)</h4><table><tr><th>지구</th><th>위치</th><th>도면 처리</th></tr>')
    for a, r, l in g['zones']:
        h.append(f'<tr><td class="lab">{a}</td><td>{r}</td><td>{l}</td></tr>')
    h.append('</table>')
    if g.get('fix'):
        h.append('<h4>④ 기존 도면에서 고칠 곳</h4><div class="check"><ul>' + ''.join(f'<li>{x}</li>' for x in g['fix']) + '</ul></div>')
    h.append('</div>')
    return '\n'.join(h)


def strip_src(t): return re.sub(r'<span class="src">.*?</span>', '', t)


def summary(T):
    n = T['name']
    h = ['<h2>종합 발전방향</h2>', f'<div class="vision"><span class="slogan">"{T["vision"]["slogan"]}"</span>' + '<br>'.join(T['vision']['text']) + '</div>']
    if T.get('checks'):
        h.append('<div class="check"><strong>확인 필요 사항</strong><br>' + '<br>'.join('· ' + x for x in T['checks']) + '</div>')
    h.append(f'<section class="qs"><h2 class="qs-title">{n} 요약 (지역현안 · 발전방향)</h2>')
    for cls, tag, key in (('p-prob', '주요 문제점', 'problems'), ('p-pot', '주요 잠재력', 'potentials')):
        h.append(f'<div class="panel {cls}"><span class="ptag">{tag}</span>')
        for i, p in enumerate(T[key]):
            lis = ''.join(f'<li>{p.get("sum", [strip_src(x) for x, _ in p["li"]][:2])[k]}</li>' for k in range(min(2, len(p.get('sum', p['li'])))))
            h.append(f'<div class="it"><h5>{"①②③④⑤⑥"[i]} {p["t"]}<span class="lk">({p["tag"]})</span></h5><ul>{lis}</ul></div>')
        h.append('</div>')
    h.append('<div class="panel p-str"><span class="ptag">부문별 발전전략</span>')
    for i, items in enumerate(T['strategies']):
        h.append(f'<div class="it"><h5>{"①②③④⑤"[i]} {SECT[i]}</h5><ul>' + ''.join(f'<li>{x}</li>' for x in items[:2]) + '</ul></div>')
    h.append('</div><div class="panel p-zone"><span class="ptag">농촌특화지구 후보군(안)</span>')
    for z in T['zones']:
        if z.get('caution'): continue
        h.append(f'<div class="it"><h5>{z["k"]}</h5><ul><li>후보지: {z.get("cand", "")}</li></ul></div>')
    h.append('</div></section>')
    return '\n'.join(h)


GLOSS = [
    ('농촌특화지구', '농촌공간을 기능별로 나눠 관리하는 법정 구역(농촌마을보호·농촌산업·축산·농촌융복합산업·재생에너지·농촌경관·농업유산·특성화농업지구 8개 유형)', '「농촌공간 재구조화 및 재생지원에 관한 법률」, 시행령 2025.11.4 개정'),
    ('농촌마을보호지구', '주거지 주변에 공장·축사 등 위해시설이 들어오지 못하게 막아 정주환경을 보호하는 지구. 주택 30호 이상 + 대지면적비율 30% 이상 또는 1만㎡당 10호 이상', '농촌특화지구 활성화 방안(2026.7)'),
    ('농촌융복합산업지구', '농산물 생산·가공·유통·체험을 한곳에 모아 6차산업 거점으로 키우는 지구. 관리·농림지역, 원칙적으로 30,000㎡ 이상', '농촌특화지구 활성화 방안(2026.7)'),
    ('특성화농업지구', '특정 품목·재배방식을 집중 육성하는 지구(2025.11 신설). 친환경 20ha(쌀 50ha), 수출 과수 10ha 등 품목별 최소면적이 있음', '농촌특화지구 활성화 방안(2026.7)'),
    ('농촌경관지구', '자연·생활·농업경관을 보전·활용하는 지구. 법 개정으로 대상이 자연·생활경관까지 넓어짐(구 경관농업지구)', '농촌특화지구 활성화 방안(2026.7)'),
    ('재생에너지지구', '태양광 등 재생에너지 시설을 정해진 곳에 모아 난개발을 막는 지구. 마을소득형 300~1,000kW 등 유형이 있고 전력계통 여유 확인이 먼저', '농촌특화지구 활성화 방안(2026.7)'),
    ('중점 농촌환경관리시설', '축사·방치건물·폐교 등 생활환경과 경관을 해치는 시설 중 우선 정비할 대상', '기본계획(안) 제4장 부문계획 ⑤'),
    ('소멸위험지수', '20~39세 여성 인구 ÷ 65세 이상 인구. 0.5 미만이면 소멸위험, 0.2 미만이면 소멸고위험', '한국고용정보원 산식, 기본계획(안) 2장'),
    ('중심성지수', '읍·면에 있는 생활서비스 기능의 종류와 수를 점수화한 값. 높을수록 중심지 기능이 강함', '기본계획(안) 2장'),
    ('FGI', '주민·이장·면장 등이 함께하는 집단 심층 인터뷰(Focus Group Interview)', ''),
]


def glossary():
    h = ['<section class="gl"><h2 class="gl-title">용어 설명</h2><div class="grp"><dl>']
    for t, d, s in GLOSS:
        h.append(f'<div class="row"><dt>{t}</dt><dd>{d}' + (f'<span class="ex">{s}</span>' if s else '') + '</dd></div>')
    h.append('</dl></div></section>')
    return '\n'.join(h)


def render(T):
    fb = '<div class="fact-box"><strong>' + T['name'] + ' 한눈에 보기</strong><br>' + '<br>'.join('· ' + x for x in T['facts']) + S(T['facts_src']) + '</div>'
    parts = [fb, projects(T), resources(T), issues(T), direction(T), fgi(T), gis(T), summary(T), glossary()]
    return '\n'.join(parts)


if __name__ == '__main__':
    spec = importlib.util.spec_from_file_location('t', sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    T = m.T
    body = render(T)
    os.makedirs(sys.argv[2], exist_ok=True)
    open(os.path.join(sys.argv[2], T['id'] + '.body.html'), 'w', encoding='utf-8').write(
        f'<div class="page-title">정선군 {T["name"]} 농촌공간 재구조화 및 재생 기본계획 (안)</div>\n' + body)
    print(T['id'], len(body))
