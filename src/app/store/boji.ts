/* =============================================================================
 * 薄肌计划 · 全局状态仓库
 *
 * 形态与数据来源沿用原产品：一个 JSON 状态树整体持久化在 localStorage（Key: boji_plan_v1），
 * 所有个人数据（打卡 / 记忆 / 资产 / 健康 / 身体 / 计划 / 聊天）只存本机，零后端。
 *
 * 订阅模型：`useSyncExternalStore` —— `mutate()` 浅拷贝出新状态树后通知所有订阅页面重渲染，
 * 与 React 并发渲染兼容；页面只读 state，写操作一律走 mutate（自动落盘）。
 * ========================================================================== */

import { useSyncExternalStore } from 'react'

import { createSeed } from './seed'

/* ------------------------------- 数据类型 ------------------------------- */

export interface DayLog {
  water: number // ml
  sleep: number // h
  fight: number // min 搏击
  gym: number // min 薄肌
  create: number // 次
}

export interface DietEntry {
  id: string
  text: string
  ts: number
}

export interface MemoEntry {
  id: string
  text: string
  done: boolean
  ts: number
}

export type MemCat = '身体' | '决策' | '财富' | '偏好' | '目标' | '关系'

export interface MemoryEntry {
  id: string
  cat: MemCat
  text: string
  src: 'ai' | 'user'
  imp: 1 | 2 | 3
  date: string // yyyy-MM-dd
}

export interface AssetSnapshot {
  id: string
  date: string
  assets: number // 元
  debts: number // 元
  note: string
  ts: number
  src: 'ai' | 'user'
}

export type HealthLevel = '正常' | '关注' | '异常' | '疾病'

export interface HealthItem {
  name: string
  system: string
  level: HealthLevel
  note: string
}

export interface HealthRecord {
  summary: string
  items: HealthItem[]
  updatedAt: number
  source: 'ai' | 'user'
}

export interface BodySnapshot {
  id: string
  date: string
  height: number // cm
  weight: number // kg
  fat: number // %
  ts: number
  src: 'ai' | 'user'
}

export interface PlanDay {
  d: string // 周一…
  t: string // 主题
  items: string[]
}

export interface WeekPlan {
  days: PlanDay[]
  updatedAt: number
  source: 'ai' | 'user'
  basedOn: { height: number; weight: number; fat: number } | null
  equip: string
}

export interface ChatMessage {
  who: 'bot' | 'user'
  /** bot 消息：安全转义后的 HTML 片段（模型输出经 fmt() 转义） */
  html?: string
  /** user 消息：纯文本 */
  text?: string
  /** user 消息附带的图片缩略图（dataURL；对话历史里回看用，发送时另有全清图） */
  imgs?: string[]
  t: number
  /** 是否来自真实 API（展示「API 实时」标记） */
  api?: boolean
}

export interface ModelInfo {
  id: string
  n: string
  d: string
}

export interface BojiSettings {
  model: string
  botName: string
  /** 自动记忆提取：模型回答里的 [[MEMORY:…]] 标记自动入库 */
  autoMem: boolean
  /** 联网搜索：时效性问题先调 StepSearch 再回答 */
  webSearch: boolean
  apiBase: string
  apiKey: string
}

export interface BojiUser {
  name: string
  goal: string
  since: string
  lifespan: number
  birthday: string
  gender: string
  equipment: string
}

export interface BojiState {
  onboarded: boolean
  user: BojiUser
  settings: BojiSettings
  /** yyyy-MM-dd → 当日打卡 */
  data: Record<string, DayLog>
  diet: DietEntry[]
  memo: MemoEntry[]
  memories: MemoryEntry[]
  snapshots: AssetSnapshot[]
  health: HealthRecord | null
  body: BodySnapshot[]
  plan: WeekPlan | null
  chat: ChatMessage[]
  /** 开放平台拉到的模型列表（空 = 用内置兜底列表） */
  models: ModelInfo[]
  modelsAt: number
  /** 计划页当前展开的一天 */
  planOpen: string | null
}

/* ------------------------------- 常量 ------------------------------- */

export const LS_KEY = 'boji_plan_v1'

/** 每日目标：对标原产品的「碳基服务器」四指标 */
export const TARGETS = { water: 3000, sleep: 8, train: 60, create: 1 } as const

export const MEM_CATS: Record<MemCat, string> = {
  身体: 'primary',
  决策: 'info',
  财富: 'orange',
  偏好: 'violet',
  目标: 'danger',
  关系: 'violet',
}

export const DEFAULT_API_BASE = 'https://api.stepfun.com/v1'

export const MODELS_FALLBACK: ModelInfo[] = [
  { id: 'step-5-preview', n: 'step-5-preview', d: '默认 · 阶跃旗舰基模，1M 上下文，日常掌舵主力' },
]

/** 非对话类模型过滤（embed / tts / asr / 图片 / 视频…不进选择列表） */
export const MODEL_SKIP = /embed|tts|asr|rerank|ocr|moderat|image|video|audio|vision-?understand/i

export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export const QUICKS = ['💧 喝水打卡', '😴 睡眠打卡', '🥊 搏击训练', '🏋️ 薄肌训练', '✍️ 创造记录', '📚 讲讲理论']

/* ------------------------------- 工具 ------------------------------- */

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Date → yyyy-MM-dd（本地时区） */
export function dstr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

/** 今日打卡（不存在则建空）——返回的是 state.data 里的对象，调用方负责 mutate */
export function ensureDay(data: Record<string, DayLog>, k = dstr()): DayLog {
  if (!data[k]) data[k] = { water: 0, sleep: 0, fight: 0, gym: 0, create: 0 }
  return data[k]
}

export function emptyDay(): DayLog {
  return { water: 0, sleep: 0, fight: 0, gym: 0, create: 0 }
}

/** 金额格式化：300000 → 「30万」；12000 → 「1.2万」；800 → 「800」 */
export function fmtMoney(n: number): string {
  const a = Math.abs(n)
  if (a >= 10000) return `${(n / 10000).toFixed(a >= 1_000_000 ? 0 : 1).replace(/\.0$/, '')}万`
  return String(Math.round(n))
}

/** 解析用户输入的金额：支持 30万 / 300000 / 3k / 2千 */
export function parseAmount(s: string): number {
  const m = String(s ?? '')
    .replace(/[,，¥￥\s]/g, '')
    .match(/^(\d+(?:\.\d+)?)(万|w|k|千)?$/i)
  if (!m) return 0
  let v = parseFloat(m[1])
  if (/万|w/i.test(m[2] ?? '')) v *= 10000
  else if (/k/i.test(m[2] ?? '')) v *= 1000
  else if (/千/.test(m[2] ?? '')) v *= 1000
  return Math.round(v)
}

export function fmtNum(v: number | undefined | null, d = 1): string {
  return v === undefined || v === null || Number.isNaN(v) ? '—' : Number(v).toFixed(d)
}

export function bmiOf(h: number, w: number): number {
  return h > 0 ? w / (h / 100) ** 2 : 0
}

export function bmiLabel(b: number): string {
  if (b < 18.5) return '偏瘦'
  if (b < 24) return '正常'
  if (b < 28) return '超重'
  return '肥胖'
}

/** 今天是一周里的第几天（0 = 周一） */
export function todayIdx(): number {
  const w = new Date().getDay()
  return w === 0 ? 6 : w - 1
}

/* ------------------------------- Store ------------------------------- */

function loadState(): BojiState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BojiState
      // 兜底：老版本 / 缺字段的状态树补齐默认值，避免升级后白屏
      return { ...createSeed(), ...parsed }
    }
  } catch {
    /* 读取失败用种子数据 */
  }
  return createSeed()
}

let state: BojiState = loadState()
const listeners = new Set<() => void>()

function persist(): void {
  try {
    let json = JSON.stringify(state)
    // localStorage 配额约 5MB：超限时从最早的消息开始剥掉历史图片（缩略图），
    // 保证状态本身能落盘——不能因为图片把整个存储搞爆导致后续都不保存
    if (json.length > 4_000_000) {
      const draft: BojiState = { ...state }
      for (const m of draft.chat) {
        if (json.length <= 4_000_000) break
        if (m.imgs?.length) {
          delete m.imgs
          json = JSON.stringify(draft)
        }
      }
      state = draft
    }
    localStorage.setItem(LS_KEY, json)
  } catch {
    /* 存储满 / 隐私模式：静默失败，内存态继续可用 */
  }
}

function emit(): void {
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getState(): BojiState {
  return state
}

/**
 * 修改状态：传入的 draft 是浅拷贝出的新状态树，直接改它；
 * 保存后所有订阅页面重渲染。跨字段的复合操作也放在同一个 mutate 里，避免多次落盘。
 */
export function mutate(fn: (draft: BojiState) => void): void {
  const draft: BojiState = { ...state }
  fn(draft)
  state = draft
  persist()
  emit()
}

/** 重置为种子数据（「我的 → 重置所有数据」） */
export function resetState(): void {
  state = createSeed()
  persist()
  emit()
}

export function useBoji(): BojiState {
  return useSyncExternalStore(subscribe, getState, getState)
}
