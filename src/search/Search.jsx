import { useEffect, useMemo, useRef, useState } from 'react'
import { buildIndex, search, bestSentence, marks, BLOCK_SEL } from './engine.js'

const CATS = [['all', '전체'], ['plan', '기본계획'], ['consult', '컨설팅'], ['issue', '현안']]
const EXAMPLES = ['화암 마을보호지구 후보', '빈집 현황', '사과 재배 면적', '태양광 주민 반대', '사북 정선군립병원', '고한 소재지 용도지역', '원주 소결 지적']
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* */ } }

let IX = null
export function getIndex(makeSources) {
  if (!IX) IX = buildIndex(makeSources())
  return IX
}

/* 다른 화면으로 옮긴 뒤 해당 단락으로 스크롤하고 잠깐 강조 */
export function jumpTo(hit) {
  const t0 = Date.now()
  const want = hit.t.replace(/\s+/g, ' ').slice(0, 40)
  const tick = () => {
    let el = null
    if (hit.anchor) el = document.getElementById(hit.anchor) || document.querySelector(`[data-ck^="${hit.anchor}"]`)
    else {
      const main = document.querySelector('.v-doc main')
      if (main && main.childElementCount) {
        const list = main.querySelectorAll(BLOCK_SEL)
        const cand = list[hit.idx]
        const txt = (x) => (x?.textContent || '').replace(/\s+/g, ' ').trim()
        el = cand && txt(cand).startsWith(want.slice(0, 20)) ? cand : [...list].find((x) => txt(x).startsWith(want.slice(0, 20)) && !x.querySelector(BLOCK_SEL)) || cand
      }
    }
    if (el) {
      const d = el.closest('details'); if (d) d.open = true
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('srch-hit')
      setTimeout(() => el.classList.remove('srch-hit'), 2600)
      return
    }
    if (Date.now() - t0 < 4000) setTimeout(tick, 120)
  }
  setTimeout(tick, 60)
}

const Mk = ({ parts }) => parts.map((x, i) => (x.hit ? <mark key={i}>{x.t}</mark> : <span key={i}>{x.t}</span>))

export default function Search({ open, onClose, makeSources, go, initial = '' }) {
  const [q, setQ] = useState(initial)
  const [dq, setDq] = useState(initial)
  const [cat, setCat] = useState('all')
  const [ready, setReady] = useState(!!IX)
  const [recent, setRecent] = useState(() => lsGet('hub.search.recent', []))
  const inp = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setTimeout(() => inp.current?.focus(), 30)
    if (!IX) setTimeout(() => { getIndex(makeSources); setReady(true) }, 30)
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose, makeSources])
  useEffect(() => { const t = setTimeout(() => setDq(q), 140); return () => clearTimeout(t) }, [q])

  const res = useMemo(() => (ready && dq.trim() ? search(IX, dq, { cat }) : null), [ready, dq, cat])
  const summary = useMemo(() => {
    if (!res || !res.hits.length) return []
    const seen = new Set(); const out = []
    for (const h of res.hits) {
      const s = bestSentence(h.t, res.pq)
      const k = s.slice(0, 30)
      if (seen.has(k)) continue
      seen.add(k); out.push({ h, s })
      if (out.length >= 5) break
    }
    return out
  }, [res])

  const pick = (h) => {
    const r = [dq.trim(), ...recent.filter((x) => x !== dq.trim())].slice(0, 8)
    setRecent(r); lsSet('hub.search.recent', r)
    onClose()
    go(h.route)
    jumpTo(h)
  }
  if (!open) return null
  return (
    <div className="srch" role="dialog" aria-modal="true" aria-label="사이트 검색" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="srch-box">
        <div className="srch-top">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" aria-label="검색어" />
          {q ? <button type="button" className="srch-x" onClick={() => { setQ(''); inp.current?.focus() }} aria-label="지우기">×</button> : null}
          <button type="button" className="srch-close" onClick={onClose}>닫기</button>
        </div>
        <div className="srch-cats" role="tablist">
          {CATS.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={cat === k} onClick={() => setCat(k)}>{n}</button>)}
          {res ? <span className="srch-cnt">{res.total}건</span> : null}
        </div>
        <div className="srch-body">
          {!ready && <p className="srch-note">불러오는 중…</p>}
          {ready && !dq.trim() && (
            <div className="srch-empty">
              {recent.length ? <><p className="srch-h">최근 검색</p><div className="srch-chips">{recent.map((x) => <button key={x} type="button" onClick={() => setQ(x)}>{x}</button>)}</div></> : null}
              <p className="srch-h">예시</p>
              <div className="srch-chips">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setQ(x)}>{x}</button>)}</div>
            </div>
          )}
          {res && !res.hits.length && <p className="srch-note">결과 없음</p>}
          {res && res.hits.length > 0 && (
            <>
              <section className="srch-sum" aria-label="관련 내용 요약">
                <p className="srch-h">요약</p>
                <ol>
                  {summary.map(({ h, s }, i) => (
                    <li key={i}><button type="button" onClick={() => pick(h)}><Mk parts={marks(s, res.pq, 400)} /> <span className="srch-src">{h.label}{h.sec ? ` · ${h.sec.split(' › ').slice(-1)[0]}` : ''}</span></button></li>
                  ))}
                </ol>
                {res.docs.length > 1 && (
                  <div className="srch-docs">
                    <span>문서</span>
                    {res.docs.slice(0, 6).map((d) => <button key={d.doc} type="button" onClick={() => { onClose(); go(d.route) }}>{d.label} <em>{d.n}</em></button>)}
                  </div>
                )}
              </section>
              <ul className="srch-list">
                {res.hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => pick(h)}>
                      <span className="srch-where"><b>{h.label}</b>{h.sec ? ` › ${h.sec}` : ''}</span>
                      <span className="srch-txt"><Mk parts={marks(h.t, res.pq)} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
