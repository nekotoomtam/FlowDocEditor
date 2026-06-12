import { describe, expect, it } from "vitest"
import {
  getEditorAutosaveStatusSnapshot,
  resolveEditorAutosaveStatusChrome,
  setEditorAutosaveStatusSnapshot,
  subscribeEditorAutosaveStatus,
} from "../shell/editorAutosaveStatusStore"

describe("editor autosave status store", () => {
  it("resolves editor chrome labels without requiring EditorShell state", () => {
    expect(resolveEditorAutosaveStatusChrome(false, "saved")).toEqual({
      localSaveStatus: "saved",
      localSaveStatusLabel: "Saved",
      localSaveStatusTone: "success",
    })
    expect(resolveEditorAutosaveStatusChrome(false, "saving")).toEqual({
      localSaveStatus: "saving",
      localSaveStatusLabel: "Saving",
      localSaveStatusTone: "neutral",
    })
    expect(resolveEditorAutosaveStatusChrome(true, "saving")).toEqual({
      localSaveStatus: "saving",
      localSaveStatusLabel: "Test doc",
      localSaveStatusTone: "success",
    })
  })

  it("notifies bottom-bar subscribers only when the status changes", () => {
    setEditorAutosaveStatusSnapshot("saved")
    let notificationCount = 0
    const unsubscribe = subscribeEditorAutosaveStatus(() => {
      notificationCount += 1
    })

    setEditorAutosaveStatusSnapshot("saved")
    expect(notificationCount).toBe(0)

    setEditorAutosaveStatusSnapshot("saving")
    expect(getEditorAutosaveStatusSnapshot()).toBe("saving")
    expect(notificationCount).toBe(1)

    unsubscribe()
    setEditorAutosaveStatusSnapshot("saved")
    expect(notificationCount).toBe(1)
  })
})
