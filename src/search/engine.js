/* 사이트 전체 검색 엔진 (브라우저 안에서만 동작 — 서버·API 키 없음)
   - 문서 HTML을 문단 단위로 쪼개 색인
   - 한국어 조사 떼기 + 동의어 확장 + 글자 2-gram 부분일치로 "질문처럼" 검색
   - 결과마다 가장 관련 있는 문장을 뽑아 요약 카드로 보여 줌 */

export const BLOCK_SEL = 'p, li, tr, h2, h3, h4, h5, h6, figcaption, .tcap, .zone, .check, .fact-box, .vision, .box, .note, blockquote, dd'
const HEAD_SEL = 'h2, h3'

const JOSA = ['에서는', '으로는', '에서도', '이라는', '이라고', '에서', '으로', '에게', '까지', '부터', '처럼', '보다', '하고', '이랑', '라는', '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '요']
const STOP = new Set(['뭐', '뭐야', '무엇', '무슨', '어떻게', '어디', '어디야', '알려줘', '알려', '관련', '관련된', '내용', '정리', '정리해줘', '있어', '있나', '있는', '있는지', '해줘', '대해', '대한', '대해서', '좀', '그리고', '어떤', '얼마', '얼마나', '몇', '몇개', '인가', '인지', '같은', '것', '거', '등', '및', '찾아줘', '보여줘', '나와', '나와있어', '했어', '해', '현황은', '어때'])
const SYN = [
  ['마을보호', '마을보호지구', '농촌마을보호지구', '정주'],
  ['경관', '경관지구', '농촌경관지구', '경관농업'],
  ['융복합', '6차산업', '6차', '농촌융복합산업지구', '가공'],
  ['산업지구', '농촌산업지구', '공업', '농공단지', '공장'],
  ['축산', '축사', '우사', '축산지구', '악취'],
  ['재생에너지', '태양광', '풍력', '햇빛소득마을', '발전'],
  ['특성화농업', '특성화농업지구', '친환경', '주산지'],
  ['빈집', '공가', '폐가', '유휴'],
  ['인구', '소멸', '고령화', '인구감소', '소멸위험'],
  ['임대', '임대주택', 'lh', '공공임대', '행복주택'],
  ['회의록', 'fgi', '인터뷰', '주민의견'],
  ['교통', '버스', '대중교통', '도로'],
  ['돌봄', '복지', '경로당', '보건'],
  ['사과', '과수', '과수원'],
  ['쌀', '벼', '논', '유색벼'],
  ['관광', '체류', '관광객', '방문객'],
  ['지도', 'gis', '도면', '표기'],
  ['후보', '후보지', '후보군'],
  ['용도지역', '계획관리', '농림지역', '관리지역'],
  ['컨설팅', '위원', '지적', '수정'],
]
const SYN_MAP = new Map()
SYN.forEach((g) => g.forEach((w) => SYN_MAP.set(w, g)))
export const PLACES = ['정선읍', '고한읍', '사북읍', '신동읍', '북평면', '남면', '여량면', '임계면', '화암면', '원주', '완주']
const PLACE_ALIAS = { 정선읍: ['정선읍'], 고한: ['고한읍'], 사북: ['사북읍'], 신동: ['신동읍'], 북평: ['북평면'], 남면: ['남면'], 여량: ['여량면'], 임계: ['임계면'], 화암: ['화암면'], 원주: ['원주'], 완주: ['완주'] }

const norm = (s) => String(s || '').toLowerCase().replace(/[​\s]+/g, ' ').trim()
const strip = (w) => { for (const j of JOSA) if (w.length > j.length + 1 && w.endsWith(j)) return w.slice(0, -j.length); return w }
const bigrams = (w) => { const o = []; for (let i = 0; i < w.length - 1; i++) o.push(w.slice(i, i + 2)); return o }

export function parseQuery(q) {
  const raw = norm(q).replace(/[?？!.,·"'“”‘’()[\]{}~]/g, ' ').split(' ').filter(Boolean)
  const terms = []; const places = new Set()
  raw.forEach((w0) => {
    let w = strip(w0)
    for (const [k, v] of Object.entries(PLACE_ALIAS)) {
      if (w === k || w === v[0] || w.startsWith(k)) { places.add(v[0]); if (w === k || w === v[0]) w = '' }
    }
    if (!w || STOP.has(w) || STOP.has(w0)) return
    terms.push(w)
  })
  const exp = new Map()
  terms.forEach((t) => {
    exp.set(t, 1)
    const g = SYN_MAP.get(t) || [...SYN_MAP.keys()].filter((k) => k.length >= 2 && (t.includes(k) || k.includes(t))).flatMap((k) => SYN_MAP.get(k))
    ;(g || []).forEach((s) => { if (!exp.has(s)) exp.set(s, 0.45) })
  })
  const numeric = /몇|얼마|수치|면적|인구|비율|%|억/.test(q)
  return { terms, exp, places: [...places], numeric }
}

/* ── 색인 ── */
function blocksFromHtml(html) {
  const doc = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html')
  const root = doc.body.firstElementChild
  root.querySelectorAll('img, script, style, svg').forEach((x) => x.remove())
  const all = [...root.querySelectorAll(BLOCK_SEL)]
  const out = []; let h2 = '', h3 = ''
  all.forEach((el, i) => {
    const tag = el.tagName
    const t = (/^H[2-6]$/.test(el.tagName) ? [...el.childNodes].map((n) => n.textContent).join(' ') : el.textContent || '').replace(/\s+/g, ' ').trim()
    if (tag === 'H2') { h2 = t; h3 = '' } else if (tag === 'H3') h3 = t
    if (t.length < 6) return
    if (el.querySelector(BLOCK_SEL)) return // 안쪽 블록이 따로 색인됨
    out.push({ i, t, sec: [h2, h3].filter(Boolean).join(' › '), head: /^H[2-6]$/.test(tag) })
  })
  return out
}

const consultText = (it) => [it.title, it.loc, it.page, it.now, it.why, it.where, it.a, it.b, it.fix, ...(it.memo || []).map((m) => (typeof m === 'string' ? m : m.text))]
  .filter(Boolean).map((s) => String(s).replace(/<[^>]+>/g, ' ')).join(' · ').replace(/\s+/g, ' ').trim()

export function buildIndex(sources) {
  const P = []
  sources.forEach((s) => {
    if (s.kind === 'doc') {
      blocksFromHtml(s.html).forEach((b) => P.push({ doc: s.key, label: s.label, cat: s.cat, place: s.place, route: s.route, idx: b.i, t: b.t, n: norm(b.t), sec: b.sec, head: b.head }))
    } else {
      s.items.forEach((it) => {
        const t = consultText(it)
        if (t.length < 6) return
        const g = s.groups?.[it.g] || ''
        P.push({ doc: s.key, label: s.label, cat: s.cat, place: s.place, route: s.route, anchor: it.id, t, n: norm(t), sec: [g, it.id ? `${it.id} ${it.title || it.where || ''}` : ''].filter(Boolean).join(' › '), head: false })
      })
    }
  })
  const df = new Map()
  const N = P.length
  return { P, N, df, avg: P.reduce((a, p) => a + p.n.length, 0) / Math.max(N, 1) }
}

function docFreq(ix, term) {
  if (ix.df.has(term)) return ix.df.get(term)
  let c = 0; for (const p of ix.P) if (p.n.includes(term)) c++
  ix.df.set(term, c); return c
}
const countOcc = (s, t) => { let c = 0, i = s.indexOf(t); while (i >= 0) { c++; i = s.indexOf(t, i + t.length) } return c }

export function search(ix, q, { cat = 'all', limit = 40 } = {}) {
  const pq = parseQuery(q)
  if (!pq.terms.length && !pq.places.length) return { pq, hits: [], docs: [] }
  const k1 = 1.2, b = 0.6
  const weights = []
  pq.exp.forEach((w, t) => {
    if (t.length < 1) return
    const d = docFreq(ix, t)
    const idf = Math.log(1 + (ix.N - d + 0.5) / (d + 0.5))
    weights.push({ t, w, idf, bg: t.length >= 3 ? bigrams(t).map((g) => ({ g, idf: Math.log(1 + (ix.N - docFreq(ix, g) + 0.5) / (docFreq(ix, g) + 0.5)) })) : null })
  })
  const hits = []
  for (const p of ix.P) {
    if (cat !== 'all' && p.cat !== cat) continue
    let s = 0; let matched = 0
    const len = p.n.length
    for (const W of weights) {
      const tf = countOcc(p.n, W.t)
      if (tf) {
        s += W.w * W.idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / ix.avg))
        if (W.w === 1) matched++
        if (p.sec && norm(p.sec).includes(W.t)) s += 0.4 * W.w * W.idf
      } else if (W.bg && W.w === 1) {
        const got = W.bg.filter((x) => p.n.includes(x.g))
        if (got.length >= Math.ceil(W.bg.length * 0.6)) s += 0.35 * got.reduce((a, x) => a + x.idf, 0) / W.bg.length
      }
    }
    if (pq.places.length) {
      const own = pq.places.some((pl) => p.place === pl || p.label.includes(pl))
      const men = pq.places.some((pl) => p.n.includes(pl) || p.n.includes(pl.slice(0, 2)))
      if (own) s *= pq.terms.length ? 2.6 : 1; else if (men) s *= 1.3; else if (pq.terms.length) s *= 0.3; else s = 0
      if (!pq.terms.length && own) s = 0.5
    }
    if (!s) continue
    if (pq.terms.length > 1) s *= 1 + 0.35 * (matched - 1)
    if (pq.numeric && /\d/.test(p.t)) s *= 1.15
    if (p.head) s *= 0.8
    if (p.t.length < 30) s *= 0.55
    hits.push({ ...p, s })
  }
  hits.sort((a, b2) => b2.s - a.s)
  const top = hits.slice(0, limit)
  const byDoc = new Map()
  hits.slice(0, 200).forEach((h) => { const d = byDoc.get(h.doc) || { doc: h.doc, label: h.label, cat: h.cat, route: h.route, n: 0, s: 0 }; d.n++; d.s += h.s; byDoc.set(h.doc, d) })
  return { pq, hits: top, total: hits.length, docs: [...byDoc.values()].sort((a, b2) => b2.s - a.s) }
}

/* 결과 단락에서 질문과 가장 맞는 문장 하나 */
export function bestSentence(text, pq) {
  const parts = text.split(/(?<=[.。!?…])\s+|\s+[-–·•]\s+|\s{2,}|(?<=다\.)|(?<=함)\s|(?<=음)\s/).map((x) => x.trim()).filter((x) => x.length >= 8)
  if (!parts.length) return text.slice(0, 160)
  let best = parts[0], bs = -1
  parts.forEach((s) => {
    const n = norm(s); let sc = 0
    pq.exp.forEach((w, t) => { if (n.includes(t)) sc += w * (t.length >= 3 ? 1.3 : 1) })
    if (pq.numeric && /\d/.test(s)) sc += 0.3
    if (sc > bs) { bs = sc; best = s }
  })
  return best.length > 200 ? best.slice(0, 200) + '…' : best
}

/* 하이라이트용 조각 [{t, hit}] */
export function marks(text, pq, max = 260) {
  const words = [...pq.exp.keys()].filter((w) => w.length >= 1).sort((a, b) => b.length - a.length)
  let s = text
  if (s.length > max) {
    const n = norm(s); let pos = -1
    for (const w of words) { pos = n.indexOf(w); if (pos >= 0) break }
    const st = Math.max(0, pos - 70)
    s = (st ? '…' : '') + s.slice(st, st + max) + (st + max < text.length ? '…' : '')
  }
  if (!words.length) return [{ t: s, hit: false }]
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')
  return s.split(re).map((t, i) => ({ t, hit: i % 2 === 1 })).filter((x) => x.t)
}
