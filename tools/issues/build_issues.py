"""현안 문서 전체 재생성: SHP 절 + 말풍선 + PDF 도면 + 회의록 → content_*.js, 화암은 기존 content에 덧붙임"""
import re, json, sys, subprocess
sys.path.insert(0, '/tmp/claude-0/iss')
import shp_section, extras
NAMES = shp_section.NAMES
parts = {}
for tid in NAMES:
    if tid == 'hwaam': continue
    s = shp_section.section(tid, '7')
    s = s.replace('<h3>7. 농촌특화지구 지정 기준 검토 및 후보군 (SHP 분석)</h3>', f'<h2>7 ㅣ {NAMES[tid]} 농촌특화지구 지정 기준 검토 (SHP 분석)</h2>', 1)
    parts[tid] = s
extras.run(parts)
subprocess.run(['python3', '/tmp/claude-0/iss/to_site.py'], check=True)

# 화암: 원본 백업에서 다시 만들기 (여러 번 돌려도 같은 결과)
import os, shutil
P = '/tmp/claude-0/hub/site/src/issues/content_hwaam.js'; B = '/tmp/claude-0/iss/content_hwaam.base.js'
if not os.path.exists(B): shutil.copy(P, B)
s = open(B, encoding='utf-8').read()
m = re.search(r'export const MAIN_HTML = (".*?");\n', s, re.S); h = json.loads(m.group(1))
t = re.search(r'export const TOC = (\[.*?\]);', s, re.S); toc = json.loads(t.group(1))
sec = shp_section.section('hwaam', '4-5').replace('<h3>4-5.', '<h3 id="hw-45">4-5.', 1)
i = h.find('<h2', h.find('4-4. 농촌특화지구 후보지 공간자료 대조'))
h = h[:i] + sec + '\n' + h[i:]
import axes_hubs  # 6-2 축·거점: PPT 범례 기준 추천표로 교체
a = h.find('<h4>① 축 (고한 지도 범례와 같은 선 종류)</h4>'); z = h.find('<h4>③ 농촌특화지구 후보 원', a)
if a >= 0 and z > a: h = h[:a] + axes_hubs.html('화암면') + '\n' + h[z:]
from why_boxes import add_why
h = add_why(h, 'hwaam')
# 화암 PPT 도면 이미지 (다른 읍·면의 PDF 도면과 같은 자리: 3장·4장 첫머리)
for k, n, what in (('3', 1, '지역현안'), ('4', 2, '발전방향')):
    shutil.copy(f'/tmp/claude-0/iss/pptimg/hwaam-ppt0{n}.jpg', f'{extras.IMG}/hwaam-ppt0{n}.jpg')
    h, ok = extras.insert_after_h2(h, k, extras.fig(f'img/iss/hwaam-ppt0{n}.jpg', f'화암면 {what} 도면 (화암면 현안 및 발전방향 PPT {n}쪽)'))
    assert ok, k
fg = extras.fgi_section('hwaam').replace('<h2>회의록', '<h2 id="hw-fgi">회의록', 1)
h = h.rstrip() + '\n' + fg + '\n'
k = next(n for n, x in enumerate(toc) if x['label'].startswith('4-4'))
toc.insert(k + 1, {'id': 'hw-45', 'label': '4-5. 농촌특화지구 지정 기준 검토 및 후보군 (SHP 분석)', 'level': 2})
toc.append({'id': 'hw-fgi', 'label': '회의록 ㅣ 화암면 FGI 인터뷰 결과 (2026.10.14.)', 'level': 1})
s = s[:m.start(1)] + json.dumps(h, ensure_ascii=False) + s[m.end(1):]
t = re.search(r'export const TOC = (\[.*?\]);', s, re.S)
s = s[:t.start(1)] + json.dumps(toc, ensure_ascii=False, indent=1) + s[t.end(1):]
open(P, 'w', encoding='utf-8').write(s); print('hwaam ok', len(h))
