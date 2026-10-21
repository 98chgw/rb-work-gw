/* 읍·면 현안 문서 표의 위치·지번·주소를 지도 링크로 바꿈
   - 글자 클릭: 카카오맵 검색, 옆의 작은 N: 네이버지도 검색
   - 위치·놓을 위치·붙일 위치·후보지역·후보 마을·제안 후보지·대표 지번·지번·주소 열: 리 이름·고유 지명까지
   - 그 밖의 표 칸과 특화지구 후보 상자: 지번·도로명 주소만 */

const FULL = /^(위치|놓을 위치|붙일 위치|후보지역|후보 마을|대표 지번|지번|주소)$|^제안 후보지/
const LOT = /(?<![가-힣0-9])(?:([가-힣]{1,4}[읍면])\s)?([가-힣]{1,4}\d{0,2}리)\s?((?:산\s?)?\d+(?:-\d+)?)(?![\d.,·㎡%~h가-힣])(?!\s?(등|개|곳|호|채|동|명|가구))/g
const ROAD = /(?<![가-힣0-9])([가-힣]{2,}\d{0,3}(?:로|길))\s(\d+(?:-\d+)?)(?![\d.,㎡%~가-힣])/g
const NOT_ROAD = /(으로|지로|개로|곳으로|적으로|별로|대로|도로)$/
const RI = /(?<![가-힣0-9])[가-힣]{2,3}\d{0,2}리(?![가-힣])/g
const NOT_RI = /(관리|처리|거리|분리|요리|조리|머리|자리|소리)$/
const SKIP = /시가지|소재지|전체|전역|표시하지|화살표|방향|방면|밀집|기존|일부|외곽|경계|구간|지구|취락|필지|농경지|산지|공업|주거지|들녘|후보|검토|분포|부지|단지|일원|일대|텍스트|녹지|관리|배후|생산|지정|동의|재배|해당|연접|줄기|중앙|[~–]|\d+(ha|㎡|호|곳|개|MW|kW)/
// 고유명으로 볼 만한 끝말 또는 이름 목록에 있을 때만 링크
const SUF = /(역|산|사|천|강|곡|대|재|령|봉|정|굴|시장|5일장|센터|마을|병원|휴양림|밸리|케이블카|숲|정원|둔치|약수|관광지|공장|농협|분교|원|터|타운|랩|거리|산성|중계소|전수관|군락지|스키장|플랫폼|초)$/
const ALLOW = /^(아우라지|하이원|강원랜드|운탄고도|소금강|M650|동강)$/
const TOWNY = /^(행정복지|마을활력|케이블카|신청사|농협|증산초|아트플랫폼|생활건강|맛 전수관)/
const GENERIC = /^(시장|산림|광산|경사지|꽃길|수목원|농협|센터)$|구역$|지역$|클러스터$/
const NOISE = /^(?:리|마을|일원|일대|부근|인근|위|앞)$|\d리?$|축$|거점$/

const legal = (ri) => ri.replace(/\d+리$/, '리') // 행정리(방제1리) → 법정리(방제리)
const kakao = (q) => `https://map.kakao.com/?q=${encodeURIComponent(q)}`
const naver = (q) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`

/* 한 글자열에서 [시작, 끝, 검색어] 목록 */
function findPlaces(text, town, full) {
  const out = []
  const free = (a, b) => out.every(([s, e]) => b <= s || a >= e)
  for (const m of text.matchAll(LOT)) {
    if (NOT_RI.test(m[2]) || /^\d$/.test(m[3])) continue // 한 자리 숫자는 개수로 보고 제외
    const em = m[1] || town
    out.push([m.index, m.index + m[0].length, `강원 정선군 ${em} ${legal(m[2])} ${m[3].replace(/\s/g, '')}`])
  }
  for (const m of text.matchAll(ROAD)) {
    if (NOT_ROAD.test(m[1])) continue
    if (free(m.index, m.index + m[0].length)) out.push([m.index, m.index + m[0].length, `강원 정선군 ${town} ${m[1]} ${m[2]}`])
  }
  if (full) {
    // 괄호 밖 조각( / · , 로 나눔)에서 리 이름 또는 짧은 고유명
    let depth = 0, start = 0
    const segs = []
    for (let i = 0; i <= text.length; i++) {
      const ch = text[i]
      if (ch === '(') { if (depth === 0 && i > start) segs.push([start, i]); depth++; continue }
      if (ch === ')') { depth = Math.max(0, depth - 1); if (depth === 0) start = i + 1; continue }
      if (depth) continue
      if (i === text.length || ch === '/' || ch === '·' || ch === ',' || ch === '+') { if (i > start) segs.push([start, i]); start = i + 1 }
    }
    for (const [a, b] of segs) {
      const raw = text.slice(a, b)
      if (/→/.test(raw)) continue
      const lead = raw.length - raw.trimStart().length
      const seg = raw.trim()
      if (!seg || !free(a, b)) continue
      const ri = [...seg.matchAll(RI)].filter((r) => !NOT_RI.test(r[0]))
      if (ri.length) {
        for (const r of ri) {
          const s = a + lead + r.index
          if (free(s, s + r[0].length)) out.push([s, s + r[0].length, `강원 정선군 ${town} ${legal(r[0])}`])
        }
        continue
      }
      const name = seg.replace(/\s(일원|일대|부근|인근|위|앞|마을)$/, '')
      if (name.length < 2 || name.length > 16 || SKIP.test(name) || NOISE.test(name) || GENERIC.test(name)) continue
      if (!ALLOW.test(name) && (!SUF.test(name) || name.length === 2)) continue
      const s = a + lead
      out.push([s, s + name.length, name.startsWith('정선') ? name : TOWNY.test(name) ? `정선군 ${town} ${name}` : `정선 ${name}`])
    }
  }
  return out.sort((x, y) => x[0] - y[0])
}

function linkTextNode(node, town, full) {
  const t = node.nodeValue
  const hits = findPlaces(t, town, full)
  if (!hits.length) return
  const frag = document.createDocumentFragment()
  let pos = 0
  for (const [s, e, q] of hits) {
    if (s < pos) continue
    if (s > pos) frag.appendChild(document.createTextNode(t.slice(pos, s)))
    const w = document.createElement('span')
    w.className = 'mapw'
    const a = document.createElement('a')
    a.className = 'mapl'; a.href = kakao(q); a.target = '_blank'; a.rel = 'noopener'
    a.title = `카카오맵: ${q}`; a.textContent = t.slice(s, e)
    const n = document.createElement('a')
    n.className = 'mapn'; n.href = naver(q); n.target = '_blank'; n.rel = 'noopener'
    n.title = `네이버지도: ${q}`; n.setAttribute('aria-label', `네이버지도에서 ${q}`); n.textContent = 'N'
    w.append(a, n)
    frag.appendChild(w)
    pos = e
  }
  if (pos < t.length) frag.appendChild(document.createTextNode(t.slice(pos)))
  node.parentNode.replaceChild(frag, node)
}

function linkCell(cell, town, full) {
  const tw = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('.src, a, .tag, .mapw') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  const nodes = []
  while (tw.nextNode()) nodes.push(tw.currentNode)
  nodes.forEach((n) => linkTextNode(n, town, full))
}

export function linkPlaces(root, town) {
  if (!root || !town) return
  root.querySelectorAll('table').forEach((tb) => {
    const rows = [...tb.rows]
    if (!rows.length) return
    const heads = [...rows[0].cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())
    const cols = heads.map((h) => (FULL.test(h) ? 'full' : null))
    for (const r of rows.slice(1)) {
      const cells = [...r.cells]
      // 위치 열은 지명까지, 나머지 칸(칸 수가 다른 설명 행 포함)은 지번·도로명 주소만
      cells.forEach((c, i) => linkCell(c, town, cells.length === heads.length && cols[i] === 'full'))
    }
  })
  // 특화지구 후보 상자(📍 후보지 등)의 지번·도로명 주소
  root.querySelectorAll('.zone').forEach((z) => linkCell(z, town, false))
}
