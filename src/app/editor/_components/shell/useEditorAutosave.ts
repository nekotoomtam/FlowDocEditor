import { useEffect, useRef } from "react"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"
import { saveToStorage } from "./editorDocumentDataState"
import { setEditorAutosaveStatusSnapshot } from "./editorAutosaveStatusStore"

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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (disabled) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setEditorAutosaveStatusSnapshot("saving")
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(getPersistableDocumentSnapshot(), packageFieldRegistry, dataSnapshot)
      saveTimeoutRef.current = null
      setEditorAutosaveStatusSnapshot("saved")
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
      setEditorAutosaveStatusSnapshot("saved")
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

  return null
}
