/* =============================================================================
 * 薄肌计划 · 本地意图识别 + 剧本引擎（无 API Key 时的兜底体验）
 *
 * 两条机制沿用原产品：
 *  1. detect()：发送时先做本地意图识别——打卡 / 记忆类消息**先落数据**（不依赖模型），
 *     模型回复只负责确认、鼓励、指出风险；
 *  2. respond()：未接入 Key 时的本地剧本回复（打卡确认 / 决策剧本 / 理论问答 / 数学题…），
 *     并在首次明确提示如何接入真实模型。
 * ========================================================================== */

import {
  TARGETS,
  ensureDay,
  mutate,
  uid,
  dstr,
  type BojiState,
  type MemCat,
} from '@/app/store/boji'
import { esc } from './text'

/* ------------------------------- 意图识别 ------------------------------- */

export type Intent =
  | { type: 'greet' }
  | { type: 'math'; a: number; b: number; op: string }
  | { type: 'memory'; text: string }
  | { type: 'theory' }
  | { type: 'water'; ml: number }
  | { type: 'sleep'; h: number }
  | { type: 'fight'; m: number }
  | { type: 'gym'; m: number }
  | { type: 'create' }
  | { type: 'decision'; variant: 'house' | 'career' | 'generic' }
  | { type: 'fallback' }

export function detect(t: string): Intent {
  const s = t.toLowerCase()
  if (/(你好|hi|hello|在吗|你是谁|能做什么|帮助|介绍)/.test(s)) return { type: 'greet' }
  const mm = t.match(/(-?\d+(?:\.\d+)?)\s*([+＋\-−*×xX/／])\s*(-?\d+(?:\.\d+)?)/)
  if (mm) return { type: 'math', a: parseFloat(mm[1]), b: parseFloat(mm[3]), op: mm[2] }
  if (/(记住|记得|记下|别忘了|提醒我)/.test(s)) return { type: 'memory', text: cleanMemText(t) }
  if (/(理论|薄肌是什么|孙学|黄毛|先开图|搏击理论|大水|大睡|三位一体)/.test(s)) return { type: 'theory' }
  if (/(水|喝|饮料|ml|毫升|杯)/.test(s)) return { type: 'water', ml: parseMl(t) }
  if (/(睡|熬夜|起床|困)/.test(s)) return { type: 'sleep', h: parseH(t) }
  if (/(搏击|对抗|打拳|格斗|实战|反应|抗压)/.test(s)) return { type: 'fight', m: parseMin(t, 30) }
  if (/(薄肌|力量|健身|撸铁|训练|练了|打卡)/.test(s)) return { type: 'gym', m: parseMin(t, 45) }
  if (/(写|创造|发布|内容|产品|代码|视频|文章|输出)/.test(s)) return { type: 'create' }
  if (/(买房|看房|房子|房源|房贷)/.test(s)) return { type: 'decision', variant: 'house' }
  if (/(择业|跳槽|找工作|转行|行业|专业|创业|项目|投资|理财|梭哈|all ?in|副业)/.test(s)) return { type: 'decision', variant: 'career' }
  if (/(决策|选择|纠结|要不要|该不该|怎么选|拿不准|调研|开图|清单)/.test(s)) return { type: 'decision', variant: 'generic' }
  return { type: 'fallback' }
}

function cleanMemText(t: string): string {
  return t.replace(/(记住|记得|记下|别忘了|提醒我|一下|：|:)/g, '').trim()
}

function parseMl(t: string): number {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(ml|毫升|升|l)(?!\w)/i)
  if (m) {
    const v = parseFloat(m[1])
    return m[2] === '升' || m[2] === 'l' ? Math.round(v * 1000) : Math.round(v)
  }
  return /一杯|一瓶/.test(t) ? 250 : 250
}

function parseH(t: string): number {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(个)?\s*(小时|h)/i)
  return m ? parseFloat(m[1]) : 8
}

function parseMin(t: string, def: number): number {
  const m = t.match(/(\d+)\s*(分钟|min|分)/)
  return m ? parseInt(m[1]) : def
}

/** 记忆分类猜测（本地规则，与模型 [[MEMORY:…]] 分类保持一致） */
export function guessCat(t: string): MemCat {
  if (/(睡|水|训练|薄肌|搏击|蛋白|饮食|身体|奶)/.test(t)) return '身体'
  if (/(买|房|投资|钱|现金流|工资|薪|财富|收入)/.test(t)) return '财富'
  if (/(决定|选|决策|计划|目标|要|准备)/.test(t)) return '目标'
  if (/(朋友|家人|对象|Allen|同事|每周.*(练|见|开会))/.test(t)) return '关系'
  return '偏好'
}

/* ------------------------------- 本地落数据 ------------------------------- */

/**
 * 打卡 / 记忆类意图先落本地数据（不依赖模型），返回刚写入记忆的文本（供系统提示用）。
 */
export function applyLog(it: Intent): string | null {
  let memNote: string | null = null
  mutate((draft) => {
    const d = ensureDay(draft.data)
    if (it.type === 'water') d.water += it.ml
    else if (it.type === 'sleep') d.sleep = it.h
    else if (it.type === 'fight') d.fight += it.m
    else if (it.type === 'gym') d.gym += it.m
    else if (it.type === 'create') d.create += 1
    else if (it.type === 'memory') {
      const txt = it.text || ''
      if (txt.length >= 2) {
        draft.memories.unshift({ id: uid(), cat: guessCat(txt), text: txt, src: 'user', imp: 2, date: dstr() })
        memNote = txt
      }
    }
  })
  return memNote
}

/** 本周创造次数 */
function weekCreate(s: BojiState): number {
  let n = 0
  for (let i = 0; i < 7; i++) {
    const dt = new Date()
    dt.setDate(dt.getDate() - i)
    const e = s.data[dstr(dt)]
    if (e) n += e.create || 0
  }
  return n
}

function qchip(t: string): string {
  return `<button type="button" data-send="${esc(t)}" class="mt-2 me-2 inline-flex rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-caption font-semibold text-primary active:scale-95">${esc(t)}</button>`
}

/* ------------------------------- 剧本回复 ------------------------------- */

const THEORY_COUNT = 9

/** 未接入 Key 时的本地剧本回复（HTML 片段） */
export function respond(s: BojiState, t: string, it: Intent): string {
  const d = ensureDay(s.data)
  const bot = s.settings.botName || 'biubiu'
  const model = s.settings.model

  if (it.type === 'math') {
    const { a, b, op } = it
    const r = op === '+' || op === '＋' ? a + b : op === '-' || op === '−' ? a - b : op === '*' || op === '×' || op === 'x' || op === 'X' ? a * b : b !== 0 ? a / b : '∞（除数不能为 0）'
    const show = typeof r === 'number' ? String(Math.round(r * 10000) / 10000) : String(r)
    return `🧮 <b>${a} ${op} ${b} = ${show}</b><br><br>这种送分题对我背后的 ${esc(model)} 毫无压力。<br><span class="text-caption text-muted-foreground">接入真实模型后我才能全能——去「我的 → API 接入」填入 Key。</span>`
  }

  if (it.type === 'greet') {
    return (
      `你好，${esc(s.user.name)}。我是<b>${esc(bot)}</b>，你的 AI 掌舵 Agent 🦾<br><br>` +
      `· 大脑：<b>${esc(model)}</b>（「我的」页可切换）<br>` +
      `· 长期记忆：<b>${s.memories.length} 条</b>，关于你的事我会一直记着<br>` +
      '· 理论底座：搏击 / 大水 / 大睡 / 先开图再出兵 / 先自由后财富<br><br>' +
      '我能帮你：<br>💧 记录饮水、睡眠、搏击与薄肌训练<br>🧠 重大决策走「先开图，再出兵」流程<br>📚 记住你的目标、习惯和决定<br>🧭 每天给出掌舵建议<br><br>' +
      '直接说，或点下面的快捷按钮开始。' +
      `<div class="flex flex-wrap">${qchip('喝了500ml水')}${qchip('睡了6.5小时')}${qchip('练了30分钟搏击')}${qchip('帮我做一个买房决策')}</div>`
    )
  }

  if (it.type === 'water') {
    const left = Math.max(0, TARGETS.water - d.water)
    const extra = left === 0 ? '今日饮水<b>达标</b>。代谢和激素进入稳定状态，薄肌的地基打牢了。' : `还差 <b>${left}ml</b>，下午接着补。大水理论：水是代谢和激素的地基，含糖饮料是薄肌的税。`
    return `💧 +${it.ml}ml 已记录，今日累计 <b>${d.water}ml</b>。${extra}`
  }

  if (it.type === 'sleep') {
    const msg = it.h >= 8 ? '大睡理论满分 ✔ 激素和肌肉修复的窗口全开，今天的训练算没白练。' : it.h >= 7 ? '及格，但离 8 小时还差一截。今晚提前 30 分钟上床，就是白捡的增肌。' : '<b>警告：熬夜会直接废掉薄肌训练成果。</b>睡眠赤字 ' + (TARGETS.sleep - it.h).toFixed(1) + 'h，今晚 23:00 前上床是最高优先级。'
    return `😴 睡眠 <b>${it.h}h</b> 已记录（目标 8h）。${msg}`
  }

  if (it.type === 'fight') {
    return `🥊 搏击 <b>+${it.m}min</b>，今日训练合计 <b>${d.fight + d.gym}min</b>。<br><br>搏击是<b>动态神经资产</b>：练反应、抗压、冲突心态。薄肌是静态资产，搏击补的是大佬们（巴菲特、马斯克）都缺的那块底层能力。<br><br>不是让你去打比赛——是对抗训练带来的心理韧性，会迁移到每一个谈判桌和压力场。`
  }

  if (it.type === 'gym') {
    return `🏋️ 薄肌训练 <b>+${it.m}min</b> 已记录。<br><br>记住公式：<b>训练只是下单，睡觉才是收货。</b>肌肉在睡眠里生长，今晚的 8 小时就是这批订单的物流。`
  }

  if (it.type === 'create') {
    return `✍️ 创造 +1，本周累计 <b>${weekCreate(s)} 次</b>。<br><br>少消费，多创造。消费的快感 24 小时消退，创造的作品会持续给你带身份和现金流。<b>财富自由之后也要继续创造。</b>`
  }

  if (it.type === 'memory') {
    const txt = it.text || ''
    if (txt.length < 2) return '说清楚要记什么，比如：「记住我每周三晚和 Allen 练搏击」。'
    return `📚 已写入长期记忆：<b>${esc(txt)}</b>。这类信息我会在后续决策里自动引用。`
  }

  if (it.type === 'theory') {
    return (
      `📚 理论库共 <b>${THEORY_COUNT}</b> 套，完整版在「我的 → 理论库」。先给你三条最常用的：<br><br>` +
      '1. <b>先开图，再出兵</b>——重大决策前先调研足够多样本，前几个样本只建基准不下手<br>' +
      '2. <b>先自由，后财富</b>——自由是心态和选择权，财富是副产品<br>' +
      '3. <b>搏击 + 薄肌</b>——静态资产 + 动态神经资产，两个都要<br><br>' +
      '想深入哪一套？直接问我。' +
      `<div class="flex flex-wrap">${qchip('详细讲讲先开图再出兵')}${qchip('什么是搏击理论')}${qchip('三位一体是什么')}</div>`
    )
  }

  if (it.type === 'decision') {
    const head = '<b>先开图，再出兵。</b>这类决策别凭手感，按剧本走：<br><br>'
    let steps: string
    if (it.variant === 'house') {
      steps =
        '1️⃣ <b>广开图</b>：先看 <b>100 套</b>房，把价格 / 位置 / 户型 / 物业 / 退出难度全看一遍<br>' +
        '2️⃣ <b>建基准</b>：<b>前 3 套只用来建立认知基准，绝不考虑买</b>——没有基准，你判断不了好坏<br>' +
        '3️⃣ <b>设触发条件</b>：第 4~6 套开始，遇到<b>显著优于基准</b>的，立刻下手，不恋战<br>' +
        '4️⃣ <b>AI 批量调研</b>：我可以并行拉取同小区成交记录、竞品房源、租售比数据，生成对比表'
    } else if (it.variant === 'career') {
      steps =
        '1️⃣ <b>广开图</b>：用 AI 批量调研 <b>100 个行业 / 专业 / 项目</b>，每个只花 3 分钟<br>' +
        '2️⃣ <b>建坐标系</b>：按「现金流 / 成长性 / 可迁移能力 / 退出难度」四列拉表<br>' +
        '3️⃣ <b>收敛</b>：砍到 10 个候选，再逐个深挖——这时候才允许下注<br>' +
        '4️⃣ <b>先自由后财富</b>：选那个不锁死你的选项，保持「逐水草而居」的灵活性'
    } else {
      steps =
        '1️⃣ <b>广开图</b>：先列个调研清单，把这个决策的样本量补到 100 个量级<br>' +
        '2️⃣ <b>建基准</b>：前几个样本只看不选，用来校准你的判断标准<br>' +
        '3️⃣ <b>设触发条件</b>：写下「出现什么信号就出手」，避免临场情绪化<br>' +
        '4️⃣ <b>取交集</b>：大事同时问多个大模型，只采纳方案交集部分，最终你自己拍板'
    }
    return head + steps + '<br>要不要我帮你把调研清单列出来？' + `<div class="flex flex-wrap">${qchip('帮我生成调研清单')}${qchip('记下这个决策剧本')}${qchip('换个思路')}</div>`
  }

  // 兜底
  const isQ = /[?？]|吗|什么|怎么|为什么|多少|几点|谁|哪|是不是|能不能/.test(t)
  if (isQ) {
    return (
      '这个问题触及了我<b>本地剧本引擎</b>的盲区 😅<br><br>' +
      '接入真实模型后我就能认真回答：<br>1. 去「我的 → API 接入」填入 StepFun 开放平台的 Key<br>' +
      '2. 或者照孙哥的方法：同时问 3 个大模型，取方案交集，自己拍板' +
      `<div class="flex flex-wrap">${qchip('帮我做一个买房决策')}${qchip('讲讲搏击理论')}${qchip('我要打卡喝水500ml')}</div>`
    )
  }
  return (
    '收到。这类开放对话需要真实大模型——去「我的 → API 接入」填入 Key，我就能全程陪跑。<br><br>' +
    '在接入前，打卡、记忆、决策剧本和理论问答我都在行，直接说就行。'
  )
}

/** 未接入 Key 时的首次引导（只出现一次） */
export function noKeyNotice(model: string): string {
  return (
    '🔑 <b>尚未接入 API</b>——所有问题都应由真实模型（' +
    esc(model) +
    '）回答。<br><br>接入两步：<br>① 登录 <b>StepFun 开放平台</b> platform.stepfun.com（需注册登录）<br>' +
    '② 控制台 → API Keys 创建 Key，粘贴到「我的 → API 接入」<br><br>' +
    '<span class="text-caption text-muted-foreground">Key 只存在你自己设备上，不经过任何服务器。</span>'
  )
}
