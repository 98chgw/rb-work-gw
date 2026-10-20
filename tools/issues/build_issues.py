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
fg = extras.fgi_section('hwaam').replace('<h2>회의록', '<h2 id="hw-fgi">회의록', 1)
h = h.rstrip() + '\n' + fg + '\n'
k = next(n for n, x in enumerate(toc) if x['label'].startswith('4-4'))
toc.insert(k + 1, {'id': 'hw-45', 'label': '4-5. 농촌특화지구 지정 기준 검토 및 후보군 (SHP 분석)', 'level': 2})
toc.append({'id': 'hw-fgi', 'label': '회의록 ㅣ 화암면 FGI 인터뷰 결과 (2026.10.14.)', 'level': 1})
s = s[:m.start(1)] + json.dumps(h, ensure_ascii=False) + s[m.end(1):]
t = re.search(r'export const TOC = (\[.*?\]);', s, re.S)
s = s[:t.start(1)] + json.dumps(toc, ensure_ascii=False, indent=1) + s[t.end(1):]
open(P, 'w', encoding='utf-8').write(s); print('hwaam ok', len(h))
