import { useEffect, useRef, useState } from "react"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"
import { saveToStorage } from "./editorDocumentDataState"

type LocalSaveStatus = "saved" | "saving"

interface UseEditorAutosaveInput {
  disabled: boolean
  doc: DocumentNode
  dataSnapshot: DataSnapshotV1
  packageFieldRegistry: FieldRegistryV1
  packageFieldRegistryRef: { current: FieldRegistryV1 }
  dataSnapshotRef: { current: DataSnapshotV1 }
  wysiwygTextSessionDirtyVersion: number
  wysiwygTextSessionNodeId: string | null
  getPersistableDocumentSnapshot: () => DocumentNode
}

export function useEditorAutosave({
  disabled,
  doc,
  dataSnapshot,
  packageFieldRegistry,
  packageFieldRegistryRef,
  dataSnapshotRef,
  wysiwygTextSessionDirtyVersion,
  wysiwygTextSessionNodeId,
  getPersistableDocumentSnapshot,
}: UseEditorAutosaveInput) {
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>("saved")
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (disabled) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setLocalSaveStatus("saving")
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(getPersistableDocumentSnapshot(), packageFieldRegistry, dataSnapshot)
      saveTimeoutRef.current = null
      setLocalSaveStatus("saved")
    }, 500)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [
    dataSnapshot,
    disabled,
    doc,
    getPersistableDocumentSnapshot,
    packageFieldRegistry,
    wysiwygTextSessionDirtyVersion,
    wysiwygTextSessionNodeId,
  ])

  useEffect(() => {
    if (disabled) return
    const flushDraftToStorage = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      saveToStorage(getPersistableDocumentSnapshot(), packageFieldRegistryRef.current, dataSnapshotRef.current)
      setLocalSaveStatus("saved")
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushDraftToStorage()
    }
    window.addEventListener("pagehide", flushDraftToStorage)
    document.addEventListener("visibilitychange", flushWhenHidden)
    return () => {
      window.removeEventListener("pagehide", flushDraftToStorage)
      document.removeEventListener("visibilitychange", flushWhenHidden)
    }
  }, [disabled, getPersistableDocumentSnapshot, packageFieldRegistryRef, dataSnapshotRef])

  return {
    localSaveStatus,
    localSaveStatusLabel: disabled
      ? "Test doc"
      : localSaveStatus === "saving"
        ? "Saving"
        : "Saved",
    localSaveStatusTone: localSaveStatus === "saved" ? "success" as const : "neutral" as const,
  }
}
