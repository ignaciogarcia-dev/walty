"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { isAddress } from "viem"
import { AddressBook as AddressBookIcon, Plus } from "@phosphor-icons/react"
import { useDebounce } from "@/hooks/useDebounce"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useTranslation } from "@/hooks/useTranslation"
import { CONTACTS_QUERY_KEY } from "./AddressBook"

export type Contact = {
  id: number
  name: string
  address: string
  chainId: number
  createdAt: string | null
}

export function ContactPickerDropdown({
  selectedChainId,
  value,
  onSelect,
}: {
  selectedChainId: number
  value: string
  onSelect: (address: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newTo, setNewTo] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

  // ── Fetch contacts, filter by chain ──────────────────────────────────────

  const { data: allContacts = [] } = useQuery({
    queryKey: CONTACTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/contacts")
      const { data } = await res.json()
      return data as Contact[]
    },
    staleTime: 5 * 60_000,
  })

  const contacts = allContacts.filter((c) => c.chainId === selectedChainId)

  // ── Username resolution for add form ─────────────────────────────────────

  const isUsernameInput = newTo.startsWith("@")
  const usernameRaw = isUsernameInput ? newTo.slice(1).trim() : ""
  const debouncedUsername = useDebounce(usernameRaw, 600)

  const { data: resolvedData, isFetching: resolving, error: resolveError } = useQuery({
    queryKey: ["username-resolve", debouncedUsername],
    queryFn: async () => {
      const res = await fetch(`/api/username/resolve?username=${encodeURIComponent(debouncedUsername)}`)
      if (!res.ok) throw new Error(t("username-not-found"))
      const { data } = await res.json()
      return { address: data.address as string, username: debouncedUsername }
    },
    enabled: isUsernameInput && !!debouncedUsername,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const resolvedAddress = isUsernameInput ? (resolvedData?.address ?? null) : null
  const resolvedUsername = isUsernameInput ? (resolvedData?.username ?? null) : null
  const isResolving = isUsernameInput && !!usernameRaw && (usernameRaw !== debouncedUsername || resolving)
  const resolveErrorMsg = isUsernameInput && !resolving && resolveError instanceof Error ? resolveError.message : null
  const effectiveAddress: string | null = resolvedAddress ?? (isAddress(newTo) ? newTo : null)

  // ── Add contact ───────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          address: effectiveAddress,
          chainId: selectedChainId,
        }),
      })
      if (!res.ok) throw new Error(t("failed-save-contact"))
      const { data } = await res.json()
      return data as Contact
    },
    onSuccess: (contact) => {
      queryClient.setQueryData<Contact[]>(CONTACTS_QUERY_KEY, (prev = []) => [...prev, contact])
      onSelect(contact.address)
      handleClose()
    },
    onError: (err) => {
      setAddError(err instanceof Error ? err.message : t("error-saving-contact"))
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetAddForm() {
    setNewName("")
    setNewTo("")
    setAddError(null)
    setShowAddForm(false)
  }

  function handleClose() {
    setOpen(false)
    setSearch("")
    resetAddForm()
  }

  const filtered = search.trim()
    ? contacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase().trim()))
    : contacts

  const canAdd =
    !!newName.trim() && !!effectiveAddress && !isResolving && !resolveErrorMsg && !addMutation.isPending

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Popover open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${open ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          aria-label={t("from-contacts")}
        >
          <AddressBookIcon size={18} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-72 p-0 rounded-2xl overflow-hidden">
        <div className="flex flex-col overflow-hidden">

          <AnimatePresence mode="wait" initial={false}>

          {/* Search + contact list */}
          {!showAddForm && (
            <motion.div
              key="list"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className="px-3 pt-3 pb-2 border-b flex gap-1">
                <Input
                  placeholder={t("search-contacts")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-xl h-8 text-base md:text-sm flex-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors rounded-xl"
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto">
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-5 px-3">
                    {t("no-contacts")}
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-5 px-3">
                    {t("no-results")}
                  </p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { onSelect(c.address); handleClose() }}
                      className={`cursor-pointer w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 ${value === c.address ? "bg-accent" : ""
                        }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium leading-tight truncate">{c.name}</span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {c.address.slice(0, 6)}…{c.address.slice(-4)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {/* Add contact */}
          {showAddForm && (
            <motion.div
              key="form"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            >
            <div className="flex flex-col gap-2.5 p-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("contact-name")}</Label>
                <Input
                  placeholder={t("contact-name-placeholder")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="rounded-xl h-8 text-base md:text-sm"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("contact-address")}</Label>
                <Input
                  placeholder={t("username-or-address")}
                  value={newTo}
                  onChange={(e) => { setNewTo(e.target.value); setAddError(null) }}
                  className="rounded-xl h-8 text-base md:text-sm font-mono"
                />
                {isResolving && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Spinner className="size-3" />
                    {t("resolving-username")}
                  </div>
                )}
                {resolvedAddress && resolvedUsername && (
                  <p className="text-xs text-muted-foreground font-mono">
                    @{resolvedUsername} → {resolvedAddress.slice(0, 6)}…{resolvedAddress.slice(-4)}
                  </p>
                )}
                {resolveErrorMsg && <p className="text-xs text-destructive">{resolveErrorMsg}</p>}
                {addError && <p className="text-xs text-destructive">{addError}</p>}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={resetAddForm}
                  className="flex-1 rounded-xl h-7 text-xs"
                >
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  disabled={!canAdd}
                  onClick={() => addMutation.mutate()}
                  className="flex-1 rounded-xl h-7 text-xs"
                >
                  {addMutation.isPending ? <Spinner className="size-3" /> : t("save")}
                </Button>
              </div>
            </div>
          </motion.div>
          )}

          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  )
}
