"use client"
import { BusinessStatsWidget } from "@/components/activity/BusinessStatsWidget"
import { BusinessActivityList } from "@/components/activity/BusinessActivityList"

export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
      <BusinessStatsWidget />
      <BusinessActivityList />
    </div>
  )
}
