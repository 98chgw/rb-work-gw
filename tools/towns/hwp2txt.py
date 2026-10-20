"""HWP 5.x → 텍스트 (표는 셀 구분 표시). 외부 라이브러리 없이 OLE(CFB) 직접 읽기.
사용: python3 hwp2txt.py in.hwp out.txt"""
import struct, sys, zlib


class CFB:
    def __init__(self, data):
        self.d = data
        h = data[:512]
        assert h[:8] == bytes.fromhex('D0CF11E0A1B11AE1'), 'not OLE'
        self.ss = 1 << struct.unpack_from('<H', h, 30)[0]
        self.mss = 1 << struct.unpack_from('<H', h, 32)[0]
        nfat = struct.unpack_from('<I', h, 44)[0]
        dir_start = struct.unpack_from('<I', h, 48)[0]
        self.cutoff = struct.unpack_from('<I', h, 56)[0]
        minifat_start, nminifat = struct.unpack_from('<II', h, 60)
        dif_start, ndif = struct.unpack_from('<II', h, 68)
        difat = list(struct.unpack_from('<109I', h, 76))
        s = dif_start
        for _ in range(ndif):
            sec = self.sec(s)
            vals = struct.unpack_from('<%dI' % (self.ss // 4), sec)
            difat += vals[:-1]; s = vals[-1]
        difat = [x for x in difat[:nfat] if x < 0xFFFFFFFA]
        fat = []
        for x in difat:
            fat += struct.unpack_from('<%dI' % (self.ss // 4), self.sec(x))
        self.fat = fat
        dirdata = self.chain(dir_start)
        self.entries = []
        for i in range(len(dirdata) // 128):
            e = dirdata[i * 128:(i + 1) * 128]
            nl = struct.unpack_from('<H', e, 64)[0]
            name = e[:max(nl - 2, 0)].decode('utf-16le', 'ignore')
            typ = e[66]
            left, right, child = struct.unpack_from('<iii', e, 68)
            start, size = struct.unpack_from('<II', e, 116)
            self.entries.append(dict(name=name, type=typ, left=left, right=right, child=child, start=start, size=size))
        root = self.entries[0]
        self.ministream = self.chain(root['start'])[:root['size']] if root['start'] < 0xFFFFFFFA else b''
        mf = self.chain(minifat_start) if nminifat else b''
        self.minifat = list(struct.unpack_from('<%dI' % (len(mf) // 4), mf)) if mf else []
        self.paths = {}
        self._walk(root['child'], '')

    def sec(self, n):
        o = 512 + n * self.ss
        return self.d[o:o + self.ss]

    def chain(self, s):
        out = []; seen = 0
        while s < 0xFFFFFFFA and seen < len(self.fat) + 1:
            out.append(self.sec(s)); s = self.fat[s]; seen += 1
        return b''.join(out)

    def minichain(self, s, size):
        out = []
        while s < 0xFFFFFFFA:
            out.append(self.ministream[s * self.mss:(s + 1) * self.mss]); s = self.minifat[s]
        return b''.join(out)[:size]

    def _walk(self, i, prefix):
        if i < 0 or i >= len(self.entries): return
        e = self.entries[i]
        self._walk(e['left'], prefix)
        p = prefix + e['name']
        self.paths[p] = e
        if e['type'] == 1: self._walk(e['child'], p + '/')
        self._walk(e['right'], prefix)

    def read(self, path):
        e = self.paths[path]
        if e['size'] < self.cutoff: return self.minichain(e['start'], e['size'])
        return self.chain(e['start'])[:e['size']]


SKIP8 = {1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}


def para_text(b):
    u = struct.unpack('<%dH' % (len(b) // 2), b)
    out = []; i = 0
    while i < len(u):
        c = u[i]
        if c in SKIP8: i += 8; continue
        if c == 9: out.append('\t'); i += 8; continue
        if c in (10,): out.append('\n')
        elif c == 13: pass
        elif c == 24: out.append('-')
        elif c in (30, 31): out.append(' ')
        elif c >= 32: out.append(chr(c))
        i += 1
    return ''.join(out)


def hwp_text(path):
    data = open(path, 'rb').read()
    cf = CFB(data)
    hdr = cf.read('FileHeader')
    comp = struct.unpack_from('<I', hdr, 36)[0] & 1
    secs = sorted([p for p in cf.paths if p.startswith('BodyText/Section')], key=lambda x: int(x.split('Section')[1]))
    lines = []
    for sp in secs:
        raw = cf.read(sp)
        if comp: raw = zlib.decompress(raw, -15)
        lines.append(f'===== {sp.split("/")[1]} =====')
        i = 0; n = len(raw)
        tbl_level = []
        while i + 4 <= n:
            h = struct.unpack_from('<I', raw, i)[0]; i += 4
            tag, lev, size = h & 0x3FF, (h >> 10) & 0x3FF, h >> 20
            if size == 0xFFF: size = struct.unpack_from('<I', raw, i)[0]; i += 4
            body = raw[i:i + size]; i += size
            if tag == 71 and len(body) >= 4:  # CTRL_HEADER
                cid = body[:4][::-1].decode('latin1', 'ignore')
                if cid == 'tbl ': lines.append('[표 시작]')
            elif tag == 77 and len(body) >= 8:  # TABLE
                rows, cols = struct.unpack_from('<HH', body, 4)
                lines.append(f'[표 {rows}행×{cols}열]')
            elif tag == 72 and len(body) >= 16:  # LIST_HEADER (셀)
                try:
                    col, row, cs, rs = struct.unpack_from('<HHHH', body, 8)
                    if col < 200 and row < 2000: lines.append(f'  ‖셀 r{row} c{col}' + (f' span{cs}x{rs}' if cs > 1 or rs > 1 else ''))
                except struct.error:
                    pass
            elif tag == 67:  # PARA_TEXT
                t = para_text(body).strip()
                if t: lines.append(t)
    return '\n'.join(lines)


if __name__ == '__main__':
    t = hwp_text(sys.argv[1])
    open(sys.argv[2], 'w', encoding='utf-8').write(t)
    print(len(t))
