"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { DocumentPrepareOverlay } from "@/app/_components/DocumentPrepareOverlay"
import {
  createDocumentPrepareHandoff,
  formatTemplateByteSize,
  getDocumentPrepareStep,
  parseDocumentTemplateManifest,
  removeGeneratedDocumentBackups,
  storeActiveDocumentPackage,
  writeDocumentPrepareHandoff,
  type DocumentPrepareStepId,
  type DocumentTemplateSummary,
} from "@/app/editor/_components/documentLibrary"
import {
  documentParseFailureMessage,
  parsePersistedDocument,
  STORAGE_KEY,
} from "@/app/editor/_components/documentPersistence"

type LibraryStatus = "loading" | "ready" | "error"
type LibraryMessageTone = "muted" | "error"

interface PrepareOverlayState {
  templateTitle: string
  stepId: DocumentPrepareStepId
}

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  color: "#0f172a",
  fontFamily: "monospace",
  padding: "34px 40px",
  boxSizing: "border-box",
}

const headerStyle: CSSProperties = {
  maxWidth: 980,
  margin: "0 auto 20px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
}

const titleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  margin: 0,
}

const subtitleStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  margin: "8px 0 0",
  lineHeight: 1.5,
}

const linkButtonStyle: CSSProperties = {
  border: "1px solid #dbe3ef",
  borderRadius: 6,
  background: "white",
  color: "#334155",
  fontSize: 12,
  padding: "8px 11px",
  textDecoration: "none",
  whiteSpace: "nowrap",
}

const gridStyle: CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
}

const cardStyle: CSSProperties = {
  background: "white",
  border: "1px solid #dbe3ef",
  borderRadius: 8,
  padding: 16,
  minHeight: 150,
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

const cardTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  margin: 0,
}

const cardMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  color: "#64748b",
  fontSize: 11,
}

const actionButtonStyle = (disabled: boolean): CSSProperties => ({
  marginTop: "auto",
  width: "100%",
  border: "1px solid #1d4ed8",
  borderRadius: 6,
  background: disabled ? "#bfdbfe" : "#2563eb",
  color: "white",
  fontSize: 12,
  fontWeight: 800,
  padding: "9px 12px",
  cursor: disabled ? "not-allowed" : "pointer",
})

const messageStyle = (tone: "muted" | "error"): CSSProperties => ({
  maxWidth: 980,
  margin: "0 auto",
  border: `1px solid ${tone === "error" ? "#fecaca" : "#dbe3ef"}`,
  borderRadius: 8,
  background: tone === "error" ? "#fef2f2" : "white",
  color: tone === "error" ? "#b91c1c" : "#475569",
  padding: 14,
  fontSize: 12,
})

const PREPARE_STAGE_SETTLE_MS = 90

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function waitForPreparePaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

async function settlePrepareStage(ms = PREPARE_STAGE_SETTLE_MS) {
  await waitForPreparePaint()
  if (ms > 0) await delay(ms)
}

function writeLibraryLoadMetadata(storage: Storage, variant: string) {
  try {
    storage.setItem("flowdoc_document_library_template_variant", variant)
    storage.setItem("flowdoc_document_library_loaded_at", new Date().toISOString())
  } catch {
    // Metadata is useful for diagnostics, but should not block opening a document.
  }
}

export default function DocumentLibraryPageClient() {
  const router = useRouter()
  const [status, setStatus] = useState<LibraryStatus>("loading")
  const [templates, setTemplates] = useState<DocumentTemplateSummary[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<LibraryMessageTone>("muted")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [prepareOverlay, setPrepareOverlay] = useState<PrepareOverlayState | null>(null)

  const showPrepareStep = useCallback(async (templateTitle: string, stepId: DocumentPrepareStepId, settleMs?: number) => {
    setPrepareOverlay({ templateTitle, stepId })
    await settlePrepareStage(settleMs)
  }, [])

  const loadManifest = useCallback(async () => {
    setStatus("loading")
    setMessage(null)
    setMessageTone("muted")
    try {
      const response = await fetch("/mock/flowdoc-mock-manifest.json", { cache: "no-store" })
      if (!response.ok) throw new Error(`manifest request failed: ${response.status}`)
      const manifest = parseDocumentTemplateManifest(await response.json())
      setTemplates(manifest.variants)
      setStatus("ready")
    } catch (error) {
      console.error("document library manifest error:", error)
      setTemplates([])
      setStatus("error")
      setMessageTone("error")
      setMessage("Could not load document library.")
    }
  }, [])

  useEffect(() => {
    void loadManifest()
  }, [loadManifest])

  const loadBlankDocument = useCallback(async () => {
    const templateTitle = "Blank Document"
    setLoadingId("blank")
    setMessage(null)
    setMessageTone("muted")
    try {
      await showPrepareStep(templateTitle, "library-select")
      removeGeneratedDocumentBackups(window.localStorage)
      await showPrepareStep(templateTitle, "library-store")
      window.localStorage.removeItem(STORAGE_KEY)
      writeLibraryLoadMetadata(window.localStorage, "blank")
      writeDocumentPrepareHandoff(window.sessionStorage, createDocumentPrepareHandoff({
        variant: "blank",
        templateTitle,
      }))
      await showPrepareStep(templateTitle, "library-open-editor", 120)
      router.push("/editor")
    } catch (error) {
      console.error("blank document prepare error:", error)
      setMessageTone("error")
      setMessage("Could not prepare a blank document. Browser storage may be unavailable.")
      setLoadingId(null)
      setPrepareOverlay(null)
    }
  }, [router, showPrepareStep])

  const loadTemplate = useCallback(async (template: DocumentTemplateSummary) => {
    setLoadingId(template.variant)
    setMessage(null)
    setMessageTone("muted")
    try {
      await showPrepareStep(template.title, "library-select")
      await showPrepareStep(template.title, "library-fetch")
      const response = await fetch(`/mock/${encodeURIComponent(template.filename)}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`template request failed: ${response.status}`)
      const rawPackage = await response.text()
      await showPrepareStep(template.title, "library-validate")
      const parsed = parsePersistedDocument(rawPackage)
      if (!parsed.ok) {
        setMessageTone("error")
        setMessage(documentParseFailureMessage(parsed.reason))
        setLoadingId(null)
        setPrepareOverlay(null)
        return
      }

      removeGeneratedDocumentBackups(window.localStorage)
      await showPrepareStep(template.title, "library-store")
      storeActiveDocumentPackage(window.localStorage, rawPackage)
      writeLibraryLoadMetadata(window.localStorage, template.variant)
      writeDocumentPrepareHandoff(window.sessionStorage, createDocumentPrepareHandoff({
        variant: template.variant,
        templateTitle: template.title,
      }))
      await showPrepareStep(template.title, "library-open-editor", 120)
      router.push("/editor")
    } catch (error) {
      console.error("document template load error:", error)
      setMessageTone("error")
      setMessage(`Could not prepare ${template.title}. Browser storage may be full.`)
      setLoadingId(null)
      setPrepareOverlay(null)
    }
  }, [router, showPrepareStep])

  const busy = loadingId !== null
  const prepareStep = prepareOverlay ? getDocumentPrepareStep(prepareOverlay.stepId) : null

  return (
    <main data-testid="document-library-page" style={shellStyle}>
      {prepareOverlay && prepareStep && (
        <DocumentPrepareOverlay
          step={prepareStep}
          templateTitle={prepareOverlay.templateTitle}
        />
      )}

      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Document Library</h1>
          <p style={subtitleStyle}>
            Choose a document structure before entering the editor.
          </p>
        </div>
        <Link href="/editor" style={linkButtonStyle}>
          Open editor
        </Link>
      </header>

      {message && (
        <div data-testid="document-library-status" aria-live="polite" style={messageStyle(messageTone)}>
          {message}
        </div>
      )}

      {status === "loading" && (
        <div data-testid="document-library-loading" style={messageStyle("muted")}>
          Loading document library...
        </div>
      )}

      {status === "error" && (
        <div style={{ maxWidth: 980, margin: "12px auto 0" }}>
          <button type="button" onClick={loadManifest} style={actionButtonStyle(false)}>
            Retry
          </button>
        </div>
      )}

      {status === "ready" && (
        <section style={gridStyle}>
          <article data-testid="document-library-template-blank" style={cardStyle}>
            <h2 style={cardTitleStyle}>Blank Document</h2>
            <div style={cardMetaStyle}>
              <span>blank</span>
              <span>starts empty</span>
            </div>
            <button
              type="button"
              data-testid="document-library-load-blank"
              disabled={busy}
              onClick={loadBlankDocument}
              style={actionButtonStyle(busy)}
            >
              {loadingId === "blank" ? "Preparing" : "Start"}
            </button>
          </article>

          {templates.map((template) => (
            <article
              key={template.variant}
              data-testid={`document-library-template-${template.variant}`}
              style={cardStyle}
            >
              <h2 style={cardTitleStyle}>{template.title}</h2>
              <div style={cardMetaStyle}>
                <span>{template.variant}</span>
                <span>{formatTemplateByteSize(template.bytes)}</span>
                <span>{template.bodyChildren} body blocks</span>
                <span>{template.nodeCount} nodes</span>
                {template.hasThaiText && <span>Thai text</span>}
              </div>
              <button
                type="button"
                data-testid={`document-library-load-${template.variant}`}
                disabled={busy}
                onClick={() => loadTemplate(template)}
                style={actionButtonStyle(busy)}
              >
                {loadingId === template.variant ? "Preparing" : "Start"}
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
