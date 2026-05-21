export interface ShortcutKeyboardEvent {
  key: string
  code?: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export type NormalizedShortcutKey =
  | "+"
  | "-"
  | "0"
  | "c"
  | "v"
  | "x"
  | "y"
  | "z"

const SUPPORTED_PHYSICAL_KEY_CODES: Record<string, NormalizedShortcutKey> = {
  Digit0: "0",
  Equal: "+",
  KeyC: "c",
  KeyV: "v",
  KeyX: "x",
  KeyY: "y",
  KeyZ: "z",
  Minus: "-",
  Numpad0: "0",
  NumpadAdd: "+",
  NumpadSubtract: "-",
}

const SUPPORTED_KEY_VALUES = new Set<NormalizedShortcutKey>(["+", "-", "0", "c", "v", "x", "y", "z"])

export function hasPlatformShortcutModifier(event: ShortcutKeyboardEvent): boolean {
  return !event.altKey && (event.ctrlKey === true || event.metaKey === true)
}

export function normalizeShortcutKey(event: ShortcutKeyboardEvent): NormalizedShortcutKey | null {
  if (event.code) {
    const physicalKey = SUPPORTED_PHYSICAL_KEY_CODES[event.code]
    if (physicalKey) return physicalKey
  }

  const key = event.key.toLowerCase()
  if (key === "=") return "+"
  return SUPPORTED_KEY_VALUES.has(key as NormalizedShortcutKey)
    ? key as NormalizedShortcutKey
    : null
}
