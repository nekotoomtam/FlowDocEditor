import type {
  DocumentNode,
  DocumentSection,
  FlowTableNode,
  ListLevelDefinition,
  ListMarkerFormat,
  ParagraphNode,
} from "../schema"

export interface ResolvedListMarker {
  paragraphId: string
  instanceId: string
  styleId: string
  itemId: string
  level: number
  ordinal: number
  markerText: string
}

type CounterState = number[]

const THAI_LETTERS = [
  "ก", "ข", "ค", "ง", "จ", "ฉ", "ช", "ซ", "ฌ", "ญ",
  "ฎ", "ฏ", "ฐ", "ฑ", "ฒ", "ณ", "ด", "ต", "ถ", "ท",
  "ธ", "น", "บ", "ป", "ผ", "ฝ", "พ", "ฟ", "ภ", "ม",
  "ย", "ร", "ล", "ว", "ศ", "ษ", "ส", "ห", "ฬ", "อ", "ฮ",
]

function orderedBodyParagraphs(section: DocumentSection): ParagraphNode[] {
  const paragraphs: ParagraphNode[] = []
  const visit = (nodeId: string): void => {
    const node = section.nodes[nodeId]
    if (!node) return
    if (node.type === "paragraph") {
      paragraphs.push(node)
      return
    }
    if (node.type === "flow-table") {
      visitFlowTable(node as unknown as FlowTableNode)
      return
    }
    if ("childIds" in node) node.childIds.forEach(visit)
  }

  const visitFlowTable = (table: FlowTableNode): void => {
    table.rowIds.forEach((rowId) => {
      const row = table.nodes[rowId]
      if (row?.type !== "flow-table-row") return
      row.cellIds.forEach((cellId) => {
        const cell = table.nodes[cellId]
        if (cell?.type !== "flow-table-cell") return
        cell.childIds.forEach((childId) => {
          const child = table.nodes[childId]
          if (child?.type === "paragraph") paragraphs.push(child)
        })
      })
    })
  }

  visit(section.bodyRootId)
  return paragraphs
}

function levelByIndex(levels: ListLevelDefinition[], levelIndex: number): ListLevelDefinition | undefined {
  return levels.find((level) => level.level === levelIndex)
}

function formatAlphabetic(value: number, alphabet: string[]): string {
  if (value <= 0 || alphabet.length === 0) return String(value)
  let remaining = value
  let output = ""
  while (remaining > 0) {
    remaining -= 1
    output = alphabet[remaining % alphabet.length] + output
    remaining = Math.floor(remaining / alphabet.length)
  }
  return output
}

function formatRoman(value: number): string {
  if (value <= 0 || value >= 4000) return String(value)
  const pairs: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ]
  let remaining = value
  let output = ""
  for (const [amount, label] of pairs) {
    while (remaining >= amount) {
      output += label
      remaining -= amount
    }
  }
  return output
}

function formatOrdinal(value: number, format: ListMarkerFormat): string {
  switch (format) {
    case "lowerLetter":
      return formatAlphabetic(value, "abcdefghijklmnopqrstuvwxyz".split(""))
    case "upperLetter":
      return formatAlphabetic(value, "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""))
    case "thaiLetter":
      return formatAlphabetic(value, THAI_LETTERS)
    case "lowerRoman":
      return formatRoman(value).toLowerCase()
    case "upperRoman":
      return formatRoman(value)
    case "decimal":
    case "bullet":
    case "custom":
    default:
      return String(value)
  }
}

function renderMarkerText(level: ListLevelDefinition, levels: ListLevelDefinition[], counters: CounterState): string {
  if (!level.pattern.includes("%")) return level.pattern
  return level.pattern.replace(/%([1-8])/g, (_match, rawIndex: string) => {
    const levelIndex = Number(rawIndex) - 1
    const referencedLevel = levelByIndex(levels, levelIndex)
    const value = counters[levelIndex] || referencedLevel?.startAt || 1
    return formatOrdinal(value, referencedLevel?.format ?? "decimal")
  })
}

function ensureParentCounters(levels: ListLevelDefinition[], counters: CounterState, level: number): void {
  for (let index = 0; index < level; index++) {
    if (counters[index] > 0) continue
    counters[index] = levelByIndex(levels, index)?.startAt ?? 1
  }
}

function resetDeeperCounters(counters: CounterState, level: number): void {
  for (let index = level + 1; index < counters.length; index++) {
    counters[index] = 0
  }
}

export function resolveListMarkers(doc: DocumentNode): Map<string, ResolvedListMarker> {
  const markers = new Map<string, ResolvedListMarker>()
  const styles = doc.document.listStyles ?? {}
  const instances = doc.document.listInstances ?? {}
  const countersByInstance = new Map<string, CounterState>()

  const paragraphs = doc.document.sections.flatMap(orderedBodyParagraphs)
  for (const paragraph of paragraphs) {
    const list = paragraph.props.list
    if (!list) continue
    const instance = instances[list.instanceId]
    const style = instance ? styles[instance.styleId] : undefined
    const level = style ? levelByIndex(style.levels, list.level) : undefined
    if (!instance || !style || !level) continue

    const counters = countersByInstance.get(instance.id) ?? Array.from({ length: 8 }, () => 0)
    ensureParentCounters(style.levels, counters, list.level)
    counters[list.level] = list.startAt ?? (counters[list.level] > 0 ? counters[list.level] + 1 : level.startAt)
    resetDeeperCounters(counters, list.level)
    countersByInstance.set(instance.id, counters)

    markers.set(paragraph.id, {
      paragraphId: paragraph.id,
      instanceId: instance.id,
      styleId: style.id,
      itemId: list.itemId,
      level: list.level,
      ordinal: counters[list.level],
      markerText: renderMarkerText(level, style.levels, counters),
    })
  }

  return markers
}
