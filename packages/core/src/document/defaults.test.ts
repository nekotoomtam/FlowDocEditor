import { afterEach, describe, expect, it, vi } from "vitest"
import { createId } from "./defaults"

describe("createId", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses crypto randomUUID when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
    })

    expect(createId("node")).toBe("node_00000000000040008000000000000001")
  })

  it("creates unique ids for a burst of nodes", () => {
    const ids = Array.from({ length: 100 }, () => createId("node"))

    expect(new Set(ids).size).toBe(ids.length)
  })
})
