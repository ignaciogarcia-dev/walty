"use client"
import { ArrowSquareOut, ArrowsLeftRight, ClockCounterClockwise, Globe, House, Palette, PaperPlaneTilt } from "@phosphor-icons/react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme/provider"
import { useLocale } from "@/components/locale/provider"
import { isTheme } from "@/utils/theme"
import { isLocale, localeMap, type Locale } from "@/utils/locale"
import { useTranslation } from "@/hooks/useTranslation"

type SidebarItem = {
  icon: React.ReactNode
  label: string
  href: string
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()

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
  ]

  function handleThemeChange(value: string) {
    if (!isTheme(value)) return
    setTheme(value)
  }

  function handleLocaleChange(value: string) {
    if (!isLocale(value)) return
    setLocale(value as Locale)
  }

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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton tooltip={t("settings")}>
                    <Palette />
                    <span className="shrink-0 transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0">
                      {t("settings")}
                    </span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top">
                  <DropdownMenuGroup>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Globe />
                        {t("language")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
                        <DropdownMenuRadioGroup value={locale} onValueChange={handleLocaleChange}>
                          {Object.entries(localeMap).map(([value, label]) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                              {label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Palette />
                        {t("theme")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
                          <DropdownMenuRadioItem value="light">{t("light")}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="dark">{t("dark")}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild>
                    <a
                      href="https://sepolia.etherscan.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <ArrowSquareOut />
                      Etherscan
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
    </>
  )
}
