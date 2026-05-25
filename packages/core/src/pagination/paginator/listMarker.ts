import type { ResolvedListMarker } from "../../document/listNumbering"
import { toAbstractUnit } from "../../layout"
import type { DocumentNode, ListLevelDefinition, ParagraphNode } from "../../schema"
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
  const textIndent = level ? toAbstractUnit(level.textIndent.value, level.textIndent.unit) : 0
  return {
    text: marker.markerText,
    level: marker.level,
    ordinal: marker.ordinal,
    instanceId: marker.instanceId,
    styleId: marker.styleId,
    itemId: marker.itemId,
    markerIndent,
    textIndent,
    markerX: paragraphContentX + markerIndent,
    bodyX: paragraphContentX + textIndent,
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
  return {
    ...node,
    props: {
      ...node.props,
      indentLeft: { value: Math.max(0, toAbstractUnit(level.textIndent.value, level.textIndent.unit)), unit: "pt" },
      textIndent: { value: 0, unit: "pt" },
    },
  }
}
