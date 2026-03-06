"use client"
import { AddressBook, ArrowsLeftRight, ClockCounterClockwise, House, PaperPlaneTilt } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
import { useTranslation } from "@/hooks/useTranslation"
import { UserMenu } from "@/components/user/user-menu"

type SidebarItem = {
  icon: React.ReactNode
  label: string
  href: string
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()

  const appSidebarItems: SidebarItem[] = [
    {
      icon: <House />,
      label: t("home"),
      href: "/dashboard/home",
    },
    {
      icon: <PaperPlaneTilt />,
      label: t("send"),
      href: "/dashboard/send",
    },
    {
      icon: <ClockCounterClockwise />,
      label: t("activity"),
      href: "/dashboard/activity",
    },
    {
      icon: <ArrowsLeftRight />,
      label: t("swap"),
      href: "/dashboard/swap",
    },
    {
      icon: <AddressBook />,
      label: t("contacts"),
      href: "/dashboard/contacts",
    },
  ]

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
          <UserMenu />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  )
}
