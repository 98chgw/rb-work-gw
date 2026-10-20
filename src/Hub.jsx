import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DocView from './plan/DocView.jsx'
import * as CH3 from './plan/content_ch3.js'
import * as HWAAM from './issues/content_hwaam.js'
import { TOWN_DOCS } from './issues/index.js'
import * as WJ2 from './plan/content_wanju2.js'
import ConsultApp from './consult/App.jsx'
import { DATA as DATA_WJ } from './consult/data.js'
import { DATA_JS } from './consult/data_jeongseon.js'
import { fetchAll as fetchPlanComments } from './plan/store.js'
import { docOf } from './plan/comments.js'
import { fetchComments as fetchConsultComments, fetchChecks } from './consult/store.js'
import Search from './search/Search.jsx'

/* ───────── 사이트 구성 ─────────
   대분류 3개 → 소분류. 내용이 아직 없는 곳은 자리만 만들어 둠 (ready: false) */
const CHAPTERS = [
  { id: '1', no: 'Ⅰ', name: '개요', ready: false, hint: '배경 및 목적 · 계획의 범위 · 계획의 수립경과' },
  { id: '2', no: 'Ⅱ', name: '현황 및 여건분석', ready: false, hint: '지역의 여건 및 특성 · 농촌공간구조 분석 · 종합분석 및 개선과제 도출' },
  { id: '3', no: 'Ⅲ', name: '기본구상', ready: true },
  { id: '4', no: 'Ⅳ', name: '부문계획', ready: false },
  { id: '5', no: 'Ⅴ', name: '농촌특화지구 운용 및 관리계획', ready: false },
  { id: '6', no: 'Ⅵ', name: '계획의 실행 및 성과관리', ready: false },
]
const WANJU_CH = [
  { id: '2', no: 'Ⅱ', name: '현황 및 여건 분석', ready: true, part: '1.1 가. 공간적 입지 ~ 소결' },
]
/* 기본계획(안) — 군별 장 목록 */
const PLANS = [
  { id: 'jeongseon', name: '정선군', chapters: CHAPTERS, def: '3' },
  { id: 'wanju', name: '완주군', chapters: WANJU_CH, def: '2' },
]
const planOf = (id) => PLANS.find((x) => x.id === id) || PLANS[0]
const CITIES = [
  { id: 'jeongseon', name: '정선', full: '정선군', when: '2026. 7. 1', data: DATA_JS, pfx: 'J-' },
  { id: 'wonju', name: '원주', full: '원주시', when: '2026. 10. 8', data: DATA_WJ, pfx: '' },
]
const COUNTIES = [
  {
    id: 'jeongseon', name: '정선군',
    towns: [
      { id: 'jeongseon-eup', name: '정선읍' }, { id: 'gohan', name: '고한읍' }, { id: 'sabuk', name: '사북읍' },
      { id: 'sindong', name: '신동읍' }, { id: 'bukpyeong', name: '북평면' }, { id: 'nam', name: '남면' },
      { id: 'yeoryang', name: '여량면' }, { id: 'imgye', name: '임계면' }, { id: 'hwaam', name: '화암면', ready: true },
    ],
  },
]
COUNTIES.forEach((co) => co.towns.forEach((t) => { if (TOWN_DOCS[t.id]) t.ready = true }))
const TOWN_NAME = Object.fromEntries(COUNTIES.flatMap((co) => co.towns.map((t) => [t.id, t.name])))
const CATS = [
  { id: 'plan', name: '기본계획(안)', short: '기본계획', long: '농촌공간 재구조화 및 재생 기본계획(안)' },
  { id: 'consult', name: '컨설팅', short: '컨설팅', long: '광역 컨설팅 수정표' },
  { id: 'issue', name: '현안 및 발전방향', short: '현안', long: '읍·면 지역현안 및 발전방향' },
]
const cityOfKey = (key) => (String(key).startsWith('J-') ? 'jeongseon' : 'wonju')

/* ───────── 주소 (?p=plan-3 …) — 목차 링크(#…)와 겹치지 않게 쿼리로 둠 ───────── */
function parse(p) {
  const s = String(p || '')
  if (s.startsWith('plan-')) {
    const parts = s.slice(5).split('-')
    const pl = parts.length > 1 ? PLANS.find((x) => x.id === parts[0]) : PLANS[0]
    const c = pl?.chapters.find((x) => x.id === parts[parts.length - 1])
    if (c) return { cat: 'plan', pc: pl.id, sub: c.id }
  }
  if (s.startsWith('consult-')) { const c = CITIES.find((x) => x.id === s.slice(8)); if (c) return { cat: 'consult', sub: c.id } }
  if (s.startsWith('issue-')) {
    const [cty, ...rest] = s.slice(6).split('-')
    const co = COUNTIES.find((x) => x.id === cty)
    const t = co?.towns.find((x) => x.id === rest.join('-'))
    if (co) return { cat: 'issue', county: co.id, sub: t ? t.id : null }
  }
  return { cat: 'home' }
}
const keyOf = (r) => (r.cat === 'home' ? '' : r.cat === 'issue' ? `issue-${r.county}${r.sub ? '-' + r.sub : ''}` : r.cat === 'plan' ? `plan-${r.pc || 'jeongseon'}-${r.sub}` : `${r.cat}-${r.sub}`)
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch { /* 저장 불가 */ } }

function useRoute() {
  const read = () => {
    try { const p = new URLSearchParams(window.location.search).get('p'); if (p !== null) return parse(p) } catch { /* */ }
    return parse(lsGet('hub.last', 'plan-3'))
  }
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  const go = useCallback((r) => {
    const k = keyOf(r)
    try {
      const u = new URL(window.location.href)
      if (k) u.searchParams.set('p', k); else u.searchParams.delete('p')
      u.searchParams.delete('city')
      u.hash = ''
      window.history.pushState(null, '', u)
    } catch { /* 주소 변경 불가 환경 */ }
    lsSet('hub.last', k)
    setRoute(r)
    window.scrollTo(0, 0)
  }, [])
  return [route, go]
}

function useTheme() {
  const [theme, setTheme] = useState(() => lsGet('hub.theme', 'system'))
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme)
    lsSet('hub.theme', theme)
  }, [theme])
  return [theme, setTheme]
}
const ThemeIcon = ({ t }) => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    {t === 'dark'
      ? <path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z" fill="currentColor" />
      : t === 'light'
        ? <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="3.4" /><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" /></g>
        : <g><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></g>}
  </svg>
)

/* ───────── 전체 현황 (코멘트·완료 체크) — 홈 화면과 탭 숫자에 씀 ───────── */
function useStats() {
  const [st, setSt] = useState({ plan: [], consult: [], checks: {}, at: 0, err: '' })
  const load = useCallback(async () => {
    const [p, c, k] = await Promise.allSettled([fetchPlanComments(), fetchConsultComments(), fetchChecks()])
    setSt((s) => ({
      plan: p.status === 'fulfilled' ? p.value : s.plan,
      consult: c.status === 'fulfilled' ? c.value : s.consult,
      checks: k.status === 'fulfilled' ? k.value : s.checks,
      at: Date.now(),
      err: [p, c, k].some((x) => x.status === 'rejected') ? '일부 저장소를 불러오지 못했습니다' : '',
    }))
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    window.addEventListener('focus', load)
    return () => { clearInterval(t); window.removeEventListener('focus', load) }
  }, [load])
  return [st, load]
}

/* 문서 키 ↔ 화면 위치 */
const DOCS = {
  plan3: { label: '기본계획 Ⅲ. 기본구상', route: { cat: 'plan', pc: 'jeongseon', sub: '3' } },
  'plan-wanju2': { label: '완주군 Ⅱ. 공간적 입지', route: { cat: 'plan', pc: 'wanju', sub: '2' } },
}
COUNTIES.forEach((co) => co.towns.forEach((t) => { DOCS[`iss-${t.id}`] = { label: `현안 · ${t.name}`, route: { cat: 'issue', county: co.id, sub: t.id } } }))
/* 검색 색인 원본 — 처음 검색창을 열 때 한 번 만든다 */
const makeSources = () => {
  const src = [
    { kind: 'doc', key: 'plan3', label: '기본계획 Ⅲ. 기본구상', cat: 'plan', place: '', route: DOCS.plan3.route, html: CH3.MAIN_HTML },
    { kind: 'doc', key: 'plan-wanju2', label: '완주군 Ⅱ. 공간적 입지', cat: 'plan', place: '완주', route: DOCS['plan-wanju2'].route, html: WJ2.MAIN_HTML },
  ]
  COUNTIES.forEach((co) => co.towns.forEach((t) => {
    const c = TOWN_DOCS[t.id]
    if (c) src.push({ kind: 'doc', key: `iss-${t.id}`, label: `현안 · ${t.name}`, cat: 'issue', place: t.name, route: DOCS[`iss-${t.id}`].route, html: c.MAIN_HTML })
  }))
  CITIES.forEach((c) => {
    const g = Object.fromEntries((c.data.groups || []).map((x) => [x.id, x.name]))
    const items = [...(c.data.items || []), ...(c.data.contra || []).map((x) => ({ ...x, title: x.where })), ...(c.data.tableErr || [])]
    src.push({ kind: 'items', key: `consult-${c.id}`, label: `${c.name} 컨설팅`, cat: 'consult', place: c.id === 'wonju' ? '원주' : '', route: { cat: 'consult', sub: c.id }, groups: g, items })
  })
  return src
}

const issOpen = (open) => Object.entries(open).filter(([k]) => k.startsWith('iss-')).reduce((a, [, v]) => a + v, 0)

export default function Hub() {
  const [route, go] = useRoute()
  const [theme, setTheme] = useTheme()
  const [stats, reload] = useStats()
  const headRef = useRef(null)
  const [sOpen, setSOpen] = useState(false)
  const closeSearch = useCallback(() => setSOpen(false), [])
  useEffect(() => {
    const on = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setSOpen(true) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  /* 머리 높이를 CSS 변수로 → 아래 화면들의 고정 막대가 그 밑에 붙음 */
  useEffect(() => {
    const el = headRef.current
    if (!el) return undefined
    const set = () => document.documentElement.style.setProperty('--hub-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { reload() }, [route, reload])

  /* 미반영 코멘트 수 */
  const open = useMemo(() => {
    const m = { plan3: 0, 'plan-wanju2': 0, jeongseon: 0, wonju: 0 }
    stats.plan.forEach((c) => { if (!c.done) { const d = docOf(c); m[d] = (m[d] || 0) + 1 } })
    stats.consult.forEach((c) => { if (!c.done) m[cityOfKey(c.key)]++ })
    return m
  }, [stats])
  const catOpen = { plan: open.plan3 + open['plan-wanju2'], consult: open.jeongseon + open.wonju, issue: issOpen(open) }

  const title = useMemo(() => {
    if (route.cat === 'plan') { const pl = planOf(route.pc); const c = pl.chapters.find((x) => x.id === route.sub); return `${pl.name} ${c.no}. ${c.name} — 기본계획(안)` }
    if (route.cat === 'consult') return `${CITIES.find((x) => x.id === route.sub).name} 컨설팅 수정표`
    if (route.cat === 'issue') { const t = COUNTIES[0].towns.find((x) => x.id === route.sub); return `${t ? t.name + ' ' : ''}지역현안 및 발전방향` }
    return '한눈에 보기'
  }, [route])
  useEffect(() => { document.title = `${title} · 농촌공간 재구조화 및 재생 기본계획` }, [title])

  const goCat = (cat) => {
    if (cat === 'home') return go({ cat: 'home' })
    if (cat === 'plan') return go({ cat: 'plan', pc: 'jeongseon', sub: '3' })
    if (cat === 'consult') return go({ cat: 'consult', sub: 'jeongseon' })
    return go({ cat: 'issue', county: 'jeongseon', sub: 'hwaam' })
  }
  const county = COUNTIES.find((x) => x.id === (route.county || 'jeongseon'))

  return (
    <div className="hub">
      <header className="hub-head" ref={headRef}>
        <div className="hub-row">
          <button type="button" className="hub-brand" onClick={() => goCat('home')} title="한눈에 보기">
            <span className="hub-mark" aria-hidden="true">農</span>
            <span className="hub-bt">농촌공간 재구조화 및 재생 기본계획<small>작업 사이트</small></span>
          </button>
          <nav className="hub-cats" aria-label="대분류">
            <button type="button" aria-current={route.cat === 'home' ? 'page' : undefined} onClick={() => goCat('home')}>한눈에</button>
            {CATS.map((c) => (
              <button key={c.id} type="button" aria-current={route.cat === c.id ? 'page' : undefined} onClick={() => goCat(c.id)}>
                <span className="hub-cl">{c.name}</span><span className="hub-cs">{c.short}</span>{catOpen[c.id] ? <em className="hub-n" title="미반영 코멘트">{catOpen[c.id]}</em> : null}
              </button>
            ))}
          </nav>
          <button type="button" className="hub-search" onClick={() => setSOpen(true)} title="사이트 전체 검색 (Ctrl+K 또는 /)" aria-label="검색">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className="hub-sl2">검색</span>
          </button>
          <button type="button" className="hub-theme" onClick={() => setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')}
            aria-label={`화면 밝기: ${theme === 'system' ? '시스템 설정' : theme === 'dark' ? '어둡게' : '밝게'} (눌러서 바꾸기)`}
            title={`화면: ${theme === 'system' ? '시스템 설정' : theme === 'dark' ? '어둡게' : '밝게'}`}>
            <ThemeIcon t={theme} />
          </button>
        </div>

        {route.cat !== 'home' && (
          <div className="hub-row hub-subs">
            {route.cat === 'plan' && (
              <>
                {PLANS.map((pl) => (
                  <button key={pl.id} type="button" className="hub-county" aria-current={planOf(route.pc).id === pl.id ? 'true' : undefined}
                    onClick={() => go({ cat: 'plan', pc: pl.id, sub: pl.def })}>{pl.name}</button>
                ))}
                <span className="hub-div" aria-hidden="true" />
                {planOf(route.pc).chapters.map((c) => (
                  <button key={c.id} type="button" className={c.ready ? '' : 'empty'} aria-current={route.sub === c.id ? 'page' : undefined}
                    onClick={() => go({ cat: 'plan', pc: planOf(route.pc).id, sub: c.id })} title={c.ready ? `${c.no}. ${c.name}` : `${c.no}. ${c.name} (작성 전)`}>
                    <b>{c.id}장</b> <span className="hub-cn">{c.part || c.name}</span>
                    {planOf(route.pc).id === 'jeongseon' && c.id === '3' && open.plan3 ? <em className="hub-n">{open.plan3}</em> : null}
                    {planOf(route.pc).id === 'wanju' && c.id === '2' && open['plan-wanju2'] ? <em className="hub-n">{open['plan-wanju2']}</em> : null}
                  </button>
                ))}
              </>
            )}
            {route.cat === 'consult' && CITIES.map((c) => (
              <button key={c.id} type="button" aria-current={route.sub === c.id ? 'page' : undefined} onClick={() => go({ cat: 'consult', sub: c.id })}>
                <b>{c.name}</b> <span className="hub-cn">{c.when}</span>{open[c.id] ? <em className="hub-n">{open[c.id]}</em> : null}
              </button>
            ))}
            {route.cat === 'issue' && (
              <>
                {COUNTIES.length > 1
                  ? COUNTIES.map((co) => (
                    <button key={co.id} type="button" className="hub-county" aria-current={county.id === co.id ? 'true' : undefined}
                      onClick={() => go({ cat: 'issue', county: co.id, sub: null })}>{co.name}</button>
                  ))
                  : <span className="hub-sl">{county.name}</span>}
                {county.towns.map((t) => (
                  <button key={t.id} type="button" className={t.ready ? '' : 'empty'} aria-current={route.sub === t.id ? 'page' : undefined}
                    onClick={() => go({ cat: 'issue', county: county.id, sub: t.id })} title={t.ready ? t.name : `${t.name} (작성 전)`}>
                    {t.name}{open[`iss-${t.id}`] ? <em className="hub-n">{open[`iss-${t.id}`]}</em> : null}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </header>

      <Page route={route} go={go} stats={stats} open={open} reload={reload} county={county} />
      <Search open={sOpen} onClose={closeSearch} makeSources={makeSources} go={go} />
    </div>
  )
}

function Page({ route, go, stats, open, reload, county }) {
  if (route.cat === 'plan') {
    const pl = planOf(route.pc)
    const c = pl.chapters.find((x) => x.id === route.sub)
    if (pl.id === 'wanju') {
      return (
        <div className="v-doc">
          <DocView key="plan-wanju2" docKey="plan-wanju2" idPrefix="plan-wanju2~" content={WJ2} title="완주군 Ⅱ. 현황 및 여건 분석"
            fileName="완주군_2장_공간적입지" memoToggle={false} />
        </div>
      )
    }
    if (c.id === '3') {
      return (
        <div className="v-doc">
          <DocView key="plan3" docKey="plan3" content={CH3} title="정선군 Ⅲ. 기본구상" fileName="정선군_기본구상" />
        </div>
      )
    }
    return <Empty kicker="정선군 농촌공간 재구조화 및 재생 기본계획(안)" title={`${c.no}. ${c.name}`} hint={c.hint}
      note={Number(c.id) >= 4 ? '장 구성은 원주시 기본계획서(제1~6장)를 따랐습니다. 정선 목차가 정해지면 이름을 바꿉니다.' : '0610 취합본에 초안이 있습니다. 정리되면 이 자리에 넣습니다.'}
      back={() => go({ cat: 'plan', pc: 'jeongseon', sub: '3' })} backLabel="Ⅲ. 기본구상 보기" />
  }
  if (route.cat === 'consult') {
    return (
      <div className="v-consult">
        <ConsultApp key={route.sub} city={route.sub} />
      </div>
    )
  }
  if (route.cat === 'issue') {
    const t = county.towns.find((x) => x.id === route.sub)
    if (!t) return <TownPick county={county} go={go} />
    if (TOWN_DOCS[t.id]) {
      return (
        <div className="v-doc v-hw">
          <DocView key={`iss-${t.id}`} docKey={`iss-${t.id}`} idPrefix={`iss-${t.id}~`} content={TOWN_DOCS[t.id]} title={`${t.name} 지역현안 및 발전방향`}
            fileName={`${t.name}_지역현안`} mainClass="hwbody" memoToggle={false} blockSel={HW_BLOCKS} onRootClick={t.id === 'hwaam' ? hwaamClick : undefined} />
        </div>
      )
    }
    return <Empty kicker={`${county.name} · 읍·면 지역현안 및 발전방향`} title={`${t.name} 지역현안 및 발전방향`}
      hint="지역 사업 추진 현황 · 주요 자원 · 지역현안 및 잠재력 · 특화지구 및 발전방향 · 지도(GIS) 표기안"
      note="화암면 문서와 같은 틀로 작성합니다."
      back={() => go({ cat: 'issue', county: county.id, sub: 'hwaam' })} backLabel="화암면 보기" />
  }
  return <Home go={go} stats={stats} open={open} reload={reload} />
}

/* 화암면 문서 : 코멘트 달 수 있는 단위, CSV 내려받기 버튼 */
const HW_BLOCKS = 'p, li, tr, h2, h3, h4, h5, h6, figure, dt, .fact-box, .vision'
function hwaamClick(e) {
  if (!e.target.closest('#dl')) return false
  const PTS = HWAAM.PTS
  if (!PTS.length) return true
  const cols = Object.keys(PTS[0])
  const esc = (v) => { v = String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
  const txt = '﻿' + [cols.join(','), ...PTS.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }))
  a.download = '화암면_GIS_표기지점.csv'
  document.body.appendChild(a); a.click(); a.remove()
  return true
}

function Empty({ kicker, title, hint, note, back, backLabel }) {
  return (
    <main className="hub-page hub-empty">
      <p className="hub-kicker">{kicker}</p>
      <h1>{title}</h1>
      <div className="hub-emptybox">
        <span className="hub-tag">작성 전</span>
        <p>아직 내용이 없습니다. 자리만 만들어 두었습니다.</p>
        {hint && <p className="hub-dim">들어갈 내용: {hint}</p>}
        {note && <p className="hub-dim">{note}</p>}
      </div>
      {back && <button type="button" className="hub-btn" onClick={back}>{backLabel} →</button>}
    </main>
  )
}

function TownPick({ county, go }) {
  return (
    <main className="hub-page">
      <p className="hub-kicker">현안 및 발전방향</p>
      <h1>{county.name}</h1>
      <div className="hub-grid">
        {county.towns.map((t) => (
          <button key={t.id} type="button" className={`hub-card sm ${t.ready ? '' : 'empty'}`} onClick={() => go({ cat: 'issue', county: county.id, sub: t.id })}>
            <b>{t.name}</b><span>{t.ready ? '작성됨' : '작성 전'}</span>
          </button>
        ))}
      </div>
    </main>
  )
}

/* ───────── 한눈에 보기 ───────── */
const fmt = (t) => {
  if (!t) return ''
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}.${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function Home({ go, stats, open, reload }) {
  const [msg, setMsg] = useState('')
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2400) }

  const consult = CITIES.map((c) => {
    const items = c.data.items
    const done = items.filter((i) => stats.checks[i.id]?.done).length
    const must = items.filter((i) => i.pri === '필수')
    const mustLeft = must.filter((i) => !stats.checks[i.id]?.done).length
    return { ...c, total: items.length, done, mustLeft, open: open[c.id] }
  })
  const plan3All = stats.plan.filter((c) => docOf(c) === 'plan3')
  const issAll = stats.plan.filter((c) => docOf(c).startsWith('iss-'))
  const townsDone = COUNTIES[0].towns.filter((t) => t.ready).length

  /* 최근 코멘트 (모든 곳) */
  const recent = useMemo(() => {
    const all = []
    stats.plan.forEach((c) => {
      const d = DOCS[docOf(c)]
      if (!d) return
      all.push({ ...c, where: d.label, route: d.route, sec: c.section })
      ;(c.replies || []).forEach((r) => all.push({ ...r, reply: true, done: c.done, where: d.label, route: d.route, sec: c.section, parent: c.text }))
    })
    stats.consult.forEach((c) => {
      const city = cityOfKey(c.key)
      const where = `컨설팅 · ${CITIES.find((x) => x.id === city).name}`
      const route = { cat: 'consult', sub: city }
      all.push({ ...c, where, route, sec: c.section || c.key })
      ;(c.replies || []).forEach((r) => all.push({ ...r, reply: true, done: c.done, where, route, sec: c.section || c.key, parent: c.text }))
    })
    return all.filter((x) => x.at).sort((a, b) => b.at - a.at).slice(0, 12)
  }, [stats])

  const copyOpen = async () => {
    const d = new Date()
    const L = [`[미반영 코멘트 전체] ${d.getMonth() + 1}.${d.getDate()} 기준`]
    const group = (label, list) => {
      const l = list.filter((c) => !c.done)
      if (!l.length) return
      L.push('', `■ ${label} (${l.length}건)`)
      l.forEach((c) => {
        L.push(`  - [${c.section || c.key || '본문'}] ${c.author || '익명'}: ${c.text}`)
        ;(c.replies || []).forEach((r) => L.push(`      ↳ ${r.author || '익명'}: ${r.text}`))
      })
    }
    group('기본계획 Ⅲ. 기본구상', plan3All)
    group('완주군 Ⅱ. 공간적 입지', stats.plan.filter((c) => docOf(c) === 'plan-wanju2'))
    CITIES.forEach((c) => group(`컨설팅 · ${c.name}`, stats.consult.filter((x) => cityOfKey(x.key) === c.id)))
    COUNTIES[0].towns.forEach((t) => group(`현안 · ${t.name}`, stats.plan.filter((c) => docOf(c) === `iss-${t.id}`)))
    if (L.length === 1) L.push('', '미반영 코멘트가 없습니다.')
    const t = L.join('\n')
    try { await navigator.clipboard.writeText(t); say('복사했습니다 — 카톡·메일에 붙여 넣으세요') } catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); say('복사했습니다') } catch { say('복사가 막혀 있습니다') }
      ta.remove()
    }
  }

  return (
    <main className="hub-page hub-home">
      <p className="hub-kicker">정선군 · 원주시 농촌공간 재구조화 및 재생 기본계획</p>
      <h1>한눈에 보기</h1>
      <p className="hub-lead">기본계획(안)·컨설팅 수정표·읍면 현안 문서를 한 곳에 모았습니다. 숫자는 <b>아직 반영하지 않은 코멘트</b>와 <b>수정 완료 체크</b>입니다.
        <span className="hub-dim"> · {stats.at ? `${fmt(stats.at)} 기준` : '불러오는 중'}{stats.err ? ` · ${stats.err}` : ''}</span>
      </p>
      <div className="hub-tools">
        <button type="button" className="hub-btn" onClick={copyOpen}>미반영 코멘트 전체 복사</button>
        <button type="button" className="hub-btn ghost" onClick={reload}>새로고침</button>
        {msg && <span className="hub-msg" role="status">{msg}</span>}
      </div>

      <div className="hub-grid three">
        <section className="hub-card">
          <p className="hub-ck">기본계획(안)</p>
          <h2>정선 1~6장 · 완주 2장</h2>
          <ul className="hub-chaps">
            {CHAPTERS.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => go({ cat: 'plan', pc: 'jeongseon', sub: c.id })} className={c.ready ? '' : 'empty'}>
                  <span>{c.no}. {c.name}</span>
                  <em>{c.id === '3' ? (open.plan3 ? `코멘트 ${open.plan3}` : '작성됨') : '작성 전'}</em>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => go({ cat: 'plan', pc: 'wanju', sub: '2' })}>
                <span>완주 Ⅱ. 공간적 입지</span>
                <em>{open['plan-wanju2'] ? `코멘트 ${open['plan-wanju2']}` : '작성됨'}</em>
              </button>
            </li>
          </ul>
          <p className="hub-dim">정선 Ⅲ장 코멘트 {plan3All.length}건 중 미반영 {open.plan3}건</p>
        </section>

        <section className="hub-card">
          <p className="hub-ck">컨설팅 수정표</p>
          <h2>정선 · 원주</h2>
          {consult.map((c) => (
            <button key={c.id} type="button" className="hub-prog" onClick={() => go({ cat: 'consult', sub: c.id })}>
              <span className="hub-pt"><b>{c.full}</b> <span className="hub-dim">{c.when}</span></span>
              <span className="hub-bar" aria-hidden="true"><i style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} /></span>
              <span className="hub-pn">수정 완료 <b>{c.done}</b>/{c.total} · 필수 남음 {c.mustLeft} · 미반영 의견 {c.open}</span>
            </button>
          ))}
        </section>

        <section className="hub-card">
          <p className="hub-ck">현안 및 발전방향</p>
          <h2>정선군 9개 읍·면</h2>
          <div className="hub-towns">
            {COUNTIES[0].towns.map((t) => (
              <button key={t.id} type="button" className={t.ready ? 'on' : ''} onClick={() => go({ cat: 'issue', county: 'jeongseon', sub: t.id })}>{t.name}</button>
            ))}
          </div>
          <p className="hub-dim">작성 {townsDone}/{COUNTIES[0].towns.length} · 현안 코멘트 {issAll.length}건 중 미반영 {issOpen(open)}건</p>
        </section>
      </div>

      <section className="hub-recent">
        <h2>최근 코멘트</h2>
        {recent.length ? (
          <ol>
            {recent.map((r) => (
              <li key={r.id + (r.reply ? 'r' : '')}>
                <button type="button" onClick={() => go(r.route)}>
                  <span className="hub-rw">{r.where}{r.sec ? ` › ${r.sec}` : ''}</span>
                  <span className="hub-rt">{r.reply ? <span className="hub-dim">↳ 답변 · </span> : null}{r.text}</span>
                  <span className="hub-rm">{r.author || '익명'} · {fmt(r.at)} · {r.done ? '반영 완료' : '미반영'}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="hub-dim">아직 코멘트가 없습니다. 각 문서에서 <b>코멘트 달기</b>를 누르고 문단·표의 행을 누르면 남길 수 있습니다.</p>}
      </section>
    </main>
  )
}
