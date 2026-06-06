import { useState } from "react"
import { SAMPLE_FIELD_REGISTRY_V1 } from "@/app/_lib/fieldRegistry"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import { loadDocumentFromStorage } from "../documentPersistence"
import { WYSIWYG_PERF_TRACE_ENABLED } from "../wysiwygInlineEditConfig"
import { finishFlowDocPerfSpan, startWysiwygPerfSpan } from "../wysiwygPerformance"
import {
  createEmptyDataSnapshot,
  dataSnapshotFromDocumentParseResult,
  fieldRegistryFromDocumentParseResult,
} from "./editorDocumentDataState"

let dataSnapshotCreateInvocationId = 0
let fieldRegistryCreateInvocationId = 0

export function useEditorPackageDataState(hasInitialTestScenario: boolean) {
  const [dataSnapshot, setDataSnapshot] = useState<DataSnapshotV1>(() => {
    const invocationId = ++dataSnapshotCreateInvocationId
    const startedAt = startWysiwygPerfSpan()
    if (hasInitialTestScenario) {
      const snapshot = createEmptyDataSnapshot()
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:data-snapshot-create", startedAt, {
        invocationId,
        source: "test-scenario",
      })
      return snapshot
    }
    const result = loadDocumentFromStorage(localStorage)
    const snapshot = dataSnapshotFromDocumentParseResult(result)
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:data-snapshot-create", startedAt, {
      invocationId,
      source: result.ok ? result.source : result.reason,
    })
    return snapshot
  })

  const [packageFieldRegistry, setPackageFieldRegistry] = useState<FieldRegistryV1>(() => {
    const invocationId = ++fieldRegistryCreateInvocationId
    const startedAt = startWysiwygPerfSpan()
    if (hasInitialTestScenario) {
      finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:field-registry-create", startedAt, {
        invocationId,
        source: "test-scenario",
        fieldCount: SAMPLE_FIELD_REGISTRY_V1.fields.length,
      })
      return SAMPLE_FIELD_REGISTRY_V1
    }
    const result = loadDocumentFromStorage(localStorage)
    const registry = fieldRegistryFromDocumentParseResult(result)
    finishFlowDocPerfSpan(WYSIWYG_PERF_TRACE_ENABLED, "pre-pagination:field-registry-create", startedAt, {
      invocationId,
      source: result.ok ? result.source : result.reason,
      fieldCount: registry.fields.length,
    })
    return registry
  })

  return {
    dataSnapshot,
    setDataSnapshot,
    packageFieldRegistry,
    setPackageFieldRegistry,
  }
}
