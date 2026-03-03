"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { ThemeSelector } from "@/components/theme/selector"
import { LocaleSelector } from "@/components/locale/selector"
import { useTranslation } from "@/hooks/useTranslation"

export default function LoginPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Walty</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ethereum-wallet-sepolia")}</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-6">
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
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
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

          <div className="flex flex-col gap-1.5">
            <Label>{t("language")}</Label>
            <LocaleSelector />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("theme")}</Label>
            <ThemeSelector />
          </div>

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
