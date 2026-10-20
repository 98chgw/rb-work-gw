"""화암면 지역현안 및 발전방향 HTML → content_hwaam.js + hwaam.raw.css
사용: python3 gen_hwaam.py in.html out.js out.css"""
import re, json, sys, html as H

src, out_js, out_css = sys.argv[1:4]
s = open(src, encoding='utf-8').read()

styles = re.findall(r'<style[^>]*>(.*?)</style>', s, re.S)
css = '\n'.join(styles)
css = re.sub(r'@import[^;]+;', '', css)  # 글꼴은 index.html에서 불러옴

body = re.search(r'<body[^>]*>(.*)</body>', s, re.S).group(1)
body = re.sub(r'<style[^>]*>.*?</style>', '', body, flags=re.S)
m = re.search(r'<script>(.*?)</script>', body, re.S)
pts = []
if m:
    pm = re.search(r'const PTS=(\[.*?\]);', m.group(1), re.S)
    if pm: pts = json.loads(pm.group(1))
body = re.sub(r'<script.*?</script>', '', body, flags=re.S)

# 표지 : page-title
cm = re.search(r'<div class="page-title">(.*?)</div>', body, re.S)
cover_title = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', cm.group(1))).strip() if cm else ''
if cm: body = body.replace(cm.group(0), '', 1)

# 목차 : h2 / h3 에 id 부여
toc = []
cnt = {'n': 0}
def addid(mt):
    tag, attrs, inner = mt.group(1), mt.group(2), mt.group(3)
    cnt['n'] += 1
    hid = f'hw-{cnt["n"]}'
    attrs = re.sub(r'\sid="[^"]*"', '', attrs)
    label = re.sub(r'\s+', ' ', H.unescape(re.sub('<[^>]+>', '', inner))).strip()
    toc.append({'id': hid, 'label': label, 'level': 1 if tag == 'h2' else 2})
    return f'<{tag} id="{hid}"{attrs}>{inner}</{tag}>'
body = re.sub(r'<(h2|h3)([^>]*)>(.*?)</\1>', addid, body, flags=re.S)

cover = (
    '<p class="kicker">정선군 농촌공간 재구조화 및 재생 기본계획(안) · 읍·면 지역현안 및 발전방향</p>'
    f'<h1>화암면<br>지역현안 및 발전방향</h1>'
    f'<p class="sub">{H.escape(cover_title)}</p>'
)

js = '// 자동 생성 파일 — 원본: 화암면_지역현안_및_발전방향.html\n'
js += 'export const COVER_HTML = ' + json.dumps(cover, ensure_ascii=False) + ';\n'
js += 'export const MAIN_HTML = ' + json.dumps(body.strip(), ensure_ascii=False) + ';\n'
js += 'export const FOOTER_HTML = "";\n'
js += 'export const TOC = ' + json.dumps(toc, ensure_ascii=False, indent=1) + ';\n'
js += 'export const PTS = ' + json.dumps(pts, ensure_ascii=False) + ';\n'
open(out_js, 'w', encoding='utf-8').write(js)
open(out_css, 'w', encoding='utf-8').write(css)
print(len(body), len(toc), len(pts), cover_title)
