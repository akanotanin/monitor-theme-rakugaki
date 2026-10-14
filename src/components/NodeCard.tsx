import { useRef, useState, type ComponentType, type ReactNode } from "react"
import {
  ArrowDown, ArrowDownUp, ArrowUp, CalendarClock, Cpu, HardDrive, Lock, MemoryStick,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { LatencyPanel } from "@/components/Latency"
import { TextHighlight } from "@/components/TextHighlight"
import { Meter } from "@/components/Meter"
import type { Node } from "@/lib/api"
import { CYCLES, FOREVER, bytes, daysUntil, money, pair, percent, rate, uptime } from "@/lib/format"
import { remarkChips, type RemarkChip } from "@/lib/notes"
import { remarksOnCards, type RemarkPlacement } from "@/lib/site-settings"

/**
 * This period's usage as the plan meters it. The hub computes it; the switch
 * below serves only a hub from before `month_used`.
 */
export function monthUsage(node: Node): number {
  if (typeof node.month_used === "number") return node.month_used
  const { month_rx: rx, month_tx: tx } = node
  switch (node.traffic_mode) {
    case "up":
      return tx
    case "down":
      return rx
    case "max":
      return Math.max(rx, tx)
    default:
      return rx + tx
  }
}

// A node that has reported once has told the hub its shape -- cores, memory,
// disk -- and the hub retains its traffic totals whether connected or not. A node
// that never connected is the only case with nothing to show.
export function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

/**
 * 离线了多久（秒）。优先用 hub 算好的 `last_seen_ago`——它按 **hub 的时钟**算，而拿
 * `last_seen` 减访客浏览器的时钟会在访客时钟偏了时报出错误的时长（快 8 小时就显示成
 * 「离线 8 小时」，hub 1.4.0 起专门下发这个字段就是为了替掉那种算法）。老 hub（1.4.0
 * 之前）没有这个 key，退回按 `last_seen` 自己算；从未上报（last_seen 为 0）得 0，
 * 调用方按「不足一分钟」处理。
 */
export function offlineSeconds(node: Node): number {
  if (typeof node.last_seen_ago === "number") return Math.max(0, node.last_seen_ago)
  return node.last_seen ? Math.max(0, Date.now() / 1000 - node.last_seen) : 0
}

// 上游那枚「圆点 + 在线时长」徽章（Status）已随本主题删除：卡片与详情页都不再挂它，
// 详情页把同一个时长写进了信息项里的「在线时间」（见 NodeDetail 的 onlineFor）。
// 要恢复，去上游 monitor-theme-default 的 v1.1.0 取回该组件，并把 index.css 里
// --online / --offline 两个色值一起加回来。
//
// 详细档标题行前那枚状态点（StatusDot）也一并撤了：那一点紧贴国旗、挤在名字前头，
// 位置局促；何况在线与否在下面的 MetaRow 里已写成「在线 …」的文字，不必再用一枚
// 无标签的圆点重复一遍。标题行现在只剩「旗子 + 名字」。

/**
 * Where the machine is: its flag, or the bare code for one the set lacks.
 *
 * 旗子是主题自带的静态文件（`/flags/<CC>.svg`，258 面，按 ISO 3166-1 alpha-2
 * 命名，36×36 圆角方形画布、图案画在中间的 36×26 里），按国家码现取一张：访客
 * 只会下载页面上真正出现的那几面旗，不必把整套打进 bundle。
 *
 * 取不到就退回文字徽标——国家码不在这 258 面里（hub 偶尔给出 XA 这类非 ISO 码）、
 * 或者旗子文件没被装上，都走这一条，不留一枚破图。
 */
export function Country({ node }: { node: Node }) {
  const [missing, setMissing] = useState(false)
  const code = (node.country || "").trim().toUpperCase()
  if (!code) return null
  if (missing) {
    return (
      <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
        {code}
      </Badge>
    )
  }
  return (
    <img
      src={`/flags/${code}.svg`}
      alt={code}
      title={code}
      width={24}
      height={18}
      loading="lazy"
      // 24×18（4:3）：比一行 12px 的字高一档才看得清，1px 描边让日本、波兰这类
      // 白底旗在卡片上仍有边界。画布是正方形，`object-cover` 正好裁掉上下留白，
      // `-translate-y-px` 抵消行盒与图标基线之间的 1px 落差。
      className="h-[18px] w-6 shrink-0 -translate-y-px rounded-[3px] object-cover ring-[1.5px] ring-line-strong"
      onError={() => setMissing(true)}
    />
  )
}

/* ------------------------------------------------------------------ 详细档的小件 */

/** 详细档第二行左边那句「在线 …」。没接入的节点没有时长可说，返回 null。 */
function onlineText(node: Node): string | null {
  if (node.online) return node.metrics ? `在线 ${uptime(node.metrics.uptime)}` : "在线"
  if (!deployed(node)) return null
  const down = offlineSeconds(node)
  return down >= 60 ? `离线 ${uptime(down)}` : "离线"
}

export function priceText(node: Node): string | null {
  return node.price > 0 ? money(node.price, node.currency) : null
}

export function cycleText(node: Node): string | null {
  if (node.price <= 0) return null
  return CYCLES[node.billing_cycle] ?? (node.billing_cycle || null)
}

/**
 * 到期还剩多少天。优先用 hub 算好的 `expires_in`：它按 hub 的时区算，还会给在线节点
 * 顺延到期日，访客自己按浏览器时钟算会在顺延前的那几个小时里显示成「已过期」。只有
 * 旧 hub 没这个 key 时，才退回按 `expires_at` 自己数。
 */
export function expiryText(node: Node): string | null {
  const days = node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)
  if (days === null || days === undefined) return null
  if (days < 0) return `已过期 ${-days} 天`
  if (days === 0) return "今天到期"
  return `剩余 ${days} 天`
}

/**
 * 到期读数的排版：数字与「天」之间换成**不断行空格**（U+00A0）—— 宽卡里整条文本与线上
 * 一字不差（同一份字体、同一条文本，逐像素相同）；窄卡放开折行后，断点只可能落在
 * 「剩余｜280 天」之间那个普通空格上，不会把「…280」与「天」拆散（CJK 默认每个字都是
 * 断点，会折出孤零零一个「天」）。不额外套 span 也是为这条逐像素相同服务：文本节点
 * 边界会改变字形的亚像素排布。其余几种文案（今天到期 / 无期限）本来就短，原样返回。
 */
function ExpiryReading({ node }: { node: Node }) {
  return (expiryText(node) ?? "无期限").replace(/(\d) 天$/, "$1\u00A0天")
}

/**
 * 详细档第二行：左「在线时长」、右「价格 / 周期」——**备注不再重排这一行**
 * （改版前它会把价格挤进第三枚读数盒、把到期日藏起来；现在这两样都留在原位）。
 */
function MetaRow({ node }: { node: Node }) {
  const online = onlineText(node)
  const price = priceText(node)
  const cycle = cycleText(node)
  if (!online && !price) return null
  return (
    <div data-meta="" className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="truncate">{online}</span>
      {price && <span className="tnum shrink-0">{cycle ? `${price} / ${cycle}` : price}</span>}
    </div>
  )
}

/**
 * 详细档那三枚读数盒：实时速率 / 累计总量 / 剩余时间。一层浅底把它们与上下的网格分开，
 * 像仪表盘上嵌进去的读数窗——前两个对应「此刻」与「累计」，第三个上面是本机还剩多久、
 * 下面一行写到期日。
 *
 * 排布：三枚**永远同一行**（站长 2026-10-14 定的形态）；薄的地方由 CSS 按卡片宽度让位
 * （见 index.css 的 `[data-stats]`：窄卡里读数降 11px、到期图标隐藏、日期行去掉缩进）。
 * 这里的 props 透传是给那段 CSS 认盒子用的（`data-stat="speed|total|expiry"`）。
 */
function InfoBox({ children, ...rest }: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className="sk-chip min-w-0 space-y-1.5 overflow-hidden border-[1.5px] border-dashed border-line-strong bg-paper-warm px-2 py-2 text-xs">
      {children}
    </div>
  )
}

function Stat({ icon: Icon, children, wrap }: {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  /** 窄卡里超宽时允许在空格处折行（到期读数用，见 .stat-wrap 的容器查询）。 */
  wrap?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3 shrink-0" />
      <span className={wrap ? "tnum truncate stat-wrap" : "tnum truncate"}>{children}</span>
    </span>
  )
}

// Traffic uses the plan's own counting rule, so the bar matches the quota the
// node is billed against.
function trafficFoot(node: Node) {
  return node.traffic_limit > 0
    ? pair(monthUsage(node), node.traffic_limit)
    : `${bytes(monthUsage(node))} / ${FOREVER}`
}

/**
 * 备注小卡片：**私有那几枚带锁 + 描边**（仅自己可见），公有那几枚实心 `secondary`。
 * 卡片（详细档标题行、经典/延迟的浮层）与整页详情、紧凑展开行共用这一套——写法只有一处，
 * 合并后的次序（私有在前、公有在后）也由 `@/lib/notes` 的 `remarkChips` 一处决定。
 */
export function RemarkChips({ chips, max = "full", keep = false }: { chips: RemarkChip[]; max?: string; keep?: boolean }) {
  return (
    <>
      {chips.map((c, i) => (
        <Badge
          key={i + "-" + c.text}
          variant={c.own ? "outline" : "secondary"}
          // keep（详细档标题行那一格）：小卡片保持自然宽度、不许被挤扁 —— 否则四枚会各自缩成
          // 「仅自…」这种两个字的残片（实测踩过）。放不下的部分由外层裁掉、在悬浮层里看全。
          className={(keep ? "shrink-0 " : "min-w-0 shrink ") + "font-normal " + (c.own ? "gap-1 text-muted-foreground" : "")}
          style={{ maxWidth: max === "full" ? undefined : max }}
          title={c.own ? "仅自己可见：" + c.text : c.text}
        >
          {c.own && <Lock className="size-3 shrink-0" aria-hidden />}
          <span className="min-w-0 truncate">{c.text}</span>
        </Badge>
      ))}
    </>
  )
}

export function NodeCard({ node, onOpen, onOpenLatency, onWarm, latencyLines, cardStyle, remarkPlacement, terms, selected }: {
  node: Node
  onOpen: () => void
  /** 点卡面那组「三网延迟」的行：绕开默认页签，直达详情的「网络延迟」（没有延迟块时不挂）。 */
  onOpenLatency?: () => void
  /** 指针或键盘刚落到这张卡片上：先把手头这块 chunk（详情页的图表那 391KB）取回来。 */
  onWarm?: () => void
  latencyLines: string
  cardStyle: "classic" | "latency" | "detailed" | "plain"
  /** 「备注显示位置」：`detail` 时卡片这一侧一枚都不摊（整页详情照旧，见 NodeDetail）。 */
  remarkPlacement?: RemarkPlacement
  /** 搜索命中词：名字里描色（见 Highlight）。没在搜时是空数组。 */
  terms?: string[]
  /** 键盘光标（↑↓）停在这张卡上：加一圈描边。 */
  selected?: boolean
}) {
  const m = node.metrics
  // 详细档：图标、元信息行与三枚读数盒都只在它里面出现；配色仍与另外两档同一套灰。
  const detailed = cardStyle === "detailed"
  // 简约档：读数格与经典是同一个骨架，只换一套视觉处理——表名提亮成前景色、进度条压细、
  // 底注变小、格行距收紧、底部网络收成一行（见下方各处 plain 分支）。
  const plain = cardStyle === "plain"
  // 这台机器的公开备注（见 @/lib/notes）：hub 后台按节点填的那条，逗号分隔＝多枚小卡片。
  // 这台机器的备注（见 @/lib/notes）：私有在前（仅自己可见）、公有在后，都拆成一枚枚小卡片。
  // 备注那一串：先按「备注显示位置」判这一侧要不要摊，再交给 @/lib/notes 拆（私有在前、公有在后）。
  const chips = remarksOnCards(remarkPlacement ?? "both") ? remarkChips(node) : []
  // 「经典」「延迟」两档右上角那枚 ⓘ 悬浮层已于 2026-10-14 按站长要求退役：
  // 计费与到期改在详情页看（NodeDetail 的「计费 / 到期」两格），这两档卡面不再摊任何浮层。
  // 「详细」档标题行那一格：悬停弹悬浮层，把放不下的备注看全（只有这一档有，另两档收在 ⓘ 里）。
  const [titlePeek, setTitlePeek] = useState(false)
  const titlePeekRef = useRef<HTMLSpanElement>(null)
  // 卡片底部那一行网络：简约 / 延迟两档共用**同一个节点**——一行两段，左边实时速率（墨色）、
  // 右边累计总量（弱化灰），上面一条手画的分隔线；方向用文字 ↓ ↑ 而不是图标，这样整段能原样
  // 复制成「↓ 88 B/s ↑ 312 B/s」。延迟档原本是「上下行各一组、组内用分隔点连起来」的两端式，
  // 按要求与简约看齐后也改成这条；两档同一个节点，也是护栏里「逐项相同」那条等价断言的前提。
  // `data-net` 是给护栏认这一行的锚点（改版后那两条旧判据——按 2×2 那格的类名、按分隔点那行——
  // 都会失配，命中 0 反而看着像「本来就没有」）。
  // ★ 这一行允许折行是深兜底（真实机型到不了那一步）：读数层在窄卡里由 index.css 的容器
  // 查询整体降到 11px + 字距 -1px（内容盒 ≤288px 生效），最坏形状需宽 ~253px——4 列桌面
  // 与最窄两列一律单行；只有 640px 视口那一档的极端读数（双向都 ≥999 KB/s）才会回落折行。
  // （2026-10-14 站长截图的那份「同屏有的折有的不折」，就是换手写数字后内容宽度恰好落在
  // 可用宽临界带里——不是刻意的，容器查询上线后消失。）
  const netRow = (
    <div data-net="row" className="tnum mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-[1.5px] border-dashed border-line-strong pt-4 text-xs">
      <span className="truncate">{m ? `↓ ${rate(m.net_rx)} ↑ ${rate(m.net_tx)}` : "—"}</span>
      <span className="truncate text-muted-foreground">{`↓ ${bytes(node.total_rx)} ↑ ${bytes(node.total_tx)}`}</span>
    </div>
  )

  // 经典档底部＝**速率一行、总量一行的 2×2 四格**（与上面读数格同两条列），与上面那条
  // 一行两段不是一回事。箭头同样是文字 ↓ ↑（不是图标，整段可原样复制）：速率那行的数值用前景色、
  // 箭头与整行总量用弱化灰。它和简约档的差别只剩「一档是四格、一档是一行」与那几把视觉尺子。
  const netGrid = (
    <div data-net="grid" className="tnum mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t-[1.5px] border-dashed border-line-strong pt-4 text-xs">
      <span>
        <span className="text-muted-foreground">↓</span> {m ? rate(m.net_rx) : "—"}
      </span>
      <span>
        <span className="text-muted-foreground">↑</span> {m ? rate(m.net_tx) : "—"}
      </span>
      <span className="text-muted-foreground">↓ {bytes(node.total_rx)}</span>
      <span className="text-muted-foreground">↑ {bytes(node.total_tx)}</span>
    </div>
  )

  return (
    <Card
      onClick={onOpen}
      // 摸到卡片（悬停 / 键盘 Tab 到它 / 手指按下）就先取详情那块 chunk：真要打开的人，
      // 鼠标按下去之前多半已经碰过这张卡了。见 App 的 warmDetail。
      onPointerOver={onWarm}
      onFocus={onWarm}
      onTouchStart={onWarm}
      // min-w-0: a grid item sizes to its content unless told otherwise, and the
      // name line below does not wrap, so on a phone the card would grow past its
      // column and scroll the page sideways. The truncate inside only takes effect
      // once the card is allowed to be narrower.
      // 键盘光标（搜索框里 ↑↓ 选中的那台）停在上面时加一圈 2px 描边：用 outline 而不是
      // border/ring —— 不占盒宽、不改网格（用 border 会让这张卡大一圈、把邻居挤动）。
      // data-node-card 是滚动定位（见 App 的 NodeList）与护栏共用的锚点；
      // data-selected 是「当前被键盘选中」的标记（护栏读它，不用去解析类名）。
      data-node-card={node.id}
      data-selected={selected ? "1" : undefined}
      className={`sk-lift min-w-0 cursor-pointer gap-0 p-4 ${selected ? "outline-2 outline-offset-1 outline-ring" : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      {/* 一行身份：旗子在前、名字在后。原先的三段（名称 + 国家徽标 / 系统·虚拟化·
          架构那一行 / 右侧的状态与到期两行）在这里收成一行——列表页一眼要看的是
          哪台机器、还剩多少余量；系统与到期在详情页写得更全，挤在卡片上只会把
          名字推到省略号。 */}
      <div className="flex min-w-0 items-center gap-2">
        <Country node={node} />
        {/* 搜索命中处描色（Highlight：mark 不改变 textContent，既有文案断言照旧；没在搜时它原样返回，零影响）。 */}
        <h3 className="font-display min-w-0 truncate text-[15px] font-semibold tracking-[-.01em]"><TextHighlight text={node.name} terms={terms} /></h3>
        {/* 「详细」档的备注：挂在**标题行右端**——名字下面那一行、读数格、
            三枚读数盒一概不动（早先那套「把价格挤进读数盒、把到期日藏起来」的重排已经取消）。
            写法与 hub 那两个字段一致：逗号分隔＝多枚，一枚一枚各自成卡片（私有那条按换行也拆）。
            ★名字优先：名字那格照旧（可截断），备注这格 `grow basis-0` —— flex 基准尺寸是 0，
            所以它**从不参与「谁先被压」的竞争**：名字先拿满自己内容需要的宽度，剩下的才给备注，
            备注拿到多少由容器余量与上限（窄屏 40%、≥sm 55%）决定，不够就自己截断。
            早先写的是「两边都让一点 + 备注 [flex-shrink:100]」：那在手机 390 + 长名字时仍会让
            名字少 2px 并被截断（护栏实测 175 → 173px），因为 shrink 是按「收缩系数 × 基准尺寸」
            分摊的，只要备注有基准尺寸就会分走一点。
            ★「经典」「延迟」两档不挂在这里：悬浮层已退役（2026-10-14），这两档卡面不摊备注。
            「紧凑」档收在展开行量程栏那格（见 NodeDetail）。 */}
        {detailed && chips.length > 0 && (
          /* 「详细」档的备注：**只占一行**（零行高、名字不受影响），放不下的部分裁在边缘外，
             鼠标移到这一格上弹悬浮层看全（多枚、完整文字）。★悬浮层必须挂在这个**没有 overflow-hidden**
             的外层上，否则会被裁掉看不见；内层才是那条会裁的一行。 */
          <span
            ref={titlePeekRef}
            className="relative ml-auto flex min-w-0 max-w-[40%] grow basis-0 items-center justify-end sm:max-w-[55%]"
            onPointerEnter={() => setTitlePeek(true)}
            onPointerLeave={() => setTitlePeek(false)}
          >
            {/* ★`justify-start`（不是 end）：右对齐时溢出会往**左**跑，被裁掉的就成了排在最前面的
                私有那枚——而它是站长最想一眼看到的；左对齐则是尾巴被裁，前几枚完整。 */}
            <span data-remark="title" className="flex min-w-0 items-center justify-start gap-1 overflow-hidden">
              <RemarkChips chips={chips} max="9rem" keep />
            </span>
            {titlePeek && (
              <span
                data-remark-panel
                className="sk-pop absolute right-0 top-5 z-20 flex w-max max-w-[18rem] flex-wrap justify-end gap-1 px-2 py-1.5"
              >
                <RemarkChips chips={chips} />
              </span>
            )}
          </span>
        )}
      </div>

      {/* One layout for both states: a disconnected node still knows its
          cores, memory, disk size and traffic totals, and showing those with
          the live figures blank beats a stretched card with one line in it. */}
      {deployed(node) ? (
        <>
          {detailed && <MetaRow node={node} />}

          <div className={`mt-4 grid grid-cols-2 gap-x-4 ${plain ? "gap-y-3" : "gap-y-4"}`}>
            {/* The core count belongs beside the word CPU: it is what the
                percentage and the load averages are both measured against. */}
            <Meter
              plain={plain}
              icon={detailed ? Cpu : undefined}
              // 简约档：表名提亮，只有那截「N 核」留在弱化灰里（间距用空格而不是 ml-*，
              // 复制与读屏拿到的仍是「CPU 2 核」）。
              label={plain
                ? <>CPU <span className="text-muted-foreground">{node.cpu_cores} 核</span></>
                : `CPU ${node.cpu_cores} 核`}
              pct={m ? m.cpu : null}
              foot={m ? m.load.map((n) => n.toFixed(2)).join(" ") : "—"}
            />
            <Meter
              plain={plain}
              icon={detailed ? MemoryStick : undefined}
              label="内存"
              pct={m ? percent(m.mem_used, m.mem_total) : null}
              foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
            />
            <Meter
              plain={plain}
              icon={detailed ? HardDrive : undefined}
              label="硬盘"
              pct={m ? percent(m.disk_used, m.disk_total) : null}
              foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
            />
            <Meter
              plain={plain}
              icon={detailed ? ArrowDownUp : undefined}
              label="流量"
              pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
              empty={FOREVER}
              foot={trafficFoot(node)}
            />
          </div>

          {cardStyle === "classic" ? (
            /* 经典形态：底部分速率一行、总量一行的 2×2 四格；不含延迟，也就不发延迟请求。 */
            netGrid
          ) : cardStyle === "plain" ? (
            /* 简约形态：与经典同一批读数，底部收成一行两段（实时速率 + 累计总量）。 */
            netRow
          ) : cardStyle === "latency" ? (
            <>
              {/* 延迟档底部与「简约」是同一个 netRow 节点（版本对齐后不再各写一份），
                  它自己的 border-t 把「用量格」与「速率·总量」分开；三网延迟那条线由
                  LatencyPanel 自己画在下面。 */}
              {netRow}
              {/* 三网延迟：每条线路一行，数据来自 hub 的 ping 历史（详见 Latency.tsx）。 */}
              <LatencyPanel node={node} lines={latencyLines} onOpen={onOpenLatency} />
            </>
          ) : (
            <>
              {/* 详细形态：网速、总量，加第三枚读数盒并排。第三枚上面一直是「剩余时间」，
                  下面一行写到期日。
                  速率与总量各按上下行分两行；配色与另外两档同一套灰。下面照旧挂三网延迟。
                  ★三枚**永远同一行**（站长 2026-10-14 定的形态）；让位规则在 index.css 的
                  [data-stats]：窄卡里读数降 11px、到期图标隐藏、日期行去掉缩进，读数实在
                  放不下时才在「剩余｜280 天」的空格处折行（数字+单位整块不拆，见
                  ExpiryReading）。逐宽判据：tools/verify_card_expiry_fit.mjs。 */}
              <div data-stats="" className="mt-4 grid gap-2">
                <InfoBox data-stat="speed">
                  <Stat icon={ArrowDown}>{m ? rate(m.net_rx) : "—"}</Stat>
                  <Stat icon={ArrowUp}>{m ? rate(m.net_tx) : "—"}</Stat>
                </InfoBox>
                <InfoBox data-stat="total">
                  <Stat icon={ArrowDown}>{bytes(node.total_rx)}</Stat>
                  <Stat icon={ArrowUp}>{bytes(node.total_tx)}</Stat>
                </InfoBox>
                <InfoBox data-stat="expiry">
                  <Stat icon={CalendarClock} wrap><ExpiryReading node={node} /></Stat>
                  {/* 备注不再重排这一排：第三枚读数盒下面**永远是到期日**（价格留在第二行右侧）。
                      日期行的缩进（对应图标宽度）由 CSS 给：窄卡里归零，见 index.css。 */}
                  {node.expires_at && (
                    <span data-stat-date="" className="block truncate pl-[18px] text-muted-foreground">{node.expires_at}</span>
                  )}
                </InfoBox>
              </div>
              <LatencyPanel node={node} lines={latencyLines} onOpen={onOpenLatency} />
            </>
          )}
        </>
      ) : (
        /* Never connected: nothing to plot, so the card stays short rather than
           padding out to match its neighbours. */
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          还没有接入。在后台生成安装命令并执行一次。
        </p>
      )}
    </Card>
  )
}
