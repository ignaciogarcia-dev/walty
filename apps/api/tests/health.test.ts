import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"

describe("api skeleton", () => {
  const app = createApp()

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
    expect(res.headers["cache-control"]).toBe("no-store")
  })

  it("GET /version returns package info", async () => {
    const res = await request(app).get("/version")
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("@walty/api")
    expect(typeof res.body.version).toBe("string")
  })

  it("unknown route returns 404 json", async () => {
    const res = await request(app).get("/nope")
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("not_found")
  })

  it("includes CORS headers for the configured origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3000")
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    )
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
  })
})
