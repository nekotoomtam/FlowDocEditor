import { describe, it, expect, vi } from "vitest"
import { arePageFragmentsStructurallyEqual } from "../EditorCanvas"
import type { PageFragment } from "@/pagination/types"

describe("arePageFragmentsStructurallyEqual", () => {
  it("returns true for structurally identical fragments with same text version", () => {
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 1234,
      },
    ]
    const b: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 1234,
      },
    ]

    expect(arePageFragmentsStructurallyEqual(a, b)).toBe(true)
  })

  it("returns false for structurally identical fragments with DIFFERENT text version", () => {
    const a: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 1234,
      },
    ]
    const b: PageFragment[] = [
      {
        nodeId: "1",
        nodeType: "paragraph",
        pageIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        fragmentIndex: 0,
        nodeTextVersion: 5678, // Changed text version
      },
    ]

    expect(arePageFragmentsStructurallyEqual(a, b)).toBe(false)
  })
})
