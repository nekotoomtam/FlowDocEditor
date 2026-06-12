import { useSyncExternalStore } from "react"

export type LocalSaveStatus = "saved" | "saving"
export type AutosaveStatusTone = "neutral" | "success"

const editorAutosaveStatusListeners = new Set<() => void>()
let editorAutosaveStatusSnapshot: LocalSaveStatus = "saved"

export function getEditorAutosaveStatusSnapshot(): LocalSaveStatus {
  return editorAutosaveStatusSnapshot
}

export function subscribeEditorAutosaveStatus(listener: () => void): () => void {
  editorAutosaveStatusListeners.add(listener)
  return () => {
    editorAutosaveStatusListeners.delete(listener)
  }
}

export function setEditorAutosaveStatusSnapshot(status: LocalSaveStatus): void {
  if (editorAutosaveStatusSnapshot === status) return
  editorAutosaveStatusSnapshot = status
  for (const listener of editorAutosaveStatusListeners) {
    listener()
  }
}

export function resolveEditorAutosaveStatusChrome(
  disabled: boolean,
  status: LocalSaveStatus,
): {
  localSaveStatus: LocalSaveStatus
  localSaveStatusLabel: string
  localSaveStatusTone: AutosaveStatusTone
} {
  if (disabled) {
    return {
      localSaveStatus: status,
      localSaveStatusLabel: "Test doc",
      localSaveStatusTone: "success",
    }
  }

  return {
    localSaveStatus: status,
    localSaveStatusLabel: status === "saving" ? "Saving" : "Saved",
    localSaveStatusTone: status === "saved" ? "success" : "neutral",
  }
}

export function useEditorAutosaveStatus(disabled: boolean) {
  const localSaveStatus = useSyncExternalStore(
    subscribeEditorAutosaveStatus,
    getEditorAutosaveStatusSnapshot,
    getEditorAutosaveStatusSnapshot,
  )
  return resolveEditorAutosaveStatusChrome(disabled, localSaveStatus)
}
