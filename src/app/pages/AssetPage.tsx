import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Input } from '@/shared/ui/Input'
import { VoiceInputButton } from '@/app/components/VoiceInputButton'
import { useToast } from '@/shared/ui/Toast'
import { LineLegend, SnapshotLineChart, type SnapshotLinePoint, type SnapshotLineSeries } from '@/shared/ui/charts'
import { dstr, fmtMoney, mutate, parseAmount, uid, useBoji } from '@/app/store/boji'

/**
 * 资产页：只记「某一时刻的总资产 / 总负债」两个数字，三条曲线（总资产 / 总负债 / 净资产）
 * 按快照时间变化；点曲线上的点可修改对应时刻的快照。
 */
export function AssetPage() {
  const s = useBoji()
  const { toast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const snapshots = [...s.snapshots].sort((a, b) => a.ts - b.ts)
  const last = snapshots[snapshots.length - 1]
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null
  const net = last ? last.assets - last.debts : 0
  const dNet = last && prev ? net - (prev.assets - prev.debts) : 0

  const points: SnapshotLinePoint[] = snapshots.map((e) => ({
    id: e.id,
    date: e.date.slice(5),
    title: `${e.date}｜资产 ${fmtMoney(e.assets)}｜负债 ${fmtMoney(e.debts)}｜净资产 ${fmtMoney(e.assets - e.debts)}（点击修改）`,
    values: { assets: e.assets, debts: e.debts, net: e.assets - e.debts },
  }))
  const series: SnapshotLineSeries[] = [
    { key: 'assets', label: '总资产', color: 'primary' },
    { key: 'debts', label: '总负债', color: 'danger' },
    { key: 'net', label: '净资产', color: 'info' },
  ]

  function openAdd() {
    setEditId(null)
    setFormOpen(true)
  }

  function openEdit(id: string) {
    setEditId(id)
    setFormOpen(true)
  }

  function delLatest() {
    const l = snapshots[snapshots.length - 1]
    if (l) setConfirmId(l.id)
  }

  return (
    <div className="page space-y-3">
      {/* 净资产快照 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">净资产快照</h2>
          <button type="button" onClick={openAdd} className="text-caption font-medium text-info">
            + 记快照
          </button>
        </div>
        {last ? (
          <>
            <div className="flex gap-2">
              <Metric label="总资产" value={`¥${fmtMoney(last.assets)}`} tone="primary" />
              <Metric label="总负债" value={`¥${fmtMoney(last.debts)}`} tone="danger" />
              <Metric label="净资产" value={`¥${fmtMoney(net)}`} tone={net >= 0 ? 'info' : 'danger'} />
            </div>
            <p className="mt-2.5 text-caption text-muted-foreground">
              快照日期 {last.date}
              {prev && (
                <>
                  {' · '}较上期{' '}
                  <b className={dNet >= 0 ? 'text-primary' : 'text-danger'}>
                    {dNet >= 0 ? '+' : ''}
                    {fmtMoney(dNet)}
                  </b>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-caption leading-relaxed text-muted-foreground">
            还没有快照。
            <br />
            记录当前的总资产和总负债，曲线会从第一次快照开始生长。
          </p>
        )}
      </section>

      {/* 资产变化曲线 */}
      <section className="rounded-md bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-body font-semibold">资产变化曲线（按快照时间）</h2>
          <span className="text-caption text-muted-foreground">点曲线上的点可修改</span>
        </div>
        <SnapshotLineChart points={points} series={series} onSelect={openEdit} />
        <LineLegend series={series} extra={`共 ${snapshots.length} 次快照`} />
        {snapshots.length > 0 && (
          <>
            <p className="mb-1.5 mt-3 text-caption text-muted-foreground">点日期可修改对应时刻的快照</p>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {snapshots.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => openEdit(e.id)}
                  className={
                    i === snapshots.length - 1
                      ? 'min-h-tap shrink-0 rounded-full border border-primary bg-primary-soft px-3 text-caption font-medium text-primary'
                      : 'min-h-tap shrink-0 rounded-full border border-border bg-surface px-3 text-caption font-medium text-muted-foreground'
                  }
                >
                  {e.date.slice(5)}
                </button>
              ))}
            </div>
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={delLatest}>
                记错了？删除最近一次
              </Button>
            </div>
          </>
        )}
      </section>

      {/* FAB */}
      <button
        type="button"
        onClick={openAdd}
        aria-label="记一笔快照"
        className="fixed bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+16px)] right-4 z-30 flex size-12 items-center justify-center rounded-full bg-info text-info-foreground shadow-lg active:scale-95"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      {/* 添加 / 编辑快照 */}
      <SnapshotForm
        key={editId ?? 'new'}
        open={formOpen}
        editId={editId}
        onClose={() => setFormOpen(false)}
        onSaved={(isNew) => toast({ title: isNew ? '快照已记录' : '快照已更新', tone: 'success' })}
      />

      {/* 删除确认 */}
      <Dialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="删除这次快照？"
        description="删除后曲线会重算，不可恢复。"
        footer={
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmId(null)}>
              返回
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (confirmId) {
                  mutate((draft) => {
                    draft.snapshots = draft.snapshots.filter((e) => e.id !== confirmId)
                  })
                  toast({ title: '已删除该次快照' })
                }
                setConfirmId(null)
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

function Metric({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'danger' | 'info' }) {
  const toneCls = tone === 'primary' ? 'text-primary' : tone === 'danger' ? 'text-danger' : 'text-info'
  return (
    <div className="flex-1 rounded-md bg-surface-muted p-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={`mt-1 text-title font-semibold ${toneCls}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

/** 记快照 / 改快照表单（日期 + 总资产 + 总负债 + 备注） */
function SnapshotForm({
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
  const existing = editId ? s.snapshots.find((e) => e.id === editId) : undefined
  const [date, setDate] = useState(existing?.date ?? dstr())
  const [assets, setAssets] = useState(existing ? String(existing.assets) : '')
  const [debts, setDebts] = useState(existing ? String(existing.debts) : '')
  const [note, setNote] = useState(existing?.note ?? '')

  // 关闭时不保留表单态：下次打开按目标快照重新初始化
  if (!open) return null

  function save() {
    const a = parseAmount(assets)
    const d = parseAmount(debts)
    if (!a && !d) {
      toast({ title: '至少填总资产或总负债', tone: 'warning' })
      return
    }
    const dt = date || dstr()
    if (existing) {
      mutate((draft) => {
        const item = draft.snapshots.find((x) => x.id === existing.id)
        if (item) {
          item.date = dt
          item.assets = a
          item.debts = d
          item.note = note.trim()
          item.ts = new Date(`${dt}T12:00:00`).getTime()
        }
      })
    } else {
      mutate((draft) => {
        draft.snapshots.push({ id: uid(), date: dt, assets: a, debts: d, note: note.trim(), ts: new Date(`${dt}T12:00:00`).getTime(), src: 'user' })
      })
    }
    onClose()
    onSaved(!existing)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing ? '修改快照' : '记一次快照'}
      description={
        existing
          ? `原记录：${existing.date} · 资产 ¥${fmtMoney(existing.assets)} · 负债 ¥${fmtMoney(existing.debts)}`
          : '只记当前时刻的总资产和总负债，不做收支明细。曲线按快照时间变化。'
      }
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
        <Input
          label="总资产（元，支持 30万 / 300000 / 3k）"
          value={assets}
          onChange={(e) => setAssets(e.target.value)}
          placeholder="如 300000 或 30万"
          inputMode="decimal"
        />
        <Input
          label="总负债（元，没有填 0 或留空）"
          value={debts}
          onChange={(e) => setDebts(e.target.value)}
          placeholder="如 100000 或 10万"
          inputMode="decimal"
        />
        <div className="flex items-end gap-2">
          <Input label="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：发完年终奖后" className="flex-1" />
          <VoiceInputButton onResult={(text) => setNote((prev) => (prev ? `${prev} ${text}` : text))} />
        </div>
        {existing && (
          <Button
            variant="danger-ghost"
            className="w-full"
            onClick={() => {
              mutate((draft) => {
                draft.snapshots = draft.snapshots.filter((e) => e.id !== existing.id)
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
