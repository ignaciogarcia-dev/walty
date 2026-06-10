import type { NextFunction, Request, Response } from "express"
import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { ValidationError } from "@walty/shared/api-utils/errors"
import { validateBody } from "../src/middleware/validateBody.js"

function run(schema: Parameters<typeof validateBody>[0], body: unknown) {
  const req = { body } as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  validateBody(schema)(req, res, next)
  return { req, next: next as ReturnType<typeof vi.fn> }
}

const schema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
})

describe("validateBody", () => {
  it("calls next() with no error for a valid body", () => {
    const { next } = run(schema, { name: "a", count: 3 })
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
  })

  it("replaces req.body with the parsed value (unknown keys stripped)", () => {
    const { req } = run(schema, { name: "a", count: 3, sneaky: "x" })
    expect(req.body).toEqual({ name: "a", count: 3 })
    expect(req.body).not.toHaveProperty("sneaky")
  })

  it("passes a 400 ValidationError to next() for an invalid body", () => {
    const { next } = run(schema, { name: "", count: -1 })
    expect(next).toHaveBeenCalledTimes(1)
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.status).toBe(400)
    expect(err.code).toBe("validation_error")
  })

  it("names the offending field in the error message", () => {
    const { next } = run(schema, { name: "a", count: -1 })
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error
    expect(err.message).toMatch(/count/)
  })

  it("treats a missing/non-object body as invalid", () => {
    const { next } = run(schema, undefined)
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(err).toBeInstanceOf(ValidationError)
  })
})
