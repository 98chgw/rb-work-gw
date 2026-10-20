"""out/*.body.html → out_final/*.body.html
 1) 6-2 발전방향 지도에 부문별 전략 말풍선 표 추가 (callouts.py)
 2) 3장·4장 첫머리에 「현안 및 발전방향」 PDF 도면 이미지 삽입 (7개 읍·면)
 3) 특화지구 SHP 검토 절 삽입 (shp_section.py 가 만든 조각, 있으면)
 4) 문서 끝에 FGI 회의록 절 추가 (fgi2html.py)
이미지는 사이트 public/img/iss/ 에 파일로 두고 상대경로로 참조"""
import os, re, sys, glob, shutil, html as H
sys.path.insert(0, '/tmp/claude-0/iss')
from callouts import callout_html
from fgi2html import fgi_html

SITE = '/tmp/claude-0/hub/site'
IMG = f'{SITE}/public/img/iss'
os.makedirs(IMG, exist_ok=True); os.makedirs('/tmp/claude-0/iss/out_final', exist_ok=True)
U = '/root/.claude/uploads/1b5324e2-e9c8-5caf-9d2a-2e66dea71522/'
FGI = {'hwaam': ('5087ab6a-__________.hwp', '2026.10.14.'), 'gohan': ('665a327d-___________1.hwp', '2026.2.19.'), 'sindong': ('96c3022e-______________1.hwp', '2026.7.21.'),
       'imgye': ('b2eec7c9-___________0907_3.hwp', '2026.9.8.'), 'nam': ('e141c02a-__________2.hwp', '2026.10.12.'), 'jeongseon-eup': ('e7485e1b-___________2.hwp', '2026.4.3.'),
       'yeoryang': ('f37a5b95-___________1.hwp', '2026.7.24.'), 'bukpyeong': ('f8a6c7c8-_______________1.hwp', '2026.8.10.'), 'sabuk': ('ff95cc3b-______________1.hwp', '2026.7.21.')}
NAMES = {'jeongseon-eup': '정선읍', 'gohan': '고한읍', 'sabuk': '사북읍', 'sindong': '신동읍', 'bukpyeong': '북평면', 'nam': '남면', 'yeoryang': '여량면', 'imgye': '임계면', 'hwaam': '화암면'}
# PDF 쪽 번호 (정선군_현안_및_발전방향_7개지역(남면화암면제외).pdf)
PDF = {'gohan': (1, 2), 'bukpyeong': (3, 4), 'sabuk': (5, 6), 'sindong': (7, 8), 'yeoryang': (9, 10), 'imgye': (11, 12), 'jeongseon-eup': (13, 14)}
TRANS = {}  # AI 녹취 전사(북평·임계)는 주민 실명이 들어 있어 공개 사이트에는 넣지 않음


def fig(src, cap):
    return (f'<div class="fig iss-fig"><a href="{src}" target="_blank" rel="noopener"><img src="{src}" alt="{H.escape(cap)}" loading="lazy" '
            f'style="width:100%;height:auto;display:block;border-radius:10px;border:1px solid rgba(0,0,0,.08)"></a>'
            f'<p class="src" style="margin-top:6px">{cap} · 그림을 누르면 원본 크기로 열려요</p></div>')


def pdf_figs(tid):
    if tid not in PDF: return {}
    out = {}
    for k, pg in zip(('3', '4'), PDF[tid]):
        name = f'{tid}-pdf{pg:02d}.jpg'
        shutil.copy(f'/tmp/claude-0/iss/pdfimg/pg-{pg:02d}.jpg', f'{IMG}/{name}')
        what = '지역현안' if k == '3' else '발전방향'
        out[k] = fig(f'img/iss/{name}', f'작성 도면 — {NAMES[tid]} {what} (「정선군 현안 및 발전방향 7개 지역」 PDF {pg}쪽)')
    return out


def insert_after_h2(body, num, frag):
    """'<h2>N ㅣ' 제목 바로 뒤에 삽입"""
    m = re.search(r'(<h2[^>]*>\s*' + num + r'\s*ㅣ[^<]*</h2>)', body)
    if not m: return body, False
    return body[:m.end()] + '\n' + frag + body[m.end():], True


def transcript_html(path):
    t = open(path, encoding='utf-8').read().strip().split('\n')
    title = t[0].strip(); rows = []; cur = None
    for line in t[1:]:
        m = re.match(r'^(참석자 \d+) / (\d\d:\d\d(?::\d\d)?)\s*$', line.strip())
        if m:
            cur = [m.group(1), m.group(2), []]; rows.append(cur)
        elif line.strip() and cur is not None:
            cur[2].append(line.strip())
    h = ['<div class="tr-list">']
    for who, ts, lines in rows:
        h.append(f'<p class="tr-row"><span class="tr-who">{who}</span><span class="tr-ts">{ts}</span>{H.escape(" ".join(lines))}</p>')
    h.append('</div>')
    return '\n'.join(h), len(rows)


def fgi_section(tid):
    f, date = FGI[tid]
    name = f'{tid}-fgi.jpg'
    src = None
    if os.path.exists(f'/tmp/claude-0/iss/fgiimg/{tid}.jpg'):
        shutil.copy(f'/tmp/claude-0/iss/fgiimg/{tid}.jpg', f'{IMG}/{name}'); src = f'img/iss/{name}'
    body = fgi_html(U + f, photo_src=src)
    h = [f'<h2>회의록 ㅣ {NAMES[tid]} FGI 인터뷰 결과 ({date})</h2>',
         '<p class="note">보내 준 「FGI 인터뷰 결과」 한글 파일을 문항·답변 그대로 옮긴 원문이에요. 위 본문(3~5장)의 FGI 인용은 이 회의록을 근거로 해요.</p>',
         f'<div class="fgi-doc">{body}</div>']
    if tid in TRANS:
        tr, n = transcript_html(TRANS[tid])
        h.append(f'<details class="tr"><summary>녹취 전사 원문 펼치기 (AI 전사 {n}개 발화 · 인명 외 손보지 않음)</summary>'
                 '<p class="note">회의 녹음을 AI로 받아 적은 그대로라 잘못 알아들은 단어가 있을 수 있어요. 수치·고유명사는 위 회의록을 우선해요.</p>' + tr + '</details>')
    return '\n'.join(h)


def run(shp_parts=None):
    shp_parts = shp_parts or {}
    for f in sorted(glob.glob('/tmp/claude-0/iss/out/*.body.html')):
        tid = os.path.basename(f).split('.')[0]
        b = open(f, encoding='utf-8').read()
        # 1) 말풍선: 6-2 안, '④ 기존 도면에서 고칠 곳' 앞 또는 6-2 다음 h2 앞
        co = callout_html(tid)
        if co:
            i = b.find('6-2.')
            j = b.find('<h4>④ 기존 도면', i)
            if j < 0: j = b.find('<h2', i)
            b = b[:j] + co + '\n' + b[j:]
        # 2) PDF 도면
        pf = pdf_figs(tid)
        for k, frag in pf.items():
            b, ok = insert_after_h2(b, k, frag)
            assert ok, (tid, k)
        # 3) SHP 특화지구 절: '종합 발전방향' h2 앞
        if tid in shp_parts:
            j = b.find('<h2>종합 발전방향')
            if j < 0: j = b.find('<h2 class="qs-title"')
            b = b[:j] + shp_parts[tid] + '\n' + b[j:]
        # 4) 회의록: 문서 맨 끝(용어 설명 뒤)
        b = b.rstrip() + '\n' + fgi_section(tid) + '\n'
        open(f'/tmp/claude-0/iss/out_final/{tid}.body.html', 'w', encoding='utf-8').write(b)
        print('ok', tid, len(b))


if __name__ == '__main__':
    run()
