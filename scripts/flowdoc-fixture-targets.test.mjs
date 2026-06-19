import { describe, expect, it } from "vitest"
import {
  listFlowDocFixtureTargetAliases,
  readFlowDocFixtureTargets,
  resolveFlowDocFixtureTarget,
} from "./flowdoc-fixture-targets.mjs"

const fixture = {
  packageVersion: 2,
  kind: "document",
  mockData: {
    targets: {
      typing: {
        primary: "p-primary",
        boundary: "p-boundary",
      },
      node: {
        delete: "p-delete",
      },
      flowRow: {
        resizeTarget: "row-main",
        leftStack: "stack-left",
      },
      table: {
        primaryTable: "table-main",
        primaryCell: "cell-primary",
      },
    },
  },
}

describe("flowdoc fixture target aliases", () => {
  it("reads target aliases from package mockData", () => {
    expect(readFlowDocFixtureTargets(fixture)).toEqual(fixture.mockData.targets)
    expect(readFlowDocFixtureTargets(JSON.stringify(fixture))).toEqual(fixture.mockData.targets)
  })

  it("resolves dotted target alias paths", () => {
    expect(resolveFlowDocFixtureTarget(fixture, "typing.primary")).toBe("p-primary")
    expect(resolveFlowDocFixtureTarget(fixture, "node.delete")).toBe("p-delete")
    expect(resolveFlowDocFixtureTarget(fixture, "flowRow.resizeTarget")).toBe("row-main")
    expect(resolveFlowDocFixtureTarget(fixture, "table.primaryCell")).toBe("cell-primary")
    expect(resolveFlowDocFixtureTarget(fixture, "typing.missing")).toBeNull()
  })

  it("lists leaf target aliases", () => {
    expect(listFlowDocFixtureTargetAliases(fixture)).toEqual([
      "flowRow.leftStack",
      "flowRow.resizeTarget",
      "node.delete",
      "table.primaryCell",
      "table.primaryTable",
      "typing.boundary",
      "typing.primary",
    ])
  })
})
