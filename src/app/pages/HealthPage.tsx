import { useState } from 'react'
import { ImagePlus, Pencil, Plus } from 'lucide-react'

import { invokeNative } from '@/shared/bridge'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Input, Textarea } from '@/shared/ui/Input'
import { VoiceInputButton } from '@/app/components/VoiceInputButton'
import { useToast } from '@/shared/ui/Toast'
import { LineLegend, SnapshotLineChart, type SnapshotLinePoint, type SnapshotLineSeries } from '@/shared/ui/charts'
import { cn } from '@/shared/lib/cn'
import {
  bmiLabel,
  bmiOf,
  dstr,
  fmtNum,
  mutate,
  parseAmount,
  uid,
  useBoji,
  type HealthLevel,
} from '@/app/store/boji'
import { analyzeReport } from '@/app/lib/stepfun'
import { urlToCompressedDataUrl } from '@/app/lib/image'

const LEVEL_STYLE: Record<HealthLevel, string> = {
  正常: 'bg-muted text-muted-foreground',
  关注: 'bg-warning/15 text-warning',
  异常: 'bg-orange/15 text-orange',
  疾病: 'bg-danger/15 text-danger',
}

/**
 * 健康页：体检报告 AI 解读（拍照 / 相册 → 视觉通读 → 异常清单）+ 身体数据快照
 * （身高 / 体重 / 体脂 + BMI 分级 + 体重 × 体脂双轴曲线）。
 */
export function HealthPage() {
  const s = useBoji()
  const { toast } = useToast()
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMeta, setAnalyzeMeta] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')
  const [itemsDraft, setItemsDraft] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editBodyId, setEditBodyId] = useState<string | null>(null)
  const [confirmBodyId, setConfirmBodyId] = useState<string | null>(null)

  const h = s.health
  const botName = s.settings.botName || 'biubiu'
  const bodyList = [...s.body].sort((a, b) => a.ts - b.ts)
  const lastBody = bodyList[bodyList.length - 1]
  const prevBody = bodyList.length > 1 ? bodyList[bodyList.length - 2] : null

  /* ---------------- 体检报告上传 ---------------- */

  async function analyzeDataUrl(dataUrl: string) {
    setAnalyzing(true)
    setAnalyzeMeta(`⏳ ${botName}正在读报告… 0s`)
    try {
      const result = await analyzeReport(dataUrl, {
        onWaiting: (seconds, chars) => setAnalyzeMeta(`⏳ ${botName}正在读报告… ${seconds}s · 已接收 ${chars} 字${seconds >= 45 ? ' · 没卡住' : ''}`),
      })
      mutate((draft) => {
        draft.health = { summary: result.summary, items: result.items, updatedAt: Date.now(), source: 'ai' }
      })
      toast({ title: '体检报告总结完成，已存入健康档案', tone: 'success' })
    } catch (err) {
      toast({ title: '分析失败', description: (err as Error).message, tone: 'danger' })
    } finally {
      setAnalyzing(false)
      setAnalyzeMeta('')
    }
  }

  function requireKey(): boolean {
    if (s.settings.apiKey) return true
    toast({ title: '体检报告 AI 总结需要先接入 API', description: '去「我的 → API 接入」填入 Key', tone: 'warning' })
    return false
  }

  /** 体检报告上传：壳的相册 / 拍照（chooseImage），拿虚拟 URL 压缩后送模型 */
  async function pickReport() {
    if (!requireKey()) return
    try {
      const res = await invokeNative('chooseImage', { count: 1, sourceType: ['album', 'camera'] })
      const url = res.tempFilePaths[0]
      if (!url) return
      setAnalyzing(true)
      setAnalyzeMeta(`⏳ ${botName}正在读报告… 0s`)
      try {
        await analyzeDataUrl(await urlToCompressedDataUrl(url))
      } catch (err) {
        toast({ title: '图片处理失败', description: (err as Error).message, tone: 'danger' })
        setAnalyzing(false)
        setAnalyzeMeta('')
      }
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== 'cancelled') toast({ title: '选择图片失败，请重试', tone: 'danger' })
    }
  }

  /* ---------------- 手动录入健康档案 ---------------- */

  function openEditHealth() {
    setSummaryDraft(h?.summary ?? '')
    setItemsDraft((h?.items ?? []).map((it) => [it.name, it.system, it.level, it.note].filter(Boolean).join('|')).join('\n'))
    setEditOpen(true)
  }

  function saveHealth() {
    const items = itemsDraft
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const p = l.split('|').map((x) => x.trim())
        return { name: p[0] || '', system: p[1] || '', level: (['正常', '关注', '异常', '疾病'].includes(p[2]) ? p[2] : '关注') as HealthLevel, note: p[3] || '' }
      })
      .filter((it) => it.name)
    mutate((draft) => {
      draft.health = { summary: summaryDraft.trim(), items, updatedAt: Date.now(), source: 'user' }
    })
    setEditOpen(false)
    toast({ title: '健康档案已更新', tone: 'success' })
  }

  /* ---------------- 身体快照 ---------------- */

  function openAddBody() {
    setEditBodyId(null)
    setFormOpen(true)
  }

  function openEditBody(id: string) {
    setEditBodyId(id)
    setFormOpen(true)
  }

  const bodyPoints: SnapshotLinePoint[] = bodyList.map((e) => ({
    id: e.id,
    date: e.date.slice(5),
    title: `${e.date}｜${fmtNum(e.weight)}kg｜体脂 ${fmtNum(e.fat)}%（点击修改）`,
    values: { weight: e.weight, fat: e.fat },
  }))
  const bodySeries: SnapshotLineSeries[] = [
    { key: 'weight', label: '体重 kg', color: 'primary' },
    { key: 'fat', label: '体脂率 %', color: 'info', axis: 'right' },
  ]

  return (
    <div className="page space-y-3">
      {/* 健康档案 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">健康档案</h2>
          <span className="text-caption text-muted-foreground">
            {h ? `${h.source === 'ai' ? '🤖 AI 总结' : '✍️ 手动录入'} · ${dstr(new Date(h.updatedAt))}` : '未建立'}
          </span>
        </div>
        {!h || (!h.summary && !h.items.length) ? (
          <p className="text-caption leading-relaxed text-muted-foreground">
            还没有健康档案。
            <br />
            上传一次体检报告让{botName}总结，或手动录入你目前的身体状况。
          </p>
        ) : (
          <>
            {h.summary && <p className="mb-3 whitespace-pre-line text-body leading-relaxed">{h.summary}</p>}
            {h.items.length > 0 ? (
              <>
                <p className="mb-1 text-caption font-semibold text-muted-foreground">异常 / 疾病清单</p>
                <div className="divide-y divide-border">
                  {h.items.map((it, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 py-2.5">
                      <span className="text-body font-medium">{it.name}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-caption font-semibold', LEVEL_STYLE[it.level])}>{it.level}</span>
                      {it.system && <span className="text-caption text-muted-foreground">{it.system}</span>}
                      {it.note && <span className="ms-auto text-caption text-muted-foreground">{it.note}</span>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-caption text-primary">✔ 清单为空：目前没有记录的异常项</p>
            )}
          </>
        )}
        {analyzing && analyzeMeta && <p className="mt-2.5 text-caption text-info">{analyzeMeta}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={analyzing} onClick={() => void pickReport()}>
            <ImagePlus className="size-4" aria-hidden />
            上传体检报告
          </Button>
          <Button size="sm" variant="outline" onClick={openEditHealth}>
            <Pencil className="size-4" aria-hidden />
            手动录入
          </Button>
        </div>
      </section>

      {/* 身体数据 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">身体数据</h2>
          <button type="button" onClick={openAddBody} className="text-caption font-medium text-info">
            + 记快照
          </button>
        </div>
        {lastBody ? (
          <>
            <div className="flex gap-2">
              <BodyMetric label="身高" value={`${fmtNum(lastBody.height, 0)}`} unit="cm" delta={null} />
              <BodyMetric label="体重" value={fmtNum(lastBody.weight)} unit="kg" delta={prevBody ? lastBody.weight - prevBody.weight : null} unitDelta="kg" />
              <BodyMetric label="体脂率" value={fmtNum(lastBody.fat)} unit="%" delta={prevBody ? lastBody.fat - prevBody.fat : null} unitDelta="%" tone="info" />
            </div>
            <p className="mt-2.5 text-caption text-muted-foreground">
              BMI <b className="text-surface-foreground">{fmtNum(bmiOf(lastBody.height, lastBody.weight))}</b>（{bmiLabel(bmiOf(lastBody.height, lastBody.weight))}） · 快照于 {lastBody.date}
            </p>
          </>
        ) : (
          <p className="text-caption leading-relaxed text-muted-foreground">
            还没有身体数据。
            <br />
            记录身高 / 体重 / 体脂率，曲线会从第一次快照开始生长。
          </p>
        )}
      </section>

      {/* 体重 / 体脂曲线 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">体重 / 体脂曲线（按快照时间）</h2>
          <span className="text-caption text-muted-foreground">点曲线上的点可修改</span>
        </div>
        <SnapshotLineChart points={bodyPoints} series={bodySeries} onSelect={openEditBody} />
        <LineLegend series={bodySeries} extra={`共 ${bodyList.length} 次`} />
        {bodyList.length > 0 && (
          <>
            <p className="mb-1.5 mt-3 text-caption text-muted-foreground">点日期可修改对应时刻的快照</p>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {bodyList.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => openEditBody(e.id)}
                  className={
                    i === bodyList.length - 1
                      ? 'min-h-tap shrink-0 rounded-full border border-primary bg-primary-soft px-3 text-caption font-medium text-primary'
                      : 'min-h-tap shrink-0 rounded-full border border-border bg-surface px-3 text-caption font-medium text-muted-foreground'
                  }
                >
                  {e.date.slice(5)}
                </button>
              ))}
            </div>
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setConfirmBodyId(bodyList[bodyList.length - 1].id)}>
                记错了？删除最近一次
              </Button>
            </div>
          </>
        )}
      </section>

      {/* FAB */}
      <button
        type="button"
        onClick={openAddBody}
        aria-label="记一次身体快照"
        className="fixed bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+16px)] right-4 z-30 flex size-12 items-center justify-center rounded-full bg-danger text-danger-foreground shadow-lg active:scale-95"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      {/* 手动录入健康档案 */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="健康档案"
        description="写一段目前身体状况的总结；下面的清单每行一项，格式：名称|系统|等级|备注（等级：正常/关注/异常/疾病）"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button className="flex-1" onClick={saveHealth}>
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Textarea
              rows={4}
              label="身体状况总结"
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              placeholder="例：整体尚可，主要有脂肪肝和尿酸偏高，需控糖控酒…"
              className="flex-1"
            />
            <VoiceInputButton onResult={(text) => setSummaryDraft((prev) => (prev ? `${prev} ${text}` : text))} />
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              rows={5}
              label="异常 / 疾病清单（每行一项）"
              value={itemsDraft}
              onChange={(e) => setItemsDraft(e.target.value)}
              placeholder={'轻度脂肪肝|肝|关注|B超提示\n尿酸偏高|代谢|关注|480'}
              className="flex-1"
            />
            <VoiceInputButton onResult={(text) => setItemsDraft((prev) => (prev ? `${prev}\n${text}` : text))} />
          </div>
        </div>
      </Dialog>

      {/* 身体快照表单（key 随目标快照变化：每次打开都按目标重新初始化表单） */}
      <BodyForm
        key={editBodyId ?? 'new'}
        open={formOpen}
        editId={editBodyId}
        onClose={() => setFormOpen(false)}
        onSaved={(isNew) => toast({ title: isNew ? '身体快照已记录' : '身体快照已更新', tone: 'success' })}
      />

      {/* 删除确认 */}
      <Dialog
        open={confirmBodyId !== null}
        onClose={() => setConfirmBodyId(null)}
        title="删除这次快照？"
        description="删除后曲线会重算，不可恢复。"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmBodyId(null)}>
              返回
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (confirmBodyId) {
                  mutate((draft) => {
                    draft.body = draft.body.filter((e) => e.id !== confirmBodyId)
                  })
                  toast({ title: '已删除该次快照' })
                }
                setConfirmBodyId(null)
              }}
            >
              确认删除
            </Button>
          </div>
        }
      />
    </div>
  )
}

function BodyMetric({
  label,
  value,
  unit,
  delta,
  unitDelta,
  tone = 'foreground',
}: {
  label: string
  value: string
  unit: string
  delta: number | null
  unitDelta?: string
  tone?: 'foreground' | 'info'
}) {
  const valueCls = tone === 'info' ? 'text-info' : 'text-surface-foreground'
  return (
    <div className="flex-1 rounded-md bg-surface-muted p-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={`mt-1 text-title font-semibold ${valueCls}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
        <span className="ms-0.5 text-caption font-normal text-muted-foreground">{unit}</span>
      </div>
      {delta !== null && unitDelta && (
        <div className="mt-0.5 text-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.abs(delta) < 0.05 ? (
            <span className="text-muted-foreground">持平</span>
          ) : (
            <span className={delta > 0 ? 'text-orange' : 'text-primary'}>
              {delta > 0 ? '▲ +' : '▼ '}
              {fmtNum(Math.abs(delta))}
              {unitDelta}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** 身体快照表单（日期 + 身高 + 体重 + 体脂） */
function BodyForm({
  open,
  editId,
  onClose,
  onSaved,
}: {
  open: boolean
  editId: string | null
  onClose: () => void
  onSaved: (isNew: boolean) => void
}) {
  const s = useBoji()
  const { toast } = useToast()
  const existing = editId ? s.body.find((e) => e.id === editId) : undefined
  const lastBody = [...s.body].sort((a, b) => a.ts - b.ts).slice(-1)[0]
  const [date, setDate] = useState(existing?.date ?? dstr())
  // 新增时身高预填上一次快照的值（原版行为：身高不会天天变）
  const [height, setHeight] = useState(existing ? String(existing.height) : lastBody ? String(lastBody.height) : '')
  const [weight, setWeight] = useState(existing ? String(existing.weight) : '')
  const [fat, setFat] = useState(existing && existing.fat ? String(existing.fat) : '')

  if (!open) return null

  function save() {
    const w = parseAmount(weight)
    if (!w) {
      toast({ title: '先填体重', tone: 'warning' })
      return
    }
    const dt = date || dstr()
    const hgt = parseAmount(height)
    const fatV = parseFloat(fat.replace(/[^\d.]/g, '')) || 0
    if (existing) {
      mutate((draft) => {
        const item = draft.body.find((x) => x.id === existing.id)
        if (item) {
          item.date = dt
          item.height = hgt
          item.weight = w
          item.fat = fatV
          item.ts = new Date(`${dt}T12:00:00`).getTime()
        }
      })
    } else {
      mutate((draft) => {
        draft.body.push({ id: uid(), date: dt, height: hgt, weight: w, fat: fatV, ts: new Date(`${dt}T12:00:00`).getTime(), src: 'user' })
      })
    }
    onClose()
    onSaved(!existing)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? '修改身体快照' : '记一次身体快照'}
      description={existing ? `原记录：${existing.date} · ${fmtNum(existing.weight)}kg · 体脂 ${fmtNum(existing.fat)}%` : '同一时刻的身高 / 体重 / 体脂率，曲线按快照时间变化。'}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            取消
          </Button>
          <Button className="flex-1" onClick={save}>
            {existing ? '保存修改' : '记录'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input label="日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="身高（cm，如 175）" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" inputMode="decimal" />
        <Input label="体重（kg，如 73.5）" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="73.5" inputMode="decimal" />
        <Input label="体脂率（%，如 18.8）" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="18.8" inputMode="decimal" />
        {existing && (
          <Button
            variant="danger-ghost"
            className="w-full"
            onClick={() => {
              mutate((draft) => {
                draft.body = draft.body.filter((e) => e.id !== existing.id)
              })
              onClose()
              onSaved(false)
            }}
          >
            删除这次快照
          </Button>
        )}
      </div>
    </Dialog>
  )
}
