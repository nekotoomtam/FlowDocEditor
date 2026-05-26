import type {
  DocumentNode,
  FlowTableCellNode,
  FlowTableRowNode,
  LayoutNode,
} from "@/schema"

export type OutlineRenderableNode = LayoutNode | FlowTableRowNode | FlowTableCellNode
export type OutlineRenderableNodeType = OutlineRenderableNode["type"]

export type OutlineNodeItem = {
  kind: "node"
  key: string
  nodeId: string
  nodeType: OutlineRenderableNodeType
  node: OutlineRenderableNode
  sectionId: string
  bodyId: string
  isBodyChild: boolean
  labelOverride?: string
  children: OutlineItem[]
}

export type OutlineListGroupRunItem = {
  kind: "list-group-run"
  key: string
  instanceId: string
  paragraphIds: string[]
  sectionId: string
  bodyId: string
  children: OutlineNodeItem[]
}

export type OutlineItem = OutlineNodeItem | OutlineListGroupRunItem

export type OutlineSectionModel = {
  sectionId: string
  bodyId: string
  items: OutlineItem[]
}

export type BuildOutlineModelOptions = {
  listGroupIds?: Iterable<string>
}

type BuildContext = {
  sectionId: string
  bodyId: string
  listGroupIds: Set<string>
}

function paragraphListInstanceId(node: OutlineRenderableNode | undefined): string | null {
  return node?.type === "paragraph" ? node.props.list?.instanceId ?? null : null
}

function buildNodeItem(
  nodes: Record<string, OutlineRenderableNode>,
  nodeId: string,
  context: BuildContext,
  options: {
    isBodyChild?: boolean
    labelOverride?: string
  } = {},
): OutlineNodeItem | null {
  const node = nodes[nodeId]
  if (!node) return null

  const itemBase = {
    kind: "node" as const,
    key: `node:${context.sectionId}:${nodeId}`,
    nodeId,
    nodeType: node.type,
    node,
    sectionId: context.sectionId,
    bodyId: context.bodyId,
    isBodyChild: options.isBodyChild ?? false,
    ...(options.labelOverride ? { labelOverride: options.labelOverride } : {}),
  }

  if (node.type === "body") {
    return {
      ...itemBase,
      children: buildChildItems(nodes, node.childIds, context, {
        containerId: node.id,
        childrenAreBodyChildren: true,
      }),
    }
  }

  if (node.type === "row" || node.type === "flow-row") {
    const expectedStackType = node.type === "flow-row" ? "flow-stack" : "stack"
    return {
      ...itemBase,
      children: node.childIds.flatMap((stackId, index) => {
        const stack = nodes[stackId]
        if (stack?.type !== expectedStackType) return []
        const child = buildNodeItem(nodes, stackId, context, {
          labelOverride: `คอลัมน์ ${index + 1}`,
        })
        return child ? [child] : []
      }),
    }
  }

  if (node.type === "stack" || node.type === "flow-stack") {
    return {
      ...itemBase,
      children: buildChildItems(nodes, node.childIds, context, {
        containerId: node.id,
      }),
    }
  }

  if (node.type === "flow-table") {
    const tableNodes = node.nodes as Record<string, OutlineRenderableNode>
    return {
      ...itemBase,
      children: node.rowIds.flatMap((rowId, index) => {
        const child = buildNodeItem(tableNodes, rowId, context, {
          labelOverride: `แถว ${index + 1}`,
        })
        return child ? [child] : []
      }),
    }
  }

  if (node.type === "flow-table-row") {
    return {
      ...itemBase,
      children: node.cellIds.flatMap((cellId, index) => {
        const child = buildNodeItem(nodes, cellId, context, {
          labelOverride: `เซลล์ ${index + 1}`,
        })
        return child ? [child] : []
      }),
    }
  }

  if (node.type === "flow-table-cell") {
    return {
      ...itemBase,
      children: buildChildItems(nodes, node.childIds, context, {
        containerId: node.id,
      }),
    }
  }

  return {
    ...itemBase,
    children: [],
  }
}

function buildChildItems(
  nodes: Record<string, OutlineRenderableNode>,
  childIds: string[],
  context: BuildContext,
  options: {
    containerId: string
    childrenAreBodyChildren?: boolean
  },
): OutlineItem[] {
  const items: OutlineItem[] = []
  let index = 0

  while (index < childIds.length) {
    const childId = childIds[index]
    const instanceId = paragraphListInstanceId(nodes[childId])
    if (instanceId && context.listGroupIds.has(instanceId)) {
      const runIds: string[] = []
      while (index < childIds.length && paragraphListInstanceId(nodes[childIds[index]]) === instanceId) {
        runIds.push(childIds[index])
        index += 1
      }

      const children = runIds.flatMap((runChildId) => {
        const child = buildNodeItem(nodes, runChildId, context, {
          isBodyChild: options.childrenAreBodyChildren ?? false,
        })
        return child ? [child] : []
      })
      items.push({
        kind: "list-group-run",
        key: `list-group:${context.sectionId}:${options.containerId}:${instanceId}:${runIds[0]}`,
        instanceId,
        paragraphIds: runIds,
        sectionId: context.sectionId,
        bodyId: context.bodyId,
        children,
      })
      continue
    }

    const child = buildNodeItem(nodes, childId, context, {
      isBodyChild: options.childrenAreBodyChildren ?? false,
    })
    if (child) items.push(child)
    index += 1
  }

  return items
}

export function buildOutlineModel(
  doc: DocumentNode,
  options: BuildOutlineModelOptions = {},
): OutlineSectionModel[] {
  const listGroupIds = new Set(options.listGroupIds ?? [])

  return doc.document.sections.map((section) => {
    const body = section.nodes[section.bodyRootId]
    const context: BuildContext = {
      sectionId: section.id,
      bodyId: section.bodyRootId,
      listGroupIds,
    }
    const items = body?.type === "body"
      ? buildChildItems(section.nodes, body.childIds, context, {
        containerId: body.id,
        childrenAreBodyChildren: true,
      })
      : []

    return {
      sectionId: section.id,
      bodyId: section.bodyRootId,
      items,
    }
  })
}
