import { describe, expect, it } from "vitest"
import type { OutlineNodeItem, OutlineSectionModel } from "../outlineModel"
import {
  flattenOutlinePanelRows,
  OUTLINE_NODE_ROW_HEIGHT,
  resolveOutlineVisibleWindow,
  toggleOutlineRowExpanded,
  type OutlineFlatRow,
} from "../outlinePanelWindowing"

function paragraphItem(id: string, children: OutlineNodeItem[] = []): OutlineNodeItem {
  return {
    kind: "node",
    key: `node:section:${id}`,
    nodeId: id,
    nodeType: "paragraph",
    node: {
      id,
      type: "paragraph",
      props: {},
      children: [{ id: `${id}-text`, type: "text", text: id }],
    } as OutlineNodeItem["node"],
    sectionId: "section",
    bodyId: "body",
    isBodyChild: children.length === 0,
    children,
  }
}

function sectionWithItems(items: OutlineNodeItem[]): OutlineSectionModel[] {
  return [{ sectionId: "section", bodyId: "body", items }]
}

function rows(count: number): OutlineFlatRow[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "node",
    key: `node:section:p${index}`,
    item: paragraphItem(`p${index}`),
    depth: 0,
    expandable: false,
    expanded: false,
    height: OUTLINE_NODE_ROW_HEIGHT,
  }))
}

describe("outline panel windowing", () => {
  it("flattens only expanded outline branches", () => {
    const child = paragraphItem("child")
    const parent = paragraphItem("parent", [child])
    const expanded = flattenOutlinePanelRows(sectionWithItems([parent]), {
      showSectionHeadings: false,
      expandedRowKeys: new Map(),
    })

    expect(expanded.map((row) => row.key)).toEqual(["node:section:parent", "node:section:child"])
    expect(expanded[1].depth).toBe(1)

    const collapsedKeys = toggleOutlineRowExpanded(new Map(), parent.key)
    const collapsed = flattenOutlinePanelRows(sectionWithItems([parent]), {
      showSectionHeadings: false,
      expandedRowKeys: collapsedKeys,
    })

    expect(collapsed.map((row) => row.key)).toEqual(["node:section:parent"])
    expect(collapsed[0].kind).toBe("node")
    if (collapsed[0].kind !== "node") throw new Error("expected node row")
    expect(collapsed[0].expanded).toBe(false)
  })

  it("resolves a bounded visible row window", () => {
    const visibleWindow = resolveOutlineVisibleWindow(rows(100), {
      virtualized: true,
      scrollTop: OUTLINE_NODE_ROW_HEIGHT * 2,
      viewportHeight: OUTLINE_NODE_ROW_HEIGHT * 2,
      overscanRows: 0,
    })

    expect(visibleWindow.virtualized).toBe(true)
    expect(visibleWindow.totalHeight).toBe(100 * OUTLINE_NODE_ROW_HEIGHT)
    expect(visibleWindow.visibleRows.map((entry) => entry.index)).toEqual([1, 2, 3, 4])
  })

  it("returns every row when virtualization is disabled", () => {
    const visibleWindow = resolveOutlineVisibleWindow(rows(5), {
      virtualized: false,
      scrollTop: OUTLINE_NODE_ROW_HEIGHT * 2,
      viewportHeight: OUTLINE_NODE_ROW_HEIGHT,
    })

    expect(visibleWindow.virtualized).toBe(false)
    expect(visibleWindow.visibleRows.map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4])
  })
})
