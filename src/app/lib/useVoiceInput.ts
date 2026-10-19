/* =============================================================================
 * 薄肌计划 · 语音输入 hook（ASR）
 *
 * 封装「壳录音 → StepAudio 3 ASR 转写 → 文本回调」的完整状态机，供所有
 * 文本输入处复用（主对话 / 计划编辑 / 饮食 / 备忘 / 记忆 / 备注 / 档案）。
 * 同一时刻只应有一个实例在录音；recordAudioStop 事件只由正在录音的实例消费。
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'

import { getBridgeMode, invokeNative, onNativeEvent } from '@/shared/bridge'
import { getState } from '@/app/store/boji'
import { useToast } from '@/shared/ui/Toast'
import { transcribeAudio } from './stepfun'

export function useVoiceInput(onResult: (text: string) => void) {
  const { toast } = useToast()
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)
  const recordingRef = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const clear = useCallback(() => {
    recordingRef.current = false
    setRecording(false)
    setSecs(0)
    if (timer.current) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  const finish = useCallback(
    async (filePath: string) => {
      // 只有正在录音的实例消费结果（多个输入处共用同一事件通道）
      if (!recordingRef.current || !filePath) return
      clear()
      setBusy(true)
      try {
        const text = await transcribeAudio(filePath)
        onResultRef.current(text)
      } catch (err) {
        toast({ title: '识别失败', description: (err as Error).message, tone: 'danger' })
      } finally {
        setBusy(false)
      }
    },
    [clear, toast],
  )

  // 录音到 60s 上限自动停：壳推 recordAudioStop 事件（主动 stop 不发事件）
  useEffect(() => {
    let dispose: (() => void) | undefined
    void onNativeEvent('recordAudioStop', (e) => {
      void finish(e.tempFilePath)
    }).then((d) => {
      dispose = d
    })
    return () => dispose?.()
  }, [finish])

  const start = useCallback(async () => {
    if (!getState().settings.apiKey) {
      toast({ title: '语音输入需要先接入 API', description: '去「我的 → API 接入」填入 Key', tone: 'warning' })
      return
    }
    try {
      // 16kHz 单声道 aac：识别够用、文件小；上限 60s，到点壳自动停并推事件
      await invokeNative('recordAudio', { duration: 60000, format: 'aac', sampleRate: 16000, numberOfChannels: 1 })
      recordingRef.current = true
      setRecording(true)
      setSecs(0)
      timer.current = window.setInterval(() => setSecs((v) => v + 1), 1000)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'cancelled') return
      if (getBridgeMode() === 'mock') {
        toast({ title: '语音输入需要真机 App 壳', description: '预览环境没有麦克风桥接，装壳后即可用', tone: 'info' })
      } else {
        toast({ title: '无法开始录音', description: '请检查麦克风权限', tone: 'danger' })
      }
    }
  }, [toast])

  const stop = useCallback(async () => {
    try {
      const res = await invokeNative('stopRecordAudio', undefined)
      await finish(res.tempFilePath)
    } catch {
      clear()
      toast({ title: '录音太短或结束失败，请重试', tone: 'warning' })
    }
  }, [finish, clear, toast])

  const toggle = useCallback(() => {
    if (recording) void stop()
    else void start()
  }, [recording, start, stop])

  return { recording, secs, busy, toggle }
}
