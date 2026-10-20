/* 코멘트 위치·표시 도우미
   코멘트를 달 수 있는 곳 = data-ck 속성이 붙은 요소 (카드의 제목·지적·지금·고친다면 안의 문단/행·손메모, 정리표의 각 행)
   키는 항목 번호를 기준으로 만들어서 본문 문구를 고쳐도 위치가 유지됨 */

export const clean = (t) => (t || '').replace(/의견\s*\d+|✓/g, '').replace(/\s+/g, ' ').trim()

export function textOf(el) {
  if (!el) return ''
  const copy = el.cloneNode(true)
  copy.querySelectorAll('.cm-badge, .ck, button, .lab').forEach((b) => b.remove())
  if (el.tagName === 'TR') return [...copy.cells].map((c) => clean(c.innerText || c.textContent)).filter(Boolean).join(' | ')
  return clean(copy.innerText || copy.textContent)
}

export const sectionOf = (el) => el?.closest('[data-cs]')?.dataset.cs || ''

/* 문서 순서 (목록 정렬용) */
export function orderMap(root) {
  const m = {}
  if (!root) return m
  root.querySelectorAll('[data-ck]').forEach((el, i) => { if (m[el.dataset.ck] === undefined) m[el.dataset.ck] = i })
  return m
}

export function countByKey(comments) {
  const m = {}
  comments.forEach((c) => {
    const s = (m[c.key] ||= { open: 0, done: 0 })
    if (c.done) s.done++
    else s.open++
  })
  return m
}

/* React가 그리지 않는 영역(고친다면 안의 HTML)에 배지를 직접 붙임 */
export function decorateRaw(container, counts) {
  if (!container) return
  container.querySelectorAll(':scope .cm-badge.raw').forEach((b) => b.remove())
  container.querySelectorAll('[data-ck]').forEach((el) => {
    el.removeAttribute('data-cm')
    const s = counts[el.dataset.ck]
    if (!s) return
    el.setAttribute('data-cm', s.open ? 'open' : 'done')
    const host = el.tagName === 'TR' ? el.lastElementChild : el
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'cm-badge raw' + (s.open ? '' : ' done')
    b.dataset.badgeFor = el.dataset.ck
    b.textContent = s.open ? `의견 ${s.open}` : '✓'
    b.title = s.open ? `미반영 의견 ${s.open}건 — 눌러서 보기` : '반영 완료된 의견 — 눌러서 보기'
    host.appendChild(b)
  })
}

export function toText(comments, order, title) {
  const d = new Date()
  const lines = [`[${title} 코멘트] ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} · 총 ${comments.length}건`]
  ;[...comments].sort((a, b) => (order[a.key] ?? 1e9) - (order[b.key] ?? 1e9) || a.at - b.at).forEach((c, n) => {
    lines.push('')
    lines.push(`${n + 1}. [${c.section || c.key}] "${(c.excerpt || '').slice(0, 45)}…"`)
    lines.push(`   - ${c.author || '익명'}: ${c.text} (${c.done ? '반영 완료' : '미반영'})`)
    ;(c.replies || []).forEach((r) => lines.push(`     ↳ ${r.author || '익명'}: ${r.text}`))
  })
  return lines.join('\n')
}

/* 진행 현황 요약 (카톡·메일용) */
export function progressText(data, checks, comments, title = '원주 컨설팅 수정표') {
  const lines = []
  const d = new Date()
  const all = data.items
  const done = all.filter((i) => checks[i.id]?.done)
  lines.push(`[${title}] ${d.getMonth() + 1}.${d.getDate()} 기준 ${done.length}/${all.length} 완료 · 미반영 의견 ${comments.filter((c) => !c.done).length}건`)
  data.groups.forEach((g) => {
    const its = all.filter((i) => i.g === g.id)
    if (!its.length) return
    const left = its.filter((i) => !checks[i.id]?.done)
    lines.push('')
    lines.push(`■ ${g.name} (${its.length - left.length}/${its.length})`)
    left.forEach((i) => lines.push(`  - ${i.id} ${i.title} [${i.pri} · 계획서 ${i.page}]`))
  })
  return lines.join('\n')
}
