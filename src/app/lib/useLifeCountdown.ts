import { useEffect, useState } from 'react'

import { useBoji } from '@/app/store/boji'

export interface LifeCountdown {
  /** 是否已设置生日（未设置时展示引导入口） */
  configured: boolean
  /** 剩余天数（超过预期寿命时为 0） */
  days: number
  /** 剩余时:分:秒（已拆分，页面自己拼） */
  hours: number
  minutes: number
  seconds: number
  /** 是否已超过预期寿命 */
  expired: boolean
  /** 人生进度百分比（0–100） */
  percent: number
  /** 已度过天数 */
  livedDays: number
  /** 预期寿命对应的结束日期（yyyy-MM-dd） */
  endDate: string
}

/** 生命倒计时：生日 + 预期寿命 → 剩余天数 / 时:分:秒（秒级跳动）+ 人生进度 */
export function useLifeCountdown(): LifeCountdown {
  const s = useBoji()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const lifespan = s.user.lifespan || 80
  if (!s.user.birthday) {
    return { configured: false, days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, percent: 0, livedDays: 0, endDate: '' }
  }
  const birthday = new Date(`${s.user.birthday}T00:00:00`)
  const end = new Date(birthday.getFullYear() + lifespan, birthday.getMonth(), birthday.getDate())
  const remainMs = end.getTime() - now
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    configured: true,
    days: Math.max(0, Math.floor(remainMs / 86400000)),
    hours: Math.max(0, Math.floor(remainMs / 3600000) % 24),
    minutes: Math.max(0, Math.floor(remainMs / 60000) % 60),
    seconds: Math.max(0, Math.floor(remainMs / 1000) % 60),
    expired: remainMs <= 0,
    percent: Math.min(100, Math.max(0, ((now - birthday.getTime()) / (end.getTime() - birthday.getTime())) * 100)),
    livedDays: Math.floor((now - birthday.getTime()) / 86400000),
    endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}
