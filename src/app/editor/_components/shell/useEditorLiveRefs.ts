import { useEffect, useLayoutEffect, useRef } from "react"
import type { DataSnapshotV1 } from "@/dataSnapshot"
import type { FieldRegistryV1 } from "@/fieldRegistry"
import type { PaginatedDocument } from "@/pagination"
import type { DocumentNode } from "@/schema"
import { summarizePaginatedForWysiwygPerf } from "../wysiwygPerformance"

export function useEditorLiveRefs({
  doc,
  packageFieldRegistry,
  dataSnapshot,
  paginated,
}: {
  doc: DocumentNode
  packageFieldRegistry: FieldRegistryV1
  dataSnapshot: DataSnapshotV1
  paginated: PaginatedDocument
}) {
  const docRef = useRef(doc)
  const packageFieldRegistryRef = useRef(packageFieldRegistry)
  const dataSnapshotRef = useRef(dataSnapshot)
  const paginatedRef = useRef(paginated)
  const paginatedPerfSummaryRef = useRef(summarizePaginatedForWysiwygPerf(paginated))

  useLayoutEffect(() => { docRef.current = doc }, [doc])
  useEffect(() => { packageFieldRegistryRef.current = packageFieldRegistry }, [packageFieldRegistry])
  useEffect(() => { dataSnapshotRef.current = dataSnapshot }, [dataSnapshot])
  useLayoutEffect(() => {
    paginatedRef.current = paginated
    paginatedPerfSummaryRef.current = summarizePaginatedForWysiwygPerf(paginated)
  }, [paginated])

  return {
    docRef,
    packageFieldRegistryRef,
    dataSnapshotRef,
    paginatedRef,
    paginatedPerfSummaryRef,
  }
}
