import type { CSSProperties } from "react"
import type { EditorPageNavItem } from "./editorCanvasNavigation"

type SaveStatusTone = "neutral" | "success"
type ZoomMode = "fit" | "manual"

export interface EditorCanvasBottomBarProps {
  saveStatusLabel: string
  saveStatusTone: SaveStatusTone
  sectionLabel: string
  contextLabel: string
  pageItems: EditorPageNavItem[]
  currentPageIndex: number
  scale: number
  minScale: number
  maxScale: number
  zoomMode: ZoomMode
  showPageThumbnails: boolean
  onTogglePageThumbnails: () => void
  onJumpToPage: (page: EditorPageNavItem) => void
  onScaleChange: (scale: number) => void
  onResetZoom: () => void
  onFitZoom: () => void
}

const editorBottomBarStyle: CSSProperties = {
  height: 42,
  flexShrink: 0,
  borderTop: "1px solid #d7dde8",
  background: "rgba(255, 255, 255, 0.96)",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 12px",
  boxSizing: "border-box",
  boxShadow: "0 -1px 0 rgba(255, 255, 255, 0.82)",
  overflowX: "auto",
  overflowY: "hidden",
  scrollbarWidth: "thin",
}

const editorBottomStatusGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  flex: "0 1 auto",
}

const editorBottomRightControlsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  flexShrink: 0,
}

const editorBottomChipStyle = (tone: SaveStatusTone = "neutral"): CSSProperties => ({
  minHeight: 24,
  maxWidth: 170,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  border: `1px solid ${tone === "success" ? "#bbf7d0" : "#e2e8f0"}`,
  borderRadius: 6,
  background: tone === "success" ? "#f0fdf4" : "#f8fafc",
  color: tone === "success" ? "#166534" : "#475569",
  fontSize: 11,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

const editorBottomButtonStyle = (active = false, disabled = false): CSSProperties => ({
  width: 28,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: `1px solid ${active ? "#93c5fd" : "#dbe3ef"}`,
  borderRadius: 6,
  background: disabled ? "#f8fafc" : active ? "#dbeafe" : "white",
  color: disabled ? "#cbd5e1" : active ? "#1d4ed8" : "#334155",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 12,
  fontWeight: 800,
})

const editorBottomTextButtonStyle = (active = false): CSSProperties => ({
  minWidth: 34,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  border: `1px solid ${active ? "#93c5fd" : "#dbe3ef"}`,
  borderRadius: 6,
  background: active ? "#dbeafe" : "white",
  color: active ? "#1d4ed8" : "#334155",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 800,
})

const editorBottomPageLabelStyle: CSSProperties = {
  minWidth: 58,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  background: "#f8fafc",
  color: "#334155",
  fontSize: 11,
  fontWeight: 800,
  boxSizing: "border-box",
}

const editorZoomSliderStyle: CSSProperties = {
  width: 128,
  accentColor: "#2563eb",
  cursor: "pointer",
}

const editorPageFilmstripStyle: CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: 48,
  zIndex: 30,
  minHeight: 116,
  maxHeight: 142,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  border: "1px solid #dbe3ef",
  borderRadius: 8,
  background: "rgba(255, 255, 255, 0.98)",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.16)",
  overflowX: "auto",
  overflowY: "hidden",
  boxSizing: "border-box",
}

const editorPageThumbnailButtonStyle = (active: boolean): CSSProperties => ({
  width: 82,
  minWidth: 82,
  height: 94,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: `1px solid ${active ? "#2563eb" : "#dbe3ef"}`,
  borderRadius: 7,
  background: active ? "#eff6ff" : "#ffffff",
  color: active ? "#1d4ed8" : "#475569",
  cursor: "pointer",
  boxShadow: active ? "0 0 0 2px rgba(37, 99, 235, 0.14)" : "none",
  flexShrink: 0,
})

function PageThumbnailGlyph() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 14,
        height: 18,
        display: "grid",
        gap: 2,
        padding: 3,
        border: "1px solid currentColor",
        borderRadius: 2,
        boxSizing: "border-box",
      }}
    >
      <span style={{ height: 2, background: "currentColor", borderRadius: 1 }} />
      <span style={{ height: 2, background: "currentColor", borderRadius: 1, opacity: 0.78 }} />
      <span style={{ height: 2, background: "currentColor", borderRadius: 1, opacity: 0.58 }} />
    </span>
  )
}

function PageMiniature({
  page,
  active,
  onJump,
}: {
  page: EditorPageNavItem
  active: boolean
  onJump: (page: EditorPageNavItem) => void
}) {
  const ratio = page.width > 0 && page.height > 0 ? page.width / page.height : 0.707
  const previewHeight = 54
  const previewWidth = Math.max(34, Math.min(46, Math.round(previewHeight * ratio)))

  return (
    <button
      type="button"
      data-testid="editor-page-thumbnail"
      data-page-index={page.pageIndex}
      aria-current={active ? "page" : undefined}
      title={`Go to page ${page.pageIndex + 1}`}
      onClick={() => onJump(page)}
      style={editorPageThumbnailButtonStyle(active)}
    >
      <span
        aria-hidden="true"
        style={{
          width: previewWidth,
          height: previewHeight,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 7,
          border: "1px solid #cbd5e1",
          background: "white",
          boxShadow: "0 2px 5px rgba(15, 23, 42, 0.10)",
          boxSizing: "border-box",
        }}
      >
        <span style={{ height: 3, background: "#94a3b8", borderRadius: 1 }} />
        <span style={{ height: 3, background: "#cbd5e1", borderRadius: 1 }} />
        <span style={{ height: 3, width: "72%", background: "#cbd5e1", borderRadius: 1 }} />
      </span>
      <span style={{ fontSize: 10, fontWeight: 800 }}>Page {page.pageIndex + 1}</span>
    </button>
  )
}

export function EditorCanvasBottomBar({
  saveStatusLabel,
  saveStatusTone,
  sectionLabel,
  contextLabel,
  pageItems,
  currentPageIndex,
  scale,
  minScale,
  maxScale,
  zoomMode,
  showPageThumbnails,
  onTogglePageThumbnails,
  onJumpToPage,
  onScaleChange,
  onResetZoom,
  onFitZoom,
}: EditorCanvasBottomBarProps) {
  const currentPosition = Math.max(0, pageItems.findIndex((page) => page.pageIndex === currentPageIndex))
  const currentPage = pageItems[currentPosition] ?? pageItems[0] ?? null
  const previousPage = currentPosition > 0 ? pageItems[currentPosition - 1] : null
  const nextPage = currentPosition >= 0 && currentPosition < pageItems.length - 1
    ? pageItems[currentPosition + 1]
    : null

  return (
    <>
      {showPageThumbnails && pageItems.length > 0 && (
        <div data-testid="editor-page-filmstrip" style={editorPageFilmstripStyle}>
          {pageItems.map((page) => (
            <PageMiniature
              key={page.key}
              page={page}
              active={currentPage?.pageIndex === page.pageIndex}
              onJump={onJumpToPage}
            />
          ))}
        </div>
      )}
      <div data-testid="editor-bottom-bar" style={editorBottomBarStyle}>
        <div style={editorBottomStatusGroupStyle}>
          <span style={editorBottomChipStyle(saveStatusTone)}>{saveStatusLabel}</span>
          <span style={editorBottomChipStyle()}>{sectionLabel}</span>
          <span style={editorBottomChipStyle()} title={contextLabel}>{contextLabel}</span>
        </div>
        <div style={{ flex: 1, minWidth: 24 }} />
        <div style={editorBottomRightControlsStyle}>
          <button
            type="button"
            data-testid="editor-page-filmstrip-toggle"
            aria-pressed={showPageThumbnails}
            title="Show page thumbnails"
            onClick={onTogglePageThumbnails}
            style={editorBottomButtonStyle(showPageThumbnails)}
          >
            <PageThumbnailGlyph />
          </button>
          <button
            type="button"
            title="Previous page"
            disabled={!previousPage}
            onClick={() => previousPage && onJumpToPage(previousPage)}
            style={editorBottomButtonStyle(false, !previousPage)}
          >
            &lt;
          </button>
          <span data-testid="editor-bottom-page-status" style={editorBottomPageLabelStyle}>
            {currentPage ? `${currentPage.pageIndex + 1} / ${pageItems.length}` : "0 / 0"}
          </span>
          <button
            type="button"
            title="Next page"
            disabled={!nextPage}
            onClick={() => nextPage && onJumpToPage(nextPage)}
            style={editorBottomButtonStyle(false, !nextPage)}
          >
            &gt;
          </button>
          <input
            data-testid="editor-bottom-zoom-slider"
            type="range"
            min={minScale}
            max={maxScale}
            step={0.01}
            value={scale}
            aria-label="Zoom"
            aria-valuetext={`${Math.round(scale * 100)}%`}
            title="Zoom"
            onChange={(event) => onScaleChange(Number(event.currentTarget.value))}
            style={editorZoomSliderStyle}
          />
          <button
            type="button"
            onClick={onResetZoom}
            title="Reset zoom to 100%"
            style={editorBottomTextButtonStyle(zoomMode === "manual")}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={onFitZoom}
            title="Fit page width"
            style={editorBottomTextButtonStyle(zoomMode === "fit")}
          >
            Fit
          </button>
        </div>
      </div>
    </>
  )
}
