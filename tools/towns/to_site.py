"""out/*.body.html → 사이트 src/issues/content_<id>.js + index.js(등록부)"""
import re, json, glob, os, html as H
SRC='/tmp/claude-0/hub/site/src/issues'
NAMES={'jeongseon-eup':'정선읍','gohan':'고한읍','sabuk':'사북읍','sindong':'신동읍','bukpyeong':'북평면','nam':'남면','yeoryang':'여량면','imgye':'임계면','hwaam':'화암면'}
def conv(tid, body):
    m=re.search(r'<div class="page-title">(.*?)</div>',body,re.S)
    title=re.sub(r'\s+',' ',m.group(1)).strip() if m else ''
    if m: body=body.replace(m.group(0),'',1)
    toc=[]; n=[0]
    def addid(mt):
        tag,attrs,inner=mt.group(1),mt.group(2),mt.group(3)
        n[0]+=1; hid=f'{tid}-{n[0]}'
        attrs=re.sub(r'\sid="[^"]*"','',attrs)
        lab=re.sub(r'\s+',' ',H.unescape(re.sub('<[^>]+>','',inner))).strip()
        toc.append({'id':hid,'label':lab,'level':1 if tag=='h2' else 2})
        return f'<{tag} id="{hid}"{attrs}>{inner}</{tag}>'
    body=re.sub(r'<(h2|h3)([^>]*)>(.*?)</\1>',addid,body,flags=re.S)
    nm=NAMES[tid]
    cover=(f'<p class="kicker">정선군 농촌공간 재구조화 및 재생 기본계획(안) · 읍·면 지역현안 및 발전방향</p>'
           f'<h1>{nm}<br>지역현안 및 발전방향</h1><p class="sub">{H.escape(title)}</p>')
    js=f'// 자동 생성 — {nm} 지역현안 및 발전방향\n'
    js+='export const COVER_HTML = '+json.dumps(cover,ensure_ascii=False)+';\n'
    js+='export const MAIN_HTML = '+json.dumps(body.strip(),ensure_ascii=False)+';\n'
    js+='export const FOOTER_HTML = "";\nexport const TOC = '+json.dumps(toc,ensure_ascii=False,indent=1)+';\nexport const PTS = [];\n'
    open(f'{SRC}/content_{tid}.js','w',encoding='utf-8').write(js)
for f in sorted(glob.glob('/tmp/claude-0/iss/out/*.body.html')):
    tid=os.path.basename(f).split('.')[0]
    conv(tid, open(f,encoding='utf-8').read()); print('ok',tid)
ids=[os.path.basename(f)[8:-3] for f in glob.glob(f'{SRC}/content_*.js')]
lines=['// 자동 생성 — 읍·면 현안 문서 등록부']
for i in sorted(ids): lines.append(f"import * as T_{i.replace('-','_')} from './content_{i}.js'")
lines.append('export const TOWN_DOCS = {'+', '.join(f"'{i}': T_{i.replace('-','_')}" for i in sorted(ids))+'}')
open(f'{SRC}/index.js','w',encoding='utf-8').write('\n'.join(lines)+'\n'); print(sorted(ids))
