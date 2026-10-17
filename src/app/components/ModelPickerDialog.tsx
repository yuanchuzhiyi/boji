import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { useToast } from '@/shared/ui/Toast'
import { cn } from '@/shared/lib/cn'
import { mutate, useBoji } from '@/app/store/boji'
import { fetchModels, modelList } from '@/app/lib/stepfun'

/**
 * 模型选择弹层：列表实时来自 StepFun 开放平台（需已填入 Key），
 * 打开时列表过期（>6h）自动刷新；失败回退内置列表。
 */
export function ModelPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useBoji()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const checkedRef = useRef(false)

  const hasKey = Boolean(s.settings.apiKey)

  async function refresh() {
    setLoading(true)
    const ok = await fetchModels()
    setLoading(false)
    toast(ok ? { title: '模型列表已更新', tone: 'success' } : { title: '拉取失败，用内置列表', tone: 'warning' })
  }

  // 打开时若列表过期则自动拉一次（每个打开周期只检查一次）
  useEffect(() => {
    if (!open) {
      checkedRef.current = false
      return
    }
    if (checkedRef.current) return
    checkedRef.current = true
    const stale = !s.modelsAt || Date.now() - s.modelsAt > 6 * 3600 * 1000
    if (s.settings.apiKey && stale) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="选择机器人模型"
      description={hasKey ? (s.models.length ? `${s.models.length} 个 · 来自开放平台` : '内置列表（正在拉取开放平台列表）') : '填入 API Key 后可拉取开放平台完整模型列表'}
    >
      <div className="space-y-2">
        {modelList(s).map((m) => {
          const selected = s.settings.model === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                mutate((draft) => {
                  draft.settings.model = m.id
                })
                onClose()
                toast({ title: `已切换模型：${m.id}` })
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border p-3 text-left',
                selected ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
              )}
            >
              <span className={cn('mt-0.5 size-5 shrink-0 rounded-full border', selected ? 'border-primary bg-primary' : 'border-input')} aria-hidden />
              <span className="min-w-0">
                <span className="block text-body font-semibold">{m.n}</span>
                {m.d && <span className="mt-0.5 block text-caption text-muted-foreground">{m.d}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {hasKey && (
        <Button variant="ghost" className="mt-3 w-full" loading={loading} onClick={() => void refresh()}>
          <RefreshCw className="size-4" aria-hidden />
          刷新模型列表
        </Button>
      )}
    </Dialog>
  )
}
