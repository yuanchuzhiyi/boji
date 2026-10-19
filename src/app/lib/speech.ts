/* =============================================================================
 * 薄肌计划 · 语音播报（TTS 播放器）
 *
 * 合成（stepfun.ts 的 synthesizeSpeech）+ 播放的单例管理：同一时刻只播一段，
 * 新的播放会顶掉上一段；播放结束 / 失败后自动释放 objectURL。
 * ========================================================================== */

import { synthesizeSpeech } from './stepfun'

let current: HTMLAudioElement | null = null

/** 停止当前播放（如有） */
export function stopSpeaking(): void {
  if (current) {
    current.pause()
    current = null
  }
}

export function isSpeaking(): boolean {
  return Boolean(current && !current.paused)
}

/**
 * 合成并播放一段文本。播放中再次调用会顶掉当前音频。
 * 返回的 Promise 在播放自然结束或失败时resolve/reject。
 */
export async function speak(text: string, opts: { voice?: string; speed?: number } = {}): Promise<void> {
  stopSpeaking()
  const blob = await synthesizeSpeech(text, opts)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  current = audio
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      URL.revokeObjectURL(url)
      if (current === audio) current = null
    }
    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('音频播放失败'))
    }
    audio.play().catch((err: unknown) => {
      cleanup()
      reject(err instanceof Error ? err : new Error('音频播放失败'))
    })
  })
}
