import { describe, expect, it } from "vitest"
import { createPaginationProfiler } from "../profiler"

function scriptedNow(values: number[]) {
  let index = 0
  return () => values[index++] ?? values[values.length - 1] ?? 0
}

describe("pagination profiler", () => {
  it("aggregates timings and counts by stable stage name", () => {
    const profiler = createPaginationProfiler({
      enabled: true,
      source: "browser",
      now: scriptedNow([0, 4, 5, 11]),
    })

    profiler.measure("paragraph-measure", () => undefined)
    profiler.measure("paragraph-measure", () => undefined)
    profiler.count("measuredParagraphs", 2)

    const profile = profiler.flush({ totalMs: 20, pageCount: 1, fragmentCount: 2 })

    expect(profile.source).toBe("browser")
    expect(profile.pageCount).toBe(1)
    expect(profile.fragmentCount).toBe(2)
    expect(profile.stages).toEqual([
      {
        name: "paragraph-measure",
        totalMs: 10,
        count: 2,
        avgMs: 5,
        maxMs: 6,
        minMs: 4,
      },
    ])
    expect(profile.counters?.measuredParagraphs).toBe(2)
  })

  it("keeps nested stage output stable", () => {
    const profiler = createPaginationProfiler({
      enabled: true,
      source: "server",
      now: scriptedNow([0, 2, 5, 12]),
    })

    const endOuter = profiler.start("page-packing")
    profiler.measure("fragment-generation", () => undefined)
    endOuter()

    const profile = profiler.flush({ totalMs: 12 })

    expect(profile.stages).toEqual([
      {
        name: "page-packing",
        totalMs: 12,
        count: 1,
        avgMs: 12,
        maxMs: 12,
        minMs: 12,
        children: [
          {
            name: "fragment-generation",
            totalMs: 3,
            count: 1,
            avgMs: 3,
            maxMs: 3,
            minMs: 3,
          },
        ],
      },
    ])
    expect(profile.topStages?.map((stage) => stage.name)).toEqual(["page-packing", "fragment-generation"])
  })
})
