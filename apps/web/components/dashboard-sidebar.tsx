"use client"
import { ClockCounterClockwise, DeviceMobile, House, Receipt, SidebarSimpleIcon, Users, Wallet } from "@phosphor-icons/react"
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
  useSidebarState,
} from "@/components/ui/sidebar"
import { useTranslation } from "@/hooks/useTranslation"
import { useUser } from "@/hooks/useUser"
import { useBusinessContext } from "@/hooks/useBusinessContext"
import { UserMenu } from "@/components/user/user-menu"
import { cn } from "@/utils/style"
import Image from "next/image"

type SidebarItem = {
  icon: React.ReactNode
  label: string
  href: string
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { user } = useUser()
  const { isMpc } = useBusinessContext()
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebarState()
  const isCollapsed = state === "collapsed"
  const isOwner = user?.isOwner ?? false
  const showActivityTab = true
  const showTeamTab = isOwner
  const showRefundsTab = isOwner
  // Per-operator wallets don't exist under MPC — cashiers are keyless and all
  // funds land on the business address, so there's nothing to collect.
  const showWalletsTab = isOwner && !isMpc

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
    ...(showActivityTab
      ? [{
        icon: <ClockCounterClockwise size={18} weight="regular" />,
        label: t("activity"),
        href: "/dashboard/activity",
      }]
      : []),
    ...(showTeamTab
      ? [{
        icon: <Users size={18} weight="regular" />,
        label: t("team"),
        href: "/dashboard/business/team",
      }]
      : []),
    ...(showRefundsTab
      ? [{
        icon: <Receipt size={18} weight="regular" />,
        label: t("manage-refunds"),
        href: "/dashboard/business/refunds/manage",
      }]
      : []),
    ...(showWalletsTab
      ? [{
        icon: <Wallet size={18} weight="regular" />,
        label: t("cashier-wallets"),
        href: "/dashboard/business/wallets",
      }]
      : []),
    {
      icon: <DeviceMobile size={18} weight="regular" />,
      label: t("devices"),
      href: "/dashboard/devices",
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
              className="cursor-pointer group/logo relative flex size-9 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <span className="text-lg font-bold transition-opacity duration-200 group-hover/logo:opacity-0">
                <Image src="/logo.png" alt="Walty" width={28} height={28} />
              </span>
              <SidebarSimpleIcon className="absolute size-[20px] opacity-0 transition-opacity duration-200 group-hover/logo:opacity-100" />
            </button>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Link
                href="/dashboard/home"
                aria-label={t("home")}
                onClick={handleMobileNavigation}
                className="cursor-pointer flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Image src="/logo.png" alt="Walty" width={28} height={28} />
              </Link>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="cursor-pointer flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <SidebarSimpleIcon className="size-[20px] " />
              </button>
            </div>
          )}
        </SidebarHeader>



        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {appSidebarItems.map((item) => {
                  const isHome = item.href === "/dashboard/home"
                  const isTeam = item.href === "/dashboard/business/team"
                  const isRefunds = item.href === "/dashboard/business/refunds/manage"
                  const isWallets = item.href === "/dashboard/business/wallets"
                  const isDevices = item.href === "/dashboard/devices"
                  const isActive = isHome
                    ? pathname === "/dashboard/home" || pathname === "/dashboard/business/home"
                    : isTeam
                      ? pathname === "/dashboard/business/team"
                      : isRefunds
                        ? pathname.startsWith("/dashboard/business/refunds/manage")
                        : isWallets
                          ? pathname.startsWith("/dashboard/business/wallets")
                          : isDevices
                            ? pathname.startsWith("/dashboard/devices")
                            : pathname === item.href
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                        className={cn(
                          !isCollapsed &&
                          "rounded-xl hover:bg-sidebar-highlight active:bg-sidebar-highlight data-[active=true]:rounded-xl data-[active=true]:bg-sidebar-highlight",
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
