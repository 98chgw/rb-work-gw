"""FGI 인터뷰 결과 HWP → 사이트용 회의록 HTML
- 표 구조(행·열·병합)를 레코드 레벨로 복원
- 문서 머리 표(일시·참석자)는 정보 상자로, 문항 표(번호·질문 / 답변)는 질문·답변 블록으로
사용: from fgi2html import fgi_html"""
import struct, zlib, html as H, sys
sys.path.insert(0, '/tmp/claude-0/iss')
from hwp2txt import CFB, para_text

E = lambda s: H.escape(s, quote=False)


def records(raw):
    i = 0
    while i + 4 <= len(raw):
        h = struct.unpack_from('<I', raw, i)[0]; i += 4
        tag, lev, size = h & 0x3FF, (h >> 10) & 0x3FF, h >> 20
        if size == 0xFFF: size = struct.unpack_from('<I', raw, i)[0]; i += 4
        yield tag, lev, raw[i:i + size]; i += size


def parse(path):
    cf = CFB(open(path, 'rb').read())
    comp = struct.unpack_from('<I', cf.read('FileHeader'), 36)[0] & 1
    secs = sorted([p for p in cf.paths if p.startswith('BodyText/Section')], key=lambda x: int(x.split('Section')[1]))
    blocks = []
    for sp in secs:
        raw = cf.read(sp)
        if comp: raw = zlib.decompress(raw, -15)
        stack = []  # [(table, level)]
        for tag, lev, b in records(raw):
            while stack and lev <= stack[-1][1]:
                stack.pop()
            top = stack[-1][0] if stack else None
            if tag == 71 and len(b) >= 4:
                cid = b[:4][::-1].decode('latin1', 'ignore')
                if cid == 'tbl ':
                    t = {'cells': [], 'rows': 0, 'cols': 0}
                    if top is not None and top['cells']: top['cells'][-1]['tables'].append(t)
                    else: blocks.append(('tbl', t))
                    stack.append((t, lev))
                elif cid == 'gso ' and top is not None and top['cells']:
                    top['cells'][-1]['pic'] = True
            elif tag == 77 and top is not None and len(b) >= 8:
                top['rows'], top['cols'] = struct.unpack_from('<HH', b, 4)
            elif tag == 72 and top is not None and lev == stack[-1][1] + 1 and len(b) >= 16:
                col, row, cs, rs = struct.unpack_from('<HHHH', b, 8)
                top['cells'].append({'row': row, 'col': col, 'cs': cs, 'rs': rs, 'paras': [], 'tables': [], 'pic': False})
            elif tag == 67:
                t = para_text(b).strip()
                if not t: continue
                if top is not None and top['cells']: top['cells'][-1]['paras'].append(t)
                elif top is None: blocks.append(('p', t))
    return blocks


def cell_html(c):
    return ''.join(f'<p>{E(p)}</p>' for p in c['paras']) + ''.join(table_html(t) for t in c['tables'])


def table_html(t):
    rows = {}
    for c in t['cells']: rows.setdefault(c['row'], []).append(c)
    h = ['<div class="tw"><table class="fgi-t"><tbody>']
    for r in sorted(rows):
        h.append('<tr>' + ''.join(
            '<td' + (f' colspan="{c["cs"]}"' if c['cs'] > 1 else '') + (f' rowspan="{c["rs"]}"' if c['rs'] > 1 else '') + '>' + cell_html(c) + '</td>'
            for c in sorted(rows[r], key=lambda c: c['col'])) + '</tr>')
    h.append('</tbody></table></div>')
    return ''.join(h)


def fgi_html(path, photo_src=None, title_hint=''):
    blocks = parse(path)
    out = []
    cur = None

    def close(q):
        hd = f'<h5><span class="fgi-no">{E(q["no"])}</span>{E(q["q"])}</h5>' if q['q'] else ''
        return f'<div class="fgi-q">{hd}<div class="fgi-a">' + ''.join(q['body']) + '</div></div>'

    for kind, v in blocks:
        if kind == 'p':
            if cur: cur['body'].append(f'<p>{E(v)}</p>')
            else: out.append(f'<p>{E(v)}</p>')
            continue
        t = v
        cells = t['cells']
        texts = [' '.join(c['paras']) for c in cells]
        # 제목 표(1×1)
        if t['rows'] == 1 and t['cols'] == 1:
            continue
        # 일시·참석자 머리 표
        if any(x.strip().startswith('일시') for x in texts[:2]) and any(x.strip().startswith('참석자') for x in texts):
            rows = {}
            for c in cells:
                if c['pic'] and not c['paras']: continue
                rows.setdefault(c['row'], []).append(c)
            dl = []
            for r in sorted(rows):
                cs = sorted(rows[r], key=lambda c: c['col'])
                if len(cs) >= 2:
                    dl.append(f'<tr><th>{E(" ".join(cs[0]["paras"]))}</th><td>' + '<br>'.join(E(p) for p in sum((c['paras'] for c in cs[1:]), [])) + '</td></tr>')
            box = '<div class="fgi-meta"><table class="fgi-mt"><tbody>' + ''.join(dl) + '</tbody></table>'
            if photo_src: box += f'<figure class="fgi-ph"><img src="{photo_src}" alt="FGI 인터뷰 현장" loading="lazy"><figcaption>인터뷰 현장</figcaption></figure>'
            if cur: out.append(close(cur)); cur = None
            out.append(box + '</div>'); continue
        # 문항 표: [번호|질문] 행 → 질문 / 짧은 단독 칸 → 소제목 / 나머지 → 답변 문단. 다음 쪽으로 이어진 표는 앞 질문에 붙임
        rows = {}
        for c in cells: rows.setdefault(c['row'], []).append(c)
        for r in sorted(rows):
            cs = [c for c in sorted(rows[r], key=lambda c: c['col']) if c['paras'] or c['tables']]
            if not cs: continue
            first = ' '.join(cs[0]['paras']).strip()
            if len(cs) >= 2 and first.isdigit() and len(first) <= 2:
                if cur: out.append(close(cur))
                cur = {'no': first, 'q': ' '.join(cs[1]['paras']).strip(), 'body': []}
                for c in cs[2:]: cur['body'].append(cell_html(c))
                continue
            if cur is None: cur = {'no': '', 'q': '', 'body': []}
            for c in cs:
                txt = ' '.join(c['paras']).strip()
                if len(cs) == 1 and len(c['paras']) == 1 and len(txt) <= 20 and not c['tables']:
                    cur['body'].append(f'<h6>{E(txt)}</h6>')
                else:
                    cur['body'].append(cell_html(c))
    if cur: out.append(close(cur))
    return '\n'.join(out)


if __name__ == '__main__':
    print(fgi_html(sys.argv[1])[:3000])
