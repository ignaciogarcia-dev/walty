"use client"
import { useEffect, useState } from "react"
import { isAddress } from "viem"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useTranslation } from "@/hooks/useTranslation"

type Contact = {
  id: number
  name: string
  address: string
  createdAt: string | null
}

export function AddressBook() {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((data: Contact[]) => setContacts(data))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd() {
    if (!name.trim() || !address.trim()) return
    if (!isAddress(address)) {
      setError("Invalid Ethereum address")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), address: address.trim() }),
      })

      if (!res.ok) throw new Error("Failed to save contact")

      const contact: Contact = await res.json()
      setContacts((prev) => [...prev, contact])
      setName("")
      setAddress("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving contact")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setContacts((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h2 className="font-semibold text-foreground">{t("address-book")}</h2>

      {/* Add contact form */}
      <div className="flex flex-col gap-3 rounded-2xl bg-muted/30 border p-4 r">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-name">{t("contact-name")}</Label>
          <Input
            id="contact-name"
            placeholder="Alice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-2xl"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-address">{t("contact-address")}</Label>
          <Input
            id="contact-address"
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="font-mono rounded-2xl"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button onClick={handleAdd} disabled={!name || !address || saving} className="rounded-2xl">
          {saving ? <Spinner /> : null}
          {t("add-contact")}
        </Button>
      </div>

      {/* Contact list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
          <Spinner className="size-3" />
          {t("loading")}
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("no-contacts")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{c.address}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(c.id)}
                className="text-destructive hover:text-destructive shrink-0"
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
