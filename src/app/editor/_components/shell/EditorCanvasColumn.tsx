import type { CSSProperties, ReactNode } from "react"
import {
  EditorCanvasBottomBar,
  type EditorCanvasBottomBarProps,
} from "./EditorCanvasBottomBar"

interface EditorCanvasColumnProps extends EditorCanvasBottomBarProps {
  children: ReactNode
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
  ...bottomBarProps
}: EditorCanvasColumnProps) {
  return (
    <div data-testid="editor-canvas-column" style={editorCanvasColumnStyle}>
      <div style={editorCanvasViewportSlotStyle}>
        {children}
      </div>
      <EditorCanvasBottomBar {...bottomBarProps} />
    </div>
  )
}
