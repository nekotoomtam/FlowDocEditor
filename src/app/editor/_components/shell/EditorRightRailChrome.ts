import type * as React from "react"

export const rightRailSidebarStyle = (collapsed: boolean): React.CSSProperties => ({
  width: 36,
  flexShrink: 0,
  borderRight: collapsed ? "none" : "1px solid #e5e7eb",
  background: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 5,
  padding: "8px 0 8px 3px",
  position: "relative",
  zIndex: 2,
})

export const rightRailBookmarkGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
}

export const rightRailBookmarkButton = (active: boolean, height = 28, fontSize = 11): React.CSSProperties => ({
  width: active ? "calc(100% + 7px)" : "100%",
  height,
  border: "none",
  borderRadius: "0 6px 6px 0",
  background: active
    ? "linear-gradient(90deg, rgba(37, 99, 235, 0.28) 0%, rgba(37, 99, 235, 0.15) 58%, rgba(255, 255, 255, 0.92) 100%)"
    : "transparent",
  boxShadow: active
    ? "inset 3px 0 0 #2563eb, 4px 0 8px rgba(15, 23, 42, 0.06), 1px 0 0 rgba(37, 99, 235, 0.08)"
    : "none",
  color: active ? "#1d4ed8" : "#64748b",
  cursor: "pointer",
  fontSize,
  fontWeight: 700,
  lineHeight: 1,
  marginRight: active ? -7 : 0,
  padding: 0,
  position: "relative",
  zIndex: active ? 3 : 1,
  textAlign: "center",
  transition: "width 120ms ease, background 120ms ease, box-shadow 120ms ease, color 120ms ease",
})
