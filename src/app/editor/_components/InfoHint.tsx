"use client"

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface InfoHintProps {
  text: string
  ariaLabel?: string
  align?: "left" | "right"
}

const TOOLTIP_WIDTH = 190
const TOOLTIP_GAP = 6
const VIEWPORT_GUTTER = 8

export function InfoHint({ text, ariaLabel = "More information", align = "right" }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const tooltipId = useId()

  useEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      const preferredLeft = align === "right" ? rect.right - TOOLTIP_WIDTH : rect.left
      const maxLeft = Math.max(VIEWPORT_GUTTER, viewportWidth - TOOLTIP_WIDTH - VIEWPORT_GUTTER)
      setPosition({
        left: Math.min(Math.max(preferredLeft, VIEWPORT_GUTTER), maxLeft),
        top: rect.bottom + TOOLTIP_GAP,
      })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [align, open])

  const tooltip = open && position && typeof document !== "undefined"
    ? createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          data-testid="info-hint-tooltip"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            zIndex: 2147483647,
            width: TOOLTIP_WIDTH,
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            background: "#111827",
            color: "#f9fafb",
            boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            padding: "7px 8px",
            fontSize: 10,
            lineHeight: 1.45,
            textTransform: "none",
            letterSpacing: 0,
            whiteSpace: "normal",
            pointerEvents: "none",
          }}
        >
          {text}
        </span>,
        document.body,
      )
    : null

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        data-testid="info-hint"
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault()
          setOpen((value) => !value)
        }}
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "1px solid #cbd5e1",
          background: "#fff",
          color: "#64748b",
          cursor: "help",
          display: "inline-grid",
          placeItems: "center",
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "monospace",
          padding: 0,
        }}
      >
        i
      </button>
      {tooltip}
    </span>
  )
}
