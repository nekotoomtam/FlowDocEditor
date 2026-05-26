import type { ListInstance, ListStyleDefinition, UnitValue } from "../schema"
import { LIST_LEVEL_COUNT, pt } from "../schema"

export const TOR_CLAUSE_LIST_STYLE_ID = "tor-clause"
export const PAREN_DECIMAL_LIST_STYLE_ID = "paren-decimal"
export const BULLET_BASIC_LIST_STYLE_ID = "bullet-basic"

export const FLOWDOC_LIST_STYLE_PRESET_IDS = [
  TOR_CLAUSE_LIST_STYLE_ID,
  PAREN_DECIMAL_LIST_STYLE_ID,
  BULLET_BASIC_LIST_STYLE_ID,
] as const

export type FlowDocListStylePresetId = typeof FLOWDOC_LIST_STYLE_PRESET_IDS[number]

function decimalPatternForLevel(level: number): string {
  const pattern = Array.from({ length: level + 1 }, (_value, index) => `%${index + 1}`).join(".")
  return level === 0 ? `${pattern}.` : pattern
}

function cloneUnitValue(value: UnitValue): UnitValue {
  return { value: value.value, unit: value.unit }
}

export function cloneListStyleDefinition(style: ListStyleDefinition): ListStyleDefinition {
  return {
    id: style.id,
    levels: style.levels.map((level) => ({
      level: level.level,
      format: level.format,
      pattern: level.pattern,
      startAt: level.startAt,
      ...(level.restartAfterLevel != null ? { restartAfterLevel: level.restartAfterLevel } : {}),
      markerIndent: cloneUnitValue(level.markerIndent),
      textIndent: cloneUnitValue(level.textIndent),
      ...(level.tabStop ? { tabStop: cloneUnitValue(level.tabStop) } : {}),
    })),
  }
}

export const TOR_CLAUSE_LIST_STYLE: ListStyleDefinition = {
  id: TOR_CLAUSE_LIST_STYLE_ID,
  levels: Array.from({ length: LIST_LEVEL_COUNT }, (_value, level) => ({
    level,
    format: "decimal" as const,
    pattern: decimalPatternForLevel(level),
    startAt: 1,
    markerIndent: pt(level * 36),
    textIndent: pt((level + 1) * 36),
  })),
}

export const PAREN_DECIMAL_LIST_STYLE: ListStyleDefinition = {
  id: PAREN_DECIMAL_LIST_STYLE_ID,
  levels: [
    {
      level: 0,
      format: "decimal",
      pattern: "(%1)",
      startAt: 1,
      markerIndent: pt(72),
      textIndent: pt(108),
    },
  ],
}

export const BULLET_BASIC_LIST_STYLE: ListStyleDefinition = {
  id: BULLET_BASIC_LIST_STYLE_ID,
  levels: [
    {
      level: 0,
      format: "bullet",
      pattern: "•",
      startAt: 1,
      markerIndent: pt(72),
      textIndent: pt(108),
    },
  ],
}

export const FLOWDOC_LIST_STYLE_PRESETS: Record<FlowDocListStylePresetId, ListStyleDefinition> = {
  [TOR_CLAUSE_LIST_STYLE_ID]: TOR_CLAUSE_LIST_STYLE,
  [PAREN_DECIMAL_LIST_STYLE_ID]: PAREN_DECIMAL_LIST_STYLE,
  [BULLET_BASIC_LIST_STYLE_ID]: BULLET_BASIC_LIST_STYLE,
}

export function getListStylePreset(styleId: FlowDocListStylePresetId): ListStyleDefinition {
  return cloneListStyleDefinition(FLOWDOC_LIST_STYLE_PRESETS[styleId])
}

export function getAllListStylePresets(): Record<FlowDocListStylePresetId, ListStyleDefinition> {
  return {
    [TOR_CLAUSE_LIST_STYLE_ID]: getListStylePreset(TOR_CLAUSE_LIST_STYLE_ID),
    [PAREN_DECIMAL_LIST_STYLE_ID]: getListStylePreset(PAREN_DECIMAL_LIST_STYLE_ID),
    [BULLET_BASIC_LIST_STYLE_ID]: getListStylePreset(BULLET_BASIC_LIST_STYLE_ID),
  }
}

export function createListInstanceForPreset(
  id: string,
  styleId: FlowDocListStylePresetId,
  startAt?: number,
): ListInstance {
  return { id, styleId, ...(startAt != null ? { startAt } : {}) }
}
