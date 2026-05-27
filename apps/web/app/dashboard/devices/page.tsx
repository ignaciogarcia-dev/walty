import { requireAuth } from "@/lib/auth"
import { DevicesPanel } from "@/components/devices/DevicesPanel"

export default async function DevicesPage() {
  await requireAuth()
  return <DevicesPanel />
}
