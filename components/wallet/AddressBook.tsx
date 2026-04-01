"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { isAddress } from "viem"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useTranslation } from "@/hooks/useTranslation"

import type { Contact } from "./ContactPickerDropdown"

export const CONTACTS_QUERY_KEY = ["contacts"] as const

export function AddressBook() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: CONTACTS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/contacts")
      const { data } = await res.json()
      return data as Contact[]
    },
    staleTime: 5 * 60_000,
  })

  const addMutation = useMutation({
    mutationFn: async ({ name, address }: { name: string; address: string }) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, chainId: 137 }),
      })
      if (!res.ok) throw new Error(t("failed-save-contact"))
      const { data: contact } = await res.json() as { data: Contact }
      return contact
    },
    onSuccess: (contact) => {
      // Optimistic update: add to cache without refetch
      queryClient.setQueryData<Contact[]>(CONTACTS_QUERY_KEY, (prev = []) => [
        ...prev,
        contact,
      ])
      setName("")
      setAddress("")
      setError(null)
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("error-saving-contact"))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      return id
    },
    onSuccess: (id) => {
      // Remove from cache without refetch
      queryClient.setQueryData<Contact[]>(CONTACTS_QUERY_KEY, (prev = []) =>
        prev.filter((c) => c.id !== id)
      )
    },
  })

  function handleAdd() {
    if (!name.trim() || !address.trim()) return
    if (!isAddress(address)) {
      setError(t("invalid-address"))
      return
    }
    setError(null)
    addMutation.mutate({ name: name.trim(), address: address.trim() })
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-sm font-semibold text-foreground">{t("address-book")}</h2>

      <div className="flex flex-col gap-3 rounded-3xl border bg-card px-5 py-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-name">{t("contact-name")}</Label>
          <Input
            id="contact-name"
            placeholder={t("contact-name-placeholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-3xl"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-address">{t("contact-address")}</Label>
          <Input
            id="contact-address"
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="font-mono rounded-3xl"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          onClick={handleAdd}
          disabled={!name || !address || addMutation.isPending}
          className="cursor-pointer rounded-3xl"
        >
          {addMutation.isPending ? <Spinner /> : null}
          {t("add-contact")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border bg-card px-5 py-8 text-muted-foreground text-sm">
          <Spinner className="size-3" />
          {t("loading")}
        </div>
      ) : contacts.length === 0 ? (
        <p className="rounded-3xl border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          {t("no-contacts")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-3xl border bg-card px-5 py-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{c.address}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteMutation.mutate(c.id)}
                disabled={deleteMutation.isPending && deleteMutation.variables === c.id}
                className="cursor-pointer text-destructive hover:text-destructive shrink-0"
              >
                {t("delete")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
