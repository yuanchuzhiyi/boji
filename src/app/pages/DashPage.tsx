import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Pencil, Wrench } from 'lucide-react'

import { BotFace } from '@/shared/ui/BotFace'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Textarea } from '@/shared/ui/Input'
import { useToast } from '@/shared/ui/Toast'
import { MetricRing, WeekSleepChart } from '@/shared/ui/charts'
import { VoiceInputButton } from '@/app/components/VoiceInputButton'
import { cn } from '@/shared/lib/cn'
import {
  TARGETS,
  WEEKDAYS,
  clamp,
  dstr,
  ensureDay,
  mutate,
  todayIdx,
  useBoji,
  type DayLog,
  type PlanDay,
} from '@/app/store/boji'
import { generateWeekPlan } from '@/app/lib/stepfun'
import { esc } from '@/app/lib/text'

/**
 * 掌舵页：今日「碳基服务器」四指标 + 一周训练计划 + AI 掌舵日报 + 服务器负载 + 一键打卡。
 */
export function DashPage() {
  const s = useBoji()
  const { toast } = useToast()
  const [equipOpen, setEquipOpen] = useState(false)
  const [editPlanOpen, setEditPlanOpen] = useState(false)
  const [equipDraft, setEquipDraft] = useState('')
  const [planText, setPlanText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genMeta, setGenMeta] = useState<{ seconds: number; chars: number; preview: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** 器械弹层保存后是否紧接着触发生成 */
  const equipThenGenerate = useRef(false)

  const d = ensureDay(s.data)
  const botName = s.settings.botName || 'biubiu'
  const train = d.fight + d.gym
  const now = new Date()
  const weekLabel = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]

  /* ---------------- 一键打卡 ---------------- */

  const quickLogs: Array<{ icon: string; label: string; sub: string; run: (day: DayLog) => void }> = [
    { icon: '💧', label: '喝水 +250ml', sub: '白开水', run: (day) => { day.water += 250 } },
    { icon: '😴', label: '睡眠 8h', sub: '理想修复', run: (day) => { day.sleep = 8 } },
    { icon: '🥊', label: '搏击 30min', sub: '神经资产', run: (day) => { day.fight += 30 } },
    { icon: '🏋️', label: '薄肌 45min', sub: '静态资产', run: (day) => { day.gym += 45 } },
    { icon: '✍️', label: '创造 +1', sub: '少消费多创造', run: (day) => { day.create += 1 } },
    { icon: '🥤', label: '含糖饮料 +1', sub: '税！扣 200ml', run: (day) => { day.water = Math.max(0, day.water - 200) } },
  ]

  function quickLog(index: number) {
    mutate((draft) => {
      quickLogs[index].run(ensureDay(draft.data))
    })
    toast({ title: '已写入今日数据', tone: 'success' })
  }

  /* ---------------- 训练计划 ---------------- */

  function openEquip(thenGenerate: boolean) {
    setEquipDraft(s.user.equipment || '')
    equipThenGenerate.current = thenGenerate
    setEquipOpen(true)
  }

  function saveEquip() {
    mutate((draft) => {
      draft.user.equipment = equipDraft.trim().slice(0, 120)
    })
    setEquipOpen(false)
    if (equipThenGenerate.current) {
      equipThenGenerate.current = false
      void doGeneratePlan()
    } else {
      toast({ title: '器械条件已保存' })
    }
  }

  function planToText(days: PlanDay[]): string {
    return days.map((day) => `${day.d}|${day.t}\n${day.items.join('\n')}`).join('\n\n')
  }

  function openEditPlan() {
    const days = s.plan?.days ?? []
    setPlanText(days.length ? planToText(days) : WEEKDAYS.map((d) => `${d}|`).join('\n\n'))
    setEditPlanOpen(true)
  }

  function savePlan() {
    const days: PlanDay[] = []
    let cur: PlanDay | null = null
    for (const raw of planText.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const m = line.match(/^(周[一二三四五六日]|星期[一二三四五六日])\s*[|:：]\s*(.*)$/)
      if (m) {
        cur = { d: m[1].replace('星期', '周'), t: (m[2] || '训练日').slice(0, 40), items: [] }
        days.push(cur)
      } else if (cur) {
        cur.items.push(line.slice(0, 80))
      } else {
        cur = { d: WEEKDAYS[days.length] || '其他', t: line.slice(0, 40), items: [] }
        days.push(cur)
      }
    }
    days.forEach((day) => {
      if (!day.items.length && day.t) day.items = [day.t]
    })
    if (!days.length) {
      toast({ title: '至少写一天', tone: 'warning' })
      return
    }
    mutate((draft) => {
      draft.plan = {
        days,
        updatedAt: Date.now(),
        source: 'user',
        basedOn: draft.plan?.basedOn ?? null,
        equip: draft.user.equipment || draft.plan?.equip || '',
      }
    })
    setEditPlanOpen(false)
    toast({ title: '训练计划已固定', tone: 'success' })
  }

  async function doGeneratePlan() {
    if (!s.settings.apiKey) {
      toast({ title: 'AI 生成需要先接入 API', description: '去「我的 → API 接入」填入 Key', tone: 'warning' })
      return
    }
    const body = [...s.body].sort((a, b) => a.ts - b.ts)
    if (!body.length) {
      toast({ title: '先在「健康」页记录一次身体快照', description: '身高 / 体重 / 体脂', tone: 'warning' })
      return
    }
    setGenerating(true)
    setGenMeta({ seconds: 0, chars: 0, preview: '' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const days = await generateWeekPlan(
        {
          onWaiting: (seconds, chars) => setGenMeta((st) => ({ ...(st ?? { seconds: 0, chars: 0, preview: '' }), seconds, chars })),
          onPreview: (text, kind) =>
            setGenMeta((st) => ({ ...(st ?? { seconds: 0, chars: 0, preview: '' }), preview: (kind === 'reason' ? '💭 ' : '') + text.slice(-280) })),
        },
        controller.signal,
      )
      const last = body[body.length - 1]
      mutate((draft) => {
        draft.plan = {
          days,
          updatedAt: Date.now(),
          source: 'ai',
          basedOn: { height: last.height, weight: last.weight, fat: last.fat },
          equip: draft.user.equipment,
        }
        draft.planOpen = null
      })
      toast({ title: '已生成并固定一周训练计划', tone: 'success' })
    } catch (err) {
      if ((err as Error).name === 'AbortError') toast({ title: '已取消生成' })
      else toast({ title: '生成失败', description: (err as Error).message, tone: 'danger' })
    } finally {
      abortRef.current = null
      setGenerating(false)
      setGenMeta(null)
    }
  }

  /* ---------------- AI 掌舵日报 ---------------- */

  const advice: Array<[string, string]> = []
  const todayName = WEEKDAYS[todayIdx()]
  const todayPlan = s.plan?.days.find((x) => x.d === todayName)
  if (todayPlan) advice.push(['🗓️', `今日训练计划：<b>${esc(todayPlan.t)}</b>（已固定，上方可展开）`])
  if (d.water < TARGETS.water * 0.5) advice.push(['💧', `饮水落后：现在补 <b>${TARGETS.water - d.water}ml</b>，分 3 次喝，别等口渴。`])
  else if (d.water < TARGETS.water) advice.push(['💧', `饮水差 <b>${TARGETS.water - d.water}ml</b> 达标，下午来两杯。`])
  else advice.push(['💧', '饮水达标 ✔ 代谢地基稳固，保持。'])
  if (d.sleep < 7) advice.push(['🌙', `睡眠赤字 <b>${(TARGETS.sleep - d.sleep).toFixed(1)}h</b>：今晚 23:00 前上床，否则训练成果打折。`])
  else if (d.sleep >= 8) advice.push(['🌙', '睡眠满分 ✔ 肌肉修复窗口全开。'])
  else advice.push(['🌙', `睡眠 ${d.sleep}h 及格，冲 8h 就是白捡的增肌。`])
  if (train === 0) advice.push(['🏋️', '今日未训练：<b>30 分钟薄肌</b> 或 <b>20 分钟搏击</b>，二选一即可。'])
  else advice.push(['🥊', `已训练 ${train}min ✔${d.fight ? '（含搏击，神经资产 +1）' : '，缺一块动态神经资产——搏击安排上了吗？'}`])
  if (d.create === 0) advice.push(['✍️', '今日无创造产出：写 <b>300 字</b>或改一版产品，少消费多创造。'])
  else advice.push(['✍️', `创造 ${d.create} 次 ✔ 长期价值持续复利。`])

  /* ---------------- 服务器负载 ---------------- */

  const debt = Math.max(0, TARGETS.sleep - d.sleep)
  const load = clamp(Math.round(28 + debt * 14 + Math.max(0, TARGETS.water - d.water) / 45), 5, 99)
  const loadState = load < 45 ? { label: '流畅', cls: 'bg-primary-soft text-primary' } : load < 70 ? { label: '中等负载', cls: 'bg-warning/15 text-warning' } : { label: '过载', cls: 'bg-danger/15 text-danger' }
  const loadTip = load < 45 ? '各项指标在线，可以上强度，也可以上难度——决策、训练都行。' : load < 70 ? '先补水、补觉，把负载降下来再碰重大决策。' : '碳基服务器过热：停止熬夜，今晚只做一件事——23 点前睡觉。'

  /* ---------------- 近 7 日睡眠 ---------------- */

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date()
    dt.setDate(dt.getDate() - (6 - i))
    const key = dstr(dt)
    const entry = s.data[key]
    return { label: key.slice(8), value: entry?.sleep ?? 0, today: i === 6 }
  })

  const planDays = s.plan?.days ?? []

  return (
    <div className="page space-y-3">
      {/* 日期头 */}
      <div className="flex items-baseline gap-2 pt-1">
        <span className="text-display font-semibold">{dstr(now).slice(5)}</span>
        <span className="text-caption text-muted-foreground">周{weekLabel} · 碳基服务器运行中</span>
      </div>

      {/* 今日指标 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">今日碳基服务器指标</h2>
          <Link to="/" className="text-caption font-medium text-info">
            去对话汇报 →
          </Link>
        </div>
        <div className="flex justify-between gap-1.5">
          <MetricRing value={d.water} max={TARGETS.water} unit="/3000ml" label="饮水" color="info" />
          <MetricRing value={d.sleep} max={TARGETS.sleep} unit="/8h" label="睡眠" color="violet" />
          <MetricRing value={train} max={TARGETS.train} unit="/60min" label="训练" color="primary" />
          <MetricRing value={d.create} max={TARGETS.create} unit="/1次" label="创造" color="orange" />
        </div>
      </section>

      {/* 一周训练计划 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-body font-semibold">一周训练计划</h2>
          {planDays.length > 0 && (
            <span className="text-caption text-muted-foreground">
              {s.plan?.source === 'ai' ? '🤖 AI 生成' : '✍️ 手动'} · {s.plan?.updatedAt ? dstr(new Date(s.plan.updatedAt)) : ''}
            </span>
          )}
        </div>

        {generating && genMeta ? (
          <div className="py-1">
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-info">⏳ {botName}正在生成计划…</span>
              <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                取消
              </Button>
            </div>
            <p className="mt-1.5 text-caption text-muted-foreground">
              已等待 {genMeta.seconds}s · 已接收 {genMeta.chars} 字{genMeta.seconds >= 45 ? ' · 推理模型思考中，没卡住，可取消' : ''}
            </p>
            {genMeta.preview && (
              <p className="mt-2 line-clamp-3 max-h-[120px] overflow-hidden whitespace-pre-wrap break-all rounded-md bg-surface-muted p-2.5 text-caption text-muted-foreground">
                {genMeta.preview}
              </p>
            )}
          </div>
        ) : planDays.length === 0 ? (
          <p className="py-1 text-caption leading-relaxed text-muted-foreground">
            还没有训练计划。点「AI 生成」——先告诉你手头有什么器械，{botName}再按你的身体数据出一份
            <b className="text-surface-foreground">写到组数×次数、组间休息秒数</b>
            的一周计划，生成后即固定。也可以直接「编辑」手写。
          </p>
        ) : (
          <>
            {s.plan?.basedOn && (
              <p className="mb-1 text-caption text-muted-foreground">
                📌 基于 {s.plan.basedOn.height}cm / {s.plan.basedOn.weight}kg / 体脂 {s.plan.basedOn.fat}%（BMI{' '}
                {(s.plan.basedOn.weight / (s.plan.basedOn.height / 100) ** 2).toFixed(1)}）
                {s.plan.source === 'ai' ? '由 AI 生成' : '手动维护'}
              </p>
            )}
            {s.plan?.equip && <p className="mb-2 text-caption text-muted-foreground">🔧 器械 / 条件：{s.plan.equip}</p>}
            <p className="mb-1 text-caption text-muted-foreground">点某一天展开 / 收起当天动作（默认只显示概要）</p>
            <div>
              {planDays.map((day, i) => {
                const isToday = day.d === todayName
                const isOpen = s.planOpen === day.d
                return (
                  <div key={day.d} className={cn('py-2.5', i < planDays.length - 1 && 'border-b border-border')}>
                    <button
                      type="button"
                      onClick={() =>
                        mutate((draft) => {
                          draft.planOpen = draft.planOpen === day.d ? null : day.d
                        })
                      }
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span className={cn('w-9 shrink-0 text-body font-semibold', isToday ? 'text-primary' : 'text-muted-foreground')}>
                        {day.d}
                      </span>
                      <span className={cn('min-w-0 flex-1 text-body font-medium leading-snug', isToday ? 'text-surface-foreground' : 'text-muted-foreground')}>
                        {day.t}
                      </span>
                      <span className="shrink-0 text-caption text-muted-foreground">{day.items.length} 个动作</span>
                      <span className="w-3 shrink-0 text-center text-caption text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
                      {isToday && <span className="shrink-0 text-caption font-semibold text-primary">今天</span>}
                    </button>
                    {isOpen && (
                      <div className="ml-3.5 mt-2 space-y-1">
                        {day.items.map((item, j) => (
                          <div key={j} className="flex gap-1.5 text-caption leading-relaxed text-muted-foreground">
                            <span className="text-border" aria-hidden>
                              ·
                            </span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" loading={generating} onClick={() => openEquip(true)}>
            <Bot className="size-4" aria-hidden />
            {planDays.length ? '重新生成' : 'AI 生成'}
          </Button>
          <Button size="sm" variant="outline" onClick={openEditPlan}>
            <Pencil className="size-4" aria-hidden />
            编辑
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEquip(false)}>
            <Wrench className="size-4" aria-hidden />
            器械
          </Button>
        </div>
      </section>

      {/* AI 掌舵日报 */}
      <section className="rounded-md bg-surface p-4">
        <h2 className="mb-3 text-body font-semibold">AI 掌舵日报</h2>
        <div className="space-y-2.5">
          {advice.map(([icon, text], i) => (
            <div key={i} className="flex gap-2.5 text-caption leading-relaxed [&_b]:text-primary">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted" aria-hidden>
                {icon}
              </span>
              <span dangerouslySetInnerHTML={{ __html: text }} />
            </div>
          ))}
        </div>
      </section>

      {/* 碳基服务器状态 */}
      <section className="rounded-md bg-surface p-4">
        <h2 className="mb-3 text-body font-semibold">碳基服务器状态</h2>
        <div className="flex items-center gap-3">
          <div className="size-16 shrink-0">
            <BotFace />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-display font-semibold text-primary">{load}%</span>
              <span className={cn('rounded-full px-2 py-0.5 text-caption font-semibold', loadState.cls)}>{loadState.label}</span>
            </div>
            <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">{loadTip}</p>
          </div>
        </div>
      </section>

      {/* 近 7 日睡眠 */}
      <section className="rounded-md bg-surface p-4">
        <h2 className="mb-3 text-body font-semibold">近 7 日睡眠</h2>
        <WeekSleepChart days={weekDays} />
      </section>

      {/* 一键打卡 */}
      <h2 className="px-1 pt-1 text-caption font-semibold tracking-wide text-muted-foreground">⚡ 一键打卡（自动写入今日数据）</h2>
      <div className="grid grid-cols-3 gap-2">
        {quickLogs.map((log, i) => (
          <button
            key={log.label}
            type="button"
            onClick={() => quickLog(i)}
            className="flex min-h-tap flex-col items-center gap-1 rounded-md border border-border bg-surface-muted p-3 active:scale-95 active:border-primary"
          >
            <span className="text-title" aria-hidden>
              {log.icon}
            </span>
            <span className="text-caption font-semibold text-surface-foreground">{log.label}</span>
            <span className="text-caption text-muted-foreground">{log.sub}</span>
          </button>
        ))}
      </div>

      {/* 器械条件弹层 */}
      <Dialog
        open={equipOpen}
        onClose={() => setEquipOpen(false)}
        title="我的器械 / 条件"
        description={`${botName}只推荐你手头能做的——没有搏击条件就写「无搏击条件」，它绝不会给你排搏击。`}
      >
        <Textarea
          rows={3}
          value={equipDraft}
          onChange={(e) => setEquipDraft(e.target.value)}
          placeholder="如：哑铃一对（5-20kg）、卧推凳、瑜伽垫、小区单杠；无搏击条件；无健身房"
          label="器械 / 条件"
        />
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setEquipOpen(false)}>
            取消
          </Button>
          <Button className="flex-1" onClick={saveEquip}>
            保存
          </Button>
        </div>
      </Dialog>

      {/* 编辑计划弹层 */}
      <Dialog
        open={editPlanOpen}
        onClose={() => setEditPlanOpen(false)}
        title="一周训练计划"
        description="「周一|标题」开新一天，下面每行写一个动作（组数×次数、组间休息都要写）。空行会被忽略，保存后即固定。"
      >
        <div className="flex items-end gap-2">
          <Textarea rows={8} value={planText} onChange={(e) => setPlanText(e.target.value)} label="计划文本" className="flex-1" />
          <VoiceInputButton onResult={(text) => setPlanText((prev) => (prev ? `${prev}\n${text}` : text))} />
        </div>
        <p className="mt-1.5 text-caption text-muted-foreground">麦克风语音录入会追加为新的动作行。</p>
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setEditPlanOpen(false)}>
            取消
          </Button>
          <Button className="flex-1" onClick={savePlan}>
            保存并固定
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
