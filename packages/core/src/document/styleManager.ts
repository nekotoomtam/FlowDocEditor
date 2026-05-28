import type {
  DocumentNode,
  DocumentStyleDefinitions,
  FlowTableNode,
  ListInstance,
  ListStyleDefinition,
  ParagraphNode,
  ParagraphStyleDefinition,
} from "../schema"
import {
  FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS,
  cloneParagraphStyleDefinition,
} from "./paragraphStylePresets"
import type { FlowDocParagraphStylePresetId } from "./paragraphStylePresets"
import {
  BULLET_BASIC_LIST_STYLE_ID,
  FLOWDOC_LIST_STYLE_PRESET_IDS,
  PAREN_DECIMAL_LIST_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
  cloneListStyleDefinition,
} from "./listPresets"
import type { FlowDocListStylePresetId } from "./listPresets"
import { orderedDocumentParagraphs } from "./documentTraversal"
import { resolveListMarkers, type ResolvedListMarker } from "./listNumbering"

export const STYLE_MANAGER_PARAGRAPH_STYLE_GROUP_ID = "paragraph-styles"
export const STYLE_MANAGER_LIST_STYLE_GROUP_ID = "list-styles"
export const STYLE_MANAGER_LIST_GROUP_GROUP_ID = "list-groups"

export type StyleManagerResourceKind = "paragraph-style" | "list-style" | "list-group"
export type StyleManagerStyleSource = "document"

export type StyleManagerParagraphStyleItem = {
  kind: StyleManagerResourceKind
  id: string
  label: string
  source: StyleManagerStyleSource
  definition: ParagraphStyleDefinition
  isBase: boolean
  canEdit: boolean
  canRename: boolean
  canDelete: boolean
  presetId?: FlowDocParagraphStylePresetId
}

export type StyleManagerParagraphStyleGroup = {
  id: typeof STYLE_MANAGER_PARAGRAPH_STYLE_GROUP_ID
  label: string
  items: StyleManagerParagraphStyleItem[]
}

export type StyleManagerListStyleItem = {
  kind: "list-style"
  id: string
  label: string
  source: StyleManagerStyleSource
  definition: ListStyleDefinition
  levelCount: number
  canEdit: boolean
  canRename: boolean
  canDelete: boolean
  presetId?: FlowDocListStylePresetId
}

export type StyleManagerListStyleGroup = {
  id: typeof STYLE_MANAGER_LIST_STYLE_GROUP_ID
  label: string
  items: StyleManagerListStyleItem[]
}

export type StyleManagerListGroupItem = {
  kind: "list-group"
  id: string
  label: string
  source: StyleManagerStyleSource
  instance: ListInstance
  styleId: string
  styleLabel: string
  itemCount: number
  firstDocumentOrder?: number
  firstParagraphId?: string
  lastParagraphId?: string
  firstMarkerText?: string
  lastMarkerText?: string
  canEdit: boolean
  canRename: boolean
  canDelete: boolean
}

export type StyleManagerListGroupGroup = {
  id: typeof STYLE_MANAGER_LIST_GROUP_GROUP_ID
  label: string
  items: StyleManagerListGroupItem[]
}

export type StyleManagerParagraphListContext = {
  paragraphId: string
  instanceId: string
  groupLabel: string
  styleId: string
  styleLabel: string
  level: number
  userLevel: number
  itemId: string
  itemCount: number
  markerText?: string
  ordinal?: number
  firstMarkerText?: string
  lastMarkerText?: string
}

export type StyleManagerState = {
  baseParagraphStyleId?: string
  paragraphStyles: StyleManagerParagraphStyleGroup
  listStyles: StyleManagerListStyleGroup
  listGroups: StyleManagerListGroupGroup
}

const PRESET_ORDER = new Map<string, number>(
  FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS.map((styleId, index) => [styleId, index]),
)

const LIST_PRESET_ORDER = new Map<string, number>(
  FLOWDOC_LIST_STYLE_PRESET_IDS.map((styleId, index) => [styleId, index]),
)

const LIST_PRESET_LABELS: Record<FlowDocListStylePresetId, string> = {
  [TOR_CLAUSE_LIST_STYLE_ID]: "TOR Clause",
  [PAREN_DECIMAL_LIST_STYLE_ID]: "Parenthesized Number",
  [BULLET_BASIC_LIST_STYLE_ID]: "Bullet",
}

function paragraphStyleLabel(style: ParagraphStyleDefinition): string {
  const name = style.name?.trim()
  return name && name.length > 0 ? name : style.id
}

function paragraphStylePresetId(styleId: string): FlowDocParagraphStylePresetId | undefined {
  return FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS.includes(styleId as FlowDocParagraphStylePresetId)
    ? styleId as FlowDocParagraphStylePresetId
    : undefined
}

function listStylePresetId(styleId: string): FlowDocListStylePresetId | undefined {
  return FLOWDOC_LIST_STYLE_PRESET_IDS.includes(styleId as FlowDocListStylePresetId)
    ? styleId as FlowDocListStylePresetId
    : undefined
}

function humanizeResourceId(id: string): string {
  const acronyms = new Set(["dpa", "docx", "pdf", "toc", "tor"])
  return id
    .split(/[-_.\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (acronyms.has(part.toLowerCase())) return part.toUpperCase()
      if (part.toUpperCase() === part && part.length <= 4) return part
      return part.slice(0, 1).toUpperCase() + part.slice(1)
    })
    .join(" ") || id
}

function listStyleLabel(styleId: string): string {
  const presetId = listStylePresetId(styleId)
  return presetId ? LIST_PRESET_LABELS[presetId] : humanizeResourceId(styleId)
}

function listGroupLabel(instance: ListInstance): string {
  return humanizeResourceId(instance.id)
}

function cloneListInstance(instance: ListInstance): ListInstance {
  return {
    id: instance.id,
    styleId: instance.styleId,
    ...(instance.startAt != null ? { startAt: instance.startAt } : {}),
  }
}

function resolveExistingBaseParagraphStyleId(
  styles: DocumentStyleDefinitions | undefined,
): string | undefined {
  const baseStyleId = styles?.baseParagraphStyleId
  return baseStyleId && styles?.paragraphStyles?.[baseStyleId] ? baseStyleId : undefined
}

function compareParagraphStyleItems(
  left: StyleManagerParagraphStyleItem,
  right: StyleManagerParagraphStyleItem,
): number {
  if (left.isBase !== right.isBase) return left.isBase ? -1 : 1

  const leftPresetOrder = PRESET_ORDER.get(left.id)
  const rightPresetOrder = PRESET_ORDER.get(right.id)
  if (leftPresetOrder != null || rightPresetOrder != null) {
    return (leftPresetOrder ?? Number.MAX_SAFE_INTEGER) - (rightPresetOrder ?? Number.MAX_SAFE_INTEGER)
  }

  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id)
}

function compareListStyleItems(
  left: StyleManagerListStyleItem,
  right: StyleManagerListStyleItem,
): number {
  const leftPresetOrder = LIST_PRESET_ORDER.get(left.id)
  const rightPresetOrder = LIST_PRESET_ORDER.get(right.id)
  if (leftPresetOrder != null || rightPresetOrder != null) {
    return (leftPresetOrder ?? Number.MAX_SAFE_INTEGER) - (rightPresetOrder ?? Number.MAX_SAFE_INTEGER)
  }

  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id)
}

function compareListGroupItems(
  left: StyleManagerListGroupItem,
  right: StyleManagerListGroupItem,
): number {
  if (left.firstDocumentOrder != null || right.firstDocumentOrder != null) {
    return (left.firstDocumentOrder ?? Number.MAX_SAFE_INTEGER) - (right.firstDocumentOrder ?? Number.MAX_SAFE_INTEGER)
  }
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id)
}

export function buildParagraphStyleManagerItems(
  styles: DocumentStyleDefinitions | undefined,
): StyleManagerParagraphStyleItem[] {
  const paragraphStyles = styles?.paragraphStyles ?? {}
  const baseStyleId = resolveExistingBaseParagraphStyleId(styles)

  return Object.entries(paragraphStyles)
    .map(([styleId, style]) => {
      const presetId = paragraphStylePresetId(styleId)
      return {
        kind: "paragraph-style" as const,
        id: styleId,
        label: paragraphStyleLabel(style),
        source: "document" as const,
        definition: cloneParagraphStyleDefinition(style),
        isBase: baseStyleId === styleId,
        canEdit: true,
        canRename: true,
        canDelete: false,
        ...(presetId ? { presetId } : {}),
      }
    })
    .sort(compareParagraphStyleItems)
}

export function buildListStyleManagerItems(
  listStyles: NonNullable<DocumentNode["document"]["listStyles"]> | undefined,
): StyleManagerListStyleItem[] {
  return Object.entries(listStyles ?? {})
    .map(([styleId, style]) => {
      const presetId = listStylePresetId(styleId)
      return {
        kind: "list-style" as const,
        id: styleId,
        label: listStyleLabel(styleId),
        source: "document" as const,
        definition: cloneListStyleDefinition(style),
        levelCount: style.levels.length,
        canEdit: false,
        canRename: false,
        canDelete: false,
        ...(presetId ? { presetId } : {}),
      }
    })
    .sort(compareListStyleItems)
}

export function buildListGroupManagerItems(doc: DocumentNode): StyleManagerListGroupItem[] {
  const instances = doc.document.listInstances ?? {}
  const markers = resolveListMarkers(doc)
  const paragraphs = orderedDocumentParagraphs(doc)
  const summaries = new Map<string, {
    itemCount: number
    firstDocumentOrder?: number
    firstParagraphId?: string
    lastParagraphId?: string
    firstMarkerText?: string
    lastMarkerText?: string
  }>()

  paragraphs.forEach((paragraph, index) => {
    const list = paragraph.props.list
    if (!list || !instances[list.instanceId]) return
    const marker = markers.get(paragraph.id)
    const summary = summaries.get(list.instanceId) ?? { itemCount: 0 }
    summary.itemCount += 1
    summary.firstDocumentOrder ??= index
    summary.firstParagraphId ??= paragraph.id
    summary.lastParagraphId = paragraph.id
    if (marker) {
      summary.firstMarkerText ??= marker.markerText
      summary.lastMarkerText = marker.markerText
    }
    summaries.set(list.instanceId, summary)
  })

  return Object.entries(instances)
    .map(([instanceId, instance]) => {
      const summary = summaries.get(instanceId)
      return {
        kind: "list-group" as const,
        id: instanceId,
        label: listGroupLabel(instance),
        source: "document" as const,
        instance: cloneListInstance(instance),
        styleId: instance.styleId,
        styleLabel: listStyleLabel(instance.styleId),
        itemCount: summary?.itemCount ?? 0,
        ...(summary?.firstDocumentOrder != null ? { firstDocumentOrder: summary.firstDocumentOrder } : {}),
        ...(summary?.firstParagraphId ? { firstParagraphId: summary.firstParagraphId } : {}),
        ...(summary?.lastParagraphId ? { lastParagraphId: summary.lastParagraphId } : {}),
        ...(summary?.firstMarkerText ? { firstMarkerText: summary.firstMarkerText } : {}),
        ...(summary?.lastMarkerText ? { lastMarkerText: summary.lastMarkerText } : {}),
        canEdit: false,
        canRename: false,
        canDelete: false,
      }
    })
    .sort(compareListGroupItems)
}

function findParagraphNodeById(doc: DocumentNode, paragraphId: string): ParagraphNode | null {
  for (const section of doc.document.sections) {
    const node = section.nodes[paragraphId]
    if (node?.type === "paragraph") return node

    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const inner = (candidate as unknown as FlowTableNode).nodes[paragraphId]
      if (inner?.type === "paragraph") return inner as ParagraphNode
    }
  }
  return null
}

function summarizeListInstanceFromMarkers(
  doc: DocumentNode,
  instanceId: string,
  markers: Map<string, ResolvedListMarker>,
): {
  itemCount: number
  firstMarkerText?: string
  lastMarkerText?: string
} {
  const summary: {
    itemCount: number
    firstMarkerText?: string
    lastMarkerText?: string
  } = { itemCount: 0 }

  for (const paragraph of orderedDocumentParagraphs(doc)) {
    const list = paragraph.props.list
    if (!list || list.instanceId !== instanceId) continue
    const marker = markers.get(paragraph.id)
    summary.itemCount += 1
    if (marker) {
      summary.firstMarkerText ??= marker.markerText
      summary.lastMarkerText = marker.markerText
    }
  }

  return summary
}

export function resolveParagraphListContext(
  doc: DocumentNode,
  paragraphId: string | null | undefined,
): StyleManagerParagraphListContext | null {
  if (!paragraphId) return null
  const paragraph = findParagraphNodeById(doc, paragraphId)
  const list = paragraph?.props.list
  if (!paragraph || !list) return null

  const instance = doc.document.listInstances?.[list.instanceId]
  const style = instance ? doc.document.listStyles?.[instance.styleId] : undefined
  if (!instance || !style) return null

  const markers = resolveListMarkers(doc)
  const marker = markers.get(paragraph.id)
  const group = summarizeListInstanceFromMarkers(doc, instance.id, markers)
  return {
    paragraphId: paragraph.id,
    instanceId: instance.id,
    groupLabel: listGroupLabel(instance),
    styleId: style.id,
    styleLabel: listStyleLabel(style.id),
    level: list.level,
    userLevel: list.level + 1,
    itemId: list.itemId,
    itemCount: group.itemCount,
    ...(marker?.markerText ? { markerText: marker.markerText } : {}),
    ...(marker?.ordinal != null ? { ordinal: marker.ordinal } : {}),
    ...(group.firstMarkerText ? { firstMarkerText: group.firstMarkerText } : {}),
    ...(group.lastMarkerText ? { lastMarkerText: group.lastMarkerText } : {}),
  }
}

export function buildStyleManagerState(doc: DocumentNode): StyleManagerState {
  return {
    baseParagraphStyleId: resolveExistingBaseParagraphStyleId(doc.document.styles),
    paragraphStyles: {
      id: STYLE_MANAGER_PARAGRAPH_STYLE_GROUP_ID,
      label: "Paragraph styles",
      items: buildParagraphStyleManagerItems(doc.document.styles),
    },
    listStyles: {
      id: STYLE_MANAGER_LIST_STYLE_GROUP_ID,
      label: "List styles",
      items: buildListStyleManagerItems(doc.document.listStyles),
    },
    listGroups: {
      id: STYLE_MANAGER_LIST_GROUP_GROUP_ID,
      label: "List groups",
      items: buildListGroupManagerItems(doc),
    },
  }
}
