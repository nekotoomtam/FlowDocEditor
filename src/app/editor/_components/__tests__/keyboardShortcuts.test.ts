import { describe, expect, it } from "vitest"
import { hasPlatformShortcutModifier, normalizeShortcutKey } from "../keyboardShortcuts"

describe("keyboard shortcut normalization", () => {
  it("uses physical key codes so shortcuts survive non-Latin keyboard layouts", () => {
    expect(normalizeShortcutKey({ key: "ผ", code: "KeyZ", ctrlKey: true })).toBe("z")
    expect(normalizeShortcutKey({ key: "แ", code: "KeyC", ctrlKey: true })).toBe("c")
    expect(normalizeShortcutKey({ key: "อ", code: "KeyV", ctrlKey: true })).toBe("v")
    expect(normalizeShortcutKey({ key: "ไ", code: "KeyX", ctrlKey: true })).toBe("x")
  })

  it("keeps zoom shortcuts layout-independent", () => {
    expect(normalizeShortcutKey({ key: "๐", code: "Digit0", ctrlKey: true })).toBe("0")
    expect(normalizeShortcutKey({ key: "_", code: "Minus", ctrlKey: true })).toBe("-")
    expect(normalizeShortcutKey({ key: "=", code: "Equal", ctrlKey: true })).toBe("+")
    expect(normalizeShortcutKey({ key: "+", code: "NumpadAdd", ctrlKey: true })).toBe("+")
  })

  it("falls back to key values when code is unavailable", () => {
    expect(normalizeShortcutKey({ key: "z", ctrlKey: true })).toBe("z")
    expect(normalizeShortcutKey({ key: "=", ctrlKey: true })).toBe("+")
    expect(normalizeShortcutKey({ key: "Escape", ctrlKey: true })).toBeNull()
  })

  it("requires Ctrl or Meta and rejects Alt-modified shortcut chords", () => {
    expect(hasPlatformShortcutModifier({ key: "z", code: "KeyZ", ctrlKey: true })).toBe(true)
    expect(hasPlatformShortcutModifier({ key: "z", code: "KeyZ", metaKey: true })).toBe(true)
    expect(hasPlatformShortcutModifier({ key: "z", code: "KeyZ", ctrlKey: true, altKey: true })).toBe(false)
    expect(hasPlatformShortcutModifier({ key: "z", code: "KeyZ" })).toBe(false)
  })
})
