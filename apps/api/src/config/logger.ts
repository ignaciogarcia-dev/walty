import pino from "pino"
import { env, isProduction } from "./env.js"

export const logger = pino({
  level: env.logLevel,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino/file",
          options: { destination: 1 },
        },
      }),
})
