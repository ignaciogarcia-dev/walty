export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Walty</h1>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5">
          {children}
        </div>
      </div>
    </div>
  )
}
