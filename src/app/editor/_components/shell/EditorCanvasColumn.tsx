import { Profiler, useCallback, type CSSProperties, type ProfilerOnRenderCallback, type ReactNode } from "react"
import { recordFlowDocPerfEvent } from "../wysiwygPerformance"
import {
  EditorCanvasBottomBar,
  type EditorCanvasBottomBarProps,
} from "./EditorCanvasBottomBar"

interface EditorCanvasColumnProps extends EditorCanvasBottomBarProps {
  children: ReactNode
  perfTraceActive?: boolean
}

const editorCanvasColumnStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  position: "relative",
  background: "#f3f4f6",
  overflow: "hidden",
}

const editorCanvasViewportSlotStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  overflow: "hidden",
}

export function EditorCanvasColumn({
  children,
  perfTraceActive = false,
  ...bottomBarProps
}: EditorCanvasColumnProps) {
  const handleBottomBarRender = useCallback<ProfilerOnRenderCallback>((
    profilerId,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  ) => {
    recordFlowDocPerfEvent(false, {
      name: "react:subtree-commit",
      startMs: startTime,
      durationMs: Math.max(0, actualDuration),
      detail: {
        id: profilerId,
        source: phase,
        baseDurationMs: Math.max(0, baseDuration),
        commitTime,
      },
    })
  }, [])

  return (
    <div data-testid="editor-canvas-column" style={editorCanvasColumnStyle}>
      <div style={editorCanvasViewportSlotStyle}>
        {children}
      </div>
      {perfTraceActive ? (
        <Profiler id="canvas-bottom-bar" onRender={handleBottomBarRender}>
          <EditorCanvasBottomBar {...bottomBarProps} />
        </Profiler>
      ) : (
        <EditorCanvasBottomBar {...bottomBarProps} />
      )}
    </div>
  )
}
