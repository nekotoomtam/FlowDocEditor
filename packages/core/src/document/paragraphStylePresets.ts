import { DEFAULT_FONT_KEY } from "../font-registry"
import type { ParagraphStyleDefinition } from "../schema"
import { pt } from "../schema"
import { cloneParagraphStyleProperties } from "./paragraphStyles"

export const TOR_BODY_PARAGRAPH_STYLE_ID = "tor.body"
export const TOR_HEADING1_PARAGRAPH_STYLE_ID = "tor.heading1"
export const TOR_HEADING2_PARAGRAPH_STYLE_ID = "tor.heading2"
export const TOR_HEADING3_PARAGRAPH_STYLE_ID = "tor.heading3"
export const TOR_TABLE_BODY_PARAGRAPH_STYLE_ID = "tor.tableBody"
export const TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE_ID = "tor.signatureText"

export const FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS = [
  TOR_BODY_PARAGRAPH_STYLE_ID,
  TOR_HEADING1_PARAGRAPH_STYLE_ID,
  TOR_HEADING2_PARAGRAPH_STYLE_ID,
  TOR_HEADING3_PARAGRAPH_STYLE_ID,
  TOR_TABLE_BODY_PARAGRAPH_STYLE_ID,
  TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE_ID,
] as const

export type FlowDocParagraphStylePresetId = typeof FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS[number]

export function cloneParagraphStyleDefinition(style: ParagraphStyleDefinition): ParagraphStyleDefinition {
  return {
    id: style.id,
    ...(style.name ? { name: style.name } : {}),
    props: cloneParagraphStyleProperties(style.props),
  }
}

export const TOR_BODY_PARAGRAPH_STYLE: ParagraphStyleDefinition = {
  id: TOR_BODY_PARAGRAPH_STYLE_ID,
  name: "TOR Body",
  props: {
    align: "left",
    fontFamilyKey: DEFAULT_FONT_KEY,
    fontSize: pt(12),
    textColor: "000000",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    strikethrough: false,
    lineHeight: 1.5,
    spacingBefore: pt(0),
    spacingAfter: pt(8),
    textIndent: pt(0),
    indentLeft: pt(0),
    indentRight: pt(0),
  },
}

export const TOR_HEADING1_PARAGRAPH_STYLE: ParagraphStyleDefinition = {
  id: TOR_HEADING1_PARAGRAPH_STYLE_ID,
  name: "TOR Heading 1",
  props: {
    ...TOR_BODY_PARAGRAPH_STYLE.props,
    fontSize: pt(16),
    fontWeight: "bold",
    lineHeight: 1.35,
    spacingBefore: pt(12),
    spacingAfter: pt(8),
    headingLevel: 1,
    keepWithNext: true,
  },
}

export const TOR_HEADING2_PARAGRAPH_STYLE: ParagraphStyleDefinition = {
  id: TOR_HEADING2_PARAGRAPH_STYLE_ID,
  name: "TOR Heading 2",
  props: {
    ...TOR_BODY_PARAGRAPH_STYLE.props,
    fontSize: pt(14),
    fontWeight: "bold",
    lineHeight: 1.35,
    spacingBefore: pt(8),
    spacingAfter: pt(6),
    headingLevel: 2,
    keepWithNext: true,
  },
}

export const TOR_HEADING3_PARAGRAPH_STYLE: ParagraphStyleDefinition = {
  id: TOR_HEADING3_PARAGRAPH_STYLE_ID,
  name: "TOR Heading 3",
  props: {
    ...TOR_BODY_PARAGRAPH_STYLE.props,
    fontSize: pt(13),
    fontWeight: "bold",
    lineHeight: 1.35,
    spacingBefore: pt(6),
    spacingAfter: pt(4),
    headingLevel: 3,
    keepWithNext: true,
  },
}

export const TOR_TABLE_BODY_PARAGRAPH_STYLE: ParagraphStyleDefinition = {
  id: TOR_TABLE_BODY_PARAGRAPH_STYLE_ID,
  name: "TOR Table Body",
  props: {
    ...TOR_BODY_PARAGRAPH_STYLE.props,
    fontSize: pt(11),
    lineHeight: 1.25,
    spacingBefore: pt(0),
    spacingAfter: pt(0),
  },
}

export const TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE: ParagraphStyleDefinition = {
  id: TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE_ID,
  name: "TOR Signature Text",
  props: {
    ...TOR_BODY_PARAGRAPH_STYLE.props,
    align: "center",
    lineHeight: 1.35,
    spacingBefore: pt(4),
    spacingAfter: pt(4),
  },
}

export const FLOWDOC_PARAGRAPH_STYLE_PRESETS: Record<FlowDocParagraphStylePresetId, ParagraphStyleDefinition> = {
  [TOR_BODY_PARAGRAPH_STYLE_ID]: TOR_BODY_PARAGRAPH_STYLE,
  [TOR_HEADING1_PARAGRAPH_STYLE_ID]: TOR_HEADING1_PARAGRAPH_STYLE,
  [TOR_HEADING2_PARAGRAPH_STYLE_ID]: TOR_HEADING2_PARAGRAPH_STYLE,
  [TOR_HEADING3_PARAGRAPH_STYLE_ID]: TOR_HEADING3_PARAGRAPH_STYLE,
  [TOR_TABLE_BODY_PARAGRAPH_STYLE_ID]: TOR_TABLE_BODY_PARAGRAPH_STYLE,
  [TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE_ID]: TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE,
}

export function getParagraphStylePreset(styleId: FlowDocParagraphStylePresetId): ParagraphStyleDefinition {
  return cloneParagraphStyleDefinition(FLOWDOC_PARAGRAPH_STYLE_PRESETS[styleId])
}

export function getAllParagraphStylePresets(): Record<FlowDocParagraphStylePresetId, ParagraphStyleDefinition> {
  return Object.fromEntries(
    FLOWDOC_PARAGRAPH_STYLE_PRESET_IDS.map((styleId) => [styleId, getParagraphStylePreset(styleId)]),
  ) as Record<FlowDocParagraphStylePresetId, ParagraphStyleDefinition>
}
