import { useEffect, useState, type ReactNode } from 'react'
import { Cpu, Download, Sparkles, Trash2 } from 'lucide-react'

import { BotFace } from '@/shared/ui/BotFace'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Input, Switch } from '@/shared/ui/Input'
import { useToast } from '@/shared/ui/Toast'
import { cn } from '@/shared/lib/cn'
import { APP_VERSION } from '@/shared/config/app'
import { dstr, getState, mutate, resetState, uid, useBoji } from '@/app/store/boji'
import { ModelPickerDialog } from '@/app/components/ModelPickerDialog'
import { probeConnection } from '@/app/lib/stepfun'
import { esc } from '@/app/lib/text'

interface Theory {
  t: string
  tag: string
  d: string
}

const THEORIES: Theory[] = [
  { t: '搏击理论', tag: '邵艾伦', d: '薄肌管体态、代谢、抗衰（静态资产）；搏击管神经、反应、抗压、冲突心态（动态神经资产）。大佬们缺的正是这一块——不是要去打比赛，而是对抗训练带来的心理韧性。' },
  { t: '大水理论', tag: '邵艾伦', d: '大量白开水，少糖饮料。水是代谢和激素的地基，也是维持薄肌的基础设施。' },
  { t: '大睡理论', tag: '邵艾伦', d: '睡眠是激素与肌肉修复的核心。熬夜会直接废掉薄肌训练成果——训练只是下单，睡觉才是收货。' },
  { t: '先开图，再出兵', tag: '孙宇晨', d: '重大决策前先广泛调研足够多样本：买房先看 100 套，前 3 套只用来建立认知基准、绝不能买；4~6 套遇到显著更好的，立刻下手。信息足够之后再行动，不要在认知没建立时仓促下注。' },
  { t: '先自由，后财富', tag: '孙宇晨', d: '大众误区是「赚到钱才能自由」。真相是：自由是一种心态与选择权，先拥有自由的状态，财富才会作为副产品到来。逐水草而居，保持灵活，不要被资产和固定岗位锁死。' },
  { t: 'AI 个人掌舵', tag: '孙宇晨', d: '把自己当成一家公司：AI 做日常掌舵，人负责最终判断微调。持续记录睡眠、饮食、训练、收支、日程喂给 AI；遇到大事同时问多个大模型，取方案交集，再自己决策。年轻人预算很少时，优先买 AI 工具而不是消费品。' },
  { t: '少消费，多创造', tag: '孙宇晨', d: '消费只能带来短暂快感；创造（写作、产品、项目、内容）带来长期价值与身份跃迁。财富自由之后依然要持续创造，不能停留在纯消费享乐。' },
  { t: '人生体验互补', tag: '孙宇晨', d: '一直做创业者会缺少打工人视角，人生要补齐不同身份体验——他甚至提出愿意倒贴钱去 OpenAI / Anthropic 上班。模拟器游戏同理：通过游戏体验不同人生，打开认知边界。' },
  { t: '三位一体：孙学 × 薄肌 × 黄毛', tag: '网络总结', d: '孙学：财富、机会、决策方法论；薄肌：身体底层资产，碳基服务器；黄毛：独立判断，敢于顶住质疑执行。' },
]

/**
 * 「我的」页：生命倒计时 + 个人资料 + 机器人 / 模型设置 + 理论库 + API 接入 + 数据管理。
 */
export function MePage() {
  const s = useBoji()
  const { toast } = useToast()
  const [now, setNow] = useState(Date.now())
  const [modelSheet, setModelSheet] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileLifespan, setProfileLifespan] = useState('')
  const [profileBirthday, setProfileBirthday] = useState('')
  const [profileGender, setProfileGender] = useState('')
  const [apiBase, setApiBase] = useState(s.settings.apiBase)
  const [apiKey, setApiKey] = useState(s.settings.apiKey)
  const [apiStatus, setApiStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [onboardOpen, setOnboardOpen] = useState(false)

  // 生命倒计时：秒级跳动
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const botName = s.settings.botName || '小薄'
  const sinceDays = Math.max(1, Math.round((Date.now() - new Date(s.user.since).getTime()) / 86400000))

  /* ---------------- 生命倒计时 ---------------- */

  const birthday = s.user.birthday ? new Date(`${s.user.birthday}T00:00:00`) : null
  const end = birthday ? new Date(birthday.getFullYear() + (s.user.lifespan || 80), birthday.getMonth(), birthday.getDate()) : null
  const remainMs = end ? end.getTime() - now : 0

  /* ---------------- 设置动作 ---------------- */

  function openRename() {
    setNameDraft(botName)
    setRenameOpen(true)
  }

  function saveBotName() {
    const v = nameDraft.trim().slice(0, 8)
    if (!v) {
      toast({ title: '名字不能为空', tone: 'warning' })
      return
    }
    mutate((draft) => {
      draft.settings.botName = v
    })
    setRenameOpen(false)
    toast({ title: `以后它叫「${v}」了`, tone: 'success' })
  }

  function openProfile() {
    setProfileName(s.user.name)
    setProfileLifespan(String(s.user.lifespan || 80))
    setProfileBirthday(s.user.birthday)
    setProfileGender(s.user.gender)
    setProfileOpen(true)
  }

  function saveProfile() {
    const ls = parseInt(profileLifespan.replace(/[^\d]/g, ''))
    mutate((draft) => {
      draft.user.name = profileName.trim() || draft.user.name
      draft.user.lifespan = ls && ls > 0 && ls < 150 ? ls : 80
      draft.user.birthday = profileBirthday.trim()
      draft.user.gender = profileGender
    })
    setProfileOpen(false)
    toast({ title: '资料已更新', tone: 'success' })
  }

  function saveApi() {
    mutate((draft) => {
      draft.settings.apiBase = apiBase.trim() || 'https://api.stepfun.com/v1'
      draft.settings.apiKey = apiKey.trim()
    })
    setApiStatus(null)
    toast({
      title: apiKey.trim() ? `已接入 StepCode，所有问题将由 ${s.settings.model} 实时回答` : 'Key 已清空，暂时回到剧本引擎',
      tone: apiKey.trim() ? 'success' : 'info',
    })
  }

  async function testConnection() {
    setTesting(true)
    const result = await probeConnection()
    setTesting(false)
    setApiStatus({ ok: result.ok, text: result.message })
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'boji-plan-data.json'
    a.click()
    URL.revokeObjectURL(a.href)
    toast({ title: '已导出 JSON', tone: 'success' })
  }

  /* ---------------- 新手引导（3 步） ---------------- */

  const [obStep, setObStep] = useState(0)
  const [obName, setObName] = useState('')
  const [obGoal, setObGoal] = useState('')
  const goals = ['全套掌舵', '薄肌体型', '搏击心态', '财富决策']

  function startOnboarding() {
    setObStep(0)
    setObName(s.user.name === '阿晨' ? '' : s.user.name)
    setObGoal('')
    setOnboardOpen(true)
  }

  function finishOnboarding() {
    mutate((draft) => {
      draft.user.name = obName || draft.user.name
      draft.user.goal = obGoal || '全套掌舵'
      draft.user.since = dstr()
      draft.onboarded = true
      if (obGoal) {
        const gtxt = `主战场：${obGoal}（设定于 ${dstr()}，${botName}会按这个侧重点每日盯盘）`
        if (!draft.memories.some((m) => m.text === gtxt)) {
          draft.memories.unshift({ id: uid(), cat: '目标', text: gtxt, src: 'ai', imp: 3, date: dstr() })
        }
      }
      draft.chat.push({
        who: 'bot',
        t: Date.now(),
        html: `认识了，${esc(draft.user.name)}。✅ 我是${esc(botName)}，模型 <b>${esc(draft.settings.model)}</b>，长期记忆已挂载。<br><br>从今天起：饮水、睡眠、搏击、薄肌、创造，我每天帮你盯；遇到大事，走「先开图，再出兵」。<br><br>第一件事——昨晚睡了几小时？`,
      })
    })
    setOnboardOpen(false)
    toast({ title: `${botName}已就位`, tone: 'success' })
  }

  return (
    <div className="page space-y-3">
      {/* 生命倒计时 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">生命倒计时</h2>
          <button type="button" onClick={openProfile} className="text-caption font-medium text-info">
            设置
          </button>
        </div>
        {end && remainMs > 0 ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-display font-semibold text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.floor(remainMs / 86400000).toLocaleString()}
              </span>
              <span className="text-caption font-medium text-muted-foreground">天</span>
              <span className="ms-2.5 text-title font-semibold text-info" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '1px' }}>
                {String(Math.floor(remainMs / 3600000) % 24).padStart(2, '0')}:{String(Math.floor(remainMs / 60000) % 60).padStart(2, '0')}:
                {String(Math.floor(remainMs / 1000) % 60).padStart(2, '0')}
              </span>
            </div>
            <p className="mt-1.5 text-caption text-muted-foreground">
              距离 {s.user.lifespan || 80} 岁生日（{dstr(end)}）还有 {Math.floor(remainMs / 86400000).toLocaleString()} 天 · 每秒都在倒数
            </p>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-caption text-muted-foreground">
                <span>人生进度</span>
                <span>{(((now - (birthday?.getTime() ?? now)) / (end.getTime() - (birthday?.getTime() ?? now))) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full rounded-sm bg-gradient-to-r from-primary to-info"
                  style={{ width: `${Math.min(100, Math.max(0, ((now - (birthday?.getTime() ?? now)) / (end.getTime() - (birthday?.getTime() ?? now))) * 100)).toFixed(2)}%` }}
                />
              </div>
              <p className="mt-1 text-caption text-muted-foreground">已度过 {Math.floor((now - (birthday?.getTime() ?? now)) / 86400000).toLocaleString()} 天</p>
            </div>
          </>
        ) : end && remainMs <= 0 ? (
          <div className="py-1 text-center">
            <p className="text-title font-semibold text-danger">已超过预期寿命</p>
            <p className="mt-1 text-caption text-muted-foreground">每一个多出来的日子都是赚的。点「设置」把预期寿命调高。</p>
          </div>
        ) : (
          <p className="text-caption leading-relaxed text-muted-foreground">
            还没设置生日。
            <br />
            点右上角「设置」填上生日和预期寿命（默认 80 岁），这里就开始倒计时。
          </p>
        )}
      </section>

      {/* 资料卡 */}
      <section className="flex items-center gap-3 rounded-md bg-surface p-4">
        <div className="size-14 shrink-0">
          <BotFace />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-title font-semibold">{s.user.name} 的掌舵Agent</p>
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            已共同运行 <b className="text-surface-foreground">{sinceDays}</b> 天 · 记忆 {s.memories.length} 条
            <br />
            {s.user.birthday ? `🎂 ${s.user.birthday}` : '🎂 未设置'} · {s.user.gender || '性别未填'} · 预期 {s.user.lifespan || 80} 岁
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openProfile}>
          编辑
        </Button>
      </section>

      {/* 机器人 / 模型 */}
      <h2 className="px-1 pt-1 text-caption font-semibold tracking-wide text-muted-foreground">🤖 机器人 / 模型</h2>
      <section className="rounded-md bg-surface px-4">
        <RowItem icon={<Cpu className="size-5" aria-hidden />} title="当前模型" sub="机器人背后的大脑，可随时切换" value={s.settings.model} onClick={() => setModelSheet(true)} />
        <RowItem icon={<span className="text-title">🦾</span>} title="机器人名字" sub="它怎么称呼自己" value={botName} onClick={openRename} />
        <div className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-title" aria-hidden>
            📝
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body">自动记忆提取</p>
            <p className="mt-0.5 text-caption text-muted-foreground">每轮回答时提炼值得记住的信息（职业/目标/习惯/偏好），自动入库</p>
          </div>
          <Switch
            checked={s.settings.autoMem}
            onChange={(v) => {
              mutate((draft) => {
                draft.settings.autoMem = v
              })
              toast({ title: v ? '自动记忆提取已开启' : '自动记忆提取已关闭' })
            }}
          />
        </div>
        <div className="flex items-center gap-3 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-title" aria-hidden>
            🔍
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body">联网搜索</p>
            <p className="mt-0.5 text-caption text-muted-foreground">问到时效性问题时，自动调用 StepSearch 全网搜索后再回答</p>
          </div>
          <Switch
            checked={s.settings.webSearch !== false}
            onChange={(v) => {
              mutate((draft) => {
                draft.settings.webSearch = v
              })
              toast({ title: v ? '联网搜索已开启' : '联网搜索已关闭' })
            }}
          />
        </div>
      </section>

      {/* 理论库 */}
      <h2 className="px-1 pt-1 text-caption font-semibold tracking-wide text-muted-foreground">📚 理论库（访谈同款）</h2>
      <div className="space-y-2">
        {THEORIES.map((th) => (
          <details key={th.t} className="rounded-md bg-surface px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-body font-medium">
              {th.t}
              <span className="shrink-0 rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-caption font-semibold text-info">{th.tag}</span>
              <span className="ms-auto text-caption text-muted-foreground">▶</span>
            </summary>
            <p className="mt-2 text-caption leading-relaxed text-muted-foreground">{th.d}</p>
          </details>
        ))}
      </div>

      {/* API 接入 */}
      <h2 className="px-1 pt-1 text-caption font-semibold tracking-wide text-muted-foreground">🔌 API 接入</h2>
      <section className="rounded-md bg-surface p-4">
        <p className="text-caption leading-relaxed text-muted-foreground">
          所有问题由真实模型回答（OpenAI 兼容接口直连）。接入两步：
          <br />
          ① 登录 <b className="text-info">StepFun 开放平台</b> platform.stepfun.com（需注册登录）
          <br />
          ② 控制台 → API Keys 创建 Key，粘贴到下方
          <br />
          <span className="text-muted-foreground">Key 只存在你自己设备的 localStorage，不经过任何服务器。</span>
        </p>
        <div className="mt-3 space-y-2.5">
          <Input label="接口基地址" value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="https://api.stepfun.com/v1" />
          <Input label="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." type="password" autoComplete="off" />
          <div className="flex items-center gap-2">
            <Button onClick={saveApi}>保存</Button>
            <Button variant="outline" loading={testing} onClick={() => void testConnection()}>
              测试连接
            </Button>
          </div>
          {apiStatus && (
            <p className={cn('text-caption', apiStatus.ok ? 'text-primary' : 'text-danger')}>
              {apiStatus.ok ? '✅' : '❌'} {apiStatus.text}
            </p>
          )}
        </div>
      </section>

      {/* 数据 */}
      <h2 className="px-1 pt-1 text-caption font-semibold tracking-wide text-muted-foreground">🗂️ 数据</h2>
      <section className="rounded-md bg-surface px-4">
        <RowItem icon={<Download className="size-5" aria-hidden />} title="导出记忆与数据" sub="下载 JSON 备份" value="导出" onClick={exportData} />
        <RowItem
          icon={<Sparkles className="size-5" aria-hidden />}
          title="重新运行新手引导"
          sub="让它重新认识你"
          value="开始"
          onClick={startOnboarding}
        />
        <div className="py-3">
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="flex min-h-tap w-full items-center gap-3 rounded-md text-left active:bg-accent"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-danger" aria-hidden>
              <Trash2 className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body text-danger">重置所有数据</span>
              <span className="mt-0.5 block text-caption text-muted-foreground">清空记忆、打卡与聊天记录</span>
            </span>
          </button>
        </div>
      </section>

      {/* 关于 */}
      <p className="px-4 pb-2 pt-3 text-center text-caption leading-relaxed text-muted-foreground">
        薄肌计划 BojiPlan · v{APP_VERSION}
        <br />
        机器人「{botName}」 · 模型服务：直连 StepFun 开放平台 API（默认 step-5-preview）
        <br />
        理论出处：孙宇晨 × 邵艾伦 5 小时访谈
        <br />⚠️ 理论均为个人观点合集，非投资 / 医学建议
      </p>

      {/* 模型选择 */}
      <ModelPickerDialog open={modelSheet} onClose={() => setModelSheet(false)} />

      {/* 改名 */}
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="机器人名字"
        description="它怎么称呼自己——对话、记忆摘要、提醒里都会用这个名字。"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button className="flex-1" onClick={saveBotName}>
              保存
            </Button>
          </div>
        }
      >
        <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={8} placeholder="小薄" label="名字" />
      </Dialog>

      {/* 我的资料 */}
      <Dialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="我的资料"
        description="生日和预期寿命用于生命倒计时；性别会进入小薄对你的认知。"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setProfileOpen(false)}>
              取消
            </Button>
            <Button className="flex-1" onClick={saveProfile}>
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="称呼" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="怎么称呼你？" />
          <Input label="预期平均寿命（岁）" value={profileLifespan} onChange={(e) => setProfileLifespan(e.target.value)} placeholder="80" inputMode="numeric" />
          <Input label="生日" type="date" value={profileBirthday} onChange={(e) => setProfileBirthday(e.target.value)} />
          <div>
            <p className="mb-1.5 text-caption font-medium text-muted-foreground">性别</p>
            <div className="flex gap-1.5">
              {['男', '女', '保密'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setProfileGender(g === '保密' ? '' : g)}
                  className={cn(
                    'min-h-tap flex-1 rounded-md border text-caption font-medium',
                    (g === '保密' ? profileGender === '' : profileGender === g) ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground',
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* 重置确认 */}
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="重置所有数据？"
        description="记忆、打卡、聊天记录都会清空，且不可恢复。"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setResetOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                resetState()
                setResetOpen(false)
                toast({ title: '已重置' })
              }}
            >
              确认重置
            </Button>
          </div>
        }
      />

      {/* 新手引导（3 步） */}
      <Dialog
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        title={obStep === 0 ? `你好，我是${botName} 🦾` : obStep === 1 ? '你的主战场是？' : '记忆模块已挂载 🧠'}
        description={
          obStep === 0
            ? '你的 AI 掌舵 Agent。先让我记住你的名字——之后的每次对话、决策、打卡，我都会带着这个认知服务你。'
            : obStep === 1
              ? '决定我每天盯你的侧重点。可以之后在「我的」里改。'
              : '我会自动从对话里提取关于你的长期信息（目标、习惯、决定），也可以在上方「记忆」页手动管理。理论底座：搏击 × 大水 × 大睡 × 先开图再出兵 × 先自由后财富 × 少消费多创造。'
        }
        footer={
          <div className="flex w-full gap-2">
            {obStep > 0 && (
              <Button variant="ghost" className="flex-1" onClick={() => setObStep(obStep - 1)}>
                上一步
              </Button>
            )}
            {obStep === 0 && (
              <Button variant="ghost" className="flex-1" onClick={() => setOnboardOpen(false)}>
                跳过
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={() => {
                if (obStep === 0 && !obName.trim()) {
                  toast({ title: '先告诉我你的名字', tone: 'warning' })
                  return
                }
                if (obStep < 2) setObStep(obStep + 1)
                else finishOnboarding()
              }}
            >
              {obStep < 2 ? '下一步' : '开始掌舵 →'}
            </Button>
          </div>
        }
      >
        <StepDots step={obStep} />
        {obStep === 0 && <Input value={obName} onChange={(e) => setObName(e.target.value)} placeholder="怎么称呼你？" label="称呼" />}
        {obStep === 1 && (
          <div className="grid grid-cols-2 gap-2">
            {goals.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setObGoal(g)}
                className={cn(
                  'min-h-tap rounded-md border p-3 text-body font-medium',
                  obGoal === g ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        )}
        {obStep === 2 && (
          <p className="text-caption leading-relaxed text-muted-foreground">
            理论底座已挂载：搏击 × 大水 × 大睡 × 先开图再出兵 × 先自由后财富 × 少消费多创造。从今天起，饮水、睡眠、搏击、薄肌、创造，我每天帮你盯。
          </p>
        )}
      </Dialog>
    </div>
  )
}

/** 新手引导步骤点 */
function StepDots({ step }: { step: number }) {
  return (
    <div className="mb-4 flex justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn('h-1.5 rounded-full transition-all', i <= step ? 'w-4 bg-primary' : 'w-1.5 bg-muted')} />
      ))}
    </div>
  )
}

/** 设置行：图标 + 标题 + 副说明 + 右侧值 */
function RowItem({
  icon,
  title,
  sub,
  value,
  onClick,
}: {
  icon: ReactNode
  title: string
  sub: string
  value?: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-tap w-full items-center gap-3 border-b border-border py-3 text-left last:border-b-0 active:bg-accent">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-info" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body">{title}</span>
        <span className="mt-0.5 block text-caption text-muted-foreground">{sub}</span>
      </span>
      {value && <span className="max-w-[40%] shrink-0 truncate text-caption font-semibold text-info">{value}</span>}
    </button>
  )
}
