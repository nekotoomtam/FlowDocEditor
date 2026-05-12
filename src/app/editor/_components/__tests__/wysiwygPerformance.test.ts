import { afterEach, describe, expect, it, vi } from "vitest"
import {
  appendWysiwygPerfEvent,
  finishWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
  type WysiwygPerfEvent,
} from "../wysiwygPerformance"
import type { PaginatedDocument } from "@/pagination"

function event(kind: WysiwygPerfEvent["kind"], startedAt: number): WysiwygPerfEvent {
  return { kind, startedAt, durationMs: 1 }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("appendWysiwygPerfEvent", () => {
  it("keeps newest events when the buffer reaches its cap", () => {
    const events = [
      event("inline-edit-draft-update", 1),
      event("active-paragraph-measure", 2),
    ]

    const next = appendWysiwygPerfEvent(
      events,
      event("browser-preview-pagination", 3),
      2,
    )

    expect(next.map((item) => item.startedAt)).toEqual([2, 3])
    expect(events.map((item) => item.startedAt)).toEqual([1, 2])
  })

  it("drops events when the cap is zero", () => {
    expect(appendWysiwygPerfEvent([], event("inline-edit-draft-update", 1), 0)).toEqual([])
  })
})

describe("summarizePaginatedForWysiwygPerf", () => {
  it("counts pages and fragments across sections without inspecting document semantics", () => {
    const paginated = {
      sections: [
        {
          sectionId: "s1",
          pages: [
            { fragments: [{}, {}] },
            { fragments: [{}] },
          ],
        },
        {
          sectionId: "s2",
          pages: [
            { fragments: [{}, {}, {}] },
          ],
        },
      ],
    } as unknown as PaginatedDocument

    expect(summarizePaginatedForWysiwygPerf(paginated)).toEqual({
      pageCount: 3,
      fragmentCount: 6,
    })
  })
})

describe("finishWysiwygPerfSpan", () => {
  it("is inert when tracing is disabled", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(false, "inline-edit-draft-update", 10, {
      nodeId: "p1",
      textLength: 5,
    })

    expect(window.__flowDocWysiwygPerfEvents).toBeUndefined()
  })

  it("appends scalar metadata without storing paragraph text", () => {
    vi.stubGlobal("window", {})

    finishWysiwygPerfSpan(true, "inline-edit-draft-update", 10, {
      nodeId: "p1",
      textLength: 5,
    })

    expect(window.__flowDocWysiwygPerfEvents).toHaveLength(1)
    expect(window.__flowDocWysiwygPerfEvents?.[0]).toMatchObject({
      kind: "inline-edit-draft-update",
      nodeId: "p1",
      textLength: 5,
    })
    expect(JSON.stringify(window.__flowDocWysiwygPerfEvents)).not.toContain("Alpha")
  })
})
