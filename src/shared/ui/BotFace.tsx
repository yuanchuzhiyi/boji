import { useId } from 'react'

import { cn } from '@/shared/lib/cn'

/**
 * 机器人「小薄」头像（薄肌计划的 AI 掌舵形象）。
 *
 * 顶栏 / 消息气泡 / 服务器状态卡共用同一个组件；`thinking` 时光晕呼吸，
 * 眼睛定期眨一下——两个动画都在 globals.css（prefers-reduced-motion 已全局降级）。
 */
export function BotFace({ className, thinking = false }: { className?: string; thinking?: boolean }) {
  const gradientId = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('size-full', className, thinking && 'animate-bot-think')}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--boji-line2))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--boji-bg))' }} />
        </linearGradient>
      </defs>
      {/* 天线 + 顶端球 */}
      <line x1="32" y1="3" x2="32" y2="11" className="stroke-primary" strokeWidth="2" />
      <circle cx="32" cy="4.5" r="3" className="fill-primary" />
      {/* 两侧耳 */}
      <rect x="4" y="25" width="6" height="15" rx="3" className="fill-surface-muted" />
      <rect x="54" y="25" width="6" height="15" rx="3" className="fill-surface-muted" />
      {/* 头 */}
      <rect x="10" y="11" width="44" height="39" rx="14" fill={`url(#${gradientId})`} className="stroke-primary" strokeWidth="1.4" />
      {/* 眼睛（定期眨一下） */}
      <g className="animate-bot-blink">
        <rect x="20" y="25" width="7.5" height="10" rx="3.7" className="fill-primary" />
        <rect x="36.5" y="25" width="7.5" height="10" rx="3.7" className="fill-primary" />
      </g>
      {/* 嘴 */}
      <path d="M25.5 42 q6.5 6 13 0" className="stroke-primary" fill="none" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
