"use client"
import { AddressBook, ArrowsLeftRight, ClockCounterClockwise, House, PaperPlaneTilt, SidebarSimpleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebarState,
} from "@/components/ui/sidebar"
import { useTranslation } from "@/hooks/useTranslation"
import { UserMenu } from "@/components/user/user-menu"
import { cn } from "@/utils/style"

type SidebarItem = {
  icon: React.ReactNode
  label: string
  href: string
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebarState()
  const isCollapsed = state === "collapsed"

  function handleMobileNavigation() {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const appSidebarItems: SidebarItem[] = [
    {
      icon: <House size={18} weight="regular" />,
      label: t("home"),
      href: "/dashboard/home",
    },
    {
      icon: <PaperPlaneTilt size={18} weight="regular" />,
      label: t("send"),
      href: "/dashboard/send",
    },
    {
      icon: <ArrowsLeftRight size={18} weight="regular" />,
      label: t("swap"),
      href: "/dashboard/swap",
    },
    {
      icon: <ClockCounterClockwise size={18} weight="regular" />,
      label: t("activity"),
      href: "/dashboard/activity",
    },
    {
      icon: <AddressBook size={18} weight="regular" />,
      label: t("contacts"),
      href: "/dashboard/contacts",
    },
  ]

  return (
    <>
      <Sidebar
        variant="floating"
        collapsible="icon"
        className={cn(isCollapsed && "[&_[data-sidebar=sidebar]]:bg-dashboard-shell")}
      >
        <SidebarHeader>
          {isCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="group/logo relative flex size-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <span className="text-lg font-bold transition-opacity duration-200 group-hover/logo:opacity-0">W</span>
              <SidebarSimpleIcon className="absolute size-[18px] opacity-0 transition-opacity duration-200 group-hover/logo:opacity-100" />
            </button>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Link
                href="/dashboard/home"
                aria-label={t("home")}
                onClick={handleMobileNavigation}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <span className="text-lg font-bold">W</span>
              </Link>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <SidebarSimpleIcon className="size-[18px]" />
              </button>
            </div>
          )}
        </SidebarHeader>



        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {appSidebarItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={cn(
                          !isCollapsed &&
                          "rounded-xl hover:bg-sidebar-highlight data-[active=true]:rounded-xl data-[active=true]:bg-sidebar-highlight",
                        )}
                      >
                        <Link href={item.href} onClick={handleMobileNavigation}>
                          {item.icon}
                          <span className="truncate whitespace-nowrap">
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

        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  )
}
