import { memo } from "react"
import { EditorCanvas } from "./EditorCanvas"
import type { ComponentProps } from "react"
import { FlowdocDraftEditorIslandRoot } from "./FlowdocDraftEditorIslandRoot"
import { useEditorStructuralIslandStore } from "./shell/editorStructuralIslandStore"
import { useEditorStructuralIslandController } from "./shell/useEditorStructuralIslandController"

export const EditorCanvasStructuralIslandWrapper = memo(function EditorCanvasStructuralIslandWrapper(props: {
  canvasProps: Omit<ComponentProps<typeof EditorCanvas>, "suppressedCanvasTextNodeIds" | "activeOutOfCanvasStructuralIsland" | "handleOptimisticStructuralRefocusPainted">
  controllerProps: Parameters<typeof useEditorStructuralIslandController>[0]
  islandProps: Omit<ComponentProps<typeof FlowdocDraftEditorIslandRoot>, "active" | "nodeId" | "paragraph" | "fragment" | "pageKey" | "pages" | "onStructuralRefocusPainted" | "structuralRefocusStartedAt">
}) {
  const {
    activeOutOfCanvasStructuralIsland,
    flowdocDraftEditorIslandConfig,
    handleOptimisticStructuralRefocusPainted,
    suppressedCanvasTextNodeIds,
  } = useEditorStructuralIslandController(props.controllerProps)

  const { optimisticStructuralRefocusPaint } = useEditorStructuralIslandStore()

  return (
    <>
      <EditorCanvas
        {...props.canvasProps}
        suppressedCanvasTextNodeIds={suppressedCanvasTextNodeIds}
        activeOutOfCanvasStructuralIsland={activeOutOfCanvasStructuralIsland}
      />
      {flowdocDraftEditorIslandConfig ? (
        <FlowdocDraftEditorIslandRoot
          {...props.islandProps}
          key={flowdocDraftEditorIslandConfig.nodeId}
          active
          nodeId={flowdocDraftEditorIslandConfig.nodeId}
          paragraph={flowdocDraftEditorIslandConfig.paragraph}
          fragment={flowdocDraftEditorIslandConfig.fragment}
          pageKey={flowdocDraftEditorIslandConfig.pageKey}
          pages={flowdocDraftEditorIslandConfig.pages}
          onStructuralRefocusPainted={handleOptimisticStructuralRefocusPainted}
          structuralRefocusStartedAt={optimisticStructuralRefocusPaint?.nodeId === flowdocDraftEditorIslandConfig.nodeId
            ? optimisticStructuralRefocusPaint.startedAt
            : null}
        />
      ) : null}
    </>
  )
})
