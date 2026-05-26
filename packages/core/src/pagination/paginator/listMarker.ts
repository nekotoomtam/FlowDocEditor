import type { ResolvedListMarker } from "../../document/listNumbering"
import { toAbstractUnit } from "../../layout"
import { resolveListLevelBodyIndent, type DocumentNode, type ListLevelDefinition, type ParagraphNode } from "../../schema"
import type { ListMarkerRenderProps } from "../types"

export interface ListNumberingPaginationContext {
  markers: Map<string, ResolvedListMarker>
  styles: NonNullable<DocumentNode["document"]["listStyles"]>
}

export function toListMarkerRenderProps(
  marker: ResolvedListMarker | undefined,
  context: ListNumberingPaginationContext | undefined,
  paragraphContentX: number,
): ListMarkerRenderProps | undefined {
  if (!marker) return undefined
  const level = context?.styles[marker.styleId]?.levels.find((candidate) => candidate.level === marker.level)
  const markerIndent = level ? toAbstractUnit(level.markerIndent.value, level.markerIndent.unit) : 0
  const bodyIndentValue = level ? resolveListLevelBodyIndent(level) : undefined
  const bodyIndent = bodyIndentValue ? toAbstractUnit(bodyIndentValue.value, bodyIndentValue.unit) : 0
  return {
    text: marker.markerText,
    level: marker.level,
    ordinal: marker.ordinal,
    instanceId: marker.instanceId,
    styleId: marker.styleId,
    itemId: marker.itemId,
    markerIndent,
    bodyIndent,
    markerX: paragraphContentX + markerIndent,
    bodyX: paragraphContentX + bodyIndent,
  }
}

function resolveListLevelDefinition(
  marker: ResolvedListMarker | undefined,
  context: ListNumberingPaginationContext | undefined,
): ListLevelDefinition | undefined {
  if (!marker) return undefined
  return context?.styles[marker.styleId]?.levels.find((candidate) => candidate.level === marker.level)
}

export function withListBodyIndent(
  node: ParagraphNode,
  marker: ResolvedListMarker | undefined,
  context: ListNumberingPaginationContext | undefined,
): ParagraphNode {
  const level = resolveListLevelDefinition(marker, context)
  if (!level) return node
  const bodyIndent = resolveListLevelBodyIndent(level)
  return {
    ...node,
    props: {
      ...node.props,
      indentLeft: { value: Math.max(0, toAbstractUnit(bodyIndent.value, bodyIndent.unit)), unit: "pt" },
      textIndent: { value: 0, unit: "pt" },
    },
  }
}
