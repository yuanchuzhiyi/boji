import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'

import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Input, Textarea } from '@/shared/ui/Input'
import { useToast } from '@/shared/ui/Toast'
import { cn } from '@/shared/lib/cn'
import { MEM_CATS, dstr, mutate, uid, useBoji, type MemCat } from '@/app/store/boji'
import { fmtTime } from '@/app/lib/text'

/** 记忆分类 → 静态类名（动态拼类名 Tailwind 扫不到，必须映射表完整出现） */
const CAT_STYLE: Record<MemCat, { text: string; soft: string; border: string }> = {
  身体: { text: 'text-primary', soft: 'bg-primary-soft', border: 'border-primary' },
  决策: { text: 'text-info', soft: 'bg-info-soft', border: 'border-info' },
  财富: { text: 'text-orange', soft: 'bg-orange-soft', border: 'border-orange' },
  偏好: { text: 'text-violet', soft: 'bg-violet-soft', border: 'border-violet' },
  目标: { text: 'text-danger', soft: 'bg-danger/15', border: 'border-danger' },
  关系: { text: 'text-violet', soft: 'bg-violet-soft', border: 'border-violet' },
}
const FILTER_STYLE = { text: 'text-primary', soft: 'bg-primary-soft', border: 'border-primary' }

/**
 * 记忆页：长期记忆库（分类 / 来源 / 重要度 / 搜索）+ 饮食记录（自动带时间）+ 备忘录（待办）。
 */
export function MemoryPage() {
  const s = useBoji()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MemCat | '全部'>('全部')
  const [dietText, setDietText] = useState('')
  const [memoText, setMemoText] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newMem, setNewMem] = useState('')
  const [newCat, setNewCat] = useState<MemCat>('偏好')
  const [newImp, setNewImp] = useState(2)

  const cats = Object.keys(MEM_CATS) as MemCat[]

  const weekNew = useMemo(() => {
    let n = 0
    for (let i = 0; i < 7; i++) {
      const dt = new Date()
      dt.setDate(dt.getDate() - i)
      const key = dstr(dt)
      s.memories.forEach((m) => {
        if (m.date === key) n += 1
      })
    }
    return n
  }, [s.memories])

  const filtered = useMemo(
    () =>
      s.memories.filter((m) => {
        if (filter !== '全部' && m.cat !== filter) return false
        const q = query.trim()
        if (q && !m.text.includes(q) && !m.cat.includes(q)) return false
        return true
      }),
    [s.memories, filter, query],
  )

  const dietList = [...s.diet].sort((a, b) => b.ts - a.ts)
  const dietToday = dietList.filter((e) => dstr(new Date(e.ts)) === dstr()).length
  const memoList = [...s.memo].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.ts - a.ts)
  const memoOpen = memoList.filter((e) => !e.done).length

  function addDiet() {
    const v = dietText.trim()
    if (!v) {
      toast({ title: '写一下吃了什么', tone: 'warning' })
      return
    }
    mutate((draft) => {
      draft.diet.push({ id: uid(), text: v.slice(0, 80), ts: Date.now() })
    })
    setDietText('')
    toast({ title: `已记录 · ${fmtTime(Date.now())}`, tone: 'success' })
  }

  function addMemo() {
    const v = memoText.trim()
    if (!v) {
      toast({ title: '写点什么', tone: 'warning' })
      return
    }
    mutate((draft) => {
      draft.memo.push({ id: uid(), text: v.slice(0, 80), done: false, ts: Date.now() })
    })
    setMemoText('')
    toast({ title: '已加入备忘录', tone: 'success' })
  }

  function saveNewMem() {
    const t = newMem.trim()
    if (!t) {
      toast({ title: '先写点内容', tone: 'warning' })
      return
    }
    mutate((draft) => {
      draft.memories.unshift({ id: uid(), cat: newCat, text: t, src: 'user', imp: newImp as 1 | 2 | 3, date: dstr() })
    })
    setNewMem('')
    setAddOpen(false)
    toast({ title: '已写入长期记忆', tone: 'success' })
  }

  return (
    <div className="page space-y-3">
      {/* 统计 */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox value={String(s.memories.length)} label="记忆总数" />
        <StatBox value={String(weekNew)} label="本周新增" />
        <StatBox value={s.settings.autoMem ? 'ON' : 'OFF'} label="自动提取" />
      </div>

      {/* 理解摘要 */}
      <section className="rounded-md border border-violet/30 bg-gradient-to-br from-violet-soft to-info-soft p-4">
        <h2 className="mb-2 text-body font-semibold">{s.settings.botName || '小薄'}对你的当前理解</h2>
        <p className="text-caption leading-relaxed text-surface-foreground [&_b]:text-primary">
          你正在追求<b>薄肌 + 搏击</b>双资产，睡眠与饮水是底线指标；决策风格偏<b className="text-info!">「先开图，再出兵」</b>，
          重大选择前要补足样本量；财富观认同<b className="text-orange!">「先自由，后财富」</b>，保持选择权优先于存款数字。
          （本摘要由{s.settings.botName || '小薄'}根据 {s.memories.length} 条记忆生成）
        </p>
      </section>

      {/* 饮食记录 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">吃了什么</h2>
          <span className="text-caption text-muted-foreground">今天 {dietToday} 笔</span>
        </div>
        <div className="mb-3 flex gap-2">
          <Input
            value={dietText}
            onChange={(e) => setDietText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addDiet()
            }}
            placeholder="刚吃了什么？如：牛肉面 + 鸡蛋"
            enterKeyHint="done"
            className="flex-1"
          />
          <Button className="shrink-0" onClick={addDiet}>
            记一笔
          </Button>
        </div>
        {dietList.length === 0 ? (
          <p className="py-1 text-caption text-muted-foreground">还没有记录。吃了什么顺手记一笔，时间自动带上。</p>
        ) : (
          <div className="divide-y divide-border">
            {dietList.slice(0, 30).map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-2.5">
                <span className="shrink-0 text-caption font-semibold text-info" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTime(e.ts)}
                </span>
                <span className="shrink-0 text-caption text-muted-foreground">{dstr(new Date(e.ts)) === dstr() ? '今天' : dstr(new Date(e.ts)).slice(5)}</span>
                <span className="min-w-0 flex-1 text-body">{e.text}</span>
                <button
                  type="button"
                  aria-label="删除"
                  onClick={() =>
                    mutate((draft) => {
                      draft.diet = draft.diet.filter((x) => x.id !== e.id)
                    })
                  }
                  className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent active:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 备忘录 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">备忘录</h2>
          <span className="text-caption text-muted-foreground">{memoOpen ? `${memoOpen} 项待完成` : '全部完成 ✔'}</span>
        </div>
        <div className="mb-3 flex gap-2">
          <Input
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addMemo()
            }}
            placeholder="记件待办，如：周三晚 8 点搏击"
            enterKeyHint="done"
            className="flex-1"
          />
          <Button className="shrink-0" onClick={addMemo}>
            添加
          </Button>
        </div>
        {memoList.length === 0 ? (
          <p className="py-1 text-caption text-muted-foreground">还没有备忘。把待办、约定、灵感丢进来。</p>
        ) : (
          <div className="divide-y divide-border">
            {memoList.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 py-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={e.done}
                  aria-label={e.done ? '标记为未完成' : '标记为完成'}
                  onClick={() =>
                    mutate((draft) => {
                      const item = draft.memo.find((x) => x.id === e.id)
                      if (item) item.done = !item.done
                    })
                  }
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border',
                    e.done ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {e.done && <span className="text-caption font-semibold">✓</span>}
                </button>
                <span className={cn('min-w-0 flex-1 text-body', e.done && 'text-muted-foreground line-through')}>{e.text}</span>
                <span className="shrink-0 text-caption text-muted-foreground">{fmtTime(e.ts)}</span>
                <button
                  type="button"
                  aria-label="删除"
                  onClick={() =>
                    mutate((draft) => {
                      draft.memo = draft.memo.filter((x) => x.id !== e.id)
                    })
                  }
                  className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent active:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 搜索 + 分类筛选 */}
      <div className="flex items-center gap-2 rounded-md border border-input bg-surface px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索记忆，如：搏击 / 买房 / 乳糖…"
          type="search"
          className="min-h-tap flex-1 bg-transparent text-body text-surface-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {(['全部', ...cats] as Array<MemCat | '全部'>).map((c) => {
          const on = filter === c
          const style = c === '全部' ? FILTER_STYLE : CAT_STYLE[c]
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={cn(
                'min-h-tap shrink-0 rounded-full border px-3 text-caption font-medium',
                on ? `${style.border} ${style.soft} ${style.text}` : 'border-border bg-surface text-muted-foreground',
              )}
            >
              {c}
            </button>
          )
        })}
      </div>

      {/* 记忆列表 */}
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-caption text-muted-foreground">没有相关记忆。点右下角 + 手动添加一条。</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const style = CAT_STYLE[m.cat]
            return (
              <div key={m.id} className={cn('relative rounded-md bg-surface p-3.5 ps-4 border-s-[3px]', style.border)}>
                <button
                  type="button"
                  aria-label="删除记忆"
                  onClick={() =>
                    mutate((draft) => {
                      draft.memories = draft.memories.filter((x) => x.id !== m.id)
                    })
                  }
                  className="absolute right-3 top-2.5 flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-accent active:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
                <p className="pe-8 text-body leading-relaxed">{m.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', style.soft, style.text)}>{m.cat}</span>
                  <span>{m.src === 'ai' ? '🤖 对话提取' : '✍️ 手动'}</span>
                  <span className="text-warning">{'★'.repeat(m.imp)}</span>
                  <span className="ms-auto">{m.date}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FAB：添加记忆 */}
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        aria-label="添加长期记忆"
        className="fixed bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+16px)] right-4 z-30 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      {/* 添加记忆弹层 */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="添加长期记忆" description="关于你的目标、习惯、偏好、关系——小薄会在决策时自动引用。">
        <Textarea
          rows={3}
          value={newMem}
          onChange={(e) => setNewMem(e.target.value)}
          placeholder="例如：我对乳糖不耐，蛋白粉选分离乳清"
          label="内容"
        />
        <div className="mt-3">
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">分类</p>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewCat(c)}
                className={cn(
                  'min-h-tap rounded-full border px-3 text-caption font-medium',
                  newCat === c ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">重要度</p>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setNewImp(v)}
                className={cn(
                  'min-h-tap flex-1 rounded-md border text-caption font-medium',
                  newImp === v ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground',
                )}
              >
                {'★'.repeat(v)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setAddOpen(false)}>
            取消
          </Button>
          <Button className="flex-1" onClick={saveNewMem}>
            写入记忆
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md bg-surface p-3 text-center">
      <div className="text-title font-semibold text-primary">{value}</div>
      <div className="mt-0.5 text-caption text-muted-foreground">{label}</div>
    </div>
  )
}
