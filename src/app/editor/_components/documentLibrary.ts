import { STORAGE_KEY } from "./documentPersistence"

export interface DocumentTemplateSummary {
  variant: string
  filename: string
  id: string
  title: string
  bytes: number
  bodyChildren: number
  nodeCount: number
  hasThaiText: boolean
  questionTriples: number
}

export interface DocumentTemplateManifest {
  generatedAt: string | null
  variants: DocumentTemplateSummary[]
}

export type DocumentPrepareStepId =
  | "library-select"
  | "library-fetch"
  | "library-validate"
  | "library-store"
  | "library-open-editor"
  | "editor-load-shell"
  | "editor-start-session"
  | "editor-build-layout"
  | "editor-ready"

export interface DocumentPrepareOverlayStep {
  id: DocumentPrepareStepId
  phaseIndex: number
  phaseTotal: number
  phaseTitle: string
  title: string
  detail: string
  detailMessages?: string[]
}

export interface DocumentPrepareHandoff {
  version: 1
  variant: string
  templateTitle: string
  startedAt: number
}

export const DOCUMENT_PREPARE_HANDOFF_STORAGE_KEY = "flowdoc_document_prepare_handoff"

export const DOCUMENT_PREPARE_STEPS: DocumentPrepareOverlayStep[] = [
  {
    id: "library-select",
    phaseIndex: 1,
    phaseTotal: 3,
    phaseTitle: "Preparing document structure",
    title: "Selecting template",
    detail: "Locking the chosen structure before preparing the editor session.",
    detailMessages: [
      "Confirming the selected document structure.",
      "Preparing the package handoff path.",
      "Checking browser workspace availability.",
    ],
  },
  {
    id: "library-fetch",
    phaseIndex: 1,
    phaseTotal: 3,
    phaseTitle: "Preparing document structure",
    title: "Loading package",
    detail: "Fetching the FlowDoc package for this document structure.",
    detailMessages: [
      "Downloading the FlowDoc package.",
      "Large mock documents can take a moment to load.",
      "Keeping the editor closed until the package is ready.",
    ],
  },
  {
    id: "library-validate",
    phaseIndex: 1,
    phaseTotal: 3,
    phaseTitle: "Preparing document structure",
    title: "Checking FlowDoc package",
    detail: "Parsing and validating the document before it enters the editor.",
    detailMessages: [
      "Parsing document sections, fields, and package metadata.",
      "Checking that the package can enter the editor safely.",
      "Preparing a clean editor handoff.",
    ],
  },
  {
    id: "library-store",
    phaseIndex: 1,
    phaseTotal: 3,
    phaseTitle: "Preparing document structure",
    title: "Saving editor package",
    detail: "Writing the active document package for the editor session.",
    detailMessages: [
      "Clearing generated loader leftovers.",
      "Saving the active document package.",
      "Keeping one active package to reduce browser storage pressure.",
    ],
  },
  {
    id: "library-open-editor",
    phaseIndex: 2,
    phaseTotal: 3,
    phaseTitle: "Opening editing workspace",
    title: "Moving into the editor",
    detail: "The document package is ready. Opening the workspace.",
    detailMessages: [
      "Opening the editing workspace.",
      "Keeping the loading surface active while the route changes.",
      "The editor will appear after the layout is ready.",
    ],
  },
  {
    id: "editor-load-shell",
    phaseIndex: 2,
    phaseTotal: 3,
    phaseTitle: "Opening editing workspace",
    title: "Loading editor shell",
    detail: "Preparing the editor surface for the active document.",
    detailMessages: [
      "Loading editor controls and panels.",
      "Preparing the document canvas surface.",
      "Keeping the loader visible while the editor starts.",
    ],
  },
  {
    id: "editor-start-session",
    phaseIndex: 2,
    phaseTotal: 3,
    phaseTitle: "Opening editing workspace",
    title: "Starting editing session",
    detail: "Connecting the prepared document to the editor state.",
    detailMessages: [
      "Connecting the active FlowDoc package.",
      "Preparing editing state and document tools.",
      "Starting the editor session.",
    ],
  },
  {
    id: "editor-build-layout",
    phaseIndex: 3,
    phaseTotal: 3,
    phaseTitle: "Arranging editable pages",
    title: "Building document layout",
    detail: "Measuring text and preparing the first editable page view.",
    detailMessages: [
      "Measuring text and fonts for the document.",
      "Arranging pages for a large document can take longer.",
      "The system is still working while the document layout is built.",
    ],
  },
  {
    id: "editor-ready",
    phaseIndex: 3,
    phaseTotal: 3,
    phaseTitle: "Arranging editable pages",
    title: "Ready to edit",
    detail: "The document view is ready.",
    detailMessages: [
      "Finalizing the editable document view.",
      "Preparing the first canvas frame.",
      "The document is ready to edit.",
    ],
  },
]

const generatedBackupExactKeys = new Set([
  `${STORAGE_KEY}_backup_latest`,
  `${STORAGE_KEY}_backup_latest_key`,
  `${STORAGE_KEY}_backup_codex_latest`,
  `${STORAGE_KEY}_backup_codex_latest_key`,
])

const generatedBackupPrefixes = [
  `${STORAGE_KEY}_backup_library_`,
  `${STORAGE_KEY}_backup_codex_`,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key]
  return typeof value === "boolean" ? value : null
}

export function parseDocumentTemplateManifest(value: unknown): DocumentTemplateManifest {
  if (!isRecord(value) || !Array.isArray(value.variants)) {
    throw new Error("invalid document template manifest")
  }

  const generatedAt = typeof value.generatedAt === "string" ? value.generatedAt : null
  const variants: DocumentTemplateSummary[] = []
  for (const entry of value.variants) {
    if (!isRecord(entry)) continue
    const variant = readString(entry, "variant")
    const filename = readString(entry, "filename")
    const id = readString(entry, "id")
    const title = readString(entry, "title")
    const bytes = readFiniteNumber(entry, "bytes")
    const bodyChildren = readFiniteNumber(entry, "bodyChildren")
    const nodeCount = readFiniteNumber(entry, "nodeCount")
    const hasThaiText = readBoolean(entry, "hasThaiText")
    const questionTriples = readFiniteNumber(entry, "questionTriples")
    if (
      !variant ||
      !filename ||
      !id ||
      !title ||
      bytes === null ||
      bodyChildren === null ||
      nodeCount === null ||
      hasThaiText === null ||
      questionTriples === null
    ) {
      continue
    }
    variants.push({
      variant,
      filename,
      id,
      title,
      bytes,
      bodyChildren,
      nodeCount,
      hasThaiText,
      questionTriples,
    })
  }
  if (variants.length === 0) throw new Error("document template manifest has no valid templates")
  return { generatedAt, variants }
}

export function formatTemplateByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

export function getDocumentPrepareStep(id: DocumentPrepareStepId): DocumentPrepareOverlayStep {
  const step = DOCUMENT_PREPARE_STEPS.find((entry) => entry.id === id)
  if (!step) throw new Error(`unknown document prepare step: ${id}`)
  return step
}

export function createDocumentPrepareHandoff({
  variant,
  templateTitle,
  startedAt = Date.now(),
}: {
  variant: string
  templateTitle: string
  startedAt?: number
}): DocumentPrepareHandoff {
  return {
    version: 1,
    variant,
    templateTitle,
    startedAt,
  }
}

export function parseDocumentPrepareHandoff(raw: string | null | undefined): DocumentPrepareHandoff | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (!isRecord(value)) return null
    if (value.version !== 1) return null
    if (typeof value.variant !== "string" || value.variant.trim().length === 0) return null
    if (typeof value.templateTitle !== "string" || value.templateTitle.trim().length === 0) return null
    if (typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt)) return null
    return {
      version: 1,
      variant: value.variant,
      templateTitle: value.templateTitle,
      startedAt: value.startedAt,
    }
  } catch {
    return null
  }
}

export function readDocumentPrepareHandoff(storage: Pick<Storage, "getItem">): DocumentPrepareHandoff | null {
  try {
    return parseDocumentPrepareHandoff(storage.getItem(DOCUMENT_PREPARE_HANDOFF_STORAGE_KEY))
  } catch {
    return null
  }
}

export function writeDocumentPrepareHandoff(
  storage: Pick<Storage, "setItem">,
  handoff: DocumentPrepareHandoff,
): void {
  storage.setItem(DOCUMENT_PREPARE_HANDOFF_STORAGE_KEY, JSON.stringify(handoff))
}

export function clearDocumentPrepareHandoff(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(DOCUMENT_PREPARE_HANDOFF_STORAGE_KEY)
  } catch {
    // Handoff cleanup is only a UI affordance and must not block editing.
  }
}

export function isGeneratedDocumentBackupKey(key: string): boolean {
  return generatedBackupExactKeys.has(key) || generatedBackupPrefixes.some((prefix) => key.startsWith(prefix))
}

export function removeGeneratedDocumentBackups(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keysToRemove: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && isGeneratedDocumentBackupKey(key)) keysToRemove.push(key)
  }
  for (const key of keysToRemove) storage.removeItem(key)
}

export function storeActiveDocumentPackage(storage: Pick<Storage, "length" | "key" | "removeItem" | "setItem">, rawPackage: string): void {
  removeGeneratedDocumentBackups(storage)
  storage.setItem(STORAGE_KEY, rawPackage)
}
