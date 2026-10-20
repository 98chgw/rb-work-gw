import React, { useMemo, useRef, useState } from 'react'
import { toText } from '../comments.js'

const fmt = (t) => {
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}.${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const hms = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` }

export default function CommentPanel({
  open, onClose, comments, actions, remote, sync, onRefresh,
  pending, setPending, author, setAuthor, order, onJump, focus, setFocus, title,
}) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('open')
  const [replyFor, setReplyFor] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [askDel, setAskDel] = useState(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2400) }

  const list = useMemo(() => {
    let l = comments
    if (focus) l = l.filter((c) => (focus.endsWith(':') ? c.key.startsWith(focus) : c.key === focus))
    else if (tab === 'open') l = l.filter((c) => !c.done)
    else if (tab === 'done') l = l.filter((c) => c.done)
    return [...l].sort((a, b) => (order[a.key] ?? 1e9) - (order[b.key] ?? 1e9) || a.at - b.at)
  }, [comments, tab, focus, order])
  const openCnt = comments.filter((c) => !c.done).length

  const add = () => {
    if (!text.trim() || !pending) return
    actions.add({
      id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      key: pending.key, excerpt: pending.excerpt, section: pending.section,
      author: author.trim() || '익명', text: text.trim(), at: Date.now(), done: false, replies: [],
    })
    setText(''); setPending(null); setFocus(null); setTab('open')
  }
  const reply = (id) => {
    if (!replyText.trim()) return
    actions.reply(id, { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, author: author.trim() || '익명', text: replyText.trim(), at: Date.now() })
    setReplyText(''); setReplyFor(null)
  }
  const copyText = async () => {
    const t = toText(comments, order, title)
    try { await navigator.clipboard.writeText(t); flash('텍스트로 복사했습니다') }
    catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); flash('텍스트로 복사했습니다') } catch { flash('복사하지 못했습니다') }
      ta.remove()
    }
  }
  const saveFile = () => {
    const blob = new Blob([JSON.stringify(comments, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    const d = new Date()
    a.href = URL.createObjectURL(blob)
    a.download = `원주_컨설팅_수정표_코멘트_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const loadFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(async (t) => {
      let inc
      try { inc = JSON.parse(t); if (!Array.isArray(inc)) throw new Error() } catch { flash('코멘트 파일 형식이 아닙니다'); return }
      const n = await actions.importList(inc)
      flash(`불러왔습니다 (새 코멘트 ${n}건)`)
    })
    e.target.value = ''
  }

  if (!open) return null
  return (
    <aside className="cm-panel" aria-label="코멘트">
      <div className="cm-head">
        <b>코멘트</b>
        <span className="cm-sub">미반영 {openCnt} · 전체 {comments.length}</span>
        <button type="button" className="btn" onClick={onClose}>닫기</button>
      </div>

      <div className="cm-body">
        <div className={`cm-sync ${remote ? sync.state : 'local'}`}>
          {remote
            ? sync.state === 'error'
              ? <>공유 저장소 연결 오류 — {sync.msg || '네트워크 확인'} <button type="button" className="btn" onClick={onRefresh}>다시 시도</button></>
              : sync.state === 'loading' ? '공유 저장소에서 불러오는 중…'
                : <>공유 저장소 연결됨 · 모든 PC에서 같은 코멘트가 보입니다 · {hms(sync.at)} 갱신 <button type="button" className="btn" onClick={onRefresh}>새로고침</button></>
            : '이 브라우저에만 저장됩니다 (공유하려면 .env에 Supabase 설정)'}
        </div>

        <label className="cm-lab">
          작성자
          <input id="cm-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="OOO" />
        </label>

        {pending ? (
          <div className="cm-new">
            <div className="cm-where">{pending.section || '본문'}</div>
            <blockquote>{pending.excerpt.slice(0, 110)}{pending.excerpt.length > 110 ? '…' : ''}</blockquote>
            <textarea id="cm-text" autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="이 부분에 대한 의견을 적어 주세요 (Ctrl+Enter 저장)"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add() }} />
            <div className="cm-row">
              <button type="button" className="btn pri" onClick={add} disabled={!text.trim()}>코멘트 저장</button>
              <button type="button" className="btn" onClick={() => { setPending(null); setText('') }}>취소</button>
            </div>
          </div>
        ) : (
          <p className="cm-hint">위쪽 <b>코멘트 달기</b>를 켠 뒤 카드의 제목·지적·지금·고친다면 문단, 손메모 줄, 정리표의 행을 누르면 그 자리에 코멘트를 남길 수 있습니다.</p>
        )}

        {focus ? (
          <div className="cm-row"><span className="cm-sub">{focus.endsWith(':') ? `${focus.slice(0, -1)} 카드의 코멘트만 보는 중` : '선택한 위치의 코멘트만 보는 중'}</span>
            <button type="button" className="btn" onClick={() => setFocus(null)}>전체 보기</button></div>
        ) : (
          <div className="cm-tabs" role="tablist">
            {[['open', `미반영 ${openCnt}`], ['done', `반영 완료 ${comments.length - openCnt}`], ['all', '전체']].map(([k, l]) => (
              <button type="button" key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        )}

        {list.length === 0 && <p className="cm-empty">표시할 코멘트가 없습니다.</p>}
        {list.map((c) => (
          <div key={c.id} className={`cm-card ${c.done ? 'done' : ''}`}>
            <button type="button" className="cm-jump" onClick={() => onJump(c.key)}>
              <span className="cm-where">{c.section || c.key}</span>
              <span className="cm-ex">“{(c.excerpt || '').slice(0, 64)}{(c.excerpt || '').length > 64 ? '…' : ''}”</span>
            </button>
            <div className="cm-text">{c.text}</div>
            <div className="cm-meta">{c.author} · {fmt(c.at)}{c.done ? ' · 반영 완료' : ''}</div>
            {(c.replies || []).map((r, n) => (
              <div key={n} className="cm-reply"><b>{r.author}</b> {r.text} <span className="cm-meta">{fmt(r.at)}</span></div>
            ))}
            {replyFor === c.id ? (
              <div className="cm-new">
                <textarea rows={2} autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="답변 (예: 반영했습니다)"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) reply(c.id) }} />
                <div className="cm-row">
                  <button type="button" className="btn pri" onClick={() => reply(c.id)} disabled={!replyText.trim()}>답변 저장</button>
                  <button type="button" className="btn" onClick={() => { setReplyFor(null); setReplyText('') }}>취소</button>
                </div>
              </div>
            ) : askDel === c.id ? (
              <div className="cm-row warn">
                <span>{remote ? '모든 사람의 화면에서 지워집니다.' : '이 코멘트를 지웁니다.'}</span>
                <button type="button" className="btn danger" onClick={() => { actions.remove(c.id); setAskDel(null) }}>지우기</button>
                <button type="button" className="btn" onClick={() => setAskDel(null)}>그대로 두기</button>
              </div>
            ) : (
              <div className="cm-row">
                <button type="button" className="btn" onClick={() => actions.toggleDone(c)}>{c.done ? '미반영으로 되돌리기' : '반영 완료'}</button>
                <button type="button" className="btn" onClick={() => { setReplyFor(c.id); setReplyText('') }}>답변</button>
                <button type="button" className="btn" onClick={() => setAskDel(c.id)}>삭제</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="cm-foot">
        <button type="button" className="btn" onClick={copyText} disabled={!comments.length}>텍스트로 복사</button>
        <button type="button" className="btn" onClick={saveFile} disabled={!comments.length}>파일로 저장</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>파일 불러오기</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={loadFile} />
        {msg && <span className="cm-msg" role="status">{msg}</span>}
      </div>
    </aside>
  )
}
