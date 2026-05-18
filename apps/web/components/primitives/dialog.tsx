"use client"
import { Dialog as RadixDialog } from "radix-ui"
import type * as React from "react"

export type DialogProps = React.ComponentProps<typeof RadixDialog.Root>
export const Dialog = RadixDialog.Root

export type DialogTriggerProps = React.ComponentProps<typeof RadixDialog.Trigger>
export const DialogTrigger = RadixDialog.Trigger

export type DialogPortalProps = React.ComponentProps<typeof RadixDialog.Portal>
export const DialogPortal = RadixDialog.Portal

export type DialogOverlayProps = React.ComponentProps<typeof RadixDialog.Overlay>
export const DialogOverlay = RadixDialog.Overlay

export type DialogContentProps = React.ComponentProps<typeof RadixDialog.Content>
export const DialogContent = RadixDialog.Content

export type DialogTitleProps = React.ComponentProps<typeof RadixDialog.Title>
export const DialogTitle = RadixDialog.Title

export type DialogDescriptionProps = React.ComponentProps<typeof RadixDialog.Description>
export const DialogDescription = RadixDialog.Description

export type DialogCloseProps = React.ComponentProps<typeof RadixDialog.Close>
export const DialogClose = RadixDialog.Close

export type DialogHeaderProps = React.ComponentProps<"div">
export function DialogHeader(props: DialogHeaderProps) {
  return <div data-slot="dialog-header" {...props} />
}

export type DialogFooterProps = React.ComponentProps<"div">
export function DialogFooter(props: DialogFooterProps) {
  return <div data-slot="dialog-footer" {...props} />
}
