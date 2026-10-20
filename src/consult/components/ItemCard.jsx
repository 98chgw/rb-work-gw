import React, { createContext, memo, useContext, useLayoutEffect, useRef } from 'react'
import { decorateRaw } from '../comments.js'

/* 코멘트 개수(키별)를 카드·표에 전달 */
export const CmCtx = createContext({ counts: {} })

export function Badge({ k }) {
  const { counts } = useContext(CmCtx)
  const s = counts[k]
  if (!s) return null
  return (
    <button type="button" className={`cm-badge ${s.open ? '' : 'done'}`} data-badge-for={k}
      title={s.open ? `미반영 의견 ${s.open}건 — 눌러서 보기` : '반영 완료된 의견 — 눌러서 보기'}>
      {s.open ? `의견 ${s.open}` : '✓'}
    </button>
  )
}

const cmAttr = (counts, k) => (counts[k] ? (counts[k].open ? 'open' : 'done') : undefined)

function FixBody({ id, html }) {
  const ref = useRef(null)
  const { counts } = useContext(CmCtx)
  /* 고친다면 칸은 HTML 문자열이라 안쪽 문단·목록·표 행에 코멘트 키를 직접 붙임 */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const parts = el.querySelectorAll(':scope > p, :scope > ul > li, :scope > ol > li, :scope tr')
    if (parts.length) parts.forEach((p, n) => { p.dataset.ck = `${id}:fix:${n}` })
    else el.dataset.ck = `${id}:fix`
    decorateRaw(el, counts)
  })
  const wrapped = html.replace(/<table class="ex">/g, '<div class="tw"><table class="ex">').replace(/<\/table>/g, '</table></div>')
  return <div ref={ref} className="fix-body" dangerouslySetInnerHTML={{ __html: wrapped }} />
}

function ItemCard({ it, who, group, check, onToggle, cmTotal, onFocus, onPick }) {
  const { counts } = useContext(CmCtx)
  const done = !!check?.done
  const k = (s) => `${it.id}:${s}`
  return (
    <article id={it.id} className={`card ${done ? 'is-done' : ''}`} data-pri={it.pri} data-cs={`${group} › ${it.id} ${it.title}`}>
      <header className="card-h">
        <button type="button" className={`ck ${done ? 'on' : ''}`} onClick={() => onToggle(it.id)} aria-pressed={done} aria-label={`${it.id} 수정 완료 표시`} title={done ? '완료 표시 지우기' : '수정 완료로 표시'}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
        </button>
        <span className="cid">{it.id}</span>
        <h3 data-ck={k('title')} data-cm={cmAttr(counts, k('title'))}>{it.title} <Badge k={k('title')} /></h3>
        <span className={`pri p-${it.pri}`}>{it.pri}</span>
      </header>
      <p className="meta">
        <span className={`who w-${it.who}`}>{who}</span>
        <span className="pg">계획서 {it.page}</span>
        <span>{it.loc}</span>
        {done && check?.by ? <span className="by">✓ {check.by}</span> : null}
      </p>

      {it.memo.length > 0 && (
        <div className="memo">
          <p className="lab">손메모</p>
          <ul>
            {it.memo.map((m, n) => (
              <li key={n} data-ck={k(`memo:${n}`)} data-cm={cmAttr(counts, k(`memo:${n}`))}>
                <span className="mpg">{m.page}</span><span className="pen">{m.text}</span> <Badge k={k(`memo:${n}`)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {it.why && (
        <p className="why" data-ck={k('why')} data-cm={cmAttr(counts, k('why'))}>
          <span className="lab">지적</span>{it.why} <Badge k={k('why')} />
        </p>
      )}

      <div className="cols">
        {it.now && (
          <div className="now" data-ck={k('now')} data-cm={cmAttr(counts, k('now'))}>
            <p className="lab">지금</p>
            <p>{it.now} <Badge k={k('now')} /></p>
          </div>
        )}
        <div className="fix">
          <p className="lab">혹시 수정한다면 (예시)</p>
          <FixBody id={it.id} html={it.fix} />
        </div>
      </div>

      <footer className="card-f">
        <button type="button" className="cm-link" onClick={() => onPick(it.id)}>의견 남기기</button>
        {cmTotal > 0 && <button type="button" className="cm-link has" onClick={() => onFocus(`${it.id}:`)}>이 항목 의견 {cmTotal}</button>}
      </footer>
    </article>
  )
}

export default memo(ItemCard)
