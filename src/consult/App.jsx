import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DATA } from './data.js'
import { DATA_JS } from './data_jeongseon.js'
import {
  REMOTE, fetchChecks, saveCheck, fetchComments, addComment, addReply, setDone, removeComment, importMany, migrateLocal,
} from './store.js'
import { textOf, sectionOf, countByKey, progressText } from './comments.js'
import ItemCard, { CmCtx } from './components/ItemCard.jsx'
import { Ledger, Requests, MemoLedger, Unresolved } from './components/Tables.jsx'
import CommentPanel from './components/CommentPanel.jsx'

/* 시·군별 설정 — 정선 항목·정리표 키는 모두 'J-'로 시작해 원주와 겹치지 않음 */
const CITIES = {
  jeongseon: {
    id: 'jeongseon', name: '정선', data: DATA_JS, pfx: 'J-',
    title: '정선 컨설팅 수정표', mark: '旌', date: '7.1',
    eyebrow: '정선군 농촌공간 재구조화 및 재생 기본계획', when: '2026. 7. 1 광역 컨설팅',
    who: { A: '위원 A', B: '위원 B', C: '위원 C', X: '추가 발견' },
    whoDesc: { A: '쪽수 순서로 짚은 위원', B: '도시계획·공간구조 위원', C: '농업·농촌·지역특성 위원', X: '취합본 대조' },
    pageNote: '쪽수는 녹취에서 위원이 말한 컨설팅 제출본 쪽수 · 녹음 시각은 클로바노트 기준',
  },
  wonju: {
    id: 'wonju', name: '원주', data: DATA, pfx: '',
    title: '원주 컨설팅 수정표', mark: '原', date: '10.8',
    eyebrow: '원주시 농촌공간 재구조화 및 재생 기본계획', when: '2026. 10. 8 광역 컨설팅',
    who: { P: '자문위원', T: '도 팀장', X: '추가 발견' },
    whoDesc: { P: '서면·구두 의견', T: '녹취', X: '계획서 대조' },
    pageNote: '쪽수는 계획서 아래쪽 번호(- N -) 기준',
  },
}
const CITY_ORDER = ['jeongseon', 'wonju']
const cityOfKey = (key) => (String(key).startsWith('J-') ? 'jeongseon' : 'wonju')
const PRI = ['필수', '권장', '확인']
const F0 = { pri: 'all', who: 'all', memo: 'all', q: '', hide: false }

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch { /* 저장 불가 환경 */ } }

/* 코멘트 정렬 순서 : 화면 순서(장 → 카드 → 카드 안 위치 → 정리표) */
function makeRank(D, pfx) {
  const m = {}
  let n = 0
  D.groups.forEach((g) => D.items.filter((i) => i.g === g.id).forEach((i) => { m[i.id] = n++ }))
  D.contra.forEach((c) => { m[c.id] = n++ })
  D.tableErr.forEach((c) => { m[c.id] = n++ })
  D.typos.forEach((_, i) => { m[`${pfx}typo-${i}`] = n++ })
  D.dataReq.forEach((_, i) => { m[`${pfx}req-${i}`] = n++ })
  D.memos.forEach((_, i) => { m[`${pfx}memo-${i}`] = n++ })
  D.unclear.forEach((u) => { m[u.id] = n++ })
  return m
}
const RANKS = Object.fromEntries(CITY_ORDER.map((c) => [c, makeRank(CITIES[c].data, CITIES[c].pfx)]))
function rankOf(key) {
  const [id, part = '', sub = ''] = key.split(':')
  const base = (RANKS[cityOfKey(key)][id] ?? 9999) * 1000
  const k = part === 'title' ? 0 : part === 'memo' ? 10 + Number(sub || 0) : part === 'why' ? 100 : part === 'now' ? 200 : part === 'fix' ? 300 + Number(sub || 0) : 0
  return base + k
}

/* 새로 받은 체크 상태 중 바뀌지 않은 항목은 이전 객체를 그대로 써서 카드가 다시 그려지지 않게 함 */
function keepSame(prev, next) {
  const out = {}
  let same = Object.keys(prev).length === Object.keys(next).length
  for (const [k, v] of Object.entries(next)) {
    const p = prev[k]
    if (p && p.done === v.done && p.by === v.by) out[k] = p
    else { out[k] = v; same = false }
  }
  return same ? prev : out
}

/* 컨설팅 수정표 — 시·군은 바깥(통합 사이트)에서 정해 줌 */
export default function App({ city = 'jeongseon' }) {
  const mainRef = useRef(null)
  const C = CITIES[city]
  const D = C.data
  const WHO = C.who
  const TITLE = C.title
  const [checks, setChecks] = useState({})
  const [allComments, setComments] = useState([])
  const comments = useMemo(() => allComments.filter((c) => cityOfKey(c.key) === city), [allComments, city])
  const [sync, setSync] = useState({ state: REMOTE ? 'loading' : 'ok', at: Date.now(), msg: '' })
  const [author, setAuthor] = useState(() => lsGet('wonju.author', ''))
  const [f, setF] = useState(F0)
  const [toast, setToast] = useState('')
  const [notice, setNotice] = useState('')
  const [active, setActive] = useState(D.groups[0].id)
  /* 코멘트 */
  const [commentMode, setCommentMode] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pending, setPending] = useState(null)
  const [focus, setFocus] = useState(null)
  const [jumpKey, setJumpKey] = useState(null)

  const modeRef = useRef(false)
  const checksRef = useRef(checks)
  const authorRef = useRef(author)
  modeRef.current = commentMode
  checksRef.current = checks
  authorRef.current = author

  useEffect(() => lsSet('wonju.author', author), [author])


  const toastTimer = useRef(0)
  const say = useCallback((m) => {
    setToast(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])

  /* 불러오기 — 공유 저장소면 15초마다, 창으로 돌아올 때마다 */
  const busy = useRef(false)
  const again = useRef(false)
  const refresh = useCallback(async () => {
    if (busy.current) { again.current = true; return }
    busy.current = true
    try {
      do {
        again.current = false
        const [ck, cm] = await Promise.all([fetchChecks(), fetchComments()])
        setChecks((p) => keepSame(p, ck))
        setComments(cm)
        setSync({ state: 'ok', at: Date.now(), msg: '' })
      } while (again.current)
    } catch (e) {
      setSync((s) => ({ ...s, state: 'error', msg: String(e.message || e) }))
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    if (!REMOTE) return undefined
    /* 공유 저장소를 붙이기 전에 이 PC에 쌓인 코멘트·체크를 열자마자 한 번 옮김 */
    migrateLocal()
      .then((r) => {
        if (!r) return
        const parts = []
        if (r.comments) parts.push(`코멘트 ${r.comments}건`)
        if (r.checks) parts.push(`완료 체크 ${r.checks}개`)
        setNotice(`이 PC에만 저장돼 있던 기록(${parts.join(', ')})을 공유 저장소로 옮겼습니다. 이제 모든 PC에서 보입니다.`)
        refresh()
      })
      .catch((e) => setSync((s) => ({ ...s, state: 'error', msg: `예전 기록 이전 실패(이 PC에 그대로 보관 중) — ${e.message || e}` })))
    const t = setInterval(refresh, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  /* 수정 완료 체크 */
  const toggle = useCallback(async (id) => {
    const done = !checksRef.current[id]?.done
    const by = authorRef.current.trim()
    setChecks((c) => ({ ...c, [id]: { done, by, at: Date.now() } }))
    try { await saveCheck(id, done, by) } catch (e) { say(`저장하지 못했습니다 (${e.message || e})`); refresh() }
  }, [refresh, say])

  /* 코멘트 작업 : 화면에 먼저 반영 → 저장 → 저장소 기준으로 다시 불러오기 */
  const run = useCallback(async (optimistic, job) => {
    if (optimistic) setComments(optimistic)
    try { await job() } catch (e) {
      setSync((s) => ({ ...s, state: 'error', msg: String(e.message || e) }))
      say(`저장하지 못했습니다 (${e.message || e})`)
    }
    await refresh()
  }, [refresh, say])
  const commentsRef = useRef(allComments)
  commentsRef.current = allComments
  const actions = useMemo(() => ({
    add: (c) => run((l) => [...l, c], () => addComment(c)),
    reply: (id, r) => run((l) => l.map((c) => (c.id === id ? { ...c, replies: [...(c.replies || []), r] } : c)), () => addReply(id, r)),
    toggleDone: (c) => run((l) => l.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)), () => setDone(c.id, !c.done)),
    remove: (id) => run((l) => l.filter((c) => c.id !== id), () => removeComment(id)),
    importList: async (list) => {
      let n = 0
      await run(null, async () => { n = await importMany(list, commentsRef.current) })
      return n
    },
  }), [run])

  /* 키별 코멘트 수 (내용이 같으면 같은 객체 → 카드가 쓸데없이 다시 그려지지 않음) */
  const countSig = JSON.stringify(countByKey(comments))
  const cmCtx = useMemo(() => ({ counts: JSON.parse(countSig) }), [countSig])
  const perItem = useMemo(() => {
    const m = {}
    comments.forEach((c) => { const id = c.key.split(':')[0]; if (c.key.includes(':')) m[id] = (m[id] || 0) + 1 })
    return m
  }, [comments])
  const order = useMemo(() => Object.fromEntries(comments.map((c) => [c.key, rankOf(c.key)])), [comments])

  /* 본문 클릭 : 배지 → 그 위치 코멘트 보기 / 코멘트 달기 모드 → 누른 곳에 코멘트 */
  useEffect(() => {
    const root = mainRef.current
    if (!root) return undefined
    const onClick = (e) => {
      const badge = e.target.closest('.cm-badge')
      if (badge && root.contains(badge)) {
        e.preventDefault()
        e.stopPropagation()
        setPending(null)
        setFocus(badge.dataset.badgeFor)
        setPanelOpen(true)
        return
      }
      if (!modeRef.current) return
      if (e.target.closest('.ck, .card-f, input, textarea, select')) return
      const el = e.target.closest('[data-ck]')
      if (!el || !root.contains(el)) return
      e.preventDefault()
      setPending({ key: el.dataset.ck, excerpt: textOf(el).slice(0, 160), section: sectionOf(el) })
      setFocus(null)
      setPanelOpen(true)
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (modeRef.current) setCommentMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onPick = useCallback((id) => {
    const el = mainRef.current?.querySelector(`[data-ck="${id}:title"]`)
    if (!el) return
    setPending({ key: `${id}:title`, excerpt: textOf(el).slice(0, 160), section: sectionOf(el) })
    setFocus(null)
    setPanelOpen(true)
  }, [])
  const onFocus = useCallback((prefix) => { setPending(null); setFocus(prefix); setPanelOpen(true) }, [])

  /* 코멘트 위치로 이동 (필터에 가려져 있으면 필터를 풀고 다시) */
  const flashEl = useCallback((el) => {
    if (window.innerWidth < 960) setPanelOpen(false)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.remove('cm-flash')
    void el.offsetWidth
    el.classList.add('cm-flash')
  }, [])
  const findKey = (key) => {
    const root = mainRef.current
    if (!root) return null
    const esc = window.CSS?.escape ? CSS.escape(key) : key
    return root.querySelector(`[data-ck="${esc}"]`) || (key.includes(':') ? document.getElementById(key.split(':')[0]) : null)
  }
  const jumpTo = useCallback((key) => {
    const el = findKey(key)
    if (el) { flashEl(el); return }
    setF(F0)
    setJumpKey(key)
  }, [flashEl])
  useEffect(() => {
    if (!jumpKey) return
    const el = findKey(jumpKey)
    setJumpKey(null)
    if (el) flashEl(el)
    else say('본문에서 그 위치를 찾지 못했습니다 (코멘트는 그대로 있습니다)')
  }, [jumpKey, flashEl, say])

  /* 필터 */
  const items = D.items
  const total = items.length
  const doneN = items.filter((i) => checks[i.id]?.done).length
  const mustLeft = items.filter((i) => i.pri === '필수' && !checks[i.id]?.done).length
  const openCm = comments.filter((c) => !c.done).length
  const pct = total ? (doneN / total) * 100 : 0

  const visible = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    return items.filter((i) => {
      if (f.pri !== 'all' && i.pri !== f.pri) return false
      if (f.who !== 'all' && i.who !== f.who) return false
      if (f.memo === 'yes' && !i.memo.length) return false
      if (f.hide && checks[i.id]?.done) return false
      if (q) {
        const hay = [i.id, i.title, i.page, i.loc, i.now, i.why, i.fix.replace(/<[^>]+>/g, ' '), ...i.memo.map((m) => `${m.text} ${m.page}`)].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, f, checks])
  const filtered = f.pri !== 'all' || f.who !== 'all' || f.memo !== 'all' || f.hide || f.q.trim()

  const byGroup = useMemo(() => D.groups.map((g) => ({
    ...g,
    all: items.filter((i) => i.g === g.id),
    shown: visible.filter((i) => i.g === g.id),
  })), [D, items, visible])

  /* 목차 현재 위치 */
  useEffect(() => {
    let raf = 0
    const ids = [...D.groups.map((g) => g.id), 'ledger', 'requests', 'memos', 'unresolved']
    const calc = () => {
      raf = 0
      let cur = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.offsetParent !== null && el.getBoundingClientRect().top <= 160) cur = id
      }
      setActive(cur)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(calc) }
    calc()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [D, visible])

  const copy = async (text, ok) => {
    try { await navigator.clipboard.writeText(text); say(ok) } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); say(ok) } catch { say('복사가 막혀 있습니다. 직접 선택해 복사하세요.') }
      ta.remove()
    }
  }

  const seg = (key, opts, label) => (
    <div className="seg" role="group" aria-label={label}>
      {opts.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={f[key] === v} onClick={() => setF((s) => ({ ...s, [key]: v }))}>{text}</button>
      ))}
    </div>
  )
  const ledgerCount = D.contra.length + D.tableErr.length + D.typos.length
  const hasMemo = D.memos.length > 0

  const syncLabel = REMOTE
    ? sync.state === 'error' ? '연결 오류' : sync.state === 'loading' ? '불러오는 중' : '공유 중'
    : '이 브라우저에만 저장'

  return (
    <CmCtx.Provider value={cmCtx}>
      <div className={`app ${panelOpen ? 'with-panel' : ''}`}>
        <div className="bar">
          <div className="bar-in">
            <a className="brand" href="#top">
              <span className="brand-mark" aria-hidden="true">{C.mark}</span>
              <span className="brand-t">{TITLE}</span>
              <span className="brand-d">{C.date}</span>
            </a>
            <div className="bar-search">
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <input type="search" placeholder={city === 'jeongseon' ? '찾기 — 빈집, p.16, J-A06' : '찾기 — 빈집, p.40, T15'} value={f.q}
                onChange={(e) => setF((s) => ({ ...s, q: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Escape') setF((s) => ({ ...s, q: '' })) }}
                aria-label="항목 찾기" />
            </div>
            <div className="bar-act">
              <button type="button" className={`btn cm-btn ${commentMode ? 'on' : ''}`} aria-pressed={commentMode} onClick={() => setCommentMode((v) => !v)}>
                <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M4 4.5h12v8H9l-3.5 3v-3H4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                <span>코멘트 달기</span>
              </button>
              <button type="button" className="btn" aria-pressed={panelOpen} onClick={() => { setFocus(null); setPending(null); setPanelOpen((v) => !v) }}>
                <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M4 6h12M4 10h12M4 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                <span>코멘트 목록</span>{openCm ? <em className="n">{openCm}</em> : null}
              </button>

            </div>
          </div>
          {commentMode && (
            <div className="cm-strip" role="status">
              <b>코멘트 달기</b> — 의견을 남길 제목·문단·손메모·표의 행을 누르세요 <span className="dim">· Esc로 끝내기</span>
              <button type="button" className="btn sm" onClick={() => setCommentMode(false)}>끝내기</button>
            </div>
          )}
          {notice && (
            <div className="cm-strip note" role="status">{notice} <button type="button" className="btn sm" onClick={() => setNotice('')}>확인</button></div>
          )}
        </div>

        <header className="hero" id="top" data-date={city === 'jeongseon' ? '07·01' : '10·08'}>
          <div className="hero-text">
            <p className="eyebrow">{C.eyebrow}<span className="sep" />{C.when}</p>
            <h1>{C.name} 컨설팅<br />수정표</h1>
            {city === 'jeongseon' ? (
              <p className="lead">컨설팅 녹취(약 1시간 9분)에서 위원 세 분이 말한 지적을 <b>0610 취합본</b>과 맞대어, 고칠 곳마다 <b>위원이 말한 쪽수·녹음 시각</b>과 <b>지금 문구</b>, 혹시 <b>수정한다면 예시</b>를 붙였습니다. 이미 3장(v27)에서 고친 것은 카드 안에 <b>지금 상태</b>로 적었습니다. 취합본을 읽으며 찾은 모순과 오탈자는 <b>추가 발견</b>으로 따로 표시했습니다.</p>
            ) : (
              <p className="lead">컨설팅 때 받은 계획서에 직접 쓴 <b>손메모 {D.memos.length}곳</b>과 녹취를 맞대어, 고칠 곳마다 <b>계획서 쪽수</b>와 <b>지금 문구</b>, 혹시 <b>수정한다면 예시</b>를 붙였습니다. 녹취·메모에는 없지만 계획서를 읽으며 찾은 모순과 오탈자는 <b>추가 발견</b>으로 따로 표시했습니다.</p>
            )}
            <ul className="legend" aria-label="표시 읽는 법">
              {Object.keys(WHO).map((w) => <li key={w}><span className={`who w-${w}`}>{WHO[w]}</span> {C.whoDesc[w]}</li>)}
              {hasMemo && <li><span className="pen-sample">손메모</span> 계획서에 쓴 메모</li>}
            </ul>
          </div>
          <aside className="gauge" aria-label="진행 현황">
            <p className="g-label">수정 완료</p>
            <p className="g-num"><span>{doneN}</span><small>/ {total}</small></p>
            <div className="g-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneN}><i style={{ width: `${pct}%` }} /></div>
            <dl className="g-stats">
              <div><dt>남은 필수</dt><dd>{mustLeft}</dd></div>
              <div><dt>미반영 의견</dt><dd>{openCm}</dd></div>
              <div><dt>녹음 확인</dt><dd>{D.unclear.length}</dd></div>
            </dl>
            <div className="g-foot">
              <span className={`sync ${REMOTE ? sync.state : 'local'}`} title={sync.msg || ''}><i />{syncLabel}</span>
              <button type="button" className="link" onClick={() => copy(progressText(D, checks, comments, TITLE), '진행 현황을 복사했습니다. 카톡·메일에 붙여넣으세요.')}>진행 현황 복사</button>
            </div>
          </aside>
        </header>

        <nav className="strip" aria-label="장별 진행">
          {byGroup.map((g) => {
            const d = g.all.filter((i) => checks[i.id]?.done).length
            return (
              <a key={g.id} href={`#${g.id}`} className="strip-seg" style={{ flexGrow: g.all.length }} title={`${g.name} — ${d}/${g.all.length} 완료`}>
                <span className="strip-bar"><i style={{ width: `${g.all.length ? (d / g.all.length) * 100 : 0}%` }} /></span>
                <span className="strip-name">{g.name.replace(/^2장 (여건분석 · )?/, '2장 · ').replace(/^2장 · 상위·관련계획과 의견수렴/, '2장 · 상위계획·의견')}</span>
              </a>
            )
          })}
        </nav>

        <div className="filters" role="toolbar" aria-label="필터">
          {seg('pri', [['all', '전체'], ...PRI.map((p) => [p, p])], '중요도')}
          {seg('who', [['all', '모두'], ...Object.entries(WHO)], '누가')}
          {hasMemo && seg('memo', [['all', '메모 무관'], ['yes', '손메모 있는 것']], '손메모')}
          <label className="tick"><input type="checkbox" checked={f.hide} onChange={(e) => setF((s) => ({ ...s, hide: e.target.checked }))} /><span>완료 숨기기</span></label>
          <label className="me">
            <span>내 이름</span>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="OOO" aria-label="내 이름" />
          </label>
          <span className="f-count">{filtered ? <>표시 <b>{visible.length}</b> / {total} <button type="button" className="link" onClick={() => setF(F0)}>필터 풀기</button></> : <>항목 <b>{total}</b>개</>}</span>
        </div>

        <div className="layout">
          <aside className="toc" aria-label="목차">
            <p className="toc-h">항목</p>
            {byGroup.map((g) => {
              const d = g.all.filter((i) => checks[i.id]?.done).length
              return (
                <a key={g.id} href={`#${g.id}`} className={`${g.shown.length ? '' : 'dim'} ${active === g.id ? 'on' : ''}`}>
                  <span>{g.name}</span>
                  <em>{d}/{g.all.length}</em>
                  <i style={{ width: `${g.all.length ? (d / g.all.length) * 100 : 0}%` }} />
                </a>
              )
            })}
            <p className="toc-h">정리표</p>
            <a href="#ledger" className={active === 'ledger' ? 'on' : ''}><span>모순 · 표 오기 · 오탈자</span><em>{ledgerCount}</em></a>
            <a href="#requests" className={active === 'requests' ? 'on' : ''}><span>받아야 할 자료</span><em>{D.dataReq.length}</em></a>
            {hasMemo && <a href="#memos" className={active === 'memos' ? 'on' : ''}><span>손메모 대조</span><em>{D.memos.length}</em></a>}
            <a href="#unresolved" className={`hl ${active === 'unresolved' ? 'on' : ''}`}><span>녹음으로 확인할 곳</span><em>{D.unclear.length}</em></a>
          </aside>

          <main ref={mainRef} className={commentMode ? 'cm-mode' : ''}>
            {byGroup.map((g) => (
              <section key={g.id} id={g.id} className={`grp ${g.shown.length ? '' : 'is-empty'}`} data-cs={g.name}>
                <header className="grp-h">
                  <h2>{g.name}</h2>
                  {g.sub && <p>{g.sub}</p>}
                  <span className="grp-n">{g.all.filter((i) => checks[i.id]?.done).length}<small>/{g.all.length}</small></span>
                </header>
                {g.shown.map((it) => (
                  <ItemCard key={it.id} it={it} who={WHO[it.who]} group={g.name} check={checks[it.id]} onToggle={toggle}
                    cmTotal={perItem[it.id] || 0} onFocus={onFocus} onPick={onPick} />
                ))}
              </section>
            ))}
            {!visible.length && (
              <p className="empty">조건에 맞는 항목이 없습니다. <button type="button" className="link" onClick={() => setF(F0)}>필터 풀기</button></p>
            )}

            <Ledger data={D} pfx={C.pfx} checks={checks} onToggle={toggle} note={city === 'jeongseon' ? '녹취에는 없고 0610 취합본(컨설팅 직전판)과 0610_3 수정본을 읽으며 찾은 것입니다. 쪽수는 위원이 말한 제출본 쪽수로 적었습니다.' : undefined} />
            <Requests data={D} pfx={C.pfx} checks={checks} onToggle={toggle} />
            {hasMemo && <MemoLedger data={D} pfx={C.pfx} />}
            <Unresolved data={D} note={city === 'jeongseon' ? '녹취가 자동 변환(클로바노트)이라 말이 뭉개진 곳이 많습니다. 계획서·앞뒤 맥락으로도 풀리지 않은 곳만 남겼습니다. 녹음 시각을 찾아 들어 보고 그 줄에 코멘트로 들은 내용을 남겨 주세요.' : undefined} />

            <footer className="foot">
              <div>
                <p className="foot-h">대조 자료</p>
                {city === 'jeongseon'
                  ? <p>정선 컨설팅 녹취(2026. 7. 1, 69분 9초, 클로바노트 변환본) · 정선군 기본계획 취합본 0610(컨설팅 직전판)·0610_3 · 정선 3장 기본구상 v27 · 2026~2030 정선군 폐광지역개발기금 중장기계획</p>
                  : <p>컨설팅 때 받은 원주시 기본계획서(PDF, 손메모 포함) · 원주 컨설팅 녹취(2026. 10. 8, 약 1시간 30분) · 원주시 기본계획서 0928 한글본 · 광역 컨설팅 설명자료</p>}
              </div>
              {city === 'wonju' && <div>
                <p className="foot-h">근거 자료</p>
                <ul>
                  <li><a href="https://eiec.kdi.re.kr/policy/materialView.do?num=286486" target="_blank" rel="noopener noreferrer">농식품부 — 농촌공간재구조화법 시행령·시행규칙 일부개정령안 입법예고(9.9~10.19, “농촌위해시설” → “농촌환경중점관리시설”)</a></li>
                  <li><a href="https://supple.kr/news/cmts0ztbs006q6rbgzttdlw2c" target="_blank" rel="noopener noreferrer">자치구도 농촌공간계획 수립…특화지구 지정·해제 절차 마련(2026. 9. 8 · 6.16 공포, 12.17 시행)</a></li>
                  <li><a href="https://newsseoul.co.kr/news/view/1065602447757027" target="_blank" rel="noopener noreferrer">강원특별자치도 미래산업글로벌도시 개발 종합계획(2024~2033) 최종보고회 — 도·교육청·시군 통합형 법정계획</a></li>
                </ul>
              </div>}
              <p className="foot-sig">{TITLE} · {C.pageNote}</p>
            </footer>
          </main>
        </div>

        <CommentPanel
          open={panelOpen}
          onClose={() => { setPanelOpen(false); setPending(null); setFocus(null) }}
          comments={comments} actions={actions} remote={REMOTE} sync={sync} onRefresh={refresh}
          pending={pending} setPending={setPending}
          author={author} setAuthor={setAuthor}
          order={order} onJump={jumpTo}
          focus={focus} setFocus={setFocus}
          title={TITLE}
        />
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </CmCtx.Provider>
  )
}
