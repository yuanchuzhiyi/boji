/* =============================================================================
 * 薄肌计划 · 种子数据（首次打开 / 重置后的初始状态）
 *
 * 与产品原版一致：首次启动即带一组「真实感演示数据」（近 7 天打卡、资产与身体曲线快照、
 * 一周训练计划、欢迎语），让指标环、曲线、计划一打开就有形状；用户在「我的 → 重置所有数据」
 * 可随时回到这份初始状态。生日留空，生命倒计时在用户设置后启动（与原版一致）。
 * ========================================================================== */

import {
  DEFAULT_API_BASE,
  uid,
  dstr,
  type AssetSnapshot,
  type BodySnapshot,
  type BojiState,
  type DietEntry,
  type HealthRecord,
  type MemoryEntry,
  type MemoEntry,
  type PlanDay,
  type WeekPlan,
} from './boji'

function at(h: number, m: number): number {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function seedDiet(): DietEntry[] {
  return [
    { id: uid(), text: '早餐：燕麦 60g + 鸡蛋 2 个 + 黑咖啡', ts: at(8, 5) },
    { id: uid(), text: '午餐：鸡胸肉沙拉 + 米饭 200g', ts: at(12, 20) },
    { id: uid(), text: '加餐：香蕉 1 根 + 分离乳清 30g', ts: at(15, 40) },
  ]
}

function seedMemo(): MemoEntry[] {
  const now = Date.now()
  return [
    { id: uid(), text: '周三晚 8 点和 Allen 练搏击', done: false, ts: now - 5 * 3600 * 1000 },
    { id: uid(), text: '三个月后复查肝功能和尿酸', done: false, ts: now - 86400000 },
    { id: uid(), text: '买分离乳清蛋白粉', done: true, ts: now - 2 * 86400000 },
  ]
}

function seedHealth(): HealthRecord {
  return {
    summary:
      '整体底子不错，两个要盯的点：轻度脂肪肝（肝）、尿酸偏高（代谢）。控糖控酒，每周保持 3 次搏击，睡够 8 小时，三个月后复查。',
    items: [
      { name: '轻度脂肪肝', system: '肝', level: '关注', note: 'B 超提示' },
      { name: '尿酸偏高', system: '代谢', level: '关注', note: '480 μmol/L' },
    ],
    updatedAt: Date.now() - 5 * 86400000,
    source: 'ai',
  }
}

function seedBody(): BodySnapshot[] {
  const defs: Array<[number, number, number, number]> = [
    [58, 175, 78.0, 22.0],
    [45, 175, 76.5, 21.0],
    [31, 175, 75.0, 20.0],
    [16, 175, 74.2, 19.4],
    [4, 175, 73.5, 18.8],
  ]
  return defs.map(([ago, height, weight, fat]) => {
    const dt = daysAgo(ago)
    return { id: uid(), date: dstr(dt), height, weight, fat, ts: dt.getTime(), src: 'user' as const }
  })
}

function seedSnapshots(): AssetSnapshot[] {
  const defs: Array<[number, number, number, string]> = [
    [58, 120000, 0, '起点：工资结余'],
    [45, 180000, 0, '定投一年后'],
    [31, 190000, 20000, '年初借出 2 万计入债权'],
    [16, 220000, 20000, '项目分成到账'],
    [4, 270000, 20000, '近期一笔投资浮盈'],
  ]
  return defs.map(([ago, assets, debts, note]) => {
    const dt = daysAgo(ago)
    return { id: uid(), date: dstr(dt), assets, debts, note, ts: dt.getTime(), src: 'user' as const }
  })
}

function seedMemories(): MemoryEntry[] {
  const y = dstr(daysAgo(1))
  return [
    { id: uid(), cat: '目标', text: '2025 Q3 目标：体脂降到 12%，能打完 3 局自由搏击不喘', src: 'ai', imp: 3, date: y },
    { id: uid(), cat: '身体', text: '乳糖不耐，蛋白粉选分离乳清，训练后 30 分钟内补', src: 'user', imp: 2, date: y },
    { id: uid(), cat: '决策', text: '看房剧本：先看 100 套，前 3 套只建认知基准不买，遇到显著更优立刻下手', src: 'ai', imp: 3, date: y },
    { id: uid(), cat: '偏好', text: '认同「先自由后财富」：不被固定岗位锁死，逐水草而居', src: 'user', imp: 2, date: y },
    { id: uid(), cat: '关系', text: '每周三晚 8 点和 Allen 练搏击，雷打不动', src: 'user', imp: 3, date: y },
    { id: uid(), cat: '财富', text: '现金流结构：内容 + 产品。消费只保留体验型，其余一律转入创造账户', src: 'ai', imp: 2, date: y },
    { id: uid(), cat: '身体', text: '喝水目标 3000ml/天，含糖饮料每周不超过 1 次', src: 'ai', imp: 1, date: y },
  ]
}

function seedPlanDays(): PlanDay[] {
  return [
    {
      d: '周一',
      t: '薄肌 · 上肢推（总时长约 50 分钟）',
      items: [
        '热身：开合跳 3 分钟 + 肩袖激活 12 次',
        '哑铃卧推 4 组 × 12 次，组间休 90 秒（选第 12 次略吃力的重量）',
        '哑铃肩推 3 组 × 12 次，组间休 60 秒',
        '哑铃三头屈伸 3 组 × 15 次，组间休 45 秒',
        '拉伸：胸、肩静态拉伸各 30 秒 × 2 组',
      ],
    },
    {
      d: '周二',
      t: '薄肌 · 下肢（总时长约 45 分钟）',
      items: [
        '热身：原地高抬腿 3 分钟 + 髋绕环 10 次',
        '高脚杯深蹲 4 组 × 12 次，组间休 90 秒',
        '罗马尼亚硬拉 3 组 × 12 次，组间休 90 秒（腰背保持平直）',
        '分腿蹲 3 组 × 10 次/侧，组间休 60 秒（退阶：手扶墙）',
        '小腿提踵 3 组 × 15 次，组间休 45 秒',
      ],
    },
    {
      d: '周三',
      t: '恢复日（总时长约 30 分钟）',
      items: ['快走或骑行 20 分钟，强度以「能正常说话」为准', '全身拉伸 10 分钟，重点髋前侧和肩背'],
    },
    {
      d: '周四',
      t: '薄肌 · 上肢拉（总时长约 50 分钟）',
      items: [
        '热身：肩绕环 20 次 + 俯卧撑 1 组 × 10 次激活',
        '单杠引体向上 4 组 × 8-12 次，组间休 90 秒（退阶：澳式划船）',
        '单臂哑铃划船 3 组 × 12 次/侧，组间休 60 秒',
        '哑铃弯举 3 组 × 12 次，组间休 45 秒',
        '面拉（弹力带）3 组 × 15 次，组间休 45 秒',
      ],
    },
    {
      d: '周五',
      t: '核心 + 低强度有氧（总时长约 35 分钟）',
      items: [
        '死虫式 3 组 × 10 次/侧，组间休 45 秒',
        '平板支撑 3 组 × 30-45 秒，组间休 45 秒',
        '登山跑 3 组 × 20 秒，组间休 60 秒',
        '有氧：快走 20 分钟',
      ],
    },
    {
      d: '周六',
      t: '全身循环（总时长约 40 分钟）',
      items: [
        '以下循环做 3 轮，动作间休 15 秒，轮间休 2 分钟：',
        '深蹲 × 15 次 → 俯卧撑 × 12 次（退阶：跪姿）→ 哑铃划船 × 12 次/侧 → 开合跳 30 秒',
      ],
    },
    {
      d: '周日',
      t: '完全休息',
      items: ['不安排训练；补水 3000ml、睡够 8 小时，复盘本周完成度'],
    },
  ]
}

function seedPlan(): WeekPlan {
  return {
    days: seedPlanDays(),
    updatedAt: Date.now() - 86400000,
    source: 'ai',
    basedOn: { height: 175, weight: 73.5, fat: 18.8 },
    equip: '哑铃一对（5-20kg）、可调节卧推凳、瑜伽垫、小区单杠；无搏击条件',
  }
}

function seedData(): BojiState['data'] {
  const d: BojiState['data'] = {}
  const sleepHist = [7.2, 6.4, 7.8, 8.2, 6.9, 7.5, 7.6]
  const waterHist = [2100, 1750, 2600, 3000, 2400, 2850, 1650]
  for (let i = 6; i >= 0; i--) {
    const dt = daysAgo(i)
    d[dstr(dt)] = {
      water: waterHist[6 - i],
      sleep: sleepHist[6 - i],
      fight: i % 2 ? 25 : 0,
      gym: [40, 0, 45, 35, 0, 50, 30][6 - i],
      create: i < 3 ? 1 : 0,
    }
  }
  return d
}

/** 首次打开 / 重置后的完整初始状态 */
export function createSeed(): BojiState {
  const yesterday = dstr(daysAgo(1))
  return {
    onboarded: true,
    user: {
      name: '阿晨',
      goal: '全套掌舵',
      since: yesterday,
      lifespan: 80,
      birthday: '',
      gender: '男',
      equipment: '哑铃一对（5-20kg）、可调节卧推凳、瑜伽垫、小区单杠；无搏击条件',
    },
    settings: {
      model: 'step-5-preview',
      botName: '小薄',
      autoMem: true,
      webSearch: true,
      ttsVoice: 'cixingnansheng',
      autoSpeak: false,
      apiBase: DEFAULT_API_BASE,
      apiKey: '',
    },
    data: seedData(),
    diet: seedDiet(),
    memo: seedMemo(),
    memories: seedMemories(),
    snapshots: seedSnapshots(),
    health: seedHealth(),
    body: seedBody(),
    plan: seedPlan(),
    chat: [
      {
        who: 'bot',
        html:
          '早上好，阿晨 👋 我是<b>小薄</b>，你的 AI 掌舵 Agent。模型 <b>step-5-preview</b> 已挂载，长期记忆 7 条。<br><br>' +
          '昨天的数据我看完了：睡眠 7.5h 及格，饮水 2850ml 差一点，搏击 25 分钟 ✔。<br><br>' +
          '今天想从哪件事开始？',
        t: Date.now() - 12 * 3600 * 1000,
      },
    ],
    models: [],
    modelsAt: 0,
    planOpen: null,
  }
}
