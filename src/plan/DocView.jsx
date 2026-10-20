import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Comments from './Comments.jsx'
import { decorate, docOf, BLOCK_SEL } from './comments.js'
import { REMOTE, fetchAll, addComment, addReply, setDone, removeComment, importMany, localOnlyComments, clearLocal, backupLocal, migrateLocal } from './store.js'

/* 본문 텍스트 노드에서만 검색어를 찾아 <mark>로 감싼다 (SVG·스크립트 제외) */
function highlight(root, query) {
  if (!query) return []
  const q = query.toLowerCase()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement
      if (!p || p.closest('svg, script, style')) return NodeFilter.FILTER_REJECT
      return node.nodeValue.toLowerCase().includes(q) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  const marks = []
  for (const node of nodes) {
    const text = node.nodeValue
    const lower = text.toLowerCase()
    const frag = document.createDocumentFragment()
    let pos = 0
    let idx = lower.indexOf(q)
    while (idx !== -1) {
      if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)))
      const m = document.createElement('mark')
      m.className = 'hit'
      m.textContent = text.slice(idx, idx + q.length)
      frag.appendChild(m)
      marks.push(m)
      pos = idx + q.length
      idx = lower.indexOf(q, pos)
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)))
    node.parentNode.replaceChild(frag, node)
  }
  return marks
}

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* 저장 불가 환경은 무시 */ }
}

/* 문서 보기 (기본계획 각 장 · 읍·면 현안 문서 공용)
   content = { COVER_HTML, MAIN_HTML, FOOTER_HTML, TOC } */
export default function DocView({
  docKey, content, title, mainClass = '', blockSel = BLOCK_SEL, idPrefix = '', fileName = '정선군_기본구상', onRootClick, memoToggle = true,
}) {
  const { COVER_HTML, MAIN_HTML, FOOTER_HTML, TOC } = content
  const mainRef = useRef(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [marks, setMarks] = useState([])
  const [cur, setCur] = useState(0)
  const [showSrc, setShowSrc] = useState(() => readPref('js3.showSrc', true))
  const [showMemo, setShowMemo] = useState(() => readPref('js3.showMemo', true))
  const [active, setActive] = useState(TOC[0]?.id)
  /* 코멘트 */
  const [allComments, setComments] = useState([])
  const comments = useMemo(() => allComments.filter((c) => docOf(c) === docKey), [allComments, docKey])
  const [sync, setSync] = useState({ state: 'loading', at: 0, msg: '' })
  const [localCount, setLocalCount] = useState(() => (REMOTE ? localOnlyComments().length : 0))
  const [commentMode, setCommentMode] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pending, setPending] = useState(null)
  const [focusIdx, setFocusIdx] = useState(null)
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('js3.author') || '' } catch { return '' } })
  const [deco, setDeco] = useState({ pos: {}, blocks: [] })
  const modeRef = useRef(false)
  const decoRef = useRef(deco)
  modeRef.current = commentMode
  decoRef.current = deco

  /* 코멘트 불러오기 : 공유 저장소면 15초마다, 창으로 돌아올 때마다 새로고침 */
  const refresh = async () => {
    try {
      const list = await fetchAll()
      setComments(list)
      setSync({ state: 'ok', at: Date.now(), msg: '' })
    } catch (e) {
      setSync((s) => ({ ...s, state: 'error', msg: String(e.message || e) }))
    }
  }
  const [notice, setNotice] = useState('')
  useEffect(() => {
    refresh()
    if (!REMOTE) return
    /* 예전 코멘트 자동 이전 : 이 PC 브라우저에만 있던 코멘트를 열자마자 공유 저장소로 올림 */
    migrateLocal()
      .then((r) => {
        if (!r) return
        setLocalCount(0)
        setNotice(`이 PC에만 저장돼 있던 코멘트 ${r.total}건을 공유 저장소로 옮겼습니다. 이제 모든 PC에서 보입니다.`)
        refresh()
      })
      .catch((e) => setSync((s) => ({ ...s, state: 'error', msg: '예전 코멘트 이전 실패(이 PC에 그대로 보관 중) — ' + String(e.message || e) })))
    const t = setInterval(refresh, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 작업 후 즉시 화면 반영 → 저장 → 저장소 기준으로 다시 불러오기 */
  const run = async (optimistic, job) => {
    if (optimistic) setComments(optimistic)
    try { await job(); } catch (e) { setSync((s) => ({ ...s, state: 'error', msg: String(e.message || e) })) }
    await refresh()
  }
  const actions = {
    add: (c) => run((l) => [...l, c], () => addComment(c)),
    reply: (id, r) => run((l) => l.map((c) => (c.id === id ? { ...c, replies: [...(c.replies || []), r] } : c)), () => addReply(id, r)),
    toggleDone: (c) => run((l) => l.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)), () => setDone(c.id, !c.done)),
    remove: (id) => run((l) => l.filter((c) => c.id !== id), () => removeComment(id)),
    importList: async (list) => {
      let n = 0
      await run(null, async () => { n = await importMany(list, allComments) })
      return n
    },
    uploadLocal: async () => {
      const local = localOnlyComments()
      let n = 0
      await run(null, async () => { n = await importMany(local, allComments); backupLocal(local); clearLocal() })
      setLocalCount(0)
      return n
    },
  }
  useEffect(() => { try { localStorage.setItem('js3.author', author) } catch { /* 무시 */ } }, [author])
  useEffect(() => writePref('js3.showSrc', showSrc), [showSrc])
  useEffect(() => writePref('js3.showMemo', showMemo), [showMemo])

  /* 입력 지연 처리 */
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220)
    return () => clearTimeout(t)
  }, [query])

  /* 본문은 React가 아닌 DOM으로 직접 관리 → 검색 시 원문으로 되돌린 뒤 다시 표시 */
  useLayoutEffect(() => {
    const root = mainRef.current
    if (!root) return
    root.innerHTML = MAIN_HTML
    if (!debounced) window.scrollTo(0, 0)
    const found = debounced.length >= 2 ? highlight(root, debounced) : []
    setMarks(found)
    setCur(0)
  }, [debounced, MAIN_HTML])

  /* 코멘트 위치 표시 (본문을 다시 그린 뒤, 또는 코멘트가 바뀔 때) */
  useLayoutEffect(() => {
    const d = decorate(mainRef.current, comments, blockSel)
    setDeco({ pos: d.pos || {}, blocks: d.blocks || [] })
  }, [debounced, comments, MAIN_HTML, blockSel])

  /* 본문 클릭·마우스오버 (코멘트 달기 모드) */
  useEffect(() => {
    const root = mainRef.current
    if (!root) return
    let hovered = null
    const onClick = (e) => {
      if (onRootClick && onRootClick(e)) return
      const badge = e.target.closest('.cm-badge')
      if (badge) {
        e.preventDefault()
        setPending(null)
        setFocusIdx(Number(badge.dataset.blkRef))
        setPanelOpen(true)
        return
      }
      if (!modeRef.current) return
      const el = e.target.closest('[data-blk]')
      if (!el || !root.contains(el)) return
      e.preventDefault()
      const i = Number(el.dataset.blk)
      const b = decoRef.current.blocks[i]
      if (!b) return
      setPending({ idx: i, excerpt: b.text.slice(0, 160), section: b.section })
      setFocusIdx(null)
      setPanelOpen(true)
    }
    const onOver = (e) => {
      if (!modeRef.current) return
      const el = e.target.closest('[data-blk]')
      if (el === hovered) return
      hovered?.classList.remove('cm-hover')
      hovered = el && root.contains(el) ? el : null
      hovered?.classList.add('cm-hover')
    }
    const onOut = (e) => { if (!root.contains(e.relatedTarget)) { hovered?.classList.remove('cm-hover'); hovered = null } }
    root.addEventListener('click', onClick)
    root.addEventListener('mouseover', onOver)
    root.addEventListener('mouseout', onOut)
    return () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('mouseover', onOver)
      root.removeEventListener('mouseout', onOut)
      hovered?.classList.remove('cm-hover')
    }
  }, [commentMode, onRootClick, MAIN_HTML])

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape' && modeRef.current && document.activeElement?.tagName !== 'INPUT') setCommentMode(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  const jumpTo = (i) => {
    const el = mainRef.current?.querySelector(`[data-blk="${i}"]`)
    if (!el) return
    if (window.innerWidth < 900) setPanelOpen(false)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.remove('cm-flash')
    void el.offsetWidth
    el.classList.add('cm-flash')
  }
  const openCnt = comments.filter((c) => !c.done).length

  useEffect(() => {
    marks.forEach((m, i) => m.classList.toggle('cur', i === cur))
    if (marks[cur]) marks[cur].scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [marks, cur])

  /* 목차 현재 위치 표시 : 화면 상단을 지난 마지막 제목을 현재 절로 본다 */
  useEffect(() => {
    let raf = 0
    const calc = () => {
      raf = 0
      let cur = TOC[0]?.id
      for (const t of TOC) {
        const el = document.getElementById(t.id)
        if (el && el.getBoundingClientRect().top <= 140) cur = t.id
      }
      setActive(cur)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(calc) }
    calc()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [debounced, TOC])

  const step = (d) => setCur((c) => (marks.length ? (c + d + marks.length) % marks.length : 0))
  const onKey = (e) => {
    if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
    if (e.key === 'Escape') setQuery('')
  }

  const wrapClass = useMemo(
    () => ['wrap', showSrc ? '' : 'hide-src', showMemo ? '' : 'hide-memo', commentMode ? 'cm-mode' : ''].join(' ').trim(),
    [showSrc, showMemo, commentMode]
  )

  return (
    <div className={panelOpen ? 'with-panel' : ''}>
      <div className="bar">
        <div className="bar-in">
          <span className="bar-title">{title}</span>
          <div className="search" role="search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="본문 검색 (2글자 이상)"
              aria-label="본문 검색"
            />
            <span className="cnt" aria-live="polite">
              {debounced.length >= 2 ? (marks.length ? `${cur + 1} / ${marks.length}` : '0건') : ''}
            </span>
            <button className="btn" onClick={() => step(-1)} disabled={!marks.length} aria-label="이전 결과">▲</button>
            <button className="btn" onClick={() => step(1)} disabled={!marks.length} aria-label="다음 결과">▼</button>
          </div>
          <button className="btn" aria-pressed={!showSrc} onClick={() => setShowSrc((v) => !v)}>
            출처 숨기기
          </button>
          {memoToggle && (
            <button className="btn" aria-pressed={!showMemo} onClick={() => setShowMemo((v) => !v)}>
              작업메모·검토박스 숨기기
            </button>
          )}
          <button className="btn cm-btn" aria-pressed={commentMode} onClick={() => setCommentMode((v) => !v)}>
            코멘트 달기
          </button>
          <button className="btn" aria-pressed={panelOpen} onClick={() => { setFocusIdx(null); setPanelOpen((v) => !v) }}>
            코멘트 목록{openCnt ? ` (${openCnt})` : ''}
          </button>
          <button className="btn" onClick={() => window.print()}>인쇄</button>
        </div>
        {notice && (
          <div className="cm-toast" role="status">{notice} <button className="btn" onClick={() => setNotice('')}>확인</button></div>
        )}
        {commentMode && (
          <div className="cm-strip">코멘트 달기 모드 — 의견을 남길 문단·표의 행·그림을 누르세요 (Esc로 종료)</div>
        )}
      </div>

      <div className={wrapClass}>
        <header className="cover" dangerouslySetInnerHTML={{ __html: COVER_HTML }} />

        <nav aria-label="목차">
          <h2>목차</h2>
          <ol>
            {TOC.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className={[t.level === 2 ? 'lv2' : t.level === 3 ? 'lv3' : '', active === t.id ? 'on' : ''].join(' ').trim()}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main ref={mainRef} className={mainClass || undefined} />

        {FOOTER_HTML ? <footer dangerouslySetInnerHTML={{ __html: FOOTER_HTML }} /> : null}
      </div>

      <Comments
        open={panelOpen} onClose={() => { setPanelOpen(false); setPending(null); setFocusIdx(null) }}
        comments={comments} actions={actions} remote={REMOTE} sync={sync} onRefresh={refresh} localCount={localCount}
        pending={pending} setPending={setPending}
        author={author} setAuthor={setAuthor}
        pos={deco.pos} blocks={deco.blocks} onJump={jumpTo}
        focusIdx={focusIdx} setFocusIdx={setFocusIdx}
        idPrefix={idPrefix} docTitle={title} fileName={fileName}
      />
    </div>
  )
}
