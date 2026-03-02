"use client"
import { Slot } from "radix-ui"
import type * as React from "react"

export type ButtonProps = React.ComponentProps<"button"> & { asChild?: boolean }

export function Button({ asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp data-slot="button" {...(props as React.ComponentProps<"button">)} />
}
