import { useEffect, useState } from "react"
import type { DocumentNode } from "@/schema"
import type { StyleManagerResourceSelection } from "../StyleManagerPanel"
import type { RightRailMode } from "./editorShellTypes"

export function useEditorSelectedStyleResource(
  doc: DocumentNode,
  setRightRailMode: (mode: RightRailMode) => void,
) {
  const [selectedStyleResource, setSelectedStyleResource] = useState<StyleManagerResourceSelection>(null)

  useEffect(() => {
    if (!selectedStyleResource) return
    const exists = selectedStyleResource.kind === "paragraph-style"
      ? Boolean(doc.document.styles?.paragraphStyles?.[selectedStyleResource.id])
      : selectedStyleResource.kind === "list-style"
        ? Boolean(doc.document.listStyles?.[selectedStyleResource.id])
        : Boolean(doc.document.listInstances?.[selectedStyleResource.id])
    if (exists) return
    setSelectedStyleResource(null)
    setRightRailMode("page")
  }, [doc, selectedStyleResource, setRightRailMode])

  return {
    selectedStyleResource,
    setSelectedStyleResource,
  }
}
