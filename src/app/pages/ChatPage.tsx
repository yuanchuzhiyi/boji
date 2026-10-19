import { useEffect, useRef, useState } from 'react'
import { Cpu, Hourglass, ImagePlus, Send, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { invokeNative } from '@/shared/bridge'
import { BotFace } from '@/shared/ui/BotFace'
import { useToast } from '@/shared/ui/Toast'
import { QUICKS, TARGETS, ensureDay, getState, mutate, useBoji } from '@/app/store/boji'
import { ModelPickerDialog } from '@/app/components/ModelPickerDialog'
import { askHelm, describeApiError } from '@/app/lib/stepfun'
import { applyLog, detect, noKeyNotice, respond } from '@/app/lib/script'
import { esc, fmt, fmtTime } from '@/app/lib/text'
import { urlToCompressedDataUrl } from '@/app/lib/image'
import { useLifeCountdown } from '@/app/lib/useLifeCountdown'

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
  const navigate = useNavigate()
  const life = useLifeCountdown()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
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
    const image = pendingImage
    if ((!text && !image) || busy) return
    setDraft('')
    setPendingImage(null)
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // 用户消息落库 + 本地意图识别（打卡 / 记忆先落数据）
    const shown = text || '（一张图片）'
    mutate((draft) => {
      draft.chat.push({ who: 'user', text: shown, t: Date.now() })
    })
    const it = detect(shown)
    const memNote = applyLog(it)

    setBusy(true)
    setStreaming(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      let html: string
      if (hasKey) {
        // 已接入 Key：真实模型（流式 + 工具循环 + 记忆提炼；有图时走多模态消息）
        let acc = ''
        html = await askHelm(
          shown,
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
          image ?? undefined,
        )
      } else {
        // 未接入 Key：本地剧本引擎 + 接入引导（只提醒一次）
        await new Promise((r) => setTimeout(r, 350))
        html = respond(getState(), shown, it)
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

  /** 选图（壳的相册 / 拍照）→ 压缩成 JPEG dataURL 暂存，随下一条消息发送 */
  async function pickImage() {
    if (!hasKey) {
      toast({ title: '发送图片需要先接入 API', description: '去「我的 → API 接入」填入 Key', tone: 'warning' })
      return
    }
    if (busy) return
    try {
      const res = await invokeNative('chooseImage', { count: 1, sourceType: ['album', 'camera'] })
      const url = res.tempFilePaths[0]
      if (!url) return
      setPendingImage(await urlToCompressedDataUrl(url))
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== 'cancelled') toast({ title: '选择图片失败，请重试', tone: 'danger' })
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

      {/* 生命倒计时条：始终可见，秒级跳动；未设置生日时是引导入口 */}
      {life.configured ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-primary-soft px-4 py-2">
          <Hourglass className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="shrink-0 text-caption text-muted-foreground">生命倒计时</span>
          {life.expired ? (
            <span className="text-body font-semibold text-danger">已超过预期寿命 · 多活的都是赚的</span>
          ) : (
            <>
              <span className="text-title font-semibold text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                还剩 {life.days.toLocaleString()} 天
              </span>
              <span
                className="ms-auto shrink-0 text-body font-semibold text-info"
                style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '1px' }}
              >
                {String(life.hours).padStart(2, '0')}:{String(life.minutes).padStart(2, '0')}:{String(life.seconds).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/me')}
          className="flex shrink-0 items-center gap-2 border-b border-border bg-primary-soft px-4 py-2.5 text-left"
        >
          <Hourglass className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="text-caption text-muted-foreground">
            设置生日与预期寿命，开启<b className="text-primary">生命倒计时</b> →
          </span>
        </button>
      )}

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
        {/* 待发送图片预览：压缩后暂存，随下一条消息一起发出（不入库） */}
        {pendingImage && (
          <div className="mb-2 flex items-center gap-2.5 rounded-md border border-border bg-surface p-2">
            <img src={pendingImage} alt="待发送的图片" className="size-12 shrink-0 rounded-sm object-cover" />
            <span className="min-w-0 flex-1 text-caption text-muted-foreground">
              图片已就绪，随下一条消息一起发给{botName}
            </span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              aria-label="移除图片"
              className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-accent active:text-danger"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
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
          <button
            type="button"
            onClick={() => void pickImage()}
            disabled={busy}
            aria-label="发送图片"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-input bg-surface text-muted-foreground active:border-primary active:text-primary disabled:opacity-50"
          >
            <ImagePlus className="size-5" aria-hidden />
          </button>
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
