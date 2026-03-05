"use client"
import { AddressBook } from "@/components/wallet/AddressBook"

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <AddressBook />
    </div>
  )
}
