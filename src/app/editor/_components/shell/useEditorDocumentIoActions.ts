import { useCallback, type ChangeEvent, type Dispatch, type SetStateAction } from "react"
import { SAMPLE_FIELD_REGISTRY_V1 } from "@/app/_lib/fieldRegistry"
import { createDefaultDocument } from "@/document"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { DocumentNode } from "@/schema"
import {
  documentImportSuccessMessage,
  documentParseFailureMessage,
  type DocumentParseResult,
} from "../documentPersistence"
import { createEditorPreviewPlaceholderLayoutState } from "../editorPreviewLayoutStatus"
import type { EditorPartialPreviewPaginated } from "../editorPreviewDisplay"
import type { EditorAction } from "../editorReducer"
import type { StyleManagerResourceSelection } from "../StyleManagerPanel"
import {
  createEmptyDataSnapshot,
  dataSnapshotFromDocumentParseResult,
  fieldRegistryFromDocumentParseResult,
} from "./editorDocumentDataState"
import { downloadDocumentJsonPackage, readPersistedDocumentFile } from "./editorDocumentJsonIo"
import type { EditorDocumentIoStatus } from "./editorShellTypes"

interface UseEditorDocumentIoActionsInput {
  dataSnapshot: DataSnapshotV1
  packageFieldRegistry: FieldRegistryV1
  docRef: { current: DocumentNode }
  finalizeInlineEditBeforeAction: () => boolean
  resetInlineEditStateForDocumentReplace: () => void
  clearWysiwygDraftPagination: () => void
  endWysiwygTextSession: () => void
  setSelectedStyleResource: Dispatch<SetStateAction<StyleManagerResourceSelection>>
  setPackageFieldRegistry: Dispatch<SetStateAction<FieldRegistryV1>>
  setDataSnapshot: Dispatch<SetStateAction<DataSnapshotV1>>
  setPartialPreviewPaginated: Dispatch<SetStateAction<EditorPartialPreviewPaginated | null>>
  setBrowserPreviewLayout: Dispatch<SetStateAction<ReturnType<typeof createEditorPreviewPlaceholderLayoutState>>>
  dispatch: Dispatch<EditorAction>
  setDocumentIoStatus: Dispatch<SetStateAction<EditorDocumentIoStatus | null>>
}

export function useEditorDocumentIoActions({
  dataSnapshot,
  packageFieldRegistry,
  docRef,
  finalizeInlineEditBeforeAction,
  resetInlineEditStateForDocumentReplace,
  clearWysiwygDraftPagination,
  endWysiwygTextSession,
  setSelectedStyleResource,
  setPackageFieldRegistry,
  setDataSnapshot,
  setPartialPreviewPaginated,
  setBrowserPreviewLayout,
  dispatch,
  setDocumentIoStatus,
}: UseEditorDocumentIoActionsInput) {
  const handleExportJson = useCallback(() => {
    finalizeInlineEditBeforeAction()
    downloadDocumentJsonPackage(docRef.current, packageFieldRegistry, dataSnapshot)
    setDocumentIoStatus({ type: "info", message: "Saved FlowDoc package v2 JSON." })
  }, [dataSnapshot, docRef, finalizeInlineEditBeforeAction, packageFieldRegistry, setDocumentIoStatus])

  const replaceDocumentFromParseResult = useCallback((
    result: DocumentParseResult,
    successMessage: (result: Extract<DocumentParseResult, { ok: true }>) => string,
  ): boolean => {
    if (!result.ok) {
      setDocumentIoStatus({ type: "error", message: documentParseFailureMessage(result.reason) })
      return false
    }

    const doc = result.doc
    resetInlineEditStateForDocumentReplace()
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    setSelectedStyleResource(null)
    setPackageFieldRegistry(fieldRegistryFromDocumentParseResult(result))
    setDataSnapshot(dataSnapshotFromDocumentParseResult(result))
    setPartialPreviewPaginated(null)
    setBrowserPreviewLayout(createEditorPreviewPlaceholderLayoutState())
    dispatch({ type: "LOAD_DOCUMENT", doc })
    setDocumentIoStatus({ type: "info", message: successMessage(result) })
    return true
  }, [
    clearWysiwygDraftPagination,
    dispatch,
    endWysiwygTextSession,
    resetInlineEditStateForDocumentReplace,
    setBrowserPreviewLayout,
    setDataSnapshot,
    setDocumentIoStatus,
    setPackageFieldRegistry,
    setPartialPreviewPaginated,
    setSelectedStyleResource,
  ])

  const handleImportJson = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setDocumentIoStatus(null)
    readPersistedDocumentFile(
      file,
      (result) => replaceDocumentFromParseResult(result, (okResult) => documentImportSuccessMessage(okResult.source, okResult.fieldRegistryIssues)),
      () => setDocumentIoStatus({ type: "error", message: "Could not read this file." }),
    )
    event.target.value = ""
  }, [replaceDocumentFromParseResult, setDocumentIoStatus])

  const handleNewDocument = useCallback(() => {
    if (!confirm("สร้างเอกสารใหม่? history จะถูกล้าง")) return
    const doc = createDefaultDocument("Untitled")
    resetInlineEditStateForDocumentReplace()
    clearWysiwygDraftPagination()
    endWysiwygTextSession()
    setSelectedStyleResource(null)
    setPackageFieldRegistry(SAMPLE_FIELD_REGISTRY_V1)
    setDataSnapshot(createEmptyDataSnapshot())
    setPartialPreviewPaginated(null)
    setBrowserPreviewLayout(createEditorPreviewPlaceholderLayoutState())
    dispatch({ type: "LOAD_DOCUMENT", doc })
  }, [
    clearWysiwygDraftPagination,
    dispatch,
    endWysiwygTextSession,
    resetInlineEditStateForDocumentReplace,
    setBrowserPreviewLayout,
    setDataSnapshot,
    setPackageFieldRegistry,
    setPartialPreviewPaginated,
    setSelectedStyleResource,
  ])

  return {
    handleExportJson,
    handleImportJson,
    handleNewDocument,
    replaceDocumentFromParseResult,
  }
}
