"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Globe, Palette } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation } from "@/hooks/useTranslation"
import { useTheme } from "@/components/theme/provider"
import { useLocale } from "@/components/locale/provider"
import { isTheme } from "@/utils/theme"
import { isLocale, localeMap, type Locale } from "@/utils/locale"

export default function LoginPage() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function handleThemeChange(value: string) {
    if (!isTheme(value)) return
    setTheme(value)
  }

  function handleLocaleChange(value: string) {
    if (!isLocale(value)) return
    setLocale(value as Locale)
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register"
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.push("/dashboard")
      } else {
        const data = await res.json()
        // Try to translate error messages
        const errorKey = data.error?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
        const translatedError = errorKey && (t(errorKey as any) !== errorKey) ? t(errorKey as any) : (data.error ?? t("unexpected-error"))
        setError(translatedError)
      }
    } finally {
      setLoading(false)
    }
  }

  // Settings toggles reused in both gate screens
  const settingsButtons = (
    <div className="absolute top-4 right-4 flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Globe className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup value={locale} onValueChange={handleLocaleChange}>
              {Object.entries(localeMap).map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Palette className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
              <DropdownMenuRadioItem value="light">{t("light")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">{t("dark")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Walty</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ethereum-wallet-sepolia")}</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6 relative">
          {settingsButtons}
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "login" | "register"); setError(null) }}>
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">{t("login")}</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">{t("register")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-login">{t("email")}</Label>
                <Input
                  id="email-login"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password-login">{t("password")}</Label>
                <Input
                  id="password-login"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="current-password"
                />
              </div>
            </TabsContent>

            <TabsContent value="register" className="mt-4 flex flex-col gap-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
                <p className="font-medium mb-1">{t("important-note")}</p>
                <p>{t("register-note")}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-register">{t("email")}</Label>
                <Input
                  id="email-register"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password-register">{t("account-password")}</Label>
                <Input
                  id="password-register"
                  type="password"
                  placeholder={t("minimum-8-characters")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  {t("account-password-description")}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Spinner className="mr-2" />
                {tab === "login" ? t("logging-in") : t("registering")}
              </>
            ) : (
              tab === "login" ? t("login") : t("register")
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
