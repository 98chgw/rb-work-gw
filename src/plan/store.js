/* 코멘트 저장소
   - .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_KEY 가 있으면 Supabase(공유) 사용
   - 없으면 이 브라우저(localStorage)에만 저장 */
import { loadComments, saveComments } from './comments.js'

// 기본계획·현안 코멘트 저장소. 예전 3장 사이트가 다른 Supabase 프로젝트를 썼다면
// VITE_PLAN_SUPABASE_URL / VITE_PLAN_SUPABASE_KEY 에 그 값을 넣으면 됨 (없으면 공통 값 사용)
const URL_ = (import.meta.env.VITE_PLAN_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = import.meta.env.VITE_PLAN_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_KEY || ''
export const REMOTE = Boolean(URL_ && KEY)
const TABLE = 'comments'

function headers(extra = {}) {
  const h = { apikey: KEY, 'Content-Type': 'application/json', ...extra }
  // 예전 방식 anon 키(JWT, eyJ…)일 때만 Authorization 헤더를 함께 보냄.
  // 새 publishable 키(sb_publishable_…)는 apikey 헤더에만 넣어야 함.
  if (KEY.startsWith('eyJ')) h.Authorization = `Bearer ${KEY}`
  return h
}

async function api(path, opts = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers) })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).message || '' } catch { /* 본문 없음 */ }
    throw new Error(`${res.status} ${detail}`.trim())
  }
  return res.status === 204 ? null : res.json().catch(() => null)
}

/* DB 행 ↔ 화면용 코멘트 객체 */
function rowsToComments(rows) {
  const top = rows.filter((r) => !r.parent_id)
  const byParent = {}
  rows.filter((r) => r.parent_id).forEach((r) => { (byParent[r.parent_id] ||= []).push(r) })
  return top.map((r) => ({
    id: r.id, idx: r.idx, excerpt: r.excerpt || '', section: r.section || '',
    author: r.author || '익명', text: r.body, done: !!r.done, at: Date.parse(r.created_at),
    replies: (byParent[r.id] || [])
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((x) => ({ id: x.id, author: x.author || '익명', text: x.body, at: Date.parse(x.created_at) })),
  }))
}
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export async function fetchAll() {
  if (!REMOTE) return loadComments()
  const rows = await api(`${TABLE}?select=*&order=created_at.asc`)
  return rowsToComments(rows || [])
}

export async function addComment(c) {
  if (!REMOTE) { const l = [...loadComments(), c]; saveComments(l); return }
  await api(`${TABLE}?on_conflict=id`, {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id: c.id, idx: c.idx, excerpt: c.excerpt, section: c.section, author: c.author, body: c.text, done: false }),
  })
}

export async function addReply(parentId, r) {
  if (!REMOTE) {
    saveComments(loadComments().map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies || []), r] } : c)))
    return
  }
  await api(`${TABLE}?on_conflict=id`, {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id: r.id || newId('r'), parent_id: parentId, author: r.author, body: r.text }),
  })
}

export async function setDone(id, done) {
  if (!REMOTE) { saveComments(loadComments().map((c) => (c.id === id ? { ...c, done } : c))); return }
  await api(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ done }),
  })
}

export async function removeComment(id) {
  if (!REMOTE) { saveComments(loadComments().filter((c) => c.id !== id)); return }
  // 답변은 DB에서 on delete cascade 로 함께 삭제됨
  await api(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

/* 파일 불러오기·로컬 코멘트 올리기 : 이미 있는 코멘트·답변은 건너뜀 */
export async function importMany(list, existing) {
  const have = new Map(existing.map((c) => [c.id, c]))
  let added = 0
  for (const c of list) {
    if (!c || !c.id || !c.text) continue
    const prev = have.get(c.id)
    if (!prev) {
      await addComment({ ...c, done: false })
      if (c.done) await setDone(c.id, true)
      added++
    } else if (c.done && !prev.done) await setDone(c.id, true)
    const seen = new Set((prev?.replies || []).map((r) => r.at + '|' + r.text))
    for (const r of c.replies || []) {
      if (!seen.has(r.at + '|' + r.text)) await addReply(c.id, { ...r, id: r.id || newId('r') })
    }
  }
  return added
}

export function localOnlyComments() { return loadComments() }
export function clearLocal() { saveComments([]) }

/* 옮기기 전에 원본을 따로 보관 (만일을 대비한 백업, 화면에는 쓰지 않음) */
export function backupLocal(list) {
  try {
    const k = 'js3.comments.backup'
    const prev = JSON.parse(localStorage.getItem(k) || '[]')
    localStorage.setItem(k, JSON.stringify([...prev, { at: Date.now(), list }]))
  } catch { /* 저장 불가 환경 */ }
}

/* 이 PC에 예전 방식으로 저장된 코멘트를 공유 저장소로 자동 이전 (한 번만) */
let migrating = null
export function migrateLocal() {
  if (!REMOTE) return Promise.resolve(null)
  if (migrating) return migrating
  migrating = (async () => {
    const local = loadComments()
    if (!local.length) return null
    const remote = await fetchAll()
    const added = await importMany(local, remote)
    backupLocal(local)      // 성공한 뒤에만 백업하고 비움
    saveComments([])
    return { total: local.length, added }
  })()
  return migrating
}
