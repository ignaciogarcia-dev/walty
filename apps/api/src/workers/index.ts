import cron, { type ScheduledTask } from "node-cron"
import { logger } from "../config/logger.js"
import { runReconciler } from "./reconciler.js"
import { runSweep } from "./sweep.js"

// Defaults are offset so the two jobs never tick at the same second
// (otherwise they contend on the same DB rows / RPC pools).
const RECONCILE_CRON = process.env.RECONCILE_CRON ?? "0,30 * * * * *" // :00 and :30
const SWEEP_CRON = process.env.SWEEP_CRON ?? "15,45 * * * * *" // :15 and :45

let started = false
const tasks: ScheduledTask[] = []

function workersEnabled(): boolean {
  // Two opt-out forms (current + previous code) and one explicit opt-in for
  // multi-instance deployments. In a multi-replica setup only one replica
  // should run the workers — set WORKERS_LEADER=true on that one and let
  // everything else default to disabled.
  if (process.env.WORKERS_ENABLED === "false") return false
  if (process.env.WORKERS_LEADER === "false") return false
  if (process.env.WORKERS_LEADER === "true") return true
  // Default: enabled (single-instance dev / single-replica prod).
  return true
}

export function startWorkers(): void {
  if (started) return
  started = true

  if (!workersEnabled()) {
    logger.info("workers disabled (WORKERS_ENABLED=false or WORKERS_LEADER=false)")
    return
  }

  tasks.push(
    cron.schedule(RECONCILE_CRON, () => {
      void runReconciler()
    }),
  )
  tasks.push(
    cron.schedule(SWEEP_CRON, () => {
      void runSweep()
    }),
  )

  logger.info(
    { reconcile: RECONCILE_CRON, sweep: SWEEP_CRON },
    "workers scheduled",
  )
}

export function stopWorkers(): void {
  for (const t of tasks) {
    try {
      t.stop()
    } catch {
      // swallow — best-effort during shutdown
    }
  }
  tasks.length = 0
  started = false
}
