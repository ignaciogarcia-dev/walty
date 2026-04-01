"use client"
import { useUser } from "@/hooks/useUser"
import { PersonStatsWidget } from "@/components/activity/PersonStatsWidget"
import { BusinessStatsWidget } from "@/components/activity/BusinessStatsWidget"
import { PersonActivityList } from "@/components/activity/PersonActivityList"
import { BusinessActivityList } from "@/components/activity/BusinessActivityList"
import { Spinner } from "@/components/ui/spinner"

export default function ActivityPage() {
	const { user, loading: userLoading } = useUser()

	if (userLoading) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-10 flex items-center justify-center">
				<Spinner />
			</div>
		)
	}

	const isBusiness = user?.hasActiveBusiness === true

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			{isBusiness ? (
				<>
					<BusinessStatsWidget />
					<BusinessActivityList />
				</>
			) : (
				<>
					<PersonStatsWidget />
					<PersonActivityList />
				</>
			)}
		</div>
	)
}
