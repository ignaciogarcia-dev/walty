"use client"
import { useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Globe, Palette } from "@phosphor-icons/react"
import { useWallet } from "@/hooks/useWallet"
import { WalletContext } from "@/components/wallet/context"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation()
	const { theme, setTheme } = useTheme()
	const { locale, setLocale } = useLocale()
	const router = useRouter()
	const wallet = useWallet()
	const { status, password, setPassword, unlock, lock, exportWallet, importWallet, createBackup } = wallet

	const fileInputRef = useRef<HTMLInputElement>(null)
	const [unlockError, setUnlockError] = useState<string | null>(null)
	const [importError, setImportError] = useState<string | null>(null)

	// PIN backup setup state (shown in unlocked toolbar)
	const [showPinSetup, setShowPinSetup] = useState(false)
	const [backupPin, setBackupPin] = useState("")
	const [backupError, setBackupError] = useState<string | null>(null)
	const [backupSuccess, setBackupSuccess] = useState(false)
	const [savingBackup, setSavingBackup] = useState(false)

	// Redirect states that now live in onboarding
	useEffect(() => {
		if (status === "new") router.replace("/onboarding/create-wallet")
		if (status === "recoverable") router.replace("/onboarding/recover")
	}, [status, router])

	// Auto-unlock after onboarding: the create-pin page leaves the PIN in
	// sessionStorage so the first dashboard load doesn't ask for it again.
	useEffect(() => {
		if (status !== "locked") return
		const pending = sessionStorage.getItem("pending_unlock")
		if (!pending) return
		sessionStorage.removeItem("pending_unlock")
		unlock(pending).catch(() => {})
	}, [status]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (status !== "locked") setUnlockError(null)
		setImportError(null)
	}, [status])

	function handleThemeChange(value: string) {
		if (!isTheme(value)) return
		setTheme(value)
	}

	function handleLocaleChange(value: string) {
		if (!isLocale(value)) return
		setLocale(value as Locale)
	}

	const handleCreateBackup = async () => {
		setBackupError(null)
		setBackupSuccess(false)
		setSavingBackup(true)
		try {
			await createBackup(backupPin)
			setBackupSuccess(true)
			setBackupPin("")
			setTimeout(() => { setShowPinSetup(false); setBackupSuccess(false) }, 2000)
		} catch (err) {
			setBackupError(err instanceof Error ? err.message : t("error-creating-backup"))
		} finally {
			setSavingBackup(false)
		}
	}

	async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (!file) return
		e.target.value = ""
		setImportError(null)
		try {
			await importWallet(file)
		} catch (err) {
			setImportError(err instanceof Error ? err.message : t("error-importing-backup"))
		}
	}

	const handleUnlock = async () => {
		setUnlockError(null)
		try {
			await unlock(password)
		} catch (err) {
			setUnlockError(err instanceof Error ? err.message : t("wrong-password"))
		}
	}

	// Settings toggles
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

	if (status === "loading" || status === "new" || status === "recoverable") {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3 text-muted-foreground">
					<Spinner className="size-6" />
					<span className="text-sm">{t("loading")}</span>
				</div>
			</div>
		)
	}

	if (status === "locked") {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background px-4">
				<div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5 relative">
					{settingsButtons}

					<div>
						<h2 className="text-lg font-semibold text-foreground">{t("wallet-locked")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("wallet-locked-description")}</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="unlock-password">{t("wallet-password")}</Label>
						<Input
							id="unlock-password"
							type="password"
							placeholder="••••••••"
							value={password}
							onChange={(e) => { setPassword(e.target.value); if (unlockError) setUnlockError(null) }}
							onKeyDown={(e) => e.key === "Enter" && password && handleUnlock()}
							autoComplete="current-password"
							autoFocus
						/>
						{unlockError && <p className="text-xs text-destructive">{unlockError}</p>}
					</div>

					<Button onClick={handleUnlock} disabled={!password} className="w-full">
						{t("unlock")}
					</Button>

					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">{t("or")}</span>
						<Separator className="flex-1" />
					</div>

					<input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
					<Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
						{t("import-backup")}
					</Button>
					{importError && <p className="text-xs text-destructive text-center">{importError}</p>}
				</div>
			</div>
		)
	}

	// status === "unlocked"
	return (
		<WalletContext.Provider value={wallet}>
			<SidebarProvider>
				<DashboardSidebar />
				<SidebarInset>
					<div className="flex h-16 items-center gap-2 border-b px-4">
						<SidebarTrigger />
						<div className="flex-1" />
						<Button size="sm" variant="ghost" onClick={exportWallet}>
							{t("export-backup")}
						</Button>
						<Button size="sm" variant="ghost" onClick={() => { setShowPinSetup((v) => !v); setBackupPin(""); setBackupError(null); setBackupSuccess(false) }}>
							{t("setup-pin-backup")}
						</Button>
						<Button size="sm" variant="outline" onClick={lock}>
							{t("lock")}
						</Button>
					</div>

					{showPinSetup && (
						<div className="border-b bg-muted/40 px-4 py-4">
							<p className="text-sm text-muted-foreground mb-3">{t("setup-pin-backup-description")}</p>
							<div className="flex items-end gap-3">
								<div className="flex flex-col gap-1.5 flex-1">
									<Label htmlFor="backup-pin">{t("recovery-pin")}</Label>
									<Input
										id="backup-pin"
										type="password"
										inputMode="numeric"
										placeholder="····"
										maxLength={6}
										value={backupPin}
										onChange={(e) => { setBackupPin(e.target.value.replace(/\D/g, "")); setBackupError(null); setBackupSuccess(false) }}
										onKeyDown={(e) => e.key === "Enter" && backupPin.length >= 4 && handleCreateBackup()}
									/>
								</div>
								<Button size="sm" onClick={handleCreateBackup} disabled={savingBackup || backupPin.length < 4}>
									{savingBackup ? t("setting-up-backup") : t("save")}
								</Button>
							</div>
							{backupError && <p className="mt-2 text-xs text-destructive">{backupError}</p>}
							{backupSuccess && <p className="mt-2 text-xs text-green-600 dark:text-green-400">{t("backup-created")}</p>}
						</div>
					)}

					<div className="flex-1 overflow-auto">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</WalletContext.Provider>
	)
}
