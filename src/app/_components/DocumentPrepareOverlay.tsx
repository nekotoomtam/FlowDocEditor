"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"
import type { DocumentPrepareOverlayStep } from "@/app/editor/_components/documentLibrary"

interface DocumentPrepareOverlayProps {
  step: DocumentPrepareOverlayStep
  templateTitle?: string | null
  fadingOut?: boolean
}

const overlayStyle = (fadingOut: boolean): CSSProperties => ({
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  background: "rgba(248, 250, 252, 0.97)",
  backdropFilter: "blur(12px)",
  color: "#0f172a",
  padding: 24,
  opacity: fadingOut ? 0 : 1,
  pointerEvents: fadingOut ? "none" : "auto",
  transition: "opacity 220ms ease",
})

const panelStyle: CSSProperties = {
  width: "min(540px, 100%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 18,
  textAlign: "center",
  fontFamily: "monospace",
}

const ringShellStyle: CSSProperties = {
  position: "relative",
  width: 150,
  height: 150,
  display: "grid",
  placeItems: "center",
}

const spinnerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "999px",
  border: "10px solid #dbeafe",
  borderTopColor: "#2563eb",
  borderRightColor: "#14b8a6",
  animation: "flowdocPrepareSpin 1s linear infinite",
  boxShadow: "0 18px 60px rgba(37, 99, 235, 0.18)",
}

const phaseBadgeStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: 98,
  height: 98,
  borderRadius: "999px",
  display: "grid",
  placeItems: "center",
  background: "white",
  border: "1px solid #dbe3ef",
  color: "#1d4ed8",
  fontSize: 24,
  fontWeight: 900,
}

const phaseLabelStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
}

const phaseTitleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 22,
  fontWeight: 900,
}

const taskTitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#334155",
  fontSize: 14,
  fontWeight: 800,
}

const detailStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.5,
}

const activityTrackStyle: CSSProperties = {
  position: "relative",
  width: "min(360px, 100%)",
  height: 8,
  borderRadius: 999,
  overflow: "hidden",
  background: "#dbeafe",
  border: "1px solid #bfdbfe",
}

const activityPulseStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  left: "-35%",
  width: "35%",
  borderRadius: 999,
  background: "linear-gradient(90deg, rgba(37, 99, 235, 0), #2563eb, #14b8a6)",
  animation: "flowdocPreparePulse 1.15s ease-in-out infinite",
}

const phaseDotsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
}

const phaseDotStyle = (active: boolean, done: boolean): CSSProperties => ({
  width: active ? 28 : 10,
  height: 10,
  borderRadius: 999,
  background: active ? "#2563eb" : done ? "#14b8a6" : "#cbd5e1",
  transition: "width 160ms ease, background 160ms ease",
})

const DETAIL_MESSAGE_INTERVAL_MS = 2400

export function DocumentPrepareOverlay({
  step,
  templateTitle,
  fadingOut = false,
}: DocumentPrepareOverlayProps) {
  const [detailMessageIndex, setDetailMessageIndex] = useState(0)
  const phases = Array.from({ length: step.phaseTotal }, (_, index) => index + 1)
  const detailMessages = useMemo(() => (
    step.detailMessages && step.detailMessages.length > 0
      ? step.detailMessages
      : [step.detail]
  ), [step.detail, step.detailMessages])
  const activeDetailMessage = detailMessages[detailMessageIndex % detailMessages.length] ?? step.detail
  const detail = templateTitle
    ? `${activeDetailMessage} (${templateTitle})`
    : activeDetailMessage

  useEffect(() => {
    setDetailMessageIndex(0)
  }, [step.id])

  useEffect(() => {
    if (fadingOut || detailMessages.length <= 1) return
    const intervalId = window.setInterval(() => {
      setDetailMessageIndex((current) => (current + 1) % detailMessages.length)
    }, DETAIL_MESSAGE_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [detailMessages.length, fadingOut])

  return (
    <div
      data-testid="document-prepare-overlay"
      data-prepare-phase={`${step.phaseIndex}/${step.phaseTotal}`}
      data-prepare-step={step.id}
      data-fading-out={fadingOut ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={overlayStyle(fadingOut)}
    >
      <style>
        {`
          @keyframes flowdocPrepareSpin {
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes flowdocPreparePulse {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(385%);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            [data-flowdoc-prepare-spinner="true"],
            [data-flowdoc-prepare-pulse="true"] {
              animation-duration: 2.4s !important;
            }
          }
        `}
      </style>
      <section style={panelStyle}>
        <div style={ringShellStyle} aria-hidden="true">
          <div data-flowdoc-prepare-spinner="true" style={spinnerStyle} />
          <div data-testid="document-prepare-phase-count" style={phaseBadgeStyle}>
            {step.phaseIndex}/{step.phaseTotal}
          </div>
        </div>

        <div>
          <p style={phaseLabelStyle}>Phase {step.phaseIndex} of {step.phaseTotal}</p>
          <h2 data-testid="document-prepare-title" style={phaseTitleStyle}>
            {step.phaseTitle}
          </h2>
          <p data-testid="document-prepare-stage" style={taskTitleStyle}>
            {step.title}
          </p>
          <p data-testid="document-prepare-detail" style={detailStyle}>
            {detail}
          </p>
        </div>

        <div style={activityTrackStyle} aria-hidden="true">
          <div data-flowdoc-prepare-pulse="true" style={activityPulseStyle} />
        </div>

        <div data-testid="document-prepare-phase-dots" style={phaseDotsStyle} aria-hidden="true">
          {phases.map((phase) => (
            <span
              key={phase}
              style={phaseDotStyle(phase === step.phaseIndex, phase < step.phaseIndex)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
