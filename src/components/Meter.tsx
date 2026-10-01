import type { CSSProperties, ComponentType, ReactNode } from "react"

type Props = {
  label: ReactNode
  pct: number | null
  foot: ReactNode
  empty?: ReactNode
  /** 详细档：表名前的图标（lucide 组件）。经典与延迟档不传，保持纯文字。 */
  icon?: ComponentType<{ className?: string; style?: CSSProperties }>
  /**
   * 简约档的读数窗：表名改用前景色（附加说明仍留在弱化灰里）、进度条压到 6px 且上下各留 6px、
   * 底注降到 11px。三处一起动才是那一档的观感——只把条调细、表名仍是灰的，整块看着像没对齐的旧版。
   * 经典 / 延迟 / 详细三档不传，保持原样。
   */
  plain?: boolean
}

/**
 * One metric: name and percentage on top, bar in the middle, raw numbers
 * underneath. Monochrome, since the length of the bar carries the message.
 *
 * 详细档也照旧：只是在表名前多一枚图标，颜色仍与其余两档同一套灰——图标随所在的
 * 弱化灰文字走 currentColor，不另上色。
 *
 * 简约档（`plain`）与经典共用同一个骨架，只换那一套视觉：表名提亮成前景色（CPU 那格的
 * 「N 核」仍留在弱化灰里）、条压细、底注变小，见上面的 props 说明。
 */
export function Meter({ label, pct, foot, empty = "—", icon: Icon, plain = false }: Props) {
  // null means the metric has no ceiling to fill, so the bar stays empty rather
  // than reporting 0%. What replaces the percentage depends on the reason:
  // unknown for a node with no metrics, ∞ for a plan with no limit.
  const filled = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  // 快满了就换成陶土橙：四种读数都是「越满越该看一眼」，纯墨色表达不了这一档。
  // 阈值 85% 是四条共用的——CPU 跑满和硬盘写满，对访客是同一句话「这台机器吃紧了」。
  const hot = pct !== null && filled >= 85
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-1.5 text-xs${plain ? "" : " text-muted-foreground"}`}>
          {Icon && <Icon className="size-3 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <span className="tnum text-xs font-medium">
          {pct === null ? empty : `${filled < 10 ? filled.toFixed(1) : filled.toFixed(0)}%`}
        </span>
      </div>
      <div className={`sk-bar w-full${plain ? " my-1.5 h-1.5" : " mt-2 h-2.5"}${hot ? " sk-bar-hot" : ""}`}>
        <div className="sk-bar-fill h-full" style={{ width: `${filled}%` }} />
      </div>
      <div className={`tnum truncate text-muted-foreground${plain ? " text-[11px]" : " mt-1.5 text-xs"}`}>{foot}</div>
    </div>
  )
}
