import { isTextRunOnlyParagraph } from "@/document"
import type { DocumentNode, ParagraphNode } from "@/schema"
import type { PaginatedDocument } from "@/pagination"
import {
  startWysiwygPerfSpan,
  summarizePaginatedForWysiwygPerf,
} from "../wysiwygPerformance"
import {
  getEditableParagraphFromDocument,
  getEditableParagraphTextFromDocument,
  replaceEditableParagraphTextInDocument,
} from "../wysiwygTextCommit"
import {
  isParagraphInsideFlowStack,
  isParagraphInsideRowStack,
  isParagraphInsideTableCell,
} from "../wysiwygTextEligibility"

export interface StructuralSourceDocumentResolutionInput {
  doc: DocumentNode
  nodeId: string
  text?: string
  now?: () => number
}

export interface StructuralSourceDocumentResolution {
  doc: DocumentNode
  textSupplied: boolean
  textChanged: boolean
  textResolved: boolean
  currentTextResolveMs: number
  replaceDraftTextMs: number
}

export type StructuralParagraphEligibilityFailureReason =
  | "missing-paragraph"
  | "not-text-run-only"
  | "table-cell"
  | "flow-stack"
  | "row-stack"

export type StructuralParagraphEligibility =
  | { eligible: true; paragraph: ParagraphNode }
  | { eligible: false; reason: StructuralParagraphEligibilityFailureReason; paragraph: ParagraphNode | null }

export type StructuralResultParagraphResolution =
  | { resolved: true; paragraph: ParagraphNode; text: string; textLength: number }
  | {
    resolved: false
    reason: StructuralParagraphEligibilityFailureReason | "missing-text"
    paragraph: ParagraphNode | null
    text: string | null
  }

export function resolveStructuralSourceDocument(
  input: StructuralSourceDocumentResolutionInput,
): StructuralSourceDocumentResolution {
  const now = input.now ?? startWysiwygPerfSpan
  if (input.text === undefined) {
    return {
      doc: input.doc,
      textSupplied: false,
      textChanged: false,
      textResolved: false,
      currentTextResolveMs: 0,
      replaceDraftTextMs: 0,
    }
  }

  const currentTextStartedAt = now()
  const currentText = getEditableParagraphTextFromDocument(input.doc, input.nodeId)
  const currentTextResolveMs = Math.max(0, now() - currentTextStartedAt)
  if (currentText === input.text) {
    return {
      doc: input.doc,
      textSupplied: true,
      textChanged: false,
      textResolved: currentText !== null,
      currentTextResolveMs,
      replaceDraftTextMs: 0,
    }
  }

  const replaceStartedAt = now()
  const doc = replaceEditableParagraphTextInDocument(input.doc, input.nodeId, input.text)
  return {
    doc,
    textSupplied: true,
    textChanged: true,
    textResolved: currentText !== null,
    currentTextResolveMs,
    replaceDraftTextMs: Math.max(0, now() - replaceStartedAt),
  }
}

export function resolveStructuralParagraphEligibility(input: {
  doc: DocumentNode
  nodeId: string
}): StructuralParagraphEligibility {
  const paragraph = getEditableParagraphFromDocument(input.doc, input.nodeId)
  if (!paragraph) {
    return { eligible: false, reason: "missing-paragraph", paragraph: null }
  }
  if (!isTextRunOnlyParagraph(paragraph)) {
    return { eligible: false, reason: "not-text-run-only", paragraph }
  }
  if (isParagraphInsideTableCell(input.doc, input.nodeId)) {
    return { eligible: false, reason: "table-cell", paragraph }
  }
  if (isParagraphInsideFlowStack(input.doc, input.nodeId)) {
    return { eligible: false, reason: "flow-stack", paragraph }
  }
  if (isParagraphInsideRowStack(input.doc, input.nodeId)) {
    return { eligible: false, reason: "row-stack", paragraph }
  }
  return { eligible: true, paragraph }
}

export function resolveStructuralResultParagraph(input: {
  doc: DocumentNode
  nodeId: string
}): StructuralResultParagraphResolution {
  const eligibility = resolveStructuralParagraphEligibility(input)
  if (!eligibility.eligible) {
    return {
      resolved: false,
      reason: eligibility.reason,
      paragraph: eligibility.paragraph,
      text: null,
    }
  }

  const text = getEditableParagraphTextFromDocument(input.doc, input.nodeId)
  if (text == null) {
    return {
      resolved: false,
      reason: "missing-text",
      paragraph: eligibility.paragraph,
      text,
    }
  }

  return {
    resolved: true,
    paragraph: eligibility.paragraph,
    text,
    textLength: text.length,
  }
}

export function summarizeStructuralOptimisticPaginatedForPerf(
  paginated: PaginatedDocument | null,
): ReturnType<typeof summarizePaginatedForWysiwygPerf> | null {
  return paginated ? summarizePaginatedForWysiwygPerf(paginated) : null
}
