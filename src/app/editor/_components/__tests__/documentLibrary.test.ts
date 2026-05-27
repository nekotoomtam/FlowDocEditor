import { describe, expect, it } from "vitest"
import { STORAGE_KEY } from "../documentPersistence"
import {
  DOCUMENT_PREPARE_HANDOFF_STORAGE_KEY,
  DOCUMENT_PREPARE_STEPS,
  createDocumentPrepareHandoff,
  clearDocumentPrepareHandoff,
  formatTemplateByteSize,
  getDocumentPrepareStep,
  parseDocumentPrepareHandoff,
  readDocumentPrepareHandoff,
  removeGeneratedDocumentBackups,
  storeActiveDocumentPackage,
  parseDocumentTemplateManifest,
  writeDocumentPrepareHandoff,
} from "../documentLibrary"

class MemoryStorage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe("documentLibrary", () => {
  it("parses valid manifest variants and skips invalid entries", () => {
    const manifest = parseDocumentTemplateManifest({
      generatedAt: "2026-05-27T00:00:00.000Z",
      variants: [
        {
          variant: "long",
          filename: "flowdoc-long-mock.flowdoc.json",
          id: "mock-long",
          title: "Long Mock",
          bytes: 2_559_022,
          bodyChildren: 701,
          nodeCount: 798,
          hasThaiText: true,
          questionTriples: 0,
        },
        {
          variant: "broken",
          title: "Missing filename",
        },
      ],
    })

    expect(manifest.generatedAt).toBe("2026-05-27T00:00:00.000Z")
    expect(manifest.variants).toHaveLength(1)
    expect(manifest.variants[0].variant).toBe("long")
  })

  it("rejects a manifest without valid templates", () => {
    expect(() => parseDocumentTemplateManifest({ variants: [] }))
      .toThrow("document template manifest has no valid templates")
  })

  it("formats template byte sizes for compact metadata", () => {
    expect(formatTemplateByteSize(2_559_022)).toBe("2.4 MB")
    expect(formatTemplateByteSize(12_000)).toBe("12 KB")
  })

  it("keeps prepare overlay steps grouped into large phases", () => {
    expect(DOCUMENT_PREPARE_STEPS.map((step) => step.id)).toEqual([
      "library-select",
      "library-fetch",
      "library-validate",
      "library-store",
      "library-open-editor",
      "editor-load-shell",
      "editor-start-session",
      "editor-build-layout",
      "editor-ready",
    ])
    expect(getDocumentPrepareStep("library-select")).toMatchObject({
      phaseIndex: 1,
      phaseTotal: 3,
    })
    expect(getDocumentPrepareStep("editor-build-layout")).toMatchObject({
      phaseIndex: 3,
      phaseTotal: 3,
    })

    for (const step of DOCUMENT_PREPARE_STEPS) {
      expect(step.phaseIndex).toBeGreaterThanOrEqual(1)
      expect(step.phaseIndex).toBeLessThanOrEqual(step.phaseTotal)
      expect(step.phaseTotal).toBe(3)
    }
  })

  it("keeps activity messages on the high-wait prepare phases", () => {
    const importantSteps = DOCUMENT_PREPARE_STEPS.filter((step) => (
      step.phaseIndex === 1 || step.phaseIndex === 3
    ))

    expect(importantSteps.length).toBeGreaterThan(0)
    for (const step of importantSteps) {
      expect(step.detailMessages?.length).toBeGreaterThanOrEqual(3)
    }
    expect(getDocumentPrepareStep("editor-build-layout").detailMessages)
      .toContain("The system is still working while the document layout is built.")
  })

  it("round-trips the library-to-editor prepare handoff", () => {
    const storage = new MemoryStorage()
    const handoff = createDocumentPrepareHandoff({
      variant: "stress",
      templateTitle: "Stress Mock",
      startedAt: 123,
    })

    writeDocumentPrepareHandoff(storage, handoff)

    expect(storage.getItem(DOCUMENT_PREPARE_HANDOFF_STORAGE_KEY)).toBe(JSON.stringify(handoff))
    expect(readDocumentPrepareHandoff(storage)).toEqual(handoff)
    expect(parseDocumentPrepareHandoff("not json")).toBeNull()

    clearDocumentPrepareHandoff(storage)

    expect(readDocumentPrepareHandoff(storage)).toBeNull()
  })

  it("removes generated backup copies without removing the active document", () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, "active")
    storage.setItem(`${STORAGE_KEY}_backup_library_long_2026-05-27`, "library backup")
    storage.setItem(`${STORAGE_KEY}_backup_codex_2026-05-27`, "loader backup")
    storage.setItem(`${STORAGE_KEY}_backup_latest`, "latest")
    storage.setItem("unrelated", "keep")

    removeGeneratedDocumentBackups(storage)

    expect(storage.getItem(STORAGE_KEY)).toBe("active")
    expect(storage.getItem("unrelated")).toBe("keep")
    expect(storage.getItem(`${STORAGE_KEY}_backup_library_long_2026-05-27`)).toBeNull()
    expect(storage.getItem(`${STORAGE_KEY}_backup_codex_2026-05-27`)).toBeNull()
    expect(storage.getItem(`${STORAGE_KEY}_backup_latest`)).toBeNull()
  })

  it("stores the active document without duplicating it into a backup key", () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, "previous")
    storage.setItem(`${STORAGE_KEY}_backup_library_stress_2026-05-27`, "previous")

    storeActiveDocumentPackage(storage, "next")

    expect(storage.getItem(STORAGE_KEY)).toBe("next")
    expect(storage.getItem(`${STORAGE_KEY}_backup_library_stress_2026-05-27`)).toBeNull()
  })
})
