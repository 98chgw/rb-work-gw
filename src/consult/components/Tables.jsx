import React, { useContext } from 'react'
import { Badge, CmCtx } from './ItemCard.jsx'

function Tick({ id, checks, onToggle, label }) {
  const done = !!checks[id]?.done
  return (
    <button type="button" className={`ck sm ${done ? 'on' : ''}`} onClick={() => onToggle(id)} aria-pressed={done} aria-label={`${label} 완료 표시`}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
    </button>
  )
}

function useCm() {
  const { counts } = useContext(CmCtx)
  return (k) => (counts[k] ? (counts[k].open ? 'open' : 'done') : undefined)
}

export function Ledger({ data, pfx = '', checks, onToggle, note }) {
  const cm = useCm()
  const cls = (id) => (checks[id]?.done ? 'is-done' : '')
  return (
    <section id="ledger" className="grp ledger" data-cs="모순 · 표 오기 · 오탈자">
      <header className="grp-h">
        <h2>모순 · 표 오기 · 오탈자</h2>
        <p>{note || '녹취·손메모에는 없고 계획서를 읽으며 찾은 것입니다. 쪽수는 계획서 아래쪽 번호입니다.'}</p>
      </header>

      <h3 className="sub-h">본문끼리 어긋나는 곳 <em>{data.contra.length}</em></h3>
      <div className="tw"><table className="lt">
        <thead><tr><th className="c-ck" /><th>번호</th><th>쪽</th><th>어디와 어디</th><th>한쪽</th><th>다른 쪽</th><th>수정 예시</th></tr></thead>
        <tbody>{data.contra.map((c) => (
          <tr key={c.id} id={c.id} className={cls(c.id)} data-ck={c.id} data-cm={cm(c.id)}>
            <td className="c-ck"><Tick id={c.id} checks={checks} onToggle={onToggle} label={c.id} /></td>
            <td className="mono red">{c.id}</td><td className="mono">{c.page}</td><td>{c.where}</td><td>{c.a}</td><td>{c.b}</td>
            <td className="ok">{c.fix} <Badge k={c.id} /></td>
          </tr>))}
        </tbody></table></div>

      <h3 className="sub-h">표 제목·숫자 오기 <em>{data.tableErr.length}</em></h3>
      <div className="tw"><table className="lt">
        <thead><tr><th className="c-ck" /><th>번호</th><th>쪽</th><th>지금</th><th>수정 예시</th></tr></thead>
        <tbody>{data.tableErr.map((c) => (
          <tr key={c.id} id={c.id} className={cls(c.id)} data-ck={c.id} data-cm={cm(c.id)}>
            <td className="c-ck"><Tick id={c.id} checks={checks} onToggle={onToggle} label={c.id} /></td>
            <td className="mono red">{c.id}</td><td className="mono">{c.page}</td><td>{c.now}</td>
            <td className="ok">{c.fix} <Badge k={c.id} /></td>
          </tr>))}
        </tbody></table></div>

      <h3 className="sub-h">오탈자 <em>{data.typos.length}</em></h3>
      <div className="tw"><table className="lt typo">
        <thead><tr><th className="c-ck" /><th>쪽</th><th>위치</th><th>지금</th><th>수정 예시</th></tr></thead>
        <tbody>{data.typos.map((t, n) => {
          const id = `${pfx}typo-${n}`
          return (
            <tr key={id} className={cls(id)} data-ck={id} data-cm={cm(id)}>
              <td className="c-ck"><Tick id={id} checks={checks} onToggle={onToggle} label={t.now} /></td>
              <td className="mono">{t.page}</td><td>{t.where}</td><td><del>{t.now}</del></td>
              <td><ins>{t.fix}</ins> <Badge k={id} /></td>
            </tr>
          )
        })}</tbody></table></div>
    </section>
  )
}

export function Requests({ data, pfx = '', checks, onToggle }) {
  const cm = useCm()
  return (
    <section id="requests" className="grp" data-cs="받아야 할 자료">
      <header className="grp-h">
        <h2>받아야 할 자료</h2>
        <p>수정 예시의 ○○ 칸을 채우려면 필요한 자료입니다. 받는 대로 체크하세요.</p>
      </header>
      <ul className="reqs">
        {data.dataReq.map((r, n) => {
          const id = `${pfx}req-${n}`
          return (
            <li key={id} className={checks[id]?.done ? 'is-done' : ''} data-ck={id} data-cm={cm(id)}>
              <Tick id={id} checks={checks} onToggle={onToggle} label={r.text} />
              <span className="r-cat">{r.cat}</span>
              <span className="r-text">{r.text} <Badge k={id} /></span>
              <a className="mono red" href={`#${r.ref.split(/[·\s]/)[0]}`}>{r.ref}</a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function MemoLedger({ data, pfx = '' }) {
  const cm = useCm()
  return (
    <section id="memos" className="grp" data-cs="손메모 대조">
      <header className="grp-h">
        <h2>손메모 대조</h2>
        <p>계획서에 검은 펜으로 쓴 메모 {data.memos.length}곳을 쪽 순서로 옮겼습니다. 동그라미·화살표만 있는 곳은 무엇에 표시했는지 적었습니다. 메모는 p.7~p.101에만 있습니다. 글씨를 잘못 읽은 곳이 있으면 그 줄에 코멘트를 남겨 주세요.</p>
      </header>
      <div className="tw"><table className="lt memo-t">
        <thead><tr><th>쪽</th><th>메모 (읽은 그대로)</th><th>카드</th></tr></thead>
        <tbody>{data.memos.map((m, n) => {
          const id = `${pfx}memo-${n}`
          return (
            <tr key={id} data-ck={id} data-cm={cm(id)}>
              <td className="mono">{m.page}</td>
              <td className="pen">{m.text}</td>
              <td><a className="mono red" href={`#${m.item}`}>{m.item}</a> <span className="dim">{m.title}</span> <Badge k={id} /></td>
            </tr>
          )
        })}</tbody></table></div>
    </section>
  )
}

export function Unresolved({ data, note }) {
  const cm = useCm()
  return (
    <section id="unresolved" className="grp unres" data-cs="녹음으로 확인할 곳">
      <header className="grp-h">
        <h2>녹음으로 확인할 곳</h2>
        <p>{note || '손메모·계획서·녹취 앞뒤로도 풀리지 않은 곳만 남겼습니다. 녹음 시각을 찾아 들어 보고, 그 줄에 코멘트로 들은 내용을 남겨 주시면 반영하겠습니다.'}</p>
      </header>
      <ol className="un-list">
        {data.unclear.map((u) => (
          <li key={u.id} id={u.id} data-ck={u.id} data-cm={cm(u.id)}>
            <div className="un-h">
              <span className="mono red">{u.id}</span>
              <span className="un-when">녹음 {u.when}</span>
              <span className="dim">{u.who}</span>
              <a className="mono" href={`#${u.card}`}>관련 카드 {u.card}</a>
              <Badge k={u.id} />
            </div>
            <p className="un-heard">{u.heard}</p>
            <p className="un-ask"><b>들어볼 것</b>{u.ask}</p>
            <p className="un-now">{u.now}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
