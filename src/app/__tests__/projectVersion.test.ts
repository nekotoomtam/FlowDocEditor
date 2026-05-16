import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CURRENT_PACKAGE_VERSION, CURRENT_STORAGE_PACKAGE_VERSION } from "../editor/_components/documentPersistence"

const PROJECT_VERSION = "0.5.2"

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as Record<string, unknown>
}

describe("project version marker", () => {
  it("keeps root package files aligned to the accepted 0.5.2 baseline", () => {
    const pkg = readJson("package.json")
    const lock = readJson("package-lock.json")
    const lockPackages = lock["packages"] as Record<string, Record<string, unknown>>

    expect(pkg["version"]).toBe(PROJECT_VERSION)
    expect(lock["version"]).toBe(PROJECT_VERSION)
    expect(lockPackages[""]["version"]).toBe(PROJECT_VERSION)
  })

  it("does not treat the project release marker as a persisted package-version bump", () => {
    expect(CURRENT_PACKAGE_VERSION).toBe(2)
    expect(CURRENT_STORAGE_PACKAGE_VERSION).toBe(2)
  })
})
