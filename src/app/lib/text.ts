/* =============================================================================
 * 薄肌计划 · 文本工具（模型输出的安全转义与富文本渲染）
 *
 * 模型输出一律先进 esc() 再按白名单替换（**粗体** / 换行），
 * 页面用 dangerouslySetInnerHTML 渲染——白名单之外的标记不会变成 HTML。
 * ========================================================================== */

/** HTML 转义（模型输出 / 用户输入渲染前必过） */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 剥掉结构化标记行（[[MEMORY:…]] 等不展示给用户） */
export function stripMarkers(t: unknown): string {
  return String(t ?? '')
    .replace(/\[\[(MEMORY|ASSET|SNAPSHOT|BODY):[^\]]*\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** HTML → 纯文本（播报 / 上下文注入用；先剥标签再剥标记） */
export function stripHtml(s: unknown): string {
  return stripMarkers(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
}

/** 模型输出 → 气泡 HTML：先转义，再放行 **粗体** 与换行 */
export function fmt(s: unknown): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>')
}

/** 「API 实时」来源标记 */
export function srcTag(model: string): string {
  return `<span class="mt-2 inline-flex items-center gap-1 rounded-full border border-info/35 bg-info/10 px-2 py-0.5 text-caption text-info">⚡ ${esc(model)} · API 实时</span>`
}

/** 联网搜索来源卡片 */
export function sourcesCard(list: Array<{ title: string; url: string; snippet: string }>): string {
  if (!list || !list.length) return ''
  const uniq: typeof list = []
  const seen: Record<string, boolean> = {}
  list.forEach((s) => {
    if (s.url && !seen[s.url]) {
      seen[s.url] = true
      uniq.push(s)
    }
  })
  if (!uniq.length) return ''
  return (
    '<div class="mt-2 rounded-md border border-info/25 bg-info/soft p-3">' +
    '<div class="mb-1.5 text-caption font-semibold text-info">🔎 联网搜索来源 · StepSearch</div>' +
    uniq
      .slice(0, 5)
      .map(
        (s, i) =>
          `<div class="mb-1 text-caption leading-relaxed">${i + 1}. <a class="break-all text-info no-underline" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>` +
          (s.snippet ? `<div class="mt-0.5 text-caption text-muted-foreground">${esc(s.snippet.slice(0, 120))}</div>` : '') +
          '</div>',
      )
      .join('') +
    '</div>'
  )
}

/** 时间戳 → HH:mm */
export function fmtTime(ts: number): string {
  const t = new Date(ts)
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}
