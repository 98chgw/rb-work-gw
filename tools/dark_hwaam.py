"""화암면 문서(밝은 색 고정) → 다크모드 덮어쓰기 규칙 자동 생성
밝은 배경 → 어두운 면, 어두운 글자 → 밝은 글자, 밝은 테두리 → 어두운 선"""
import re, sys
src, dst = sys.argv[1:3]
css = open(src, encoding='utf-8').read()

def hex2rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def lum(rgb):
    r, g, b = [c / 255 for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

rules = []
def walk(text):
    for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}', text):
        sel, body = m.group(1).strip(), m.group(2)
        if not sel.startswith('.v-hw'): continue
        out = []
        for prop, val in re.findall(r'([\w-]+)\s*:\s*([^;]+)', body):
            hexes = re.findall(r'#[0-9a-fA-F]{3,6}\b', val)
            if not hexes: continue
            L = lum(hex2rgb(hexes[0]))
            p = prop.lower()
            if p in ('background', 'background-color') and L > 0.8:
                out.append(f'{p}:#211C22')
            elif p in ('background', 'background-color') and L <= 0.8 and L > 0.55:
                out.append(f'{p}:#2E2830')
            elif p == 'color' and L < 0.45:
                out.append('color:#E9E3E8')
            elif p == 'color' and L < 0.6:
                out.append('color:#BDB5BB')
            elif p.startswith('border') and L > 0.7:
                out.append(f'{p}:' + re.sub(r'#[0-9a-fA-F]{3,6}\b', '#3A333A', val))
        if out:
            rules.append(f'{sel}{{{";".join(out)}}}')
walk(re.sub(r'@media[^{]+\{', '', css))

def wrap(prefix):
    return '\n'.join(prefix + ' ' + r if not r.startswith(':root') else r for r in rules)
dark1 = '\n'.join(':root[data-theme="dark"] ' + r for r in rules)
dark2 = '@media (prefers-color-scheme:dark){\n' + '\n'.join(':root:not([data-theme="light"]) ' + r for r in rules) + '\n}'
open(dst, 'w', encoding='utf-8').write('/* 자동 생성 — 화암면 문서 다크모드 */\n' + dark1 + '\n' + dark2 + '\n')
print(len(rules))
