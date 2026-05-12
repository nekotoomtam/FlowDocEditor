import { DEFAULT_STACK_MIN_HEIGHT } from "@/document"
import type { DocumentNode } from "@/schema"
import type { PageFragment, PaginatedDocument } from "@/pagination"

export function resizeFragmentHeightAndShift(
  paginated: PaginatedDocument,
  doc: DocumentNode,
  nodeId: string,
  height: number,
  pageIndex?: number | null,
): PaginatedDocument {
  let targetPageIndex: number | null = null
  let targetY: number | null = null
  let delta = 0

  for (const section of paginated.sections) {
    for (const page of section.pages) {
      const fragment = page.fragments.find((f) =>
        f.nodeId === nodeId &&
        f.nodeType === "paragraph" &&
        (pageIndex == null || f.pageIndex === pageIndex)
      )
      if (!fragment) continue
      targetPageIndex = page.index
      targetY = fragment.y
      delta = height - fragment.height
      break
    }
    if (targetY !== null) break
  }

  if (targetPageIndex === null || targetY === null || Math.abs(delta) < 0.5) return paginated

  return {
    ...paginated,
    sections: paginated.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => {
        if (page.index !== targetPageIndex) return page

        const target = page.fragments.find((f) =>
          f.nodeId === nodeId &&
          f.nodeType === "paragraph" &&
          (pageIndex == null || f.pageIndex === pageIndex)
        )
        const byId = new Map(page.fragments.map((fragment) => [fragment.nodeId, fragment]))

        const isDescendantOf = (fragment: PageFragment, ancestorId: string): boolean => {
          let parentId = fragment.parentNodeId
          while (parentId) {
            if (parentId === ancestorId) return true
            parentId = byId.get(parentId)?.parentNodeId
          }
          return false
        }

        const stackAncestor = target?.parentNodeId ? byId.get(target.parentNodeId) : null
        const rowAncestor = stackAncestor?.parentNodeId ? byId.get(stackAncestor.parentNodeId) : null

        if (target && stackAncestor?.nodeType === "stack" && rowAncestor?.nodeType === "row") {
          const isLaterInEditedStack = (fragment: PageFragment): boolean => (
            fragment.nodeId !== target.nodeId &&
            fragment.y > target.y &&
            isDescendantOf(fragment, stackAncestor.nodeId)
          )
          const adjustedY = (fragment: PageFragment): number => (
            isLaterInEditedStack(fragment) ? fragment.y + delta : fragment.y
          )
          const rowNode = doc.document.sections
            .map((docSection) => docSection.nodes[rowAncestor.nodeId])
            .find((node) => node?.type === "row")
          const rowMinHeight = rowNode?.type === "row" ? Math.max(0, rowNode.props.minHeight ?? 0) : 0
          const stackFragments = page.fragments.filter((fragment) =>
            fragment.parentNodeId === rowAncestor.nodeId &&
            fragment.nodeType === "stack"
          )

          const stackHeight = (stack: PageFragment): number => {
            const stackNode = doc.document.sections
              .map((docSection) => docSection.nodes[stack.nodeId])
              .find((node) => node?.type === "stack")
            const stackMinHeight = stackNode?.type === "stack"
              ? Math.max(DEFAULT_STACK_MIN_HEIGHT, stackNode.props.minHeight ?? 0)
              : DEFAULT_STACK_MIN_HEIGHT
            const contentBottom = page.fragments.reduce((bottom, fragment) => {
              if (!isDescendantOf(fragment, stack.nodeId)) return bottom
              const fragmentHeight = fragment.nodeId === nodeId ? height : fragment.height
              return Math.max(bottom, adjustedY(fragment) + fragmentHeight)
            }, stack.y)
            return Math.max(stackMinHeight, contentBottom - stack.y)
          }

          const nextRowHeight = Math.max(rowMinHeight, ...stackFragments.map(stackHeight))
          const rowDelta = nextRowHeight - rowAncestor.height
          const rowBottom = rowAncestor.y + rowAncestor.height

          return {
            ...page,
            fragments: page.fragments.map((fragment) => {
              const isTarget = fragment.nodeId === nodeId &&
                fragment.nodeType === "paragraph" &&
                (pageIndex == null || fragment.pageIndex === pageIndex)
              const isRow = fragment.nodeId === rowAncestor.nodeId && fragment.nodeType === "row"
              const isRowStack = fragment.parentNodeId === rowAncestor.nodeId && fragment.nodeType === "stack"
              const isInsideRow = isDescendantOf(fragment, rowAncestor.nodeId)
              const shouldShiftBelowRow = !isRow && !isInsideRow && fragment.y >= rowBottom - 0.5
              const shouldShiftInsideStack = isLaterInEditedStack(fragment)

              if (isTarget) return { ...fragment, height }
              if (isRow || isRowStack) return { ...fragment, height: nextRowHeight }
              if (shouldShiftInsideStack && Math.abs(delta) >= 0.5) {
                return {
                  ...fragment,
                  y: fragment.y + delta,
                  lines: fragment.lines?.map((line) => ({ ...line, y: line.y + delta })),
                }
              }
              if (!shouldShiftBelowRow || Math.abs(rowDelta) < 0.5) return fragment
              return {
                ...fragment,
                y: fragment.y + rowDelta,
                lines: fragment.lines?.map((line) => ({ ...line, y: line.y + rowDelta })),
              }
            }),
          }
        }

        return {
          ...page,
          fragments: page.fragments.map((fragment) => {
            const isTarget = fragment.nodeId === nodeId &&
              fragment.nodeType === "paragraph" &&
              (pageIndex == null || fragment.pageIndex === pageIndex)
            if (isTarget) return { ...fragment, height }
            if (fragment.y <= targetY) return fragment
            return {
              ...fragment,
              y: fragment.y + delta,
              lines: fragment.lines?.map((line) => ({ ...line, y: line.y + delta })),
            }
          }),
        }
      }),
    })),
  }
}
