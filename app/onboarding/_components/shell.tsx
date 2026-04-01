import { ThemeToggle } from "@/components/theme/theme-toggle"
import { LocaleSwitcher } from "@/components/locale/locale-switcher"

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4 flex items-center justify-end gap-4">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-6xl text-center font-bold tracking-tight text-[#22c55e]">WALTY</h1>
        </div>
        <div className="p-6 flex flex-col gap-6">
          {children}
        </div>
      </div>
    </div>
  )
}
