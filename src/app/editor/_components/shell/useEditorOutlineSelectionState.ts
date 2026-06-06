import { useEffect, useMemo, useState } from "react"
import { resolveParagraphListContext } from "@/document"
import type { DocumentNode } from "@/schema"
import type { StyleManagerResourceSelection } from "../StyleManagerPanel"
import { OUTLINE_SELECTION_IDLE_TIMEOUT_MS } from "./editorShellConstants"

export function useEditorOutlineSelectionState({
  doc,
  selectedNodeId,
  selectedStyleResource,
  frozen,
}: {
  doc: DocumentNode
  selectedNodeId: string | null
  selectedStyleResource: StyleManagerResourceSelection
  frozen: boolean
}) {
  const selectedParagraphListContext = useMemo(() => (
    resolveParagraphListContext(doc, selectedNodeId)
  ), [doc, selectedNodeId])
  const activeOutlineListGroupId = selectedStyleResource?.kind === "list-group"
    ? selectedStyleResource.id
    : selectedParagraphListContext?.instanceId ?? null
  const [outlineSelectionState, setOutlineSelectionState] = useState(() => ({
    selectedNodeId,
    activeListGroupId: activeOutlineListGroupId,
  }))

  useEffect(() => {
    if (frozen) return
    let frameId: number | null = null
    let idleId: number | null = null
    let timeoutId: number | null = null

    const syncOutlineSelection = () => {
      setOutlineSelectionState((current) => {
        if (
          current.selectedNodeId === selectedNodeId &&
          current.activeListGroupId === activeOutlineListGroupId
        ) {
          return current
        }
        return {
          selectedNodeId,
          activeListGroupId: activeOutlineListGroupId,
        }
      })
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => {
          idleId = null
          syncOutlineSelection()
        }, { timeout: OUTLINE_SELECTION_IDLE_TIMEOUT_MS })
        return
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = null
        syncOutlineSelection()
      }, OUTLINE_SELECTION_IDLE_TIMEOUT_MS)
    })

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [activeOutlineListGroupId, frozen, selectedNodeId])

  return {
    selectedParagraphListContext,
    activeOutlineListGroupId,
    outlineSelectionState,
  }
}
