import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDocument } from "pdf-lib"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const DEFAULT_SMOKE_PORT = 4010

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })

function pt(value) {
  return { value, unit: "pt" }
}

function paragraph(id, text) {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(8),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeSmokeDocument() {
  const p1 = paragraph("smoke-p1", "Smoke paragraph baseline")
  const thai = paragraph("smoke-thai-p1", "ภาษาไทยเริ่มต้น")
  const header = paragraph("smoke-header-p1", "Smoke Header Preview")
  const footer = paragraph("smoke-footer-p1", "Smoke Footer Preview")
  const headerRoot = { id: "smoke-header-root", type: "stack", props: {}, childIds: [header.id] }
  const footerRoot = { id: "smoke-footer-root", type: "stack", props: {}, childIds: [footer.id] }
  const stackParagraph = paragraph("smoke-stack-p1", "Stack paragraph baseline")
  const stack = {
    id: "smoke-stack",
    type: "stack",
    props: { widthShare: 100, minHeight: pt(24) },
    childIds: [stackParagraph.id],
  }
  const row = {
    id: "smoke-row",
    type: "row",
    props: {},
    childIds: [stack.id],
  }
  const tableNodes = {}
  const rowIds = []

  for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
    const cellIds = []
    for (let colIndex = 0; colIndex < 3; colIndex++) {
      const paraId = `smoke-table-p${rowIndex}-${colIndex}`
      const cellId = `smoke-table-c${rowIndex}-${colIndex}`
      tableNodes[paraId] = paragraph(paraId, `Cell ${rowIndex + 1}.${colIndex + 1}`)
      tableNodes[cellId] = { id: cellId, type: "table-cell", props: {}, childIds: [paraId] }
      cellIds.push(cellId)
    }
    const rowId = `smoke-table-row${rowIndex}`
    tableNodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds }
    rowIds.push(rowId)
  }

  const table = {
    id: "smoke-table",
    type: "table",
    props: { headerRowCount: 1 },
    columns: [{ width: pt(150) }, { width: pt(150) }, { width: pt(150) }],
    rowIds,
    nodes: tableNodes,
  }

  return {
    version: 1,
    document: {
      id: "editor-smoke-doc",
      meta: { title: "Editor Smoke" },
      sections: [{
        id: "smoke-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
          headerReserved: 36,
          footerReserved: 36,
        },
        headerRootId: headerRoot.id,
        bodyRootId: "smoke-body",
        footerRootId: footerRoot.id,
        nodes: {
          "smoke-body": { id: "smoke-body", type: "body", props: {}, childIds: [p1.id, thai.id, row.id, table.id] },
          [headerRoot.id]: headerRoot,
          [footerRoot.id]: footerRoot,
          [header.id]: header,
          [footer.id]: footer,
          [p1.id]: p1,
          [thai.id]: thai,
          [row.id]: row,
          [stack.id]: stack,
          [stackParagraph.id]: stackParagraph,
          [table.id]: table,
        },
      }],
    },
  }
}

const CONTINUATION_PARAGRAPH_TEXT = Array.from({ length: 95 }, (_, index) =>
  `Continuation stability sentence ${index + 1} keeps enough measured words to cross page boundaries safely.`,
).join(" ")

function makeContinuationDocument() {
  const longParagraph = paragraph("wysiwyg-continuation-p1", CONTINUATION_PARAGRAPH_TEXT)

  return {
    version: 1,
    document: {
      id: "wysiwyg-continuation-doc",
      meta: { title: "WYSIWYG Continuation Smoke" },
      sections: [{
        id: "wysiwyg-continuation-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "wysiwyg-continuation-body",
        nodes: {
          "wysiwyg-continuation-body": {
            id: "wysiwyg-continuation-body",
            type: "body",
            props: {},
            childIds: [longParagraph.id],
          },
          [longParagraph.id]: longParagraph,
        },
      }],
    },
  }
}

function makeFillReadinessDocument() {
  const paragraphNode = paragraph("fill-p1", "")
  paragraphNode.children = [
    { id: "fill-t1", type: "text", text: "Customer: " },
    { id: "fill-f1", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "pending" },
  ]

  return {
    version: 1,
    document: {
      id: "fill-readiness-doc",
      meta: { title: "Fill Readiness" },
      sections: [{
        id: "fill-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "fill-body",
        nodes: {
          "fill-body": { id: "fill-body", type: "body", props: {}, childIds: [paragraphNode.id] },
          [paragraphNode.id]: paragraphNode,
        },
      }],
    },
  }
}

function makeRegistryPlacementPackage() {
  const paragraphNode = paragraph("registry-p1", "")
  paragraphNode.children = [
    { id: "registry-t1", type: "text", text: "Project: " },
    { id: "registry-f1", type: "fieldRef", key: "project.code", label: "Project code", fallback: "TBD" },
  ]
  const doc = {
    version: 1,
    document: {
      id: "registry-placement-doc",
      meta: { title: "Registry Placement" },
      sections: [{
        id: "registry-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "registry-body",
        nodes: {
          "registry-body": { id: "registry-body", type: "body", props: {}, childIds: [paragraphNode.id] },
          [paragraphNode.id]: paragraphNode,
        },
      }],
    },
  }

  return {
    packageVersion: 2,
    kind: "document",
    id: doc.document.id,
    meta: {
      title: "Registry Placement",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    document: doc,
    fields: {
      version: 1,
      fields: [
        { key: "project.code", fieldType: "text", label: "Project code", fallback: "TBD" },
      ],
    },
  }
}

function makeUserReportSmokeTable(id, bodyRowCount) {
  const nodes = {}
  const rowIds = []
  const rows = [
    ["No.", "Business area", "Result"],
    ...Array.from({ length: bodyRowCount }, (_, index) => [
      String(index + 1),
      `Operational metric ${index + 1}`,
      `${(index + 1) * 7}%`,
    ]),
  ]

  rows.forEach((cells, rowIndex) => {
    const cellIds = []
    cells.forEach((text, colIndex) => {
      const paragraphId = `${id}-p${rowIndex}-${colIndex}`
      const cellId = `${id}-c${rowIndex}-${colIndex}`
      nodes[paragraphId] = paragraph(paragraphId, text)
      nodes[cellId] = { id: cellId, type: "table-cell", props: {}, childIds: [paragraphId] }
      cellIds.push(cellId)
    })
    const rowId = `${id}-row${rowIndex}`
    nodes[rowId] = { id: rowId, type: "table-row", props: {}, cellIds }
    rowIds.push(rowId)
  })

  return {
    id,
    type: "table",
    props: { headerRowCount: 1 },
    columns: [{ width: pt(90) }, { width: pt(221) }, { width: pt(140) }],
    rowIds,
    nodes,
  }
}

function makeUserReportSmokePackage() {
  const coverTitle = paragraph("report-smoke-cover-title", "Company Quarterly Performance Report")
  coverTitle.props = {
    ...coverTitle.props,
    align: "center",
    headingLevel: 1,
    fontSize: pt(18),
    lineHeight: 1.25,
    spacingAfter: pt(12),
  }
  const coverClient = paragraph("report-smoke-cover-client", "")
  coverClient.props = { ...coverClient.props, align: "center", spacingAfter: pt(8) }
  coverClient.children = [
    { id: "report-smoke-cover-client-label", type: "text", text: "Prepared for " },
    {
      id: "report-smoke-cover-client-field",
      type: "fieldRef",
      key: "customer.name",
      label: "Customer",
      fallback: "Acme Manufacturing Co.",
    },
  ]
  const headerText = paragraph("report-smoke-header-text", "Company report smoke")
  headerText.props = { ...headerText.props, fontSize: pt(9), spacingAfter: pt(0) }
  const footerText = paragraph("report-smoke-footer-text", "")
  footerText.children = [
    { id: "report-smoke-footer-label", type: "text", text: "หน้า " },
    { id: "report-smoke-footer-page", type: "pageNumber" },
  ]
  const summaryHeading = paragraph("report-smoke-summary-heading", "Executive Summary")
  summaryHeading.props = { ...summaryHeading.props, headingLevel: 1, keepWithNext: true, spacingAfter: pt(6) }
  const summary = paragraph(
    "report-smoke-summary",
    Array.from({ length: 24 }, (_, index) =>
      `Performance narrative line ${index + 1}: revenue, margin, risk, and operations stay visible for review.`,
    ).join("\n"),
  )
  const table = makeUserReportSmokeTable("report-smoke-kpi-table", 42)
  const doc = {
    version: 1,
    document: {
      id: "editor-smoke-company-report",
      meta: { title: "Company Quarterly Performance Report" },
      sections: [{
        id: "report-smoke-cover-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "report-smoke-cover-body",
        nodes: {
          "report-smoke-cover-body": {
            id: "report-smoke-cover-body",
            type: "body",
            props: {},
            childIds: [coverTitle.id, coverClient.id],
          },
          [coverTitle.id]: coverTitle,
          [coverClient.id]: coverClient,
        },
      }, {
        id: "report-smoke-body-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
          headerReserved: 36,
          footerReserved: 28,
          pageNumberStart: 1,
        },
        headerRootId: "report-smoke-header",
        bodyRootId: "report-smoke-body",
        footerRootId: "report-smoke-footer",
        nodes: {
          "report-smoke-header": { id: "report-smoke-header", type: "stack", props: {}, childIds: [headerText.id] },
          [headerText.id]: headerText,
          "report-smoke-footer": { id: "report-smoke-footer", type: "stack", props: {}, childIds: [footerText.id] },
          [footerText.id]: footerText,
          "report-smoke-body": {
            id: "report-smoke-body",
            type: "body",
            props: {},
            childIds: [summaryHeading.id, summary.id, table.id],
          },
          [summaryHeading.id]: summaryHeading,
          [summary.id]: summary,
          [table.id]: table,
        },
      }],
    },
  }

  return {
    packageVersion: 2,
    kind: "document",
    id: doc.document.id,
    meta: {
      title: "Company Quarterly Performance Report",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    },
    document: doc,
    fields: {
      version: 1,
      fields: [
        {
          key: "customer.name",
          fieldType: "text",
          label: "Customer name",
          required: true,
          fallback: "Acme Manufacturing Co.",
        },
      ],
    },
    data: {
      version: 1,
      updatedAt: "2026-05-13T00:00:00.000Z",
      values: {
        "customer.name": "Acme Manufacturing Co.",
      },
    },
  }
}

function makeFillReadinessErrorPackage() {
  const doc = makeFillReadinessDocument()
  return {
    packageVersion: 2,
    kind: "document",
    id: doc.document.id,
    meta: {
      title: "Fill Readiness Error",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    },
    document: doc,
    fields: {
      version: 1,
      fields: [
        { key: "customer.name", label: "Customer name", fieldType: "text", required: true },
      ],
    },
    data: {
      version: 1,
      updatedAt: "2026-05-13T00:00:00.000Z",
      values: {
        "customer.name": 123,
      },
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function expectNoLayoutError(page) {
  const badge = page.getByTestId("layout-error-badge")
  assert(await badge.count() === 0, "unexpected layout error badge is visible")
}

async function expectRuntimeFontFetch(page) {
  const result = await page.evaluate(async () => {
    const response = await fetch("/fonts/THSarabun.ttf")
    return {
      ok: response.ok,
      status: response.status,
      byteLength: response.ok ? (await response.arrayBuffer()).byteLength : 0,
    }
  })

  assert(result.ok, `runtime font fetch failed with status ${result.status}`)
  assert(result.byteLength > 0, "runtime font fetch returned an empty file")
}

async function expectedPaginatedPageCount(page, doc) {
  return page.evaluate(async (documentForPagination) => {
    const response = await fetch("/api/paginate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(documentForPagination),
    })
    if (!response.ok) throw new Error(`paginate failed with ${response.status}`)
    if (response.headers.get("X-FlowDoc-Font") === "fallback") {
      throw new Error("paginate used runtime font fallback")
    }
    const paginated = await response.json()
    return paginated.sections.reduce((sum, section) => sum + section.pages.length, 0)
  }, doc)
}

async function pdfPageCountFromDownload(download) {
  const filePath = await download.path()
  assert(filePath, "expected PDF download to have a local path")
  const bytes = await readFile(filePath)
  const pdf = await PDFDocument.load(bytes)
  return pdf.getPageCount()
}

async function expectInlineEditVisualMode(page, nodeId, expected) {
  const selector = `textarea[data-inline-edit-node-id="${nodeId}"]`
  await page.waitForFunction(
    ({ selector, mode, fallbackReason }) => {
      const textarea = document.querySelector(selector)
      if (!textarea) return false
      if (textarea.dataset.inlineEditVisualMode !== mode) return false
      const actualFallback = textarea.dataset.inlineEditFallbackReason ?? null
      return actualFallback === fallbackReason
    },
    { selector, mode: expected.mode, fallbackReason: expected.fallbackReason ?? null },
    { timeout: expected.timeout ?? 5000 },
  )

  const visualState = await page.locator(selector).evaluate((textarea) => {
    const style = window.getComputedStyle(textarea)
    return {
      mode: textarea.dataset.inlineEditVisualMode,
      fallbackReason: textarea.dataset.inlineEditFallbackReason ?? null,
      outlineStyle: style.outlineStyle,
    }
  })
  assert(
    visualState.mode === expected.mode,
    `expected inline edit visual mode ${expected.mode}, got ${visualState.mode}`,
  )
  assert(
    visualState.fallbackReason === (expected.fallbackReason ?? null),
    `expected inline edit fallback ${expected.fallbackReason ?? null}, got ${visualState.fallbackReason}`,
  )
  if (expected.outlineStyle) {
    assert(
      visualState.outlineStyle === expected.outlineStyle,
      `expected inline edit outline style ${expected.outlineStyle}, got ${visualState.outlineStyle}`,
    )
  }
}

async function expectInlineEditVisualContract(page, nodeId) {
  const selector = `textarea[data-inline-edit-node-id="${nodeId}"]`
  await page.waitForFunction((selector) => {
    const textarea = document.querySelector(selector)
    const mode = textarea?.dataset.inlineEditVisualMode
    if (mode === "document") return (textarea.dataset.inlineEditFallbackReason ?? null) === null
    if (mode === "textarea") return Boolean(textarea.dataset.inlineEditFallbackReason)
    return false
  }, selector, { timeout: 5000 })

  const visualState = await page.locator(selector).evaluate((textarea) => ({
    mode: textarea.dataset.inlineEditVisualMode,
    fallbackReason: textarea.dataset.inlineEditFallbackReason ?? null,
  }))
  assert(
    visualState.mode === "document" || visualState.mode === "textarea",
    `expected inline edit visual contract mode, got ${visualState.mode}`,
  )
  if (visualState.mode === "textarea") {
    assert(
      Boolean(visualState.fallbackReason),
      "expected textarea fallback mode to expose a fallback reason",
    )
  }
}

async function waitForStoredParagraphText(page, nodeId, expectedText) {
  try {
    await page.waitForFunction(
      ({ key, nodeId, expectedText }) => {
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed?.kind === "document" && (parsed?.packageVersion === 1 || parsed?.packageVersion === 2)
          ? parsed.document
          : parsed
        for (const section of doc.document.sections) {
          const node = section.nodes[nodeId]
          if (node?.type === "paragraph") {
            return node.children
              .filter((child) => child.type === "text")
              .map((child) => child.text)
              .join("") === expectedText
          }
        }
        return false
      },
      { key: STORAGE_KEY, nodeId, expectedText },
      { timeout: 5000 },
    )
  } catch (error) {
    const actualText = await readStoredParagraphText(page, nodeId)
    const expectedMarkerIndex = expectedText.indexOf("FlowDocContinuationMarker")
    const actualMarkerIndex = actualText?.indexOf("FlowDocContinuationMarker") ?? -1
    const expectedAroundMarker = expectedMarkerIndex >= 0
      ? expectedText.slice(Math.max(0, expectedMarkerIndex - 80), expectedMarkerIndex + 120)
      : ""
    const actualAroundMarker = actualMarkerIndex >= 0 && actualText
      ? actualText.slice(Math.max(0, actualMarkerIndex - 80), actualMarkerIndex + 120)
      : ""
    const actualAddedIndex = actualText?.indexOf("Added from") ?? -1
    const actualAroundAdded = actualAddedIndex >= 0 && actualText
      ? actualText.slice(Math.max(0, actualAddedIndex - 80), actualAddedIndex + 220)
      : ""
    throw new Error(
      `expected stored paragraph ${nodeId} text length ${expectedText.length}, got ${actualText?.length ?? "null"}; ` +
      `expected tail ${JSON.stringify(expectedText.slice(-120))}, got tail ${JSON.stringify(actualText?.slice(-120) ?? null)}; ` +
      `expected marker@${expectedMarkerIndex} ${JSON.stringify(expectedAroundMarker)}, got marker@${actualMarkerIndex} ${JSON.stringify(actualAroundMarker)}; ` +
      `actual Added@${actualAddedIndex} ${JSON.stringify(actualAroundAdded)}: ${error.message}`,
    )
  }
}

async function readStoredParagraphText(page, nodeId) {
  return page.evaluate(
    ({ key, nodeId }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const doc = parsed?.kind === "document" && (parsed?.packageVersion === 1 || parsed?.packageVersion === 2)
        ? parsed.document
        : parsed
      for (const section of doc.document.sections) {
        const node = section.nodes[nodeId]
        if (node?.type === "paragraph") {
          return node.children
            .filter((child) => child.type === "text")
            .map((child) => child.text)
            .join("")
        }
      }
      return null
    },
    { key: STORAGE_KEY, nodeId },
  )
}

async function waitForParagraphFragmentCountAtLeast(page, nodeId, expectedMinCount) {
  const selector = `[data-testid="editor-fragment"][data-node-id="${nodeId}"]`
  await page.waitForFunction(
    ({ selector, expectedMinCount }) => document.querySelectorAll(selector).length >= expectedMinCount,
    { selector, expectedMinCount },
    { timeout: 10000 },
  )
}

async function readParagraphFragmentSnapshot(page, nodeId) {
  return page.evaluate((nodeId) => {
    const selector = `[data-testid="editor-fragment"][data-node-id="${nodeId}"]`
    return Array.from(document.querySelectorAll(selector)).map((fragment) => ({
      pageIndex: Number(fragment.getAttribute("data-page-index") ?? "0"),
      fragmentIndex: fragment.getAttribute("data-fragment-index"),
      lineStart: fragment.getAttribute("data-line-start"),
      lineEnd: fragment.getAttribute("data-line-end"),
      parentNodeId: fragment.getAttribute("data-parent-node-id"),
      textLines: Array.from(fragment.querySelectorAll("text"))
        .map((node) => node.textContent ?? "")
        .filter((text) => text.trim().length > 0),
    }))
  }, nodeId)
}

async function waitForStableParagraphSnapshot(page, nodeId, timeout = 5000) {
  const deadline = Date.now() + timeout
  let previous = null
  let stableCount = 0

  while (Date.now() < deadline) {
    const snapshot = await readParagraphFragmentSnapshot(page, nodeId)
    const serialized = JSON.stringify(snapshot)
    if (serialized === previous) {
      stableCount += 1
      if (stableCount >= 3) return snapshot
    } else {
      previous = serialized
      stableCount = 0
    }
    await page.waitForTimeout(100)
  }

  throw new Error(`paragraph ${nodeId} did not reach a stable visible snapshot`)
}

function countOccurrences(text, marker) {
  return text.split(marker).length - 1
}

async function expectVisibleParagraphMarkerOnce(page, nodeId, marker) {
  const snapshot = await waitForStableParagraphSnapshot(page, nodeId)
  const visibleText = snapshot.flatMap((fragment) => fragment.textLines).join(" ")
  assert(
    countOccurrences(visibleText, marker) === 1,
    `expected visible paragraph ${nodeId} to contain marker ${marker} exactly once, got: ${visibleText}`,
  )
  return snapshot
}

async function expectInlineEditSliceMatchesTextarea(page, nodeId, expected) {
  const selector = `textarea[data-inline-edit-node-id="${nodeId}"]`
  const slice = await page.locator(selector).evaluate((textarea) => ({
    start: Number(textarea.dataset.inlineEditSliceStart ?? "0"),
    end: Number(textarea.dataset.inlineEditSliceEnd ?? "0"),
    valueLength: textarea.value.length,
  }))
  assert(Number.isFinite(slice.start) && Number.isFinite(slice.end), `expected finite slice for ${nodeId}`)
  assert(slice.end >= slice.start, `expected slice end >= start for ${nodeId}, got ${slice.start}-${slice.end}`)
  assert(
    slice.valueLength === slice.end - slice.start,
    `expected textarea slice length to match value for ${nodeId}, got value ${slice.valueLength} and slice ${slice.start}-${slice.end}`,
  )
  if (expected?.maxEndExclusive != null) {
    assert(
      slice.end < expected.maxEndExclusive,
      `expected slice end below ${expected.maxEndExclusive} for ${nodeId}, got ${slice.end}`,
    )
  }
  if (expected?.minStart != null) {
    assert(
      slice.start >= expected.minStart,
      `expected slice start at least ${expected.minStart} for ${nodeId}, got ${slice.start}`,
    )
  }
  return slice
}

async function expectInlineSelectionOverlay(page, nodeId) {
  try {
    await page.waitForFunction((nodeId) => {
      const textarea = document.querySelector(`textarea[data-inline-edit-node-id="${nodeId}"]`)
      if (!(textarea instanceof HTMLTextAreaElement)) return false
      const hasSelection = textarea.selectionEnd > textarea.selectionStart
      const hasOverlay = document.querySelectorAll(
        `[data-testid="editor-fragment"][data-node-id="${nodeId}"] [data-wysiwyg-selection="true"]`,
      ).length > 0
      return hasSelection && hasOverlay && textarea.dataset.inlineEditVisualMode === "document"
    }, nodeId, { timeout: 5000 })
  } catch (error) {
    const state = await page.evaluate((nodeId) => {
      const textarea = document.querySelector(`textarea[data-inline-edit-node-id="${nodeId}"]`)
      return {
        selectionStart: textarea instanceof HTMLTextAreaElement ? textarea.selectionStart : null,
        selectionEnd: textarea instanceof HTMLTextAreaElement ? textarea.selectionEnd : null,
        visualMode: textarea instanceof HTMLTextAreaElement ? textarea.dataset.inlineEditVisualMode ?? null : null,
        fallbackReason: textarea instanceof HTMLTextAreaElement ? textarea.dataset.inlineEditFallbackReason ?? null : null,
        overlayCount: document.querySelectorAll(
          `[data-testid="editor-fragment"][data-node-id="${nodeId}"] [data-wysiwyg-selection="true"]`,
        ).length,
      }
    }, nodeId)
    throw new Error(`expected inline selection overlay for ${nodeId}, got ${JSON.stringify(state)}: ${error.message}`)
  }
}

async function expectActiveInlineTextarea(page, nodeId) {
  await page.waitForFunction(
    (nodeId) => {
      const active = document.activeElement
      return active instanceof HTMLTextAreaElement &&
        active.dataset.inlineEditNodeId === nodeId
    },
    nodeId,
    { timeout: 5000 },
  )
}

async function openInlineTextareaFromFragment(page, fragment, nodeId) {
  const textarea = page.locator(`textarea[data-inline-edit-node-id="${nodeId}"]`)
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    await fragment.scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)
    await fragment.dblclick()
    try {
      await textarea.waitFor({ state: "visible", timeout: 5000 })
      return textarea
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`expected inline textarea for ${nodeId}`)
}

async function waitForActiveInlineTextareaSliceStartAtLeast(page, nodeId, expectedMinStart) {
  await page.waitForFunction(
    ({ nodeId, expectedMinStart }) => {
      const active = document.activeElement
      if (!(active instanceof HTMLTextAreaElement)) return false
      if (active.dataset.inlineEditNodeId !== nodeId) return false
      const sliceStart = Number(active.dataset.inlineEditSliceStart ?? "0")
      return Number.isFinite(sliceStart) && sliceStart >= expectedMinStart
    },
    { nodeId, expectedMinStart },
    { timeout: 10000 },
  )
}

async function waitForStoredTableShape(page, tableId, expected) {
  await page.waitForFunction(
    ({ key, tableId, rows, cols, headerRowCount }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      const doc = parsed?.kind === "document" && (parsed?.packageVersion === 1 || parsed?.packageVersion === 2)
        ? parsed.document
        : parsed
      for (const section of doc.document.sections) {
        const table = section.nodes[tableId]
        if (table?.type !== "table") continue
        return table.rowIds.length === rows &&
          table.columns.length === cols &&
          (headerRowCount == null || (table.props.headerRowCount ?? 0) === headerRowCount)
      }
      return false
    },
    { key: STORAGE_KEY, tableId, ...expected },
    { timeout: 5000 },
  )
}

async function storedTableCellId(page, tableId, rowIndex, colIndex) {
  return page.evaluate(
    ({ key, tableId, rowIndex, colIndex }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const doc = parsed?.kind === "document" && (parsed?.packageVersion === 1 || parsed?.packageVersion === 2)
        ? parsed.document
        : parsed
      for (const section of doc.document.sections) {
        const table = section.nodes[tableId]
        if (table?.type !== "table") continue
        const rowId = table.rowIds[rowIndex]
        const row = table.nodes[rowId]
        return row?.type === "table-row" ? row.cellIds[colIndex] ?? null : null
      }
      return null
    },
    { key: STORAGE_KEY, tableId, rowIndex, colIndex },
  )
}

async function storedTableCellFirstChildId(page, tableId, rowIndex, colIndex) {
  return page.evaluate(
    ({ key, tableId, rowIndex, colIndex }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const doc = parsed?.kind === "document" && (parsed?.packageVersion === 1 || parsed?.packageVersion === 2)
        ? parsed.document
        : parsed
      for (const section of doc.document.sections) {
        const table = section.nodes[tableId]
        if (table?.type !== "table") continue
        const rowId = table.rowIds[rowIndex]
        const row = table.nodes[rowId]
        const cellId = row?.type === "table-row" ? row.cellIds[colIndex] : null
        const cell = cellId ? table.nodes[cellId] : null
        return cell?.type === "table-cell" ? cell.childIds[0] ?? null : null
      }
      return null
    },
    { key: STORAGE_KEY, tableId, rowIndex, colIndex },
  )
}

async function waitForVisibleTableCellCount(page, expectedCount) {
  await page.waitForFunction(
    (count) => document.querySelectorAll('[data-testid="editor-fragment"][data-node-type="table-cell"]').length === count,
    expectedCount,
    { timeout: 5000 },
  )
}

async function waitForZoneText(page, zone, nodeId, expectedText, timeout = 5000) {
  await page.waitForFunction(
    ({ zone, nodeId, expectedText }) => {
      const fragments = Array.from(document.querySelectorAll(
        `[data-testid="editor-zone-fragment"][data-zone="${zone}"][data-node-id="${nodeId}"]`,
      ))
      return fragments.some((fragment) =>
        fragment.textContent?.includes(expectedText) &&
        getComputedStyle(fragment).pointerEvents === "none",
      )
    },
    { zone, nodeId, expectedText },
    { timeout },
  )
}

async function waitForStoredPackageVersion(page, expectedVersion) {
  await page.waitForFunction(
    ({ key, expectedVersion }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      return parsed?.packageVersion === expectedVersion && parsed?.kind === "document"
    },
    { key: STORAGE_KEY, expectedVersion },
    { timeout: 5000 },
  )
}

async function waitForStoredSnapshotValue(page, keyName, expectedValue) {
  await page.waitForFunction(
    ({ storageKey, keyName, expectedValue }) => {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      return parsed?.packageVersion === 2 &&
        parsed?.kind === "document" &&
        parsed?.data?.version === 1 &&
        parsed?.data?.values?.[keyName] === expectedValue
    },
    { storageKey: STORAGE_KEY, keyName, expectedValue },
    { timeout: 5000 },
  )
}

async function waitForStoredFieldRefMetadata(page, fieldRefId, expected) {
  await page.waitForFunction(
    ({ storageKey, fieldRefId, expected }) => {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      const doc = parsed?.kind === "document" && parsed?.packageVersion === 2
        ? parsed.document
        : parsed
      for (const section of doc.document.sections) {
        for (const node of Object.values(section.nodes)) {
          const paragraphs = []
          if (node?.type === "paragraph") paragraphs.push(node)
          if (node?.type === "table") {
            for (const inner of Object.values(node.nodes)) {
              if (inner?.type === "paragraph") paragraphs.push(inner)
            }
          }
          for (const paragraph of paragraphs) {
            const fieldRef = paragraph.children.find((child) => child.type === "fieldRef" && child.id === fieldRefId)
            if (!fieldRef) continue
            return fieldRef.key === expected.key &&
              fieldRef.label === expected.label &&
              fieldRef.fallback === expected.fallback
          }
        }
      }
      return false
    },
    { storageKey: STORAGE_KEY, fieldRefId, expected },
    { timeout: 5000 },
  )
}

async function expectPropertyPanelTitle(page, expectedTitle) {
  const panelTitle = page.getByTestId("property-panel-title")
  await panelTitle.waitFor({ state: "visible", timeout: 5000 })
  await page.waitForFunction((titleText) => {
    const title = document.querySelector('[data-testid="property-panel-title"]')
    return title?.textContent?.trim() === titleText
  }, expectedTitle, { timeout: 3000 })
}

function isIgnoredResourceError(error) {
  if (error.status !== 404) return false

  return isIgnoredResourceUrl(error.url)
}

function isIgnoredResourceUrl(url) {
  try {
    return new URL(url).pathname === "/favicon.ico"
  } catch {
    return false
  }
}

function formatConsoleError(error) {
  return [
    error.text,
    error.location?.url ? `at ${error.location.url}:${error.location.lineNumber}:${error.location.columnNumber}` : null,
  ].filter(Boolean).join(" ")
}

function formatResourceError(error) {
  return `${error.status} ${error.url}`
}

function isIgnorableConsoleError(error, ignoredResourceErrors) {
  return (
    error.text === "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
    (
      ignoredResourceErrors.some((error) => isIgnoredResourceError(error)) ||
      isIgnoredResourceUrl(error.location?.url ?? "")
    )
  )
}

function collectPageErrors(page, consoleErrors, pageErrors, resourceErrors) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push({
        text: message.text(),
        location: message.location(),
      })
    }
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  page.on("response", (response) => {
    const status = response.status()
    if (status >= 400) {
      resourceErrors.push({ status, url: response.url() })
    }
  })
}

async function waitForServer(url, server, timeoutMs = 60000) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    if (server?.exitCode != null) {
      throw new Error(`Next dev server exited before ${url} was ready`)
    }

    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ""}`)
}

function startNextDevServer() {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--port", String(smokePort)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(smokePort),
        BROWSER: "none",
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  )
  child.output = []

  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    child.output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stderr.write(text)
  })

  return child
}

function stopNextDevServer(server) {
  if (!server || server.exitCode != null) return
  server.kill()
}

async function run() {
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null

  try {
    if (server) await waitForServer(baseUrl, server)

    console.log(`editor smoke browser: ${smokeBrowserLabel(smokeBrowser)}`)
    browser = await launchSmokeBrowser(smokeBrowser)
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const consoleErrors = []
    const pageErrors = []
    const resourceErrors = []

    collectPageErrors(page, consoleErrors, pageErrors, resourceErrors)

    await page.addInitScript(({ key, doc }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(doc))
    }, { key: STORAGE_KEY, doc: makeSmokeDocument() })

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await page.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await page.getByTestId("editor-toolbar").waitFor({ state: "visible" })
    await page.getByTestId("editor-canvas").waitFor({ state: "visible" })
    await page.getByTestId("editor-page").first().waitFor({ state: "visible" })
    await waitForZoneText(page, "header", "smoke-header-p1", "Smoke Header Preview")
    await waitForZoneText(page, "footer", "smoke-footer-p1", "Smoke Footer Preview")
    await expectRuntimeFontFetch(page)
    await expectNoLayoutError(page)

    const editedText = [
      "Automated smoke edit line one",
      "line two keeps the inline editor honest",
      "line three checks wrapping and commit",
    ].join("\n")

    const paragraphFragment = page.locator('[data-testid="editor-fragment"][data-node-id="smoke-p1"]')
    assert(await paragraphFragment.count() === 1, "expected one smoke paragraph fragment")
    await paragraphFragment.dblclick()

    const textarea = page.locator('textarea[data-inline-edit-node-id="smoke-p1"]')
    await textarea.waitFor({ state: "visible", timeout: 5000 })
    await expectInlineEditVisualContract(page, "smoke-p1")
    await textarea.fill(editedText)
    await expectInlineEditVisualMode(page, "smoke-p1", {
      mode: "document",
      fallbackReason: null,
      outlineStyle: "none",
    })
    await textarea.press("Escape")
    await waitForStoredParagraphText(page, "smoke-p1", editedText)
    await waitForStoredPackageVersion(page, 2)
    await expectNoLayoutError(page)

    await page.getByRole("button", { name: "Undo" }).click()
    await waitForStoredParagraphText(page, "smoke-p1", "Smoke paragraph baseline")

    await page.getByRole("button", { name: "Redo" }).click()
    await waitForStoredParagraphText(page, "smoke-p1", editedText)
    await expectNoLayoutError(page)

    await paragraphFragment.dblclick()
    await textarea.waitFor({ state: "visible", timeout: 5000 })
    await expectInlineEditVisualContract(page, "smoke-p1")
    const selectionBox = await textarea.boundingBox()
    assert(selectionBox, "expected body paragraph textarea box for drag selection")
    await page.mouse.move(selectionBox.x + 16, selectionBox.y + Math.min(18, selectionBox.height / 2))
    await page.mouse.down()
    await page.mouse.move(selectionBox.x + Math.min(selectionBox.width - 16, 240), selectionBox.y + Math.min(18, selectionBox.height / 2), { steps: 8 })
    await page.mouse.up()
    await expectInlineSelectionOverlay(page, "smoke-p1")
    await expectInlineEditVisualMode(page, "smoke-p1", {
      mode: "document",
      fallbackReason: null,
      outlineStyle: "none",
    })
    await textarea.press("Escape")
    await waitForStoredParagraphText(page, "smoke-p1", editedText)

    const thaiEditedText = "ทดสอบภาษาไทย ก้าวหน้า ไม้เอกไม้โท และ emoji 👩‍💻"
    const thaiFragment = page.locator('[data-testid="editor-fragment"][data-node-id="smoke-thai-p1"]')
    assert(await thaiFragment.count() === 1, "expected one Thai smoke paragraph fragment")
    await thaiFragment.dblclick()
    const thaiTextarea = page.locator('textarea[data-inline-edit-node-id="smoke-thai-p1"]')
    await thaiTextarea.waitFor({ state: "visible", timeout: 5000 })
    await expectInlineEditVisualContract(page, "smoke-thai-p1")
    await thaiTextarea.dispatchEvent("compositionstart")
    await expectInlineEditVisualMode(page, "smoke-thai-p1", {
      mode: "textarea",
      fallbackReason: "composition",
      outlineStyle: "solid",
    })
    await thaiTextarea.dispatchEvent("compositionend")
    await thaiTextarea.fill(thaiEditedText)
    await expectInlineEditVisualContract(page, "smoke-thai-p1")
    await thaiTextarea.press("Escape")
    await waitForStoredParagraphText(page, "smoke-thai-p1", thaiEditedText)
    await expectNoLayoutError(page)

    const stackMarker = "FlowDocStackMarker"
    const stackEditedText = `Stack paragraph ${"wraps inside a row stack without textarea layout drift. ".repeat(4)}${stackMarker}`
    const stackParagraph = page.locator('[data-testid="editor-fragment"][data-node-id="smoke-stack-p1"]')
    assert(await stackParagraph.count() === 1, "expected one stack paragraph fragment")
    const stackBefore = await readParagraphFragmentSnapshot(page, "smoke-stack-p1")
    assert(stackBefore[0]?.parentNodeId === "smoke-stack", `expected stack paragraph parent, got ${stackBefore[0]?.parentNodeId}`)
    await stackParagraph.dblclick()
    const stackTextarea = page.locator('textarea[data-inline-edit-node-id="smoke-stack-p1"]')
    await stackTextarea.waitFor({ state: "visible", timeout: 5000 })
    await expectInlineEditVisualContract(page, "smoke-stack-p1")
    await stackTextarea.fill(stackEditedText)
    await expectInlineEditVisualMode(page, "smoke-stack-p1", {
      mode: "document",
      fallbackReason: null,
      outlineStyle: "none",
    })
    const stackAfter = await expectVisibleParagraphMarkerOnce(page, "smoke-stack-p1", stackMarker)
    assert(stackAfter[0]?.parentNodeId === "smoke-stack", `expected edited stack paragraph parent, got ${stackAfter[0]?.parentNodeId}`)
    await stackTextarea.press("Escape")
    await waitForStoredParagraphText(page, "smoke-stack-p1", stackEditedText)
    await expectNoLayoutError(page)

    const tableParagraph = page.locator('[data-testid="editor-fragment"][data-node-id="smoke-table-p1-1"]')
    assert(await tableParagraph.count() === 1, "expected one table-cell paragraph fragment")
    await tableParagraph.dblclick()
    const tableTextarea = page.locator('textarea[data-inline-edit-node-id="smoke-table-p1-1"]')
    await tableTextarea.waitFor({ state: "visible", timeout: 5000 })
    await expectInlineEditVisualContract(page, "smoke-table-p1-1")
    await tableTextarea.evaluate((el) => {
      el.focus()
      el.setSelectionRange(0, 0)
    })
    await tableTextarea.press("Backspace")
    await tableTextarea.press("Escape")
    await waitForStoredTableShape(page, "smoke-table", { rows: 2, cols: 3, headerRowCount: 1 })
    await expectNoLayoutError(page)

    await tableParagraph.click()

    await expectPropertyPanelTitle(page, "table-cell")
    await waitForStoredTableShape(page, "smoke-table", { rows: 2, cols: 3, headerRowCount: 1 })
    await waitForVisibleTableCellCount(page, 6)
    await expectNoLayoutError(page)

    await page.getByRole("button", { name: /Right/ }).click()
    await waitForStoredTableShape(page, "smoke-table", { rows: 2, cols: 4, headerRowCount: 1 })
    await waitForVisibleTableCellCount(page, 8)
    const insertedColumnCellId = await storedTableCellId(page, "smoke-table", 1, 2)
    const insertedColumnParagraphId = await storedTableCellFirstChildId(page, "smoke-table", 1, 2)
    assert(insertedColumnCellId, "expected inserted table column cell id")
    assert(insertedColumnParagraphId, "expected inserted table column paragraph id")
    await page.locator(`[data-testid="editor-fragment"][data-node-id="${insertedColumnParagraphId}"]`).click()
    await expectPropertyPanelTitle(page, "table-cell")
    await page.getByRole("button", { name: "Delete column" }).click()
    await waitForStoredTableShape(page, "smoke-table", { rows: 2, cols: 3, headerRowCount: 1 })
    await waitForVisibleTableCellCount(page, 6)
    await expectNoLayoutError(page)

    await tableParagraph.click()
    await expectPropertyPanelTitle(page, "table-cell")
    await page.getByRole("button", { name: /Below/ }).click()
    await waitForStoredTableShape(page, "smoke-table", { rows: 3, cols: 3, headerRowCount: 1 })
    await waitForVisibleTableCellCount(page, 9)
    const insertedRowCellId = await storedTableCellId(page, "smoke-table", 2, 1)
    const insertedRowParagraphId = await storedTableCellFirstChildId(page, "smoke-table", 2, 1)
    assert(insertedRowCellId, "expected inserted table row cell id")
    assert(insertedRowParagraphId, "expected inserted table row paragraph id")
    await page.locator(`[data-testid="editor-fragment"][data-node-id="${insertedRowParagraphId}"]`).click()
    await expectPropertyPanelTitle(page, "table-cell")
    await page.getByRole("button", { name: "Delete row" }).click()
    await waitForStoredTableShape(page, "smoke-table", { rows: 2, cols: 3, headerRowCount: 1 })
    await waitForVisibleTableCellCount(page, 6)
    await expectNoLayoutError(page)

    const fillPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(fillPage, consoleErrors, pageErrors, resourceErrors)
    await fillPage.addInitScript(({ key, doc }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(doc))
    }, { key: STORAGE_KEY, doc: makeFillReadinessDocument() })
    await fillPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await fillPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await fillPage.getByRole("button", { name: "Fill" }).click()
    const readiness = fillPage.getByTestId("filling-readiness")
    await readiness.waitFor({ state: "visible", timeout: 5000 })
    const readinessText = await readiness.textContent()
    assert(
      readinessText?.includes("customer.name") && readinessText.includes("required field"),
      `expected fill readiness warning for customer.name, got: ${readinessText}`,
    )
    await fillPage.getByLabel(/Customer name/).fill("Acme Co")
    await fillPage.waitForFunction(
      () => !document.querySelector('[data-testid="filling-readiness"]'),
      null,
      { timeout: 5000 },
    )
    await fillPage.waitForFunction(
      () => document.body.textContent?.includes("Customer: Acme Co"),
      null,
      { timeout: 5000 },
    )
    await waitForStoredPackageVersion(fillPage, 2)
    await waitForStoredSnapshotValue(fillPage, "customer.name", "Acme Co")
    await expectNoLayoutError(fillPage)
    await fillPage.close()

    const fillErrorPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(fillErrorPage, consoleErrors, pageErrors, resourceErrors)
    await fillErrorPage.addInitScript(({ key, pkg }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(pkg))
    }, { key: STORAGE_KEY, pkg: makeFillReadinessErrorPackage() })
    await fillErrorPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await fillErrorPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await fillErrorPage.getByRole("button", { name: "Fill" }).click()
    const errorReadiness = fillErrorPage.getByTestId("filling-readiness")
    await errorReadiness.waitFor({ state: "visible", timeout: 5000 })
    const errorReadinessText = await errorReadiness.textContent()
    assert(
      errorReadinessText?.includes("customer.name") && errorReadinessText.includes("expects string or null"),
      `expected fill readiness error for customer.name, got: ${errorReadinessText}`,
    )
    await fillErrorPage.waitForFunction(
      () => document.querySelector('[data-testid="export-readiness-status"]')?.textContent?.includes("customer.name"),
      null,
      { timeout: 10000 },
    )
    assert(
      await fillErrorPage.getByRole("button", { name: "Export PDF" }).isDisabled(),
      "expected PDF export to be blocked while fill readiness has errors",
    )
    await fillErrorPage.getByLabel(/Customer name/).fill("Acme Co")
    await fillErrorPage.waitForFunction(
      () => !document.querySelector('[data-testid="filling-readiness"]'),
      null,
      { timeout: 5000 },
    )
    await fillErrorPage.waitForFunction(
      () => !document.querySelector('[data-testid="export-readiness-status"]'),
      null,
      { timeout: 10000 },
    )
    assert(
      !(await fillErrorPage.getByRole("button", { name: "Export PDF" }).isDisabled()),
      "expected PDF export to be enabled after fill readiness errors clear and layout settles",
    )
    await expectNoLayoutError(fillErrorPage)
    await fillErrorPage.close()

    const reportPackage = makeUserReportSmokePackage()
    const reportPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(reportPage, consoleErrors, pageErrors, resourceErrors)
    await reportPage.addInitScript(({ key, pkg }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(pkg))
    }, { key: STORAGE_KEY, pkg: reportPackage })
    await reportPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await reportPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await reportPage.getByRole("button", { name: "Fill" }).click()
    await waitForZoneText(reportPage, "header", "report-smoke-header-text", "Company report smoke", 15000)
    await waitForZoneText(reportPage, "footer", "report-smoke-footer-text", "หน้า", 15000)
    await reportPage.waitForFunction(
      () => document.body.textContent?.includes("Acme Manufacturing Co."),
      null,
      { timeout: 5000 },
    )
    await expectRuntimeFontFetch(reportPage)
    await expectNoLayoutError(reportPage)
    const expectedReportPageCount = await expectedPaginatedPageCount(reportPage, reportPackage.document)
    await reportPage.waitForFunction(
      () => {
        const exportButton = Array.from(document.querySelectorAll("button"))
          .find((button) => button.textContent?.includes("Export PDF"))
        return exportButton instanceof HTMLButtonElement &&
          !exportButton.disabled &&
          !document.querySelector('[data-testid="font-fallback-status"]') &&
          !document.querySelector('[data-testid="layout-warning-status"]') &&
          !document.querySelector('[data-testid="export-readiness-status"]')
      },
      null,
      { timeout: 15000 },
    )
    const [reportDownload] = await Promise.all([
      reportPage.waitForEvent("download"),
      reportPage.getByRole("button", { name: "Export PDF" }).click(),
    ])
    const actualReportPageCount = await pdfPageCountFromDownload(reportDownload)
    assert(
      actualReportPageCount === expectedReportPageCount,
      `expected report PDF page count ${expectedReportPageCount}, got ${actualReportPageCount}`,
    )
    await reportPage.close()

    const registryPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(registryPage, consoleErrors, pageErrors, resourceErrors)
    await registryPage.addInitScript(({ key, pack }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(pack))
    }, { key: STORAGE_KEY, pack: makeRegistryPlacementPackage() })
    await registryPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await registryPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await registryPage.getByTestId("field-palette-item").filter({ hasText: "Project code" }).first().waitFor({ state: "visible", timeout: 5000 })
    const registryParagraph = registryPage.locator('[data-testid="editor-fragment"][data-node-id="registry-p1"]')
    assert(await registryParagraph.count() === 1, "expected one registry field paragraph fragment")
    await registryParagraph.dblclick()
    await registryPage.waitForTimeout(250)
    assert(
      await registryPage.locator('textarea[data-inline-edit-node-id="registry-p1"]').count() === 0,
      "fieldRef paragraph must not enter textarea inline edit",
    )
    await registryParagraph.click()
    const fieldRefs = registryPage.getByTestId("property-field-refs")
    await fieldRefs.waitFor({ state: "visible", timeout: 5000 })
    const fieldRefText = await fieldRefs.textContent()
    assert(
      fieldRefText?.includes("Project code") && fieldRefText.includes("project.code") && fieldRefText.includes("text"),
      `expected property panel field reference details, got: ${fieldRefText}`,
    )
    await registryPage.getByTestId("field-ref-label-input").fill("Project ID")
    await registryPage.getByTestId("field-ref-fallback-input").fill("Unassigned")
    await waitForStoredFieldRefMetadata(registryPage, "registry-f1", {
      key: "project.code",
      label: "Project ID",
      fallback: "Unassigned",
    })
    await expectNoLayoutError(registryPage)
    await registryPage.close()

    const continuationPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(continuationPage, consoleErrors, pageErrors, resourceErrors)
    await continuationPage.addInitScript(({ key, doc }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(doc))
    }, { key: STORAGE_KEY, doc: makeContinuationDocument() })
    await continuationPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await continuationPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await waitForParagraphFragmentCountAtLeast(continuationPage, "wysiwyg-continuation-p1", 3)
    const continuationFragments = continuationPage.locator('[data-testid="editor-fragment"][data-node-id="wysiwyg-continuation-p1"]')
    const firstContinuationFragment = continuationFragments.first()
    await firstContinuationFragment.scrollIntoViewIfNeeded()
    await firstContinuationFragment.dblclick()
    const pageTrackingTextarea = continuationPage.locator('textarea[data-inline-edit-node-id="wysiwyg-continuation-p1"]')
    await pageTrackingTextarea.waitFor({ state: "visible", timeout: 5000 })
    const firstTrackingSlice = await expectInlineEditSliceMatchesTextarea(continuationPage, "wysiwyg-continuation-p1", {
      maxEndExclusive: CONTINUATION_PARAGRAPH_TEXT.length,
    })
    assert(
      await pageTrackingTextarea.getAttribute("data-wysiwyg-inline-edit-enabled") === "true",
      "expected WYSIWYG inline edit foundation to be enabled by the smoke server flag",
    )
    await pageTrackingTextarea.evaluate((el) => {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
    await expectActiveInlineTextarea(continuationPage, "wysiwyg-continuation-p1")
    const pageTrackingMarker = "FlowDocContinuationMarker"
    const pageTrackingAppend = `${" Added from the first fragment so caret tracking must relocate the active textarea while browser pagination reflows.".repeat(4)} ${pageTrackingMarker}.`
    await continuationPage.keyboard.type(pageTrackingAppend, { delay: 1 })
    await waitForActiveInlineTextareaSliceStartAtLeast(continuationPage, "wysiwyg-continuation-p1", 1)
    await expectInlineEditSliceMatchesTextarea(continuationPage, "wysiwyg-continuation-p1")
    await expectNoLayoutError(continuationPage)
    await continuationPage.keyboard.press("Escape")
    const continuationTrackedText = CONTINUATION_PARAGRAPH_TEXT.slice(0, firstTrackingSlice.end) +
      pageTrackingAppend +
      CONTINUATION_PARAGRAPH_TEXT.slice(firstTrackingSlice.end)
    await waitForStoredParagraphText(continuationPage, "wysiwyg-continuation-p1", continuationTrackedText)
    await expectVisibleParagraphMarkerOnce(continuationPage, "wysiwyg-continuation-p1", pageTrackingMarker)
    await continuationPage.getByRole("button", { name: "Undo" }).click()
    await waitForStoredParagraphText(continuationPage, "wysiwyg-continuation-p1", CONTINUATION_PARAGRAPH_TEXT)
    await continuationPage.getByRole("button", { name: "Redo" }).click()
    await waitForStoredParagraphText(continuationPage, "wysiwyg-continuation-p1", continuationTrackedText)
    await expectVisibleParagraphMarkerOnce(continuationPage, "wysiwyg-continuation-p1", pageTrackingMarker)
    await continuationPage.getByRole("button", { name: "Undo" }).click()
    await waitForStoredParagraphText(continuationPage, "wysiwyg-continuation-p1", CONTINUATION_PARAGRAPH_TEXT)
    await continuationPage.close()

    const continuationBoundaryPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(continuationBoundaryPage, consoleErrors, pageErrors, resourceErrors)
    await continuationBoundaryPage.addInitScript(({ key, doc }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(doc))
    }, { key: STORAGE_KEY, doc: makeContinuationDocument() })
    await continuationBoundaryPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await continuationBoundaryPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await waitForParagraphFragmentCountAtLeast(continuationBoundaryPage, "wysiwyg-continuation-p1", 3)
    const continuationBoundaryFragments = continuationBoundaryPage.locator('[data-testid="editor-fragment"][data-node-id="wysiwyg-continuation-p1"]')
    const continuationFragment = continuationBoundaryFragments.nth(1)
    const continuationTextarea = await openInlineTextareaFromFragment(
      continuationBoundaryPage,
      continuationFragment,
      "wysiwyg-continuation-p1",
    )
    const continuationSliceStart = Number(await continuationTextarea.getAttribute("data-inline-edit-slice-start"))
    assert(continuationSliceStart > 0, `expected continuation slice start > 0, got ${continuationSliceStart}`)
    const continuationEditSlice = await expectInlineEditSliceMatchesTextarea(continuationBoundaryPage, "wysiwyg-continuation-p1", {
      minStart: 1,
      maxEndExclusive: CONTINUATION_PARAGRAPH_TEXT.length,
    })
    assert(
      await continuationTextarea.getAttribute("data-wysiwyg-inline-edit-enabled") === "true",
      "expected WYSIWYG inline edit foundation to be enabled in smoke dev mode",
    )
    await expectInlineEditVisualContract(continuationBoundaryPage, "wysiwyg-continuation-p1")
    const continuationLocalEnd = await continuationTextarea.evaluate((el) => {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      return el.value.length
    })
    assert(continuationLocalEnd > 0, "expected continuation textarea to contain suffix text")
    await expectActiveInlineTextarea(continuationBoundaryPage, "wysiwyg-continuation-p1")
    const continuationAppend = " Added live continuation text while the browser preview is allowed to reflow."
    await continuationBoundaryPage.keyboard.type(continuationAppend, { delay: 1 })
    await expectActiveInlineTextarea(continuationBoundaryPage, "wysiwyg-continuation-p1")
    await expectNoLayoutError(continuationBoundaryPage)
    await continuationBoundaryPage.keyboard.press("Escape")
    const continuationEditedText = CONTINUATION_PARAGRAPH_TEXT.slice(0, continuationEditSlice.end) +
      continuationAppend +
      CONTINUATION_PARAGRAPH_TEXT.slice(continuationEditSlice.end)
    await waitForStoredParagraphText(continuationBoundaryPage, "wysiwyg-continuation-p1", continuationEditedText)
    await continuationBoundaryPage.getByRole("button", { name: "Undo" }).click()
    await waitForStoredParagraphText(continuationBoundaryPage, "wysiwyg-continuation-p1", CONTINUATION_PARAGRAPH_TEXT)
    await continuationBoundaryPage.getByRole("button", { name: "Redo" }).click()
    await waitForStoredParagraphText(continuationBoundaryPage, "wysiwyg-continuation-p1", continuationEditedText)

    await waitForParagraphFragmentCountAtLeast(continuationBoundaryPage, "wysiwyg-continuation-p1", 3)
    const boundaryFragment = continuationBoundaryPage.locator('[data-testid="editor-fragment"][data-node-id="wysiwyg-continuation-p1"]').nth(1)
    const boundaryTextarea = await openInlineTextareaFromFragment(
      continuationBoundaryPage,
      boundaryFragment,
      "wysiwyg-continuation-p1",
    )
    const boundarySliceStart = Number(await boundaryTextarea.getAttribute("data-inline-edit-slice-start"))
    assert(boundarySliceStart > 0, `expected boundary slice start > 0, got ${boundarySliceStart}`)
    const beforeBoundaryText = await readStoredParagraphText(continuationBoundaryPage, "wysiwyg-continuation-p1")
    assert(beforeBoundaryText, "expected stored continuation text before boundary backspace")
    const expectedBoundaryText = beforeBoundaryText.slice(0, boundarySliceStart - 1) + beforeBoundaryText.slice(boundarySliceStart)
    const boundarySelection = await boundaryTextarea.evaluate((el) => {
      el.focus()
      el.setSelectionRange(0, 0)
      return { start: el.selectionStart, end: el.selectionEnd }
    })
    assert(
      boundarySelection.start === 0 && boundarySelection.end === 0,
      `expected continuation boundary selection at 0, got ${boundarySelection.start}-${boundarySelection.end}`,
    )
    await expectActiveInlineTextarea(continuationBoundaryPage, "wysiwyg-continuation-p1")
    await continuationBoundaryPage.keyboard.press("Backspace")
    await expectActiveInlineTextarea(continuationBoundaryPage, "wysiwyg-continuation-p1")
    await continuationBoundaryPage.keyboard.press("Escape")
    await waitForStoredParagraphText(continuationBoundaryPage, "wysiwyg-continuation-p1", expectedBoundaryText)
    await expectNoLayoutError(continuationBoundaryPage)
    await continuationBoundaryPage.close()

    const ignoredResourceErrors = resourceErrors.filter(isIgnoredResourceError)
    const unexpectedResourceErrors = resourceErrors.filter((error) => !isIgnoredResourceError(error))
    const unexpectedConsoleErrors = consoleErrors.filter((error) => (
      !isIgnorableConsoleError(error, ignoredResourceErrors)
    ))

    assert(pageErrors.length === 0, `page errors during smoke:\n${pageErrors.join("\n")}`)
    assert(unexpectedResourceErrors.length === 0, [
      "resource errors during smoke:",
      unexpectedResourceErrors.map(formatResourceError).join("\n"),
    ].join("\n"))
    assert(unexpectedConsoleErrors.length === 0, [
      "console errors during smoke:",
      unexpectedConsoleErrors.map(formatConsoleError).join("\n"),
      resourceErrors.length > 0 ? `resource errors seen:\n${resourceErrors.map(formatResourceError).join("\n")}` : "resource errors seen: none",
    ].join("\n"))

    console.log("editor smoke passed")
  } catch (error) {
    if (server?.output?.length) {
      console.error("Next dev server output:")
      console.error(server.output.join("").trim())
    }
    throw error
  } finally {
    await browser?.close()
    stopNextDevServer(server)
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
