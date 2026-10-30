import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react"
import { Activity, ArrowDown, ArrowDownUp, ArrowUp, Gauge, PiggyBank, Server, Wallet } from "lucide-react"

import { Card } from "@/components/ui/card"
import { DetailScroll } from "@/components/DetailScroll"
import { TrafficDetail } from "@/components/TrafficDetail"
import { speedHistory, type Node } from "@/lib/api"
import { bytes, rate } from "@/lib/format"
import { useFx } from "@/lib/fx"
import { BUDGET_ROWS, budgetOf, cny, fxNote, type BudgetItem } from "@/lib/money"
import { summarize, type Fleet } from "@/lib/summary"

/**
 * 列表页顶上那行概览卡片，两副面孔（主题设置的「列表页顶部」里选）：
 *
 *   原版（summary / both）——四张卡片，各一块读数：节点 / 最忙节点 / 今日流量 / 实时网速。
 *   月度预算剩余价值版（budget / bothBudget）——四张卡片，但前两张各排两块读数：
 *     ① 月度预算 + 剩余价值（口径见 lib/money.ts）
 *     ② 节点 + 最忙节点（照参考图：节点挪到原先最忙节点那一侧、最忙节点往右让位，
 *        两块分居同一张卡片的两端，下沿对齐）
 *     后两张两副面孔完全一样。
 *
 * 两副面孔的数据都来自 `/api/nodes` 里本来就有的字段，开着它不会多发一个请求——唯一的
 * 例外是第四张下面那条走势线，它画的是访客打开页面之后自己攒下的实时速率（api.ts 的
 * `speedHistory`，每 2 秒一个采样、留最近 60 个 ≈ 2 分钟）：hub 没有「全站速率历史」
 * 这种接口，刷新页面就得重新攒——冷启动头几秒那个窗口不空着：一行手写小注
 * （「正在记录网速走势…」）顶着，线画出来它退场。
 *
 * ★口径跟着分组标签走：传进来的是**当前分组筛选出的节点**（`group` 也跟着一起来，
 * 用来取那一条分组自己的速率走势线），与下面那批卡片是同一批机器。参考站（monitor 内置
 * default 主题）的概览四格也是拿筛选后的节点算的；只让列表变、这一行不动，会出现
 * 「上面写着 3 / 4 · Node B，下面只剩一个分组那两张卡片」。
 *
 * ★**搜索也吃同一套口径**：顶栏那个搜索框（`@/lib/search`）收窄之后，这一行跟着一起收窄
 * ——「上面写着 8 台、下面只搜出 2 台」与上面那句话是同一个毛病。收窄到一台不剩时，
 * 「节点」那张卡底部那行小字会写「没有匹配的节点」而不是「还没有节点」（`searching`）。
 *
 * 默认不显示（主题设置的「列表页顶部」没选它）。站点本来就有每台机器自己的卡片，
 * 不需要概览的站不必为此让出首屏；没选时这个组件整个不挂载。
 */

/**
 * 一块读数：一行标题（图标 + 名称）、一行大数字、一行小字。
 *
 * 卡片是 flex、块是 flex-col，所以块里的 `mt-auto` 能把底部那行压到同排最高的那块的下沿，
 * 内容行数不同也对齐（例如「无在线节点」与「1 台离线」落在同一条基线上）。
 *
 * `detail` 给了它，整块就成了一枚可悬停/点开的热点（2026-10-12 的创意项）：鼠标悬停（或
 * 触屏点一下）弹出一枚浮层，把这个数的分解摊开（如「月度预算」的逐台明细）。开合规则：
 * 鼠标 pointerenter 即开、leave 即关；触屏/笔点一下开，点别处或 Esc 关；键盘 Tab 到它开、
 * blur 关。原来的 hint（原生 title）在这条路径上让位给了浮层尾巴里的同一段说明 ——
 * 两套悬停提示叠在一起会打架，而信息一字不少。
 */
function Block({ icon: Icon, title, hint, detail, wide = false, children }: {
  icon: ComponentType<{ className?: string }>
  title: string
  /** 悬停提示：口径说明——月度预算与剩余价值那两个数不是一眼能看懂的，得写清楚。 */
  hint?: string
  /** 给了它可悬停/点开：弹出的浮层内容（口径行由调用方放在 detail 尾巴里）。 */
  detail?: ReactNode
  /**
   * 宽浮层（22rem；默认 15rem）。给「今日流量」那张的节点明细用：一行要放
   * 「旗子 + 名字 + 今日上下行」，下面还要放两枚带时刻的峰值，15rem 会挤成三条。
   */
  wide?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  // ★2026-10-31 与母主题 jikasei 同步：浮层再长也不许吊出视口。开的时候量一次**这块下面还剩
  //   多少空间**，把高度上限压到「剩下的那点」——矮窗口（1440×420）里 min(24rem, 60vh) 仍会
  //   顶穿屏幕下沿。`detail` 也在依赖里：今日流量的峰值是逐台回来的，行数长出来要重新量。
  const popRef = useRef<HTMLSpanElement | null>(null)
  // 开着的浮层：点别处 / Esc 收起（与 NodeCard 那枚浮层同一个做法）。
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const el = e.target
      if (!(el instanceof HTMLElement) || !ref.current?.contains(el)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey) }
  }, [open])
  // 量可用空间并压上限。用 layout effect：改高度发生在同一帧里，看不见浮层先长出来再被压。
  useLayoutEffect(() => {
    if (!open) return
    const pop = popRef.current
    const host = ref.current
    if (!pop || !host) return
    pop.style.maxHeight = "none"                   // 先按自然高度量（CSS 那道上限先让开）
    const natural = pop.offsetHeight
    const box = host.getBoundingClientRect()
    const room = Math.round(window.innerHeight - box.bottom - 8)   // 留 8px 别贴着屏幕边
    const want = Math.min(natural, 384, Math.round(window.innerHeight * 0.6))
    pop.style.maxHeight = `${Math.max(120, Math.min(want, room))}px`
  }, [open, detail])
  return (
    <div
      ref={ref}
      className={`relative flex min-w-0 flex-col ${detail !== undefined ? "rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" : ""}`}
      title={detail ? undefined : hint}
      tabIndex={detail ? 0 : undefined}
      role={detail ? "button" : undefined}
      aria-expanded={detail ? open : undefined}
      onPointerEnter={detail ? (e) => { if (e.pointerType === "mouse") setOpen(true) } : undefined}
      onPointerLeave={detail ? (e) => { if (e.pointerType === "mouse") setOpen(false) } : undefined}
      onFocus={detail ? () => setOpen(true) : undefined}
      onBlur={detail ? () => setOpen(false) : undefined}
      onClick={detail ? () => setOpen(true) : undefined}
    >
      {/* 手写小注：卡片标题用 Caveat（汉字落到系统楷体），像随手写在纸角上的一行字。
          读数与单位不跟它走——那两样是等宽的小票字。 */}
      <div className="sk-hand flex items-center gap-1.5 text-[15px] leading-none">
        <Icon className="size-3.5 shrink-0" />
        {title}
      </div>
      {children}
      {detail !== undefined && open && (
        // data-budget-detail：护栏认「浮层开没开、内容对不对」的锚点（与 data-latency 同一套做法）。
        // ★2026-10-12 两处讲究（服务器多了以后浮层会长到几十行）：
        //   ① 去掉了原来的 mt-1.5 —— 那段 6px 空隙会让「指针从块下移到浮层」的路上触发
        //      pointerleave，桌面鼠标一往下浮层就闪关（根本摸不进浮层、也滚不动）。现在浮层紧贴
        //      块底，指针全程留在 Block 子树里，悬停不断；视觉上的缓冲由浮层自己的内边距兜着。
        //   ② ★2026-10-31 与母主题同步成**三段式**（表头 / 明细 / 尾巴各一节，明细那节自己滚）：
        //      机器多时表头里的台数与尾巴里的口径会跟着滚出视野。现在表头与尾巴是 flex 的固定项，
        //      只有中间那节 `detail-scroll` 滚动（纸面滚动条同款）。高度上限写在 index.css。
        <span
          ref={popRef}
          data-budget-detail=""
          className={`${wide ? "traffic-detail max-w-[22rem]" : "budget-detail max-w-[15rem]"} sk-pop absolute left-0 top-full z-20 flex w-max flex-col text-xs`}
        >
          {detail}
        </span>
      )}
    </div>
  )
}

/**
 * 预算卡两枚浮层的内容：逐台明细（金额降序，与 budgetOf 的明细同序）+ 口径行。
 *
 * ★2026-10-31 与母主题 jikasei 同步：① 尾巴从一整段话收成**两条**（口径一条、汇率一条），
 *   15rem 宽里不再铺五行；② 机器多时只列前 BUDGET_ROWS 条，剩下的收成「其余 N 台 ≈¥X」一行
 *   ——逐台相加仍等于卡片面那个合计，数字不丢。
 */
function BudgetDetail({ head, items, note, rates }: { head: string; items: BudgetItem[]; note: string; rates: string }) {
  const shown = items.slice(0, BUDGET_ROWS)
  const rest = items.slice(BUDGET_ROWS)
  const restSum = rest.reduce((sum, item) => sum + item.amount, 0)
  return (
    <>
      {/* 表头带上条数（「各节点月摊 · 87 台」）：浮层能滚了之后，第一眼就知道一共有多少台；
          三段式之后它固定在最上面，滚到底也还在。 */}
      <span data-detail-head="" className="block border-b-[1.5px] border-dashed border-line-strong px-2.5 py-1.5 text-muted-foreground">{head} · {items.length} 台</span>
      <DetailScroll>
        {shown.map((item, i) => (
          <span key={i} data-budget-row="" className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{item.name}</span>
            <span className="tnum shrink-0">≈{cny(item.amount)}</span>
          </span>
        ))}
        {rest.length > 0 && (
          <span data-budget-rest="" className="flex items-baseline justify-between gap-3 text-muted-foreground">
            <span className="min-w-0 truncate">其余 {rest.length} 台</span>
            <span className="tnum shrink-0">≈{cny(restSum)}</span>
          </span>
        )}
      </DetailScroll>
      <span data-detail-foot="" className="block border-t-[1.5px] border-dashed border-line-strong px-2.5 py-1.5 text-muted-foreground">
        <span className="block">{note}</span>
        <span className="block">{rates}</span>
      </span>
    </>
  )
}

/**
 * 一块读数里的主数字。`tnum` 让数字等宽：每两秒刷一次时不会左右抖。
 *
 * ★**长数字要缩号**：这一行是 `truncate`，而价值版那两格各占一半卡宽——千位数量级的金额
 * （`≈¥2,803.13` 比 `≈¥277.01` 宽 14px）在「列数刚换」的窄列机位（640 / 1280 / 1440）
 * 会被打成 `≈¥2,803.…`（站长实拍）。做法：按基准字号量一次「文本宽 ÷ 格子宽」，
 * 装不下就按比例降字号（有下限，见 BIG_MIN），窗口缩放与字体加载完各重量一次；
 * `truncate` 留着当最后一道兜底。降号只发生在真的装不下时，短读数（7 / 7）不受影响。
 */
const BIG_BASE = 22
const BIG_MIN = 15
function Big({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = ""                        // 先回到基准字号量，免得越缩越小
      el.style.lineHeight = ""
      const baseH = el.getBoundingClientRect().height
      const cw = el.clientWidth
      const sw = el.scrollWidth
      if (cw > 0 && sw > cw) {
        // 行高钉在基准字号那一档：缩号只改字的大小，卡片高度零位移
        // （否则长读数那张卡会矮几像素，整行卡片跟着参差）。
        el.style.lineHeight = `${baseH}px`
        el.style.fontSize = `${Math.max(BIG_MIN, Math.floor((BIG_BASE * cw) / sw))}px`
      }
    }
    fit()
    const ro = new ResizeObserver(fit)              // 换列数 / 换字体 / 换长度都要重量
    ro.observe(el)
    // ★字体是**后到**的（这套皮肤的数字走 @font-face）：先按兜底字体量会得出「装得下」，
    //   真字体一到就溢出——冷启动那一次仍会被截（实测：同一个构建，字体已缓存时护栏全绿、
    //   冷加载时 640 档仍溢出 14px）。所以加载完 + 头几帧各重量一次。
    const timers = [0, 120, 400, 1200].map((ms) => window.setTimeout(fit, ms))
    const onDone = () => fit()
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.addEventListener?.("loadingdone", onDone)
      document.fonts.ready?.then(fit).catch(() => {})
      // 最确定的一手：按这个盒子**实际的字体规格**把字体要过来，就位后再量一次
      // （`ready` 只等「当时在加载的」字体，卡片挂载晚于它时不会重来）。
      const cs = window.getComputedStyle(el)
      document.fonts.load?.(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`)?.then(fit)?.catch(() => {})
    }
    return () => {
      ro.disconnect()
      timers.forEach((t) => window.clearTimeout(t))
      document.fonts?.removeEventListener?.("loadingdone", onDone)
    }
  }, [children])
  return <div ref={ref} className="tnum mt-2 truncate text-[22px] leading-tight font-medium">{children}</div>
}

/** 一块读数底下那行小字（卡片两端对齐时它落在下沿）。 */
function Foot({ children }: { children: ReactNode }) {
  return <div className="mt-auto truncate pt-6 text-xs text-muted-foreground">{children}</div>
}

/** 一张卡片：里面就一块读数（今日流量 / 实时网速，以及原版的每一张）。 */
function Tile({ children }: { children: ReactNode }) {
  return <Card className="min-w-0 gap-0 p-4">{children}</Card>
}

/**
 * 一张卡片里两块读数：**两块平分**（`grid-cols-2` + 同一个 `gap-x-3`），所以两张卡里的第二块
 * 读数落在同一条竖线上，而且与「今日流量 / 实时网速」两张卡里那张两列小栅格的第二列同一落点
 * —— 整行四张卡读起来是一个栅格（站长挑的排法：最素、不要分隔线）。
 *
 * 早先试过 `justify-between`（块宽按内容走）：剩余价值（≈¥191.94）比最忙节点（51.0%）宽，
 * 两张卡的右列起点差 18px（1440）/17px（390），被框出来报过；也试过固定 45% 的右列，列对齐了
 * 但与前两张卡不是一个节奏。护栏里两条都钉着（同一列 + 同一落点）。
 *
 * 下沿对齐靠 `items-stretch`（块撑满卡片高度，grid 的默认值）+ Block 里的 `mt-auto`。
 */
function Pair({ children }: { children: ReactNode }) {
  return (
    <Card className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-0 p-4">
      {children}
    </Card>
  )
}

/** 一枚带方向箭头的读数。颜色随所在那一行（今日那行是前景色，累计那行是弱化灰）。 */
function Val({ icon: Icon, children }: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <span className="tnum inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  )
}

// viewBox 的横纵与卡片实际尺寸无关：下面的 preserveAspectRatio 会把它拉满整行，
// 纵轴按自己的最大值缩放。零基准——网速这种量没有上限可参照，不零基准会把
// 「一直很忙」和「偶尔抖一下」画成同一个形状。
const W = 100
const H = 28

/**
 * 实时网速下面那条走势线：下行 / 上行两条折线，无坐标轴、无填充——这一块只说
 * 「从打开页面到现在大概什么形状」，确切读数是它上面那一行。
 *
 * `preserveAspectRatio="none"` 把 viewBox 横向拉满卡片，代价是线宽也会被拉粗，
 * 所以每条线挂 `vectorEffect="non-scaling-stroke"` 把线宽钉回 1px。
 *
 * 采样点少于两个（冷启动的头几秒、或 hub 一直连不上）就只占位不画线：一个点画不出
 * 走势，画在那里会被读成「一直那么快」。高度照留，卡片不会因此跳一下。
 */
function Sparkline({ series }: { series: { rx: number; tx: number }[] }) {
  const ready = series.length > 1
  const max = Math.max(1, ...series.map((s) => Math.max(s.rx, s.tx)))
  const min = series.length ? Math.min(...series.map((s) => Math.min(s.rx, s.tx))) : 0
  // 稳态（两个方向几乎不动）时别贴着顶边画成一根"边框线"：两条都落到中线附近（rx 略上、tx 略下）。
  const flat = max - min < max * 0.06
  const line = (pick: (s: { rx: number; tx: number }) => number, offset: number) =>
    series
      .map((s, i) => `${((i / (series.length - 1)) * W).toFixed(2)},${flat ? H / 2 + offset : (H - 1 - (pick(s) / max) * (H - 2)).toFixed(2)}`)
      .join(" ")
  return (
    // 攒点期间（打开后头几秒）不留空窗：一行手写小注顶着这块预留位，线画出来它退场（高度不变）。
    <div className={ready ? "mt-auto h-7 pt-4" : "mt-auto h-7"}>
      {ready ? (
        <svg className="h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {/* 下行用前景色、上行用弱化灰：与卡片网络区那两个方向的读法一致
              （速率用前景色、累计用灰），深浅色下都跟着同一套变量走。 */}
          <polyline points={line((s) => s.rx, -1)} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-foreground/70" />
          <polyline points={line((s) => s.tx, 1)} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-muted-foreground/60" />
        </svg>
      ) : (
        // 颜色走 .sk-hand 的 accent-ink（与「还没有节点」那类空态小注同一支笔）；
        // 别再挂 text-muted-foreground——未分层的 .sk-hand 会把它压掉，写了是误导。
        <p data-speed-note="" className="sk-hand flex h-full items-center justify-center text-[13px] leading-none">正在记录网速走势…</p>
      )}
    </div>
  )
}

/** 「节点」那块读数：在线 / 总数 + 离线台数。两副面孔共用，块本身一模一样。 */
function NodesBlock({ fleet, searching = false }: { fleet: Fleet; searching?: boolean }) {
  const offline = fleet.total - fleet.online
  return (
    <Block icon={Server} title="节点">
      {/* 「在线 / 总数」：斜杠是纯文本，与数字同一色（照参考图），也省得读屏与复制时黏成一团。 */}
      <Big>
        {fleet.online} / {fleet.total}
      </Big>
      <Foot>
        {/* 「一台都没有」有两种成因，说法得分开：站点本来就没有节点，还是搜索把当前那批全筛掉了。 */}
        {fleet.total === 0 ? (searching ? "没有匹配的节点" : "还没有节点") : offline === 0 ? "全部在线" : `${offline} 台离线`}
      </Foot>
    </Block>
  )
}

/** 「最忙节点」那块读数：CPU 占用最高的在线节点。 */
function BusiestBlock({ fleet }: { fleet: Fleet }) {
  return (
    <Block icon={Activity} title="最忙节点">
      {/* 一位小数，与卡片里 CPU 那格同一个口径。 */}
      <Big>{fleet.busiest ? `${fleet.busiest.cpu.toFixed(1)}%` : "—"}</Big>
      <Foot>
        {fleet.busiest ? fleet.busiest.name : "无在线节点"}
      </Foot>
    </Block>
  )
}

export function SummaryCards({ nodes, group, finance = false, searching = false }: { nodes: Node[]; group: string | null; finance?: boolean; searching?: boolean }) {
  const fleet = summarize(nodes)
  // 每日汇率（lib/fx.ts）：新鲜缓存 ∪ 内置表起步，拉到新的在后台无缝换上——只调一次，
  // 两个数（budget 与 note）共用同一份快照，文案与数字不许说岔。
  const fx = useFx()
  const budget = budgetOf(nodes, fx)
  // 模块级的采样缓冲：`useNodes` 每次收到推送（或轮询回来）就追加一个点，
  // 所以这里读到的是「打开页面到现在」的速率。**按分组取**（`group` = 当前选中的那一档，
  // null = 全部）：同一个缓冲里每个分组各有一条线（api.ts 的 sample），拿全站那条线画在
  // 分组标签下面，会出现「读数是这一组的、走势线是全站的」这种对不上的画面。
  const series = speedHistory.get(group) ?? []
  // 折算说明：只列真的用到过的币种——各站的账混着 USD / EUR / CNY 记，合起来必须说明口径。
  const note = fxNote(budget.used, budget.skipped, fx)
  // 「月度预算」与「剩余价值」两段口径文字：没有浮层时它们是原生 title；有浮层时挪进浮层尾巴。
  // ★2026-10-31 与母主题 jikasei 同步精简：尾巴只留「口径一句 + 汇率一句」，浮层里两条各自成行
  // （break 落在句号/冒号处，15rem 宽里不再铺五行）。
  const monthlyRule = "月摊相加；买断与未填价不计"
  const remainingRule = "按剩余天数折算；无到期日与买断不计"
  const monthlyNote = `${monthlyRule}。${note}`
  const remainingNote = `${remainingRule}。${note}`

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {finance ? (
        <>
          {/* 第一张卡：月度预算 + 剩余价值。两个数都是把各站的账按固定汇率折成人民币后相加，
              所以写「≈」；口径与汇率清单放在悬停提示里（见 lib/money.ts）。
              两块都挂了浮层（detail，2026-10-12）：月度预算摊出「各节点月摊」、剩余价值摊出
              「各节点剩余价值」——各有可计的机器才挂（明细为空时保持原生的 title 提示那副面孔）。 */}
          <Pair>
            <Block icon={Wallet} title="月度预算" hint={monthlyNote} detail={budget.monthlyItems.length > 0 ? <BudgetDetail head="各节点月摊" items={budget.monthlyItems} note={monthlyRule} rates={note} /> : undefined}>
              <Big>{budget.monthly === null ? "—" : `≈${cny(budget.monthly)}`}</Big>
              <Foot>{budget.monthlyCount ? `${budget.monthlyCount} 台计费` : "未记录价格"}</Foot>
            </Block>
            <Block icon={PiggyBank} title="剩余价值" hint={remainingNote} detail={budget.remainingItems.length > 0 ? <BudgetDetail head="各节点剩余价值" items={budget.remainingItems} note={remainingRule} rates={note} /> : undefined}>
              <Big>{budget.remaining === null ? "—" : `≈${cny(budget.remaining)}`}</Big>
              <Foot>{budget.remainingCount ? `${budget.remainingCount} 台未到期` : "无预付到期"}</Foot>
            </Block>
          </Pair>

          {/* 第二张卡：节点 + 最忙节点，与上面同一套排法——两块读数分居卡片两端。 */}
          <Pair>
            <NodesBlock fleet={fleet} searching={searching} />
            <BusiestBlock fleet={fleet} />
          </Pair>
        </>
      ) : (
        <>
          <Tile>
            <NodesBlock fleet={fleet} searching={searching} />
          </Tile>

          <Tile>
            <BusiestBlock fleet={fleet} />
          </Tile>
        </>
      )}

      <Tile>
        <Block
          icon={ArrowDownUp}
          title="今日流量"
          wide
          hint="今天各节点的下行 / 上行总量与采样峰值（点开或悬停看逐台明细）"
          detail={<TrafficDetail nodes={nodes} />}
        >
          <div className="mt-2 grid grid-cols-2 gap-x-3 text-base font-semibold">
            <Val icon={ArrowDown}>{bytes(fleet.dayRx)}</Val>
            <Val icon={ArrowUp}>{bytes(fleet.dayTx)}</Val>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">总流量</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 text-sm text-muted-foreground">
            <Val icon={ArrowDown}>{bytes(fleet.totalRx)}</Val>
            <Val icon={ArrowUp}>{bytes(fleet.totalTx)}</Val>
          </div>
        </Block>
      </Tile>

      <Tile>
        <Block icon={Gauge} title="实时网速">
          <div className="mt-2 grid grid-cols-2 gap-x-3 text-base font-semibold">
            <Val icon={ArrowDown}>{rate(fleet.netRx)}</Val>
            <Val icon={ArrowUp}>{rate(fleet.netTx)}</Val>
          </div>
          <Sparkline series={series} />
        </Block>
      </Tile>
    </div>
  )
}
