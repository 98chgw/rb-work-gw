/* 저장소 — 수정 완료 체크와 코멘트
   - .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_KEY 가 있으면 Supabase(공유) 사용 → 모든 PC에서 같은 내용이 보임
   - 없으면 이 브라우저(localStorage)에만 저장 */

const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const KEY = import.meta.env.VITE_SUPABASE_KEY || ''
export const REMOTE = Boolean(URL_ && KEY)
const T_CHECK = 'wonju_checks'
const T_CMT = 'wonju_comments'

const LK_CHECK = 'wonju.checks.v1'
const LK_CMT = 'wonju.comments.v1'
const LK_OLD = 'wonju-consult-1008' // 예전 단일 HTML 판의 체크 기록

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
const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 저장 불가 환경 */ } }
export const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/* ───────── 수정 완료 체크 ───────── */
function localChecks() {
  const c = get(LK_CHECK, null)
  if (c) return c
  // 예전 판(체크박스 id = done-T06, req-3)에서 넘어온 기록을 한 번만 옮김
  const old = get(LK_OLD, {}) || {}
  const out = {}
  Object.entries(old).forEach(([k, v]) => { if (v) out[k.startsWith('done-') ? k.slice(5) : k] = { done: true, by: '', at: Date.now() } })
  put(LK_CHECK, out)
  return out
}
export async function fetchChecks() {
  if (!REMOTE) return localChecks()
  const rows = await api(`${T_CHECK}?select=*`)
  const out = {}
  ;(rows || []).forEach((r) => { out[r.item_id] = { done: !!r.done, by: r.author || '', at: Date.parse(r.updated_at) } })
  return out
}
export async function saveCheck(id, done, by) {
  if (!REMOTE) { const c = localChecks(); c[id] = { done, by, at: Date.now() }; put(LK_CHECK, c); return }
  await api(`${T_CHECK}?on_conflict=item_id`, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ item_id: id, done, author: by || null, updated_at: new Date().toISOString() }),
  })
}

/* ───────── 코멘트 ───────── */
export const loadLocalComments = () => get(LK_CMT, []) || []
const saveLocalComments = (l) => put(LK_CMT, l)

function rowsToComments(rows) {
  const top = rows.filter((r) => !r.parent_id)
  const byParent = {}
  rows.filter((r) => r.parent_id).forEach((r) => { (byParent[r.parent_id] ||= []).push(r) })
  return top.map((r) => ({
    id: r.id, key: r.ckey, excerpt: r.excerpt || '', section: r.section || '',
    author: r.author || '익명', text: r.body, done: !!r.done, at: Date.parse(r.created_at),
    replies: (byParent[r.id] || [])
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((x) => ({ id: x.id, author: x.author || '익명', text: x.body, at: Date.parse(x.created_at) })),
  }))
}

export async function fetchComments() {
  if (!REMOTE) return loadLocalComments()
  const rows = await api(`${T_CMT}?select=*&order=created_at.asc`)
  return rowsToComments(rows || [])
}
export async function addComment(c) {
  if (!REMOTE) { saveLocalComments([...loadLocalComments(), c]); return }
  await api(`${T_CMT}?on_conflict=id`, {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id: c.id, ckey: c.key, excerpt: c.excerpt, section: c.section, author: c.author, body: c.text, done: false }),
  })
}
export async function addReply(parentId, r) {
  if (!REMOTE) {
    saveLocalComments(loadLocalComments().map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies || []), r] } : c)))
    return
  }
  await api(`${T_CMT}?on_conflict=id`, {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id: r.id || newId('r'), parent_id: parentId, author: r.author, body: r.text }),
  })
}
export async function setDone(id, done) {
  if (!REMOTE) { saveLocalComments(loadLocalComments().map((c) => (c.id === id ? { ...c, done } : c))); return }
  await api(`${T_CMT}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ done }) })
}
export async function removeComment(id) {
  if (!REMOTE) { saveLocalComments(loadLocalComments().filter((c) => c.id !== id)); return }
  // 답변은 DB에서 on delete cascade 로 함께 삭제됨
  await api(`${T_CMT}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

/* 파일 불러오기·이 브라우저 코멘트 올리기 : 이미 있는 코멘트·답변은 건너뜀 */
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
    for (const r of c.replies || []) if (!seen.has(r.at + '|' + r.text)) await addReply(c.id, { ...r, id: r.id || newId('r') })
  }
  return added
}

/* 공유 저장소를 붙이기 전에 이 PC에 쌓아 둔 코멘트·체크를 한 번만 자동 이전 */
let migrating = null
export function migrateLocal() {
  if (!REMOTE) return Promise.resolve(null)
  if (migrating) return migrating
  migrating = (async () => {
    const local = loadLocalComments()
    const checks = localChecks() || {}
    let added = 0
    if (local.length) {
      const remote = await fetchComments()
      added = await importMany(local, remote)
      put('wonju.comments.backup', [...(get('wonju.comments.backup', []) || []), { at: Date.now(), list: local }])
      saveLocalComments([])
    }
    const doneIds = Object.entries(checks).filter(([, v]) => v?.done)
    for (const [id, v] of doneIds) await saveCheck(id, true, v.by)
    if (doneIds.length) put(LK_CHECK, {})
    return local.length || doneIds.length ? { comments: local.length, added, checks: doneIds.length } : null
  })()
  return migrating
}
