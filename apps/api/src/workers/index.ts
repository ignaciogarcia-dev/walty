import cron from "node-cron"
import { logger } from "../config/logger.js"
import { runReconciler } from "./reconciler.js"
import { runSweep } from "./sweep.js"

const RECONCILE_CRON = process.env.RECONCILE_CRON ?? "*/30 * * * * *" // every 30s
const SWEEP_CRON = process.env.SWEEP_CRON ?? "*/30 * * * * *" // every 30s

let started = false

export function startWorkers(): void {
  if (started) return
  started = true

  if (process.env.WORKERS_ENABLED === "false") {
    logger.info("workers disabled by WORKERS_ENABLED=false")
    return
  }

  cron.schedule(RECONCILE_CRON, () => {
    void runReconciler()
  })
  cron.schedule(SWEEP_CRON, () => {
    void runSweep()
  })

  logger.info(
    { reconcile: RECONCILE_CRON, sweep: SWEEP_CRON },
    "workers scheduled",
  )
}
