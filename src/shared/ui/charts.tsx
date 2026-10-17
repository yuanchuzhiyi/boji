/* =============================================================================
 * 薄肌计划 · 图表（全部手写 SVG，零图表库——沿用原产品的实现路线）
 *
 * 三个组件：
 *   MetricRing        指标环（掌舵页四指标）
 *   SnapshotLineChart 快照曲线（资产三线 / 身体双轴，点上的热区可点开编辑）
 *   WeekSleepChart    近 7 日睡眠柱状图
 * 颜色一律走语义 token（stroke-info / fill-violet …），不写色值字面量。
 * ========================================================================== */

import { cn } from '@/shared/lib/cn'

export type ChartColor = 'primary' | 'info' | 'violet' | 'orange' | 'danger'

const STROKE: Record<ChartColor, string> = {
  primary: 'stroke-primary',
  info: 'stroke-info',
  violet: 'stroke-violet',
  orange: 'stroke-orange',
  danger: 'stroke-danger',
}

const FILL: Record<ChartColor, string> = {
  primary: 'fill-primary',
  info: 'fill-info',
  violet: 'fill-violet',
  orange: 'fill-orange',
  danger: 'fill-danger',
}

const TEXT: Record<ChartColor, string> = {
  primary: 'text-primary',
  info: 'text-info',
  violet: 'text-violet',
  orange: 'text-orange',
  danger: 'text-danger',
}

/* ------------------------------- 指标环 ------------------------------- */

export function MetricRing({
  value,
  max,
  unit,
  label,
  color,
}: {
  value: number
  max: number
  unit: string
  label: string
  color: ChartColor
}) {
  const C = 188.5 // 2πr，r = 30
  const p = Math.max(0, Math.min(1, max > 0 ? value / max : 0))
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <svg viewBox="0 0 72 72" className="h-16 w-16" aria-hidden>
        <circle cx="36" cy="36" r="30" fill="none" className="stroke-muted" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r="30"
          fill="none"
          className={cn('ring-anim', STROKE[color])}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={Number((C * (1 - p)).toFixed(1))}
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="35" textAnchor="middle" fontSize="15" fontWeight="600" className="fill-foreground">
          {shown}
        </text>
        <text x="36" y="47" textAnchor="middle" className="fill-muted-foreground" fontSize="8">
          {unit}
        </text>
      </svg>
      <span className="text-caption font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

/* ------------------------------- 快照曲线 ------------------------------- */

export interface SnapshotLineSeries {
  key: string
  label: string
  color: ChartColor
  /** 双轴图：left = 左轴（默认），right = 右轴 */
  axis?: 'left' | 'right'
}

export interface SnapshotLinePoint {
  id: string
  /** x 轴标签（MM-DD） */
  date: string
  values: Record<string, number>
  /** 热区标题（tooltip） */
  title: string
}

const W = 320
const H = 150
const PL = 48
const PT = 12
const PB = 22

/** 右轴（体脂率等）需要在右侧留出刻度标签的位置；单轴图右侧只留少量边距 */
const PR = (hasRight: boolean): number => (hasRight ? 34 : 10)

/**
 * 快照曲线：按录入时间绘制，末端圆点 + 每个点的可点热区（点开编辑该次快照）。
 * series 带 axis: 'right' 时启用右轴（身体数据的体脂率）。
 */
export function SnapshotLineChart({
  points,
  series,
  onSelect,
}: {
  points: SnapshotLinePoint[]
  series: SnapshotLineSeries[]
  onSelect?: (id: string) => void
}) {
  if (!points.length) {
    return (
      <p className="py-5 text-center text-caption text-muted-foreground">
        暂无数据，记第一笔快照后这里会出现曲线
      </p>
    )
  }
  const hasRight = series.some((s) => s.axis === 'right')
  const iw = W - PL - PR(hasRight)
  const ih = H - PT - PB

  function bounds(axis: 'left' | 'right'): [number, number] {
    const keys = series.filter((s) => (s.axis ?? 'left') === axis).map((s) => s.key)
    const all = points.flatMap((p) => keys.map((k) => p.values[k] ?? 0))
    let min = Math.min(...all)
    let max = Math.max(...all)
    if (min === max) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.12
    return [min - pad, max + pad]
  }
  const [lMin, lMax] = bounds('left')
  const [rMin, rMax] = hasRight ? bounds('right') : ([0, 1] as [number, number])

  const x = (i: number) => PL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  const yL = (v: number) => PT + (1 - (v - lMin) / (lMax - lMin)) * ih
  const yR = (v: number) => PT + (1 - (v - rMin) / (rMax - rMin)) * ih

  const ticks = [0, 0.5, 1].map((f) => {
    const yy = PT + ih - f * ih
    const lv = lMin + (lMax - lMin) * f
    return (
      <g key={f}>
        <line x1={PL} y1={yy} x2={W - PR(hasRight)} y2={yy} className="stroke-border" strokeWidth="1" />
        <text x={PL - 6} y={yy + 3.5} textAnchor="end" fontSize="9" className="fill-muted-foreground">
          {formatAxis(lv)}
        </text>
        {hasRight && (
          <text x={W - PR(hasRight) + 5} y={yy + 3.5} textAnchor="start" fontSize="9" className="fill-muted-foreground">
            {formatAxis(rMin + (rMax - rMin) * f)}
          </text>
        )}
      </g>
    )
  })

  const xLabelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i)
  const xLabels = xLabelIdx.map((i) => (
    <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
      {points[i].date}
    </text>
  ))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      {ticks}
      {series.map((s) => {
        const y = (v: number) => ((s.axis ?? 'left') === 'right' ? yR(v) : yL(v))
        const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.values[s.key] ?? 0).toFixed(1)}`).join(' ')
        const last = points[points.length - 1]
        return (
          <g key={s.key}>
            <path d={d} fill="none" className={STROKE[s.color]} strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx={x(points.length - 1)} cy={y(last.values[s.key] ?? 0)} r="3.4" className={FILL[s.color]} />
          </g>
        )
      })}
      {/* 可点热区：第一条线的每个数据点 */}
      {points.map((p, i) => {
        const first = series[0]
        const y = (v: number) => ((first.axis ?? 'left') === 'right' ? yR(v) : yL(v))
        return (
          <circle
            key={p.id}
            cx={x(i)}
            cy={y(p.values[first.key] ?? 0)}
            r="12"
            fill="transparent"
            className={onSelect ? 'cursor-pointer' : undefined}
            onClick={onSelect ? () => onSelect(p.id) : undefined}
          >
            <title>{p.title}</title>
          </circle>
        )
      })}
      {xLabels}
    </svg>
  )
}

function formatAxis(v: number): string {
  const a = Math.abs(v)
  if (a >= 10000) return `${(v / 10000).toFixed(a >= 1000000 ? 0 : 1).replace(/\.0$/, '')}万`
  return String(Math.round(v * 10) / 10)
}

/** 曲线图例（色点 + 名称 + 次数） */
export function LineLegend({ series, extra }: { series: Array<{ label: string; color: ChartColor }>; extra?: string }) {
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-3 text-caption text-muted-foreground">
      {series.map((s) => (
        <span key={s.label} className={TEXT[s.color]}>
          ● {s.label}
        </span>
      ))}
      {extra && <span>{extra}</span>}
    </div>
  )
}

/* ------------------------------- 近 7 日睡眠 ------------------------------- */

export function WeekSleepChart({ days }: { days: Array<{ label: string; value: number; today: boolean }> }) {
  return (
    <div className="flex h-28 items-end gap-2 pt-1.5">
      {days.map((d) => {
        const h = Math.max(3, Math.min(100, (d.value / 9) * 100))
        return (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-caption font-medium text-muted-foreground">{d.value ? d.value.toFixed(1) : '-'}</span>
            <div
              className={cn(
                'w-full max-w-[26px] rounded-t-md',
                d.today
                  ? 'bg-gradient-to-b from-primary to-primary/40 shadow-[0_0_10px_rgb(var(--primary)/0.35)]'
                  : 'bg-gradient-to-b from-violet to-violet-soft',
              )}
              style={{ height: `${h}%` }}
            />
            <span className="text-caption text-muted-foreground">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
