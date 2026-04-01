"use client"
import { useState } from "react"
import { Gear, SignOut, UserCircle } from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useUser } from "@/hooks/useUser"
import { SettingsDialog } from "@/components/settings/settings-dialog"
import { useTranslation } from "@/hooks/useTranslation"
import { cn } from "@/utils/style"

export function UserMenu() {
  const { user, loading } = useUser()
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const username = user?.username ? `@${user.username}` : "@user"
  const email = user?.email || ""

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    window.location.assign("/onboarding/login")
  }

  if (loading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="w-full" disabled>
            <UserCircle className="h-4 w-4" />
            <span className="shrink-0 transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0">
              {t("loading")}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                tooltip={username}
                className="w-full rounded-xl hover:bg-sidebar-highlight active:bg-sidebar-highlight data-[state=open]:bg-sidebar-highlight data-[state=open]:text-sidebar-accent-foreground"
              >
                <UserCircle className="h-4 w-4" />
                <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                  <span className="shrink-0 truncate text-sm font-medium transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0">
                    {username}
                  </span>
                  {email && (
                    <span
                      className={cn(
                        "shrink-0 truncate text-xs text-sidebar-foreground/70 transition-[margin,opacity] duration-200 ease-in-out group-data-[collapsible=icon]:-ml-8 group-data-[collapsible=icon]:opacity-0",
                      )}
                    >
                      {email}
                    </span>
                  )}
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-48">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Gear className="mr-2 h-4 w-4" />
                {t("settings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <SignOut className="mr-2 h-4 w-4" />
                {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
