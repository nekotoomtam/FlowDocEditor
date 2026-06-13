import { describe, expect, it } from "vitest"
import { resolveOutlineLabelUpdatePolicy } from "../OutlinePanel"

describe("outline panel label update policy", () => {
  it("applies a released edit label before freezing the current active edit", () => {
    expect(resolveOutlineLabelUpdatePolicy({
      activeEditingNodeId: "p2",
      previousActiveEditingNodeId: "p1",
      editRelease: { nodeId: "p1", token: 1 },
      consumedEditReleaseToken: null,
    })).toEqual({ kind: "single-node", nodeId: "p1" })
  })

  it("updates the previous active node when focus moves directly to another edit", () => {
    expect(resolveOutlineLabelUpdatePolicy({
      activeEditingNodeId: "p2",
      previousActiveEditingNodeId: "p1",
      editRelease: null,
      consumedEditReleaseToken: null,
    })).toEqual({ kind: "single-node", nodeId: "p1" })
  })

  it("keeps the active label frozen when the same edit session is still active", () => {
    expect(resolveOutlineLabelUpdatePolicy({
      activeEditingNodeId: "p1",
      previousActiveEditingNodeId: "p1",
      editRelease: null,
      consumedEditReleaseToken: null,
    })).toEqual({ kind: "frozen-active-edit" })
  })
})
