import { Loader2, Mic, Square } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { useVoiceInput } from '@/app/lib/useVoiceInput'

/**
 * 语音输入按钮：点一下开始录音（再点结束），识别出的文本通过 onResult 回调
 * 给调用方拼进对应的输入框。所有文本输入处（对话 / 计划 / 饮食 / 备忘 /
 * 记忆 / 备注 / 档案）共用；同一时刻全局只应有一个在录音。
 */
export function VoiceInputButton({
  onResult,
  disabled,
  className,
}: {
  onResult: (text: string) => void
  disabled?: boolean
  className?: string
}) {
  const { recording, secs, busy, toggle } = useVoiceInput(onResult)
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || busy}
      aria-label={recording ? `停止录音并转写（已录 ${secs}s）` : '语音输入转文字'}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full border active:scale-95 disabled:opacity-50',
        recording ? 'border-danger bg-danger/15 text-danger' : 'border-input bg-surface text-muted-foreground active:border-primary active:text-primary',
        className,
      )}
    >
      {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : recording ? <Square className="size-4" aria-hidden /> : <Mic className="size-5" aria-hidden />}
    </button>
  )
}
