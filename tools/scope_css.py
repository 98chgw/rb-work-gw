"""CSS 범위 지정기: 모든 선택자 앞에 범위 클래스를 붙인다.
사용: python3 scope_css.py in.css out.css .v-plan [body대체선택자]
 - :root / html 로 시작하는 선택자는 그 복합 선택자 뒤에 범위를 끼운다 (:root[data-theme=dark] .v-plan .x)
 - body 는 범위 자체(또는 지정한 대체 선택자)로 바꾼다
 - @media/@supports 안은 재귀, @keyframes/@font-face/@import/@page 는 그대로 둔다"""
import re, sys


def split_top(s, ch=','):
    out, depth, buf, q = [], 0, '', None
    for c in s:
        if q:
            buf += c
            if c == q: q = None
            continue
        if c in '"\'': q = c
        elif c in '([': depth += 1
        elif c in ')]': depth -= 1
        if c == ch and depth == 0:
            out.append(buf); buf = ''
        else:
            buf += c
    out.append(buf)
    return out


def first_compound(sel):
    depth = 0
    for i, c in enumerate(sel):
        if c in '([': depth += 1
        elif c in ')]': depth -= 1
        elif depth == 0 and c in ' >+~':
            return sel[:i], sel[i:]
    return sel, ''


def scope_sel(sel, S, body):
    sel = sel.strip()
    if not sel: return sel
    head, rest = first_compound(sel)
    m = re.match(r'^(:root|html)(.*)$', head)
    if m:
        root_part = head
        rest = rest.strip()
        # :root 바로 뒤가 body면 body 대체
        if rest.startswith('body'):
            h2, r2 = first_compound(rest)
            return f'{root_part} {body}{h2[4:]}{r2}'.strip()
        return f'{root_part} {S} {rest}'.strip() if rest else f'{root_part} {S}'
    if re.match(r'^body\b', head):
        return f'{body}{head[4:]}{rest}'
    return f'{S} {sel}'


def scope(css, S, body):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out, i, n = [], 0, len(css)
    while i < n:
        # 다음 { 또는 ; 찾기
        j = i
        depth = 0
        while j < n and css[j] not in '{;}':
            j += 1
        if j >= n:
            out.append(css[i:]); break
        if css[j] == '}':
            out.append(css[i:j + 1]); i = j + 1; continue
        prelude = css[i:j]
        if css[j] == ';':  # @import 등
            out.append(prelude + ';'); i = j + 1; continue
        # 블록 끝 찾기
        k, depth = j, 0
        while k < n:
            if css[k] == '{': depth += 1
            elif css[k] == '}':
                depth -= 1
                if depth == 0: break
            k += 1
        body_ = css[j + 1:k]
        p = prelude.strip()
        if p.startswith('@media') or p.startswith('@supports') or p.startswith('@container') or p.startswith('@layer'):
            out.append(p + '{' + scope(body_, S, body) + '}')
        elif p.startswith('@'):
            out.append(p + '{' + body_ + '}')
        else:
            sels = [scope_sel(s, S, body) for s in split_top(p)]
            out.append(','.join(sels) + '{' + body_ + '}')
        i = k + 1
    return '\n'.join(x.strip() for x in out if x.strip())


if __name__ == '__main__':
    src, dst, S = sys.argv[1:4]
    body = sys.argv[4] if len(sys.argv) > 4 else S
    css = open(src, encoding='utf-8').read()
    open(dst, 'w', encoding='utf-8').write('/* 자동 생성 — 원본: %s, 범위: %s */\n' % (src.split('/')[-1], S) + scope(css, S, body) + '\n')
