import { useEffect, useRef, useState } from 'react'
import { Cpu, Send } from 'lucide-react'

import { BotFace } from '@/shared/ui/BotFace'
import { useToast } from '@/shared/ui/Toast'
import { QUICKS, TARGETS, ensureDay, getState, mutate, useBoji } from '@/app/store/boji'
import { ModelPickerDialog } from '@/app/components/ModelPickerDialog'
import { askHelm, describeApiError } from '@/app/lib/stepfun'
import { applyLog, detect, noKeyNotice, respond } from '@/app/lib/script'
import { esc, fmt, fmtTime } from '@/app/lib/text'

/**
 * 对话页：机器人「小薄」的 AI 掌舵主界面。
 *
 * - 发送时先做本地意图识别（打卡 / 记忆先落数据，不依赖模型）；
 * - 已接入 Key：真实模型流式回答（思维链 / 正文分片、联网搜索工具循环、记忆自动提炼）；
 * - 未接入 Key：本地剧本引擎兜底，并引导去「我的 → API 接入」。
 */
export function ChatPage() {
  const s = useBoji()
  const { toast } = useToast()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState<{ html: string; searching?: string } | null>(null)
  const [modelSheet, setModelSheet] = useState(false)
  const keyNoticeShown = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const botName = s.settings.botName || '小薄'
  const hasKey = Boolean(s.settings.apiKey)

  // 新消息 / 流式增量时滚到底
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [s.chat.length, streaming?.html, busy])

  function headerStatus(): string {
    const d = ensureDay(s.data)
    const left: string[] = []
    if (d.water < TARGETS.water) left.push(`差${TARGETS.water - d.water}ml水`)
    if (d.sleep < 7) left.push('睡眠赤字')
    if (d.fight + d.gym === 0) left.push('未训练')
    return `${hasKey ? 'API 实时' : '待接入 API'} · 记忆 ${s.memories.length} 条 · ${left.length ? left[0] : '指标全绿'}`
  }

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // 1) 用户消息落库 + 本地意图识别（打卡 / 记忆先落数据）
    mutate((draft) => {
      draft.chat.push({ who: 'user', text, t: Date.now() })
    })
    const it = detect(text)
    const memNote = applyLog(it)

    setBusy(true)
    setStreaming(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      let html: string
      if (hasKey) {
        // 2) 已接入 Key：真实模型（流式 + 工具循环 + 记忆提炼）
        let acc = ''
        html = await askHelm(
          text,
          {
            onContent: (chunk) => {
              acc += chunk
              setStreaming({ html: fmt(acc) })
            },
            onSearching: (query) => setStreaming((st) => ({ html: st?.html ?? '', searching: query })),
            onMemories: (count) => toast({ title: `🧠 ${botName}记住了 ${count} 条新信息` }),
          },
          controller.signal,
          memNote ?? undefined,
        )
      } else {
        // 3) 未接入 Key：本地剧本引擎 + 接入引导（只提醒一次）
        await new Promise((r) => setTimeout(r, 350))
        html = respond(getState(), text, it)
        if (!keyNoticeShown.current) {
          keyNoticeShown.current = true
          html = `${noKeyNotice(s.settings.model)}<br><br>${html}`
        }
      }
      mutate((draft) => {
        draft.chat.push({ who: 'bot', html, t: Date.now(), api: hasKey })
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        toast({ title: '已停止生成' })
      } else {
        mutate((draft) => {
          draft.chat.push({ who: 'bot', html: `⚠️ ${describeApiError(err)}`, t: Date.now() })
        })
      }
    } finally {
      abortRef.current = null
      setStreaming(null)
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 页头：机器人形象 + 在线状态 + 模型切换（本页的全局身份信息，不是导航顶栏） */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur">
        <div className="size-10 shrink-0">
          <BotFace thinking={busy} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-title font-semibold">{botName}</span>
            <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-caption font-semibold text-primary">
              AI掌舵
            </span>
          </div>
          <div className="flex items-center gap-1 text-caption text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="truncate">{headerStatus()}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModelSheet(true)}
          className="flex min-h-tap shrink-0 items-center gap-1 rounded-full border border-input bg-surface-muted px-2.5 text-caption font-semibold text-info"
        >
          <Cpu className="size-3.5" aria-hidden />
          <span className="max-w-[92px] truncate">{s.settings.model}</span>
        </button>
      </header>

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        onClick={(event) => {
          // 剧本消息里的快捷问句（data-send）委托点击
          const target = (event.target as HTMLElement).closest('[data-send]')
          const text = target?.getAttribute('data-send')
          if (text) void send(text)
        }}
      >
        {s.chat.map((m, i) => (
          <MessageBubble key={`${m.t}-${i}`} who={m.who} html={m.who === 'bot' ? m.html ?? '' : esc(m.text ?? '')} time={fmtTime(m.t)} api={m.api} />
        ))}

        {/* 流式进行中 / 正在输入 */}
        {busy && streaming && (
          <div className="flex animate-msg-in gap-2">
            <div className="mt-0.5 size-7 shrink-0">
              <BotFace thinking />
            </div>
            <div className="min-w-0 max-w-[85%]">
              <div
                className="rounded-md rounded-tl-sm border border-border bg-surface px-3 py-2 text-body leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html:
                    (streaming.searching
                      ? `<div class="mb-1 text-info">🔍 正在联网搜索：${esc(streaming.searching)} …</div>`
                      : '') + (streaming.html || '')
                }}
              />
            </div>
          </div>
        )}
        {busy && !streaming && (
          <div className="flex animate-msg-in gap-2">
            <div className="mt-0.5 size-7 shrink-0">
              <BotFace thinking />
            </div>
            <div className="flex items-center gap-1 rounded-md rounded-tl-sm border border-border bg-surface px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-typing-dot rounded-full bg-primary"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-border bg-surface/95 px-3 pb-2 pt-2 backdrop-blur">
        <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
          {QUICKS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q.replace(/^[^ ]+ /, ''))}
              disabled={busy}
              className="min-h-tap shrink-0 rounded-full border border-border bg-surface-muted px-3 text-caption font-medium text-muted-foreground active:border-primary active:text-primary disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(100, e.target.scrollHeight)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            placeholder={`跟${botName}说点什么…（打卡 / 记住我）`}
            enterKeyHint="send"
            className="max-h-[100px] min-h-tap flex-1 resize-none rounded-lg border border-input bg-surface px-3.5 py-2.5 text-body text-surface-foreground placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void send(draft)}
            disabled={busy || !draft.trim()}
            aria-label="发送"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 disabled:opacity-50"
          >
            <Send className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* 模型选择弹层 */}
      <ModelPickerDialog open={modelSheet} onClose={() => setModelSheet(false)} />
    </div>
  )
}

/** 单条消息气泡（bot 带头像；user 右侧主色） */
function MessageBubble({ who, html, time, api }: { who: 'bot' | 'user'; html: string; time: string; api?: boolean }) {
  if (who === 'user') {
    return (
      <div className="flex animate-msg-in flex-col items-end">
        <div
          className="max-w-[85%] rounded-md rounded-tr-sm bg-primary px-3 py-2 text-body font-medium leading-relaxed text-primary-foreground"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <span className="mt-1 text-caption text-muted-foreground">{time}</span>
      </div>
    )
  }
  return (
    <div className="flex animate-msg-in gap-2">
      <div className="mt-0.5 size-7 shrink-0">
        <BotFace />
      </div>
      <div className="min-w-0 max-w-[85%]">
        <div
          className="rounded-md rounded-tl-sm border border-border bg-surface px-3 py-2 text-body leading-relaxed text-surface-foreground [&_a]:text-info [&_b]:text-primary"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <span className="mt-1 block text-caption text-muted-foreground">
          {time}
          {api ? ' · API' : ''}
        </span>
      </div>
    </div>
  )
}
