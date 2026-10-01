import * as React from "react"

import { cn } from "@/lib/utils"

// The shell only. shadcn's card ships a header, title, description, action,
// content and footer alongside it; this theme lays out its cards itself, so all
// six were unused from the moment they were vendored. Restore one from upstream
// if a card ever needs it.
//
// 描边、歪圆角与硬偏移影子都在 `.sk-card` 里（index.css，未分层，所以 `rounded-xl`
// 这类工具类盖不掉它）；`p-*` / `gap-*` 仍由调用处给。
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("sk-card flex flex-col gap-6 text-card-foreground", className)}
      {...props}
    />
  )
}

export { Card }
