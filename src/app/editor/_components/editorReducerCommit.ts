import { assertDocument, normalizeDocument } from "@/document"
import type { DocumentNode } from "@/schema"
import { WYSIWYG_PERF_TRACE_ENABLED } from "./wysiwygInlineEditConfig"
import { finishWysiwygPerfSpan, startWysiwygPerfSpan } from "./wysiwygPerformance"
import type { EditorState, HistoryEntry } from "./editorReducer"

export const MAX_HISTORY = 50

export type StructuralReducerAttribution = {
  operation: "split" | "merge"
  nodeId: string
  previousNodeId?: string | null
  sourceNodeId?: string | null
  reducerPath?: string
}

export function finishStructuralReducerAttribution(
  attribution: StructuralReducerAttribution | undefined,
  action: string,
  startedAt: number,
  metadata: Record<string, unknown> = {},
): void {
  if (!attribution) return
  finishWysiwygPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "flowdoc-structural-attribution", startedAt, {
    nodeId: attribution.nodeId,
    previousNodeId: attribution.previousNodeId,
    sourceNodeId: attribution.sourceNodeId,
    operation: attribution.operation,
    action,
    reducerPath: attribution.reducerPath,
    ...metadata,
  })
}

export function pushDoc(
  state: EditorState,
  newDoc: DocumentNode,
  history?: HistoryEntry,
  attribution?: StructuralReducerAttribution,
): EditorState {
  const pushStartedAt = startWysiwygPerfSpan()
  const normalizeStartedAt = startWysiwygPerfSpan()
  const normalizedDoc = normalizeDocument(newDoc)
  finishStructuralReducerAttribution(attribution, "normalize", normalizeStartedAt, {
    validationMode: "full",
  })
  const assertStartedAt = startWysiwygPerfSpan()
  try {
    assertDocument(normalizedDoc)
    finishStructuralReducerAttribution(attribution, "assert-document", assertStartedAt, {
      validationMode: "full",
      active: true,
    })
  } catch (error) {
    finishStructuralReducerAttribution(attribution, "assert-document", assertStartedAt, {
      validationMode: "full",
      active: false,
    })
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  const nextState = {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), history ?? { doc: state.doc, paginated: state.paginated }],
    doc: normalizedDoc,
    future: [],
  }
  finishStructuralReducerAttribution(attribution, "push-doc", pushStartedAt, {
    validationMode: "full",
    active: true,
  })
  return nextState
}

export function pushPrevalidatedDoc(
  state: EditorState,
  newDoc: DocumentNode,
  history?: HistoryEntry,
  attribution?: StructuralReducerAttribution,
): EditorState {
  const startedAt = startWysiwygPerfSpan()
  const nextState = {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), history ?? { doc: state.doc, paginated: state.paginated }],
    doc: newDoc,
    future: [],
  }
  finishStructuralReducerAttribution(attribution, "push-prevalidated-doc", startedAt, {
    validationMode: "prevalidated",
    active: true,
  })
  return nextState
}

export function setDocWithoutHistory(state: EditorState, newDoc: DocumentNode): EditorState {
  const normalizedDoc = normalizeDocument(newDoc)
  try {
    assertDocument(normalizedDoc)
  } catch (error) {
    console.error("document operation produced invalid document:", error)
    return { ...state, drag: null }
  }
  return { ...state, doc: normalizedDoc }
}
