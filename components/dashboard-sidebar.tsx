"use client"
import { ArrowSquareOut, Palette, Wallet } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { ThemeSelector } from "@/components/theme/selector"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type SidebarItem = {
  icon: React.ReactNode
  label: string
  href: string
}

const appSidebarItems: SidebarItem[] = [
  {
    icon: <Wallet />,
    label: "Transfer",
    href: "/dashboard",
  },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const [showThemeDialog, setShowThemeDialog] = useState(false)

  return (
    <>
      <Sidebar variant="floating" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-auto justify-center">
                <Link href="/">
                  <span className="text-lg font-bold">Walty</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Wallet</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {appSidebarItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href}>
                          {item.icon}
                          <span className="shrink-0 transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0">
                            {item.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setShowThemeDialog(true)} tooltip="Tema">
                <Palette />
                <span className="shrink-0 transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0">
                  Tema
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Etherscan">
                <a
                  href="https://sepolia.etherscan.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <ArrowSquareOut />
                  <span className="shrink-0 transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0">
                    Etherscan
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <Dialog open={showThemeDialog} onOpenChange={setShowThemeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seleccionar tema</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <ThemeSelector />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
