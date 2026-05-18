import { Router } from "express"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
) as { version: string; name: string }

export const versionRouter: Router = Router()

versionRouter.get("/version", (_req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    commit: process.env.GIT_COMMIT ?? null,
    nodeEnv: process.env.NODE_ENV ?? "development",
  })
})
