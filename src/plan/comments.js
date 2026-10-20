/* 코멘트 저장·위치 계산 도우미 */
export const BLOCK_SEL = 'p, li, tr, h3, h4, h5, h6, .tcap, .fig'
const KEY = 'js3.comments.v1'

export function loadComments() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
export function saveComments(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* 저장 불가 환경 */ }
}

const clean = (t) => (t || '').replace(/💬\s*\d+/g, '').replace(/\s+/g, ' ').trim()
const txt = (el) => (el ? (el.innerText || el.textContent) : '')

export function blockText(el) {
  if (el.classList.contains('fig')) return clean(txt(el.querySelector('.figcap')))
  if (el.tagName === 'TR') return [...el.cells].map((c) => clean(txt(c))).filter(Boolean).join(' | ')
  return clean(txt(el))
}

/* 본문 블록에 번호를 매기고, 각 블록이 속한 절 제목을 계산 */
export function indexBlocks(root, sel = BLOCK_SEL) {
  const all = root.querySelectorAll(`h2, h3, h4, ${sel}`)
  const blocks = []
  let h3 = '', h4 = ''
  all.forEach((el) => {
    if (el.closest('svg')) return
    const tag = el.tagName
    if (tag === 'H2') { h3 = clean(el.textContent); h4 = ''; if (!el.matches(sel)) return }
    if (tag === 'H3') { h3 = clean(el.textContent); h4 = '' }
    if (tag === 'H4') h4 = clean(el.textContent)
    if (!el.matches(sel)) return
    if (el.parentElement && el.parentElement.closest('.fig') && !el.classList.contains('fig')) return
    el.dataset.blk = blocks.length
    blocks.push({ el, text: blockText(el), section: [h3, h4].filter(Boolean).join(' › ') })
  })
  return blocks
}

/* 코멘트가 가리키는 블록 찾기 (본문이 수정돼 번호가 밀려도 발췌문으로 다시 찾음) */
export function resolve(blocks, c) {
  const key = (c.excerpt || '').slice(0, 24)
  if (blocks[c.idx] && blocks[c.idx].text.startsWith(key)) return c.idx
  const i = blocks.findIndex((b) => key && b.text.startsWith(key))
  return i >= 0 ? i : null
}

/* 코멘트 달린 블록에 표시(배지) 붙이기 */
export function decorate(root, comments, sel = BLOCK_SEL) {
  if (!root) return {}
  root.querySelectorAll('.cm-badge').forEach((b) => b.remove())
  root.querySelectorAll('[data-cm]').forEach((el) => el.removeAttribute('data-cm'))
  const blocks = indexBlocks(root, sel)
  const pos = {}
  const count = {}
  comments.forEach((c) => {
    const i = resolve(blocks, c)
    pos[c.id] = i
    if (i !== null && !c.done) count[i] = (count[i] || 0) + 1
    else if (i !== null && count[i] === undefined) count[i] = 0
  })
  Object.entries(count).forEach(([i, n]) => {
    const el = blocks[i].el
    el.setAttribute('data-cm', n > 0 ? 'open' : 'done')
    const host = el.tagName === 'TR' ? el.firstElementChild : el.classList.contains('fig') ? el.querySelector('.figcap') || el : el
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'cm-badge' + (n > 0 ? '' : ' done')
    b.dataset.blkRef = i
    b.textContent = n > 0 ? `💬 ${n}` : '✓'
    b.title = n > 0 ? `미반영 코멘트 ${n}건 — 눌러서 보기` : '반영 완료된 코멘트 — 눌러서 보기'
    host.appendChild(b)
  })
  return { pos, blocks }
}

export function toText(comments, pos, blocks, title = '정선군 Ⅲ.기본구상') {
  const d = new Date()
  const lines = [`[${title} 코멘트] ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} · 총 ${comments.length}건`]
  comments.forEach((c, n) => {
    const i = pos[c.id]
    const where = i !== null && i !== undefined ? blocks[i]?.section : `${c.section} (위치 변경됨)`
    lines.push('')
    lines.push(`${n + 1}. [${where || '본문'}] "${(c.excerpt || '').slice(0, 45)}…"`)
    lines.push(`   - ${c.author || '익명'}: ${c.text} (${c.done ? '반영 완료' : '미반영'})`)
    ;(c.replies || []).forEach((r) => lines.push(`     ↳ ${r.author || '익명'}: ${r.text}`))
  })
  return lines.join('\n')
}

/* 코멘트가 어느 문서 것인지 : id 앞의 "문서키~" (없으면 3장 — 예전부터 달린 코멘트) */
export const docOf = (c) => (String(c.id).includes('~') ? String(c.id).split('~')[0] : 'plan3')
