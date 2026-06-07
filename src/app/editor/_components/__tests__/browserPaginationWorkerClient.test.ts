import { describe, expect, it } from "vitest"
import { prewarmBrowserPaginationWorkerMeasurer } from "../shell/browserPaginationWorkerClient"

describe("browser pagination worker client", () => {
  it("posts a measurement prewarm request", () => {
    const messages: unknown[] = []
    const worker = {
      postMessage(message: unknown) {
        messages.push(message)
      },
    } as Pick<Worker, "postMessage">

    expect(prewarmBrowserPaginationWorkerMeasurer(worker)).toBe(true)
    expect(messages).toEqual([{ type: "prewarm-measurer" }])
  })

  it("reports when prewarm cannot be posted", () => {
    const worker = {
      postMessage() {
        throw new Error("closed")
      },
    } as unknown as Pick<Worker, "postMessage">

    expect(prewarmBrowserPaginationWorkerMeasurer(null)).toBe(false)
    expect(prewarmBrowserPaginationWorkerMeasurer(worker)).toBe(false)
  })
})
