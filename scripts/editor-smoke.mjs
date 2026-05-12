import { chromium } from "playwright"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const STORAGE_KEY = "flowdoc_document"
const DEFAULT_SMOKE_PORT = 4010

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"

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
        },
        bodyRootId: "smoke-body",
        nodes: {
          "smoke-body": { id: "smoke-body", type: "body", props: {}, childIds: [p1.id, table.id] },
          [p1.id]: p1,
          [table.id]: table,
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function expectNoLayoutError(page) {
  const badge = page.getByTestId("layout-error-badge")
  assert(await badge.count() === 0, "unexpected layout error badge is visible")
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

function collectPageErrors(page, consoleErrors, pageErrors) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
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
      env: { ...process.env, PORT: String(smokePort), BROWSER: "none" },
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

    browser = await chromium.launch({ headless })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const consoleErrors = []
    const pageErrors = []

    collectPageErrors(page, consoleErrors, pageErrors)

    await page.addInitScript(({ key, doc }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(doc))
    }, { key: STORAGE_KEY, doc: makeSmokeDocument() })

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await page.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await page.getByTestId("editor-toolbar").waitFor({ state: "visible" })
    await page.getByTestId("editor-canvas").waitFor({ state: "visible" })
    await page.getByTestId("editor-page").first().waitFor({ state: "visible" })
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

    const tableParagraph = page.locator('[data-testid="editor-fragment"][data-node-id="smoke-table-p1-1"]')
    assert(await tableParagraph.count() === 1, "expected one table-cell paragraph fragment")
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
    collectPageErrors(fillPage, consoleErrors, pageErrors)
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

    const registryPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    collectPageErrors(registryPage, consoleErrors, pageErrors)
    await registryPage.addInitScript(({ key, pack }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(pack))
    }, { key: STORAGE_KEY, pack: makeRegistryPlacementPackage() })
    await registryPage.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await registryPage.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 15000 })
    await registryPage.getByTestId("field-palette-item").filter({ hasText: "Project code" }).first().waitFor({ state: "visible", timeout: 5000 })
    const registryParagraph = registryPage.locator('[data-testid="editor-fragment"][data-node-id="registry-p1"]')
    assert(await registryParagraph.count() === 1, "expected one registry field paragraph fragment")
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

    assert(pageErrors.length === 0, `page errors during smoke:\n${pageErrors.join("\n")}`)
    assert(consoleErrors.length === 0, `console errors during smoke:\n${consoleErrors.join("\n")}`)

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
