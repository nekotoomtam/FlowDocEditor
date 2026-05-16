import type { CSSProperties, ReactNode } from "react"

export function RightRailPanelHeader({
  title,
  action,
  testId,
}: {
  title: string
  action?: ReactNode
  testId?: string
}) {
  return (
    <div data-testid={testId} style={rightRailPanelHeader}>
      <span style={rightRailPanelHeaderTitle}>{title}</span>
      {action && <div style={rightRailPanelHeaderAction}>{action}</div>}
    </div>
  )
}

export const rightRailPanelShell: CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "#fff",
}

export const rightRailPanelBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: 12,
  scrollbarWidth: "thin",
  scrollbarColor: "#cbd5e1 transparent",
  overscrollBehavior: "contain",
}

const rightRailPanelHeader: CSSProperties = {
  position: "relative",
  flexShrink: 0,
  minHeight: 42,
  padding: "0 14px",
  borderBottom: "1px solid #e5e7eb",
  color: "#94a3b8",
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: "uppercase",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
}

const rightRailPanelHeaderTitle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const rightRailPanelHeaderAction: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
}
