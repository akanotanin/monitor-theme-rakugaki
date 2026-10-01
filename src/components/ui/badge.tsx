import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// 便签胶囊：1.5px 墨线 + 歪圆角（`.sk-chip` 给圆角，并按奇偶换一版）。
const badgeVariants = cva(
  "sk-chip inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border-[1.5px] border-stroke px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-butter text-foreground [a&]:hover:bg-butter/80",
        secondary: "bg-oat text-foreground [a&]:hover:bg-oat/80",
        destructive:
          "border-destructive bg-destructive text-white focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline: "border-line-strong bg-elev text-foreground [a&]:hover:bg-accent",
        ghost: "border-transparent [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "border-transparent text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
