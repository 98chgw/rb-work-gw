import re,json,sys
src,out,name=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(src,encoding='utf-8').read()
def inner(tag,attr=''):
    m=re.search(r'<%s%s[^>]*>(.*?)</%s>'%(tag,attr,tag),s,re.S); return m.group(1).strip()
cover=inner('header',r' class="cover"')
main=inner('main')
footer=inner('footer')
nav=inner('nav')
toc=[]
for m in re.finditer(r'<a(?: class="(lv\d)")? href="#([^"]+)">(.*?)</a>',nav):
    toc.append({"id":m.group(2),"label":re.sub('<[^>]+>','',m.group(3)),"level":int(m.group(1)[2]) if m.group(1) else 1})
js='// 자동 생성 파일 — 원본 문서(%s)에서 추출.\n'%name
js+='export const COVER_HTML = '+json.dumps(cover,ensure_ascii=False)+';\n'
js+='export const MAIN_HTML = '+json.dumps(main,ensure_ascii=False)+';\n'
js+='export const FOOTER_HTML = '+json.dumps(footer,ensure_ascii=False)+';\n'
js+='export const TOC = '+json.dumps(toc,ensure_ascii=False,indent=1)+';\n'
open(out,'w',encoding='utf-8').write(js)
