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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function expectNoLayoutError(page) {
  const badge = page.getByTestId("layout-error-badge")
  assert(await badge.count() === 0, "unexpected layout error badge is visible")
}

async function waitForStoredParagraphText(page, nodeId, expectedText) {
  await page.waitForFunction(
    ({ key, nodeId, expectedText }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      const doc = parsed?.packageVersion === 1 && parsed?.kind === "document"
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

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => pageErrors.push(error.message))

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
    await textarea.fill(editedText)
    await textarea.press("Escape")
    await waitForStoredParagraphText(page, "smoke-p1", editedText)
    await expectNoLayoutError(page)

    await page.getByRole("button", { name: "Undo" }).click()
    await waitForStoredParagraphText(page, "smoke-p1", "Smoke paragraph baseline")

    await page.getByRole("button", { name: "Redo" }).click()
    await waitForStoredParagraphText(page, "smoke-p1", editedText)
    await expectNoLayoutError(page)

    const tableParagraph = page.locator('[data-testid="editor-fragment"][data-node-id="smoke-table-p1-1"]')
    assert(await tableParagraph.count() === 1, "expected one table-cell paragraph fragment")
    await tableParagraph.click()

    const panelTitle = page.getByTestId("property-panel-title")
    await panelTitle.waitFor({ state: "visible", timeout: 5000 })
    await page.waitForFunction(() => {
      const title = document.querySelector('[data-testid="property-panel-title"]')
      return title?.textContent?.trim() === "table-cell"
    }, null, { timeout: 3000 })
    await expectNoLayoutError(page)

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
