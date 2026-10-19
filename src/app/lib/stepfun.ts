/* =============================================================================
 * 薄肌计划 · StepFun 开放平台客户端（OpenAI 兼容）
 *
 * 沿用原产品的接入方式：用户自带 API Key（只存本机 localStorage），直连官方接口：
 *   POST {apiBase}/chat/completions   对话 / 计划生成 / 体检报告解读（多模态）
 *   POST {apiBase}/search             StepSearch 联网搜索
 *   GET  {apiBase}/models             模型目录
 *
 * 网络双轨（与 src/shared/api/client.ts 同一套口径）：
 *   1. 优先 fetch 直连（保留 SSE 流式：思维链 / 正文分片实时到达）；
 *   2. 真机上 fetch 被 WebView 拦下时，回落到壳代发的 request（非流式，整包到达）。
 * 推理模型适配（原版踩坑结论，全部保留）：不设 max_tokens；结构化任务 reasoning_effort=low
 * （400 不支持时自动去参重试）；连通性探针 max_tokens=1、HTTP 200 即通。
 * ========================================================================== */

import { getBridgeMode, invokeNative } from '@/shared/bridge'

import {
  MEM_CATS,
  MODEL_SKIP,
  bmiLabel,
  bmiOf,
  dstr,
  fmtNum,
  getState,
  mutate,
  type BojiState,
  type HealthItem,
  type HealthLevel,
  type MemoryEntry,
  type ModelInfo,
  type PlanDay,
} from '@/app/store/boji'
import { esc, fmt, sourcesCard, srcTag, stripMarkers } from './text'

/* ------------------------------- 基础类型 ------------------------------- */

export interface SearchSource {
  title: string
  url: string
  snippet: string
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
  }>
}

export interface ToolCall {
  id: string
  name: string
  args: string
}

export interface ChatResult {
  content: string
  reasoning: string
  tools: ToolCall[]
}

export class ApiHttpError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`HTTP ${status}`)
    this.name = 'ApiHttpError'
    this.status = status
    this.body = body
  }
}

/* ------------------------------- 网络层 ------------------------------- */

function apiUrl(base: string, path: string): string {
  return `${(base || 'https://api.stepfun.com/v1').replace(/\/+$/, '')}${path}`
}

function authHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
}

/** fetch 失败里疑似跨域 / 网络层拦截的那类（真机 WebView 拦 stepfun 时表现如此） */
function isNetworkLikeError(err: unknown): boolean {
  if (err instanceof ApiHttpError) return false
  return err instanceof TypeError
}

async function readErrorBody(res: Response): Promise<ApiHttpError> {
  const text = await res.text().catch(() => '')
  return new ApiHttpError(res.status, text.slice(0, 300))
}

/** SSE 流读取：按 "data: {...}" 行解析，[DONE] 结束 */
async function readSSE(res: Response, onJson: (j: ChatCompletionChunk) => void): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new TypeError('响应不支持流式读取')
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      onJson(JSON.parse(data) as ChatCompletionChunk)
    }
  }
}

/**
 * 发起一次 chat/completions 请求。
 * 流式：onJson 逐帧回调；非流式兜底：整包作为一帧回调。
 */
async function postChat(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  onJson: (j: ChatCompletionChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  const stream = body.stream === true
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
    if (!res.ok) throw await readErrorBody(res)
    if (stream) await readSSE(res, onJson)
    else onJson((await res.json()) as ChatCompletionChunk)
    return
  } catch (err) {
    if (signal?.aborted) throw err
    // 真机上 fetch 被拦（跨域 / 混合内容）→ 壳代发兜底（拿不到流式，整包到达）
    if (getBridgeMode() === 'native' && isNetworkLikeError(err)) {
      const res = await invokeNative('request', {
        url,
        method: 'POST',
        data: body,
        dataType: 'json',
        timeout: 300000,
        header: authHeaders(apiKey),
      })
      if (res.statusCode >= 400) {
        throw new ApiHttpError(res.statusCode, typeof res.data === 'string' ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300))
      }
      onJson(res.data as ChatCompletionChunk)
      return
    }
    throw err
  }
}

/** 普通 JSON 请求（models / search / 探针）：fetch 优先，native 回落 request */
async function postJson<T>(url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
    if (!res.ok) throw await readErrorBody(res)
    return (await res.json()) as T
  } catch (err) {
    if (signal?.aborted) throw err
    if (getBridgeMode() === 'native' && isNetworkLikeError(err)) {
      const res = await invokeNative('request', {
        url,
        method: 'POST',
        data: body,
        dataType: 'json',
        timeout: 60000,
        header: authHeaders(apiKey),
      })
      if (res.statusCode >= 400) {
        throw new ApiHttpError(res.statusCode, typeof res.data === 'string' ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300))
      }
      return res.data as T
    }
    throw err
  }
}

async function getJson<T>(url: string, apiKey: string): Promise<T> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) throw await readErrorBody(res)
    return (await res.json()) as T
  } catch (err) {
    if (getBridgeMode() === 'native' && isNetworkLikeError(err)) {
      const res = await invokeNative('request', {
        url,
        method: 'GET',
        dataType: 'json',
        timeout: 60000,
        header: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.statusCode >= 400) throw new ApiHttpError(res.statusCode, String(res.data).slice(0, 300))
      return res.data as T
    }
    throw err
  }
}

/* ------------------------------- 提示词工程 ------------------------------- */

/** 长期记忆上下文（最近 25 条） */
function memoryContext(s: BojiState): string {
  return s.memories
    .slice(0, 25)
    .map((m) => `[${m.cat}] ${m.text}`)
    .join('\n')
}

function bodyContext(s: BojiState): string {
  const list = [...s.body].sort((a, b) => a.ts - b.ts)
  const b = list[list.length - 1]
  if (!b) return '暂无快照'
  let out = `身高 ${fmtNum(b.height, 0)}cm · 体重 ${fmtNum(b.weight)}kg · 体脂 ${fmtNum(b.fat)}%`
  const bmi = bmiOf(b.height, b.weight)
  if (bmi > 0) out += ` · BMI ${fmtNum(bmi)}（${bmiLabel(bmi)}）`
  return `${out}（快照于 ${b.date}）`
}

function healthContext(s: BojiState): string {
  const h = s.health
  if (!h || (!h.summary && !(h.items && h.items.length))) return '暂无档案'
  let out = h.summary || ''
  if (h.items && h.items.length) {
    out += `｜关注项：${h.items.map((it) => `${it.name}(${it.level})`).join('、')}`
  }
  return out
}

/**
 * 系统提示词：六层上下文（人设 / 理论底座 / 用户资料 / 今日数据 / 长期记忆 / 健康与身体）
 * + 联网搜索触发规则 + 长期记忆提炼协议（[[MEMORY:分类|内容]] 标记行）。
 */
export function buildSystemPrompt(s: BojiState): string {
  const d = s.data[dstr()] ?? { water: 0, sleep: 0, fight: 0, gym: 0, create: 0 }
  const memTxt = memoryContext(s)
  return (
    `你是「${s.settings.botName || '小薄'}」，薄肌计划 App 里的 AI 掌舵机器人，由阶跃星辰 StepCode（模型 ${s.settings.model}）驱动。\n` +
    `用户：${s.user.name}（主战场：${s.user.goal}，${s.user.gender || '性别未填'}，生日 ${s.user.birthday || '未填'}，预期寿命 ${s.user.lifespan || 80} 岁）。语气：朋友式、直接、不尬聊。\n\n` +
    `【理论底座 · 来自孙宇晨×邵艾伦访谈】\n` +
    '1. 搏击理论：薄肌是静态资产（体态/代谢/抗衰），搏击是动态神经资产（反应/抗压/冲突心态）\n' +
    '2. 大水理论：大量白开水、少糖饮料；大睡理论：睡眠是激素与肌肉修复核心，熬夜直接废掉训练成果\n' +
    '3. 先开图再出兵：重大决策前先调研足够多样本（买房看 100 套，前 3 套只建认知基准不下手，4~6 套遇显著更优立刻下手）\n' +
    '4. 先自由后财富：自由是心态与选择权，财富是副产品；逐水草而居，不被岗位锁死\n' +
    '5. AI 个人掌舵：AI 日常掌舵、人最终拍板；大事同时问多个大模型取交集\n' +
    '6. 少消费多创造；人生体验互补\n\n' +
    `【身体数据】${bodyContext(s)}\n` +
    `【健康档案】${healthContext(s)}\n` +
    `【今日数据】饮水 ${d.water}/3000ml · 睡眠 ${d.sleep}/8h · 搏击 ${d.fight}min · 薄肌 ${d.gym}min · 创造 ${d.create}次\n` +
    `【长期记忆】\n${memTxt || '（暂无）'}\n\n` +
    '【行为准则】用中文，像朋友一样说话但别尬聊；可以自然引用上述理论但不要堆砌；用户发打卡类消息时本地已记录，你负责确认、鼓励、指出风险；重大决策主动引导「先开图，再出兵」；不确定就说不确定；回复控制在 200 字以内，可用 emoji 和短段落。\n\n' +
    '【联网搜索】你可以调用 web_search 工具（StepSearch 全网搜索）。当用户问到时效性信息（新闻、天气、股价、赛事、最新发布）或你不确定的具体事实时，先搜索再基于结果回答，并自然提及来源；日常打卡、闲聊、理论问答不要调用。\n\n' +
    '【长期记忆规则】如果用户在这轮对话里透露了值得长期记住的信息（职业、身份、目标、习惯、偏好、人际关系、重要决定、身体数据等），请在回答的最后单独输出一行：[[MEMORY:分类|内容]]，分类只能是：身体/决策/财富/偏好/目标/关系；内容写事实本身，25 字以内。没有值得记的信息就什么都不要加。这一行不会展示给用户。'
  )
}

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      '联网搜索（StepSearch 全网检索）。当用户问到时效性信息（新闻、天气、股价、赛事、最新发布）、或你不确定的具体事实时，先调用本工具获取最新资料，再基于结果回答。日常打卡、闲聊、理论问答不需要调用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，简洁具体' },
        n: { type: 'integer', description: '返回结果条数，默认 5，最多 10' },
      },
      required: ['query'],
    },
  },
}

/* ------------------------------- 记忆标记协议 ------------------------------- */

export interface ParsedMemories {
  clean: string
  added: Array<{ cat: MemoryEntry['cat']; text: string }>
}

/** 解析模型回答里的 [[MEMORY:分类|内容]] → 自动入库项 + 剥离后的展示文本 */
export function parseMemories(text: string, existing: MemoryEntry[]): ParsedMemories {
  const re = /\[\[MEMORY:\s*([^|\]\n]{1,6})\|([^\]\n]{2,60})\]\]/g
  const added: ParsedMemories['added'] = []
  let m: RegExpExecArray | null
  const clean = String(text || '')
  while ((m = re.exec(clean)) !== null) {
    const cat = (m[1].trim() in MEM_CATS ? m[1].trim() : '偏好') as MemoryEntry['cat']
    const txt = m[2].trim()
    const dup =
      existing.some(
        (x) =>
          x.text === txt ||
          (x.text.length > 3 && x.text.indexOf(txt) >= 0) ||
          (txt.length > 3 && txt.indexOf(x.text) >= 0),
      ) || added.some((x) => x.text === txt)
    if (!dup) added.push({ cat, text: txt })
  }
  return { clean: stripMarkers(clean), added }
}

/* ------------------------------- 对话（含工具循环） ------------------------------- */

export interface AskCallbacks {
  /** 思维链增量（💭 实时可见） */
  onReasoning?: (chunk: string) => void
  /** 正文增量 */
  onContent: (chunk: string) => void
  /** 模型决定联网搜索时回调（展示「🔍 正在联网搜索：query」） */
  onSearching?: (query: string) => void
  /** 自动提炼并入库的记忆条数 */
  onMemories?: (count: number) => void
}

interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: unknown
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

/** 组装请求消息：系统提示 + 最近 16 条历史 + 本轮输入（可带多张图片，多模态） */
export function buildMessages(s: BojiState, text: string, memNote?: string, images?: string[]): ChatMessageInput[] {
  const msgs: ChatMessageInput[] = [{ role: 'system', content: buildSystemPrompt(s) }]
  const hist = s.chat.slice(-16).map((m): ChatMessageInput => {
    if (m.who === 'bot') {
      return { role: 'assistant', content: String(m.html ?? '').replace(/<[^>]+>/g, '') }
    }
    // 历史里的图片只带文字：图片缩略图仅用于界面回看，不进上下文（省 token 也不失真）
    return { role: 'user', content: m.text ?? '' }
  })
  msgs.push(...hist)
  if (memNote) {
    msgs.push({ role: 'system', content: `（系统提示：用户刚说的「${memNote}」已被写入长期记忆库，请确认已记住）` })
  }
  if (images && images.length) {
    // 多模态消息：文本 + 多张图片（餐食分析 / 动作纠错 / 报告识别都走这条）
    msgs.push({
      role: 'user',
      content: [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))],
    })
  } else {
    msgs.push({ role: 'user', content: text })
  }
  return msgs
}

/** 单轮流式请求：同时收集正文 / 思维链 / tool_calls 分片 */
async function streamChat(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessageInput[],
  tools: unknown[] | null,
  cb: { onReasoning?: (c: string) => void; onContent: (c: string) => void },
  signal?: AbortSignal,
): Promise<ChatResult> {
  let content = ''
  let reasoning = ''
  const toolsByIdx = new Map<number, ToolCall>()
  await postChat(
    url,
    apiKey,
    { model, messages, stream: true, temperature: 0.7, ...(tools && tools.length ? { tools } : {}) },
    (j) => {
      const choice = j.choices?.[0]
      if (!choice) return
      const delta = choice.delta ?? {}
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content
        cb.onReasoning?.(delta.reasoning_content)
      }
      if (delta.content) {
        content += delta.content
        cb.onContent(delta.content)
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          if (!toolsByIdx.has(idx)) toolsByIdx.set(idx, { id: tc.id ?? `call_${idx}`, name: '', args: '' })
          const entry = toolsByIdx.get(idx)!
          if (tc.id) entry.id = tc.id
          if (tc.function?.name && !entry.name) entry.name = tc.function.name
          if (tc.function?.arguments) entry.args += tc.function.arguments
        }
      }
    },
    signal,
  )
  return { content, reasoning, tools: [...toolsByIdx.values()] }
}

/** StepSearch 联网搜索（官方推荐：/v1/search 封装为 function 工具） */
export async function webSearch(query: string, n = 5): Promise<SearchSource[]> {
  const s = getState()
  const url = apiUrl(s.settings.apiBase, '/search')
  const j = await postJson<{ results?: unknown[]; data?: unknown[] }>(url, s.settings.apiKey, { query, n: n || 5 })
  const arr = j.results ?? j.data ?? []
  return arr
    .slice(0, 8)
    .map((x) => {
      const r = x as Record<string, string>
      return { title: r.title || r.name || '', url: r.url || r.link || '', snippet: r.snippet || r.summary || r.content || '' }
    })
    .filter((x) => x.title || x.url)
}

/**
 * 一次完整的「AI 掌舵」回答：流式输出 + 联网搜索工具循环（最多两轮）+ 记忆提炼入库。
 * memNote：本轮刚被本地写入记忆的文本（进系统提示，让模型确认已记住）。
 * images：本轮附带的多张图片（压缩后的 JPEG dataURL），与文本一起作为多模态消息发出。
 * 返回最终展示用 HTML（含来源卡片）。
 */
export async function askHelm(text: string, cb: AskCallbacks, signal?: AbortSignal, memNote?: string, images?: string[]): Promise<string> {
  const s = getState()
  const url = apiUrl(s.settings.apiBase, '/chat/completions')
  const sources: SearchSource[] = []

  async function round(messages: ChatMessageInput[], depth: number): Promise<string> {
    const useTools = depth === 0 && s.settings.webSearch !== false ? [WEB_SEARCH_TOOL] : null
    const result = await streamChat(url, s.settings.apiKey, s.settings.model, messages, useTools, cb, signal)
    const calls = result.tools.filter((x) => x.name === 'web_search')
    if (!calls.length || depth >= 2) return result.content

    const next: ChatMessageInput[] = [
      ...messages,
      {
        role: 'assistant',
        content: result.content || '',
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args } })),
      },
    ]
    let done = 0
    await Promise.all(
      calls.map(async (c) => {
        let q = ''
        try {
          q = (JSON.parse(c.args || '{}').query as string) || ''
        } catch {
          /* 参数不完整 */
        }
        if (!q) {
          next.push({ role: 'tool', tool_call_id: c.id, content: '缺少 query 参数' })
          done += 1
          return
        }
        cb.onSearching?.(q)
        try {
          const items = await webSearch(q)
          sources.push(...items)
          next.push({
            role: 'tool',
            tool_call_id: c.id,
            content: JSON.stringify(items.slice(0, 6).map((x) => ({ title: x.title, url: x.url, snippet: x.snippet }))),
          })
        } catch (err) {
          next.push({ role: 'tool', tool_call_id: c.id, content: `搜索失败：${(err as Error).message}` })
        }
        done += 1
      }),
    )
    return round(next, depth + 1)
  }

  const messages = buildMessages(s, text, memNote, images)
  const finalText = await round(messages, 0)

  // 记忆提炼：[[MEMORY:…]] 标记行自动入库（受「自动记忆提取」开关控制）
  if (s.settings.autoMem) {
    const parsed = parseMemories(finalText, s.memories)
    if (parsed.added.length) {
      mutate((draft) => {
        for (const m of parsed.added) {
          draft.memories.unshift({
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
            cat: m.cat,
            text: m.text,
            src: 'ai',
            imp: 2,
            date: dstr(),
          })
        }
      })
      cb.onMemories?.(parsed.added.length)
    }
  }
  return `${fmt(stripMarkers(finalText))}${srcTag(s.settings.model)}${sourcesCard(sources)}`
}

/* ------------------------------- 模型目录 ------------------------------- */

export function modelList(s: BojiState): ModelInfo[] {
  return s.models.length ? s.models : [{ id: 'step-5-preview', n: 'step-5-preview', d: '默认 · 阶跃旗舰基模，1M 上下文，日常掌舵主力' }]
}

/** 拉取开放平台模型列表（过滤非对话模型，6 小时缓存） */
export async function fetchModels(): Promise<boolean> {
  const s = getState()
  if (!s.settings.apiKey) return false
  const url = apiUrl(s.settings.apiBase, '/models')
  try {
    const j = await getJson<{ data?: Array<{ id: string; owned_by?: string }>; models?: Array<{ id: string; owned_by?: string }> }>(url, s.settings.apiKey)
    const list: ModelInfo[] = (j.data ?? j.models ?? [])
      .map((m) => ({ id: m.id, n: m.id, d: m.owned_by ? `提供方 ${m.owned_by}` : '' }))
      .filter((m) => m.id && !MODEL_SKIP.test(m.id))
    if (!list.length) return false
    mutate((draft) => {
      draft.models = list
      draft.modelsAt = Date.now()
    })
    return true
  } catch {
    return false
  }
}

/** 连通性探针：max_tokens=1，HTTP 200 即通（推理模型思维链吃 token，content 为空属正常） */
export async function probeConnection(): Promise<{ ok: boolean; message: string }> {
  const s = getState()
  if (!s.settings.apiKey) return { ok: false, message: '请先保存 API Key' }
  const url = apiUrl(s.settings.apiBase, '/chat/completions')
  try {
    await postJson(url, s.settings.apiKey, {
      model: s.settings.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    })
    return { ok: true, message: `连接成功 · ${s.settings.model}（HTTP 200）` }
  } catch (err) {
    if (err instanceof ApiHttpError) {
      const hint = err.status === 401 ? ' · Key 无效，或未在开放平台登录创建' : err.status === 402 ? ' · 额度不足' : ''
      return { ok: false, message: `HTTP ${err.status}${hint}` }
    }
    return { ok: false, message: (err as Error).message }
  }
}

/* ------------------------------- 一周训练计划生成 ------------------------------- */

export interface PlanGenCallbacks {
  /** 进度：已等待秒数 / 已接收字符数 */
  onWaiting?: (seconds: number, chars: number) => void
  /** 流式预览片段（reason = 思维链） */
  onPreview?: (text: string, kind: 'reason' | 'content') => void
}

/** 从模型回复里提取 JSON 对象（容忍 ```json 代码块和前后废话） */
function extractJsonObj(txt: string, key: string): Record<string, unknown> | null {
  const t = String(txt || '').replace(/```json|```/g, '')
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) {
    try {
      const obj = JSON.parse(t.slice(s, e + 1)) as Record<string, unknown>
      const arr = obj[key]
      if (obj && Array.isArray(arr) && arr.length) return obj
    } catch {
      /* 解析失败交给兜底 */
    }
  }
  return null
}

/** 兜底：模型不守 JSON 格式时，从散文 / markdown 里解析计划 */
function parsePlanFromProse(txt: string): PlanDay[] | null {
  const days: PlanDay[] = []
  let cur: PlanDay | null = null
  for (const raw of String(txt || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^\**\s*(周[一二三四五六日]|星期[一二三四五六日])\s*[|:：]?\s*\**\s*(.*)$/)
    if (m) {
      cur = { d: m[1].replace('星期', '周'), t: (m[2] || '训练日').replace(/\*/g, '').slice(0, 50), items: [] }
      days.push(cur)
      continue
    }
    const it = line.replace(/^[-·•*\d.、\s]+/, '').replace(/\*/g, '').trim()
    if (it && cur) cur.items.push(it.slice(0, 90))
  }
  days.forEach((d) => {
    if (!d.items.length && d.t) d.items = [d.t]
  })
  return days.length ? days : null
}

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/**
 * AI 生成一周训练计划：先采集器械条件写进硬约束，再结合身体数据生成；
 * 流式进度可视、可取消；解析失败自动重试一次；reasoning_effort 不被支持时自动去参。
 */
export async function generateWeekPlan(
  cb: PlanGenCallbacks,
  signal: AbortSignal,
): Promise<PlanDay[]> {
  const s = getState()
  const list = [...s.body].sort((a, b) => a.ts - b.ts)
  const b = list[list.length - 1]
  if (!b) throw new Error('先在「健康」页记录一次身体快照（身高/体重/体脂）')
  const bmi = bmiOf(b.height, b.weight)
  const eq = s.user.equipment || '未说明（按自重/哑铃保守安排）'
  const basePrompt =
    `用户身体数据：身高 ${b.height}cm，体重 ${b.weight}kg，体脂率 ${b.fat || '未知'}%，BMI ${bmi.toFixed(1)}（${bmiLabel(bmi)}）。` +
    `可用器械 / 条件：${eq}。` +
    '目标：薄肌（低体脂 + 适量肌肉线条）。理论体系：搏击是动态神经资产，若条件允许每周安排 1-2 次对抗训练；若器械条件里没有搏击条件，就坚决不安排搏击，用其他项目替代；大睡理论：保证恢复，熬夜会废掉训练成果。\n' +
    '请生成一周 7 天训练计划，硬性要求：\n' +
    '1. 只允许使用上面列出的器械/条件，没有的绝对不能出现；\n' +
    '2. 每个动作必须写清：组数 × 次数（或秒数）、组间休息多少秒、重量/难度选择建议；\n' +
    '3. 每天必须包含热身和拉伸，并标注这天总时长；\n' +
    '4. 零基础也看得懂：动作名+怎么做+退阶选项（做不了标准版时降级为什么）；\n' +
    '5. 劳逸结合，至少 1 个恢复日/休息日。'

  const url = apiUrl(s.settings.apiBase, '/chat/completions')
  let useEffort = true
  let chars = 0
  const t0 = Date.now()
  const timer = window.setInterval(() => {
    cb.onWaiting?.(Math.round((Date.now() - t0) / 1000), chars)
  }, 1000)

  function promptFor(n: number): string {
    return (
      basePrompt +
      '\n只输出 JSON：{"days":[{"d":"周一","t":"主题（总时长约X分钟）","items":["热身：…","动作 4组×12次，组间休90秒，重量建议…，退阶：…", ...]}, ... 共 7 天]}' +
      (n > 0 ? '\n\n【再次强调】你的上一次回复无法被解析。这次只输出一个 JSON 对象，不要 markdown 代码块、不要任何解释文字、不要省略任何一天。' : '')
    )
  }

  async function attempt(n: number): Promise<PlanDay[]> {
    const body: Record<string, unknown> = {
      model: s.settings.model,
      messages: [{ role: 'user', content: promptFor(n) }],
      stream: true,
      temperature: 0.3,
    }
    if (useEffort) body.reasoning_effort = 'low'
    let text = ''
    let reasoning = ''
    await postChat(
      url,
      s.settings.apiKey,
      body,
      (j) => {
        const delta = j.choices?.[0]?.delta ?? {}
        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content
          chars += delta.reasoning_content.length
          cb.onPreview?.(delta.reasoning_content, 'reason')
        }
        if (delta.content) {
          text += delta.content
          chars += delta.content.length
          cb.onPreview?.(delta.content, 'content')
        }
      },
      signal,
    )
    const obj = extractJsonObj(text, 'days')
    const rawDays = obj ? (obj.days as unknown[]) : parsePlanFromProse(text)
    const days: PlanDay[] = ((rawDays ?? []) as Array<Record<string, unknown>>)
      .map((x, i) => {
        let items = Array.isArray(x.items) ? x.items.map((it) => String(it).slice(0, 90)) : []
        if (!items.length && x.t) items = [String(x.t).slice(0, 90)]
        return { d: String(x.d || WEEK_LABELS[i] || '').slice(0, 4), t: String(x.t || '训练日').slice(0, 50), items }
      })
      .filter((x) => x.d && x.items.length)
    if (!days.length) {
      if (n < 1) return attempt(n + 1)
      const err = new Error('无法解析计划')
      ;(err as Error & { raw?: string }).raw = (text || reasoning).slice(0, 60)
      throw err
    }
    return days
  }

  try {
    // reasoning_effort 不被支持（400）时去参重试一次；解析失败也重试一次
    for (let n = 0; ; n++) {
      try {
        return await attempt(n)
      } catch (err) {
        if (signal.aborted) throw err
        if (err instanceof ApiHttpError && err.status === 400 && useEffort && /reasoning_effort/i.test(err.body)) {
          useEffort = false
          continue
        }
        if (n < 1) continue
        throw err
      }
    }
  } finally {
    window.clearInterval(timer)
  }
}

/* ------------------------------- 体检报告解读 ------------------------------- */

const HEALTH_LEVELS: HealthLevel[] = ['正常', '关注', '异常', '疾病']

export interface ReportAnalysis {
  summary: string
  items: HealthItem[]
}

/** 体检报告图片 → AI 通读 → 身体状况总结 + 异常/疾病清单（只要 JSON，四层容错解析） */
export async function analyzeReport(
  dataUrl: string,
  cb: { onWaiting?: (seconds: number, chars: number) => void },
): Promise<ReportAnalysis> {
  const s = getState()
  const prompt =
    '这是我的体检报告，请通读并提取所有异常指标、诊断和疾病风险，用中文回答。' +
    '只输出一个 JSON 对象（不要 markdown 代码块），格式：' +
    '{"summary":"一段话总结目前身体状况、最需要关注的风险和建议（150字内）","items":[{"name":"异常或疾病名称","system":"所属系统","level":"正常/关注/异常/疾病 四选一","note":"关键指标值或建议"}]}。' +
    '确实没有异常时 items 给空数组，summary 说明整体良好。'

  const url = apiUrl(s.settings.apiBase, '/chat/completions')
  const t0 = Date.now()
  let chars = 0
  const timer = window.setInterval(() => {
    cb.onWaiting?.(Math.round((Date.now() - t0) / 1000), chars)
  }, 1000)

  let text = ''
  try {
    await postChat(
      url,
      s.settings.apiKey,
      {
        model: s.settings.model,
        reasoning_effort: 'low',
        stream: true,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      },
      (j) => {
        const delta = j.choices?.[0]?.delta ?? {}
        if (delta.content) {
          text += delta.content
          chars += delta.content.length
        }
      },
    )
  } finally {
    window.clearInterval(timer)
  }

  const cleaned = String(text || '').replace(/```json|```/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  let obj: { summary?: string; items?: unknown[] } | null = null
  if (start >= 0 && end > start) {
    try {
      obj = JSON.parse(cleaned.slice(start, end + 1)) as { summary?: string; items?: unknown[] }
    } catch {
      obj = null
    }
  }
  if (!obj || (!obj.summary && !Array.isArray(obj.items))) {
    const err = new Error('无法解析体检结果')
    ;(err as Error & { raw?: string }).raw = text.slice(0, 60)
    throw err
  }
  const items: HealthItem[] = (Array.isArray(obj.items) ? obj.items : [])
    .map((raw) => {
      const it = raw as Record<string, string>
      const level = (HEALTH_LEVELS.includes(it.level as HealthLevel) ? it.level : '关注') as HealthLevel
      return {
        name: String(it.name || '').slice(0, 40),
        system: String(it.system || '').slice(0, 12),
        level,
        note: String(it.note || '').slice(0, 60),
      }
    })
    .filter((it) => it.name)
  return { summary: String(obj.summary || '').slice(0, 600), items }
}

/* ------------------------------- 错误文案 ------------------------------- */

/** 把 API 错误翻成用户能看懂的中文（401/402 分类，原版口径） */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiHttpError) {
    const hint =
      err.status === 401
        ? '：API Key 无效，或尚未在 StepFun 开放平台（platform.stepfun.com）登录并创建 Key'
        : err.status === 402
          ? '：账户额度不足，请先充值'
          : ''
    return `StepCode 返回 ${err.status}${hint}。<br><span class="text-muted-foreground text-caption">${esc(err.body.slice(0, 150))}</span>`
  }
  const msg = err instanceof Error ? err.message : String(err)
  return `请求失败：${esc(msg)}。<br><span class="text-muted-foreground text-caption">请检查网络或 Key 后重试。</span>`
}

export { esc }
