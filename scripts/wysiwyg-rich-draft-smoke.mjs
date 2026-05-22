import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const DEFAULT_SMOKE_PORT = 4022
const RICH_PARAGRAPH_ID = "rich-draft-smoke-p1"
const KEYBOARD_PARAGRAPH_ID = "rich-draft-smoke-keyboard-p1"
const TOOLBAR_PARAGRAPH_ID = "rich-draft-smoke-toolbar-p1"
const RANGE_PARAGRAPH_ID = "rich-draft-smoke-range-p1"
const SPACE_PARAGRAPH_ID = "rich-draft-smoke-space-p1"
const FLOW_TABLE_PARAGRAPH_ID = "rich-draft-smoke-flow-table-p1"
const RICH_MARKER = "RICH_DRAFT_BROWSER_MARKER"
const KEYBOARD_MARKER = "RICH_DRAFT_KEYBOARD_MARKER"
const TOOLBAR_MARKER = "RICH_DRAFT_TOOLBAR_MARKER"
const RANGE_TARGET_TEXT = "target"
const SPACE_MARKER = "SPACE_KEY_MARKER"
const SPACE_REPEAT_COUNT = 48
const SPACE_INSERTION = " ".repeat(SPACE_REPEAT_COUNT)
const FLOW_TABLE_MARKER = "RICH_DRAFT_FLOW_TABLE_MARKER"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const platformShortcut = process.platform === "darwin" ? "Meta" : "Control"

function pt(value) {
  return { value, unit: "pt" }
}

function paragraph(id, children) {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "sarabun",
      textColor: "111827",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      strikethrough: false,
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(8),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children,
  }
}

function makeRichDraftSmokeDocument() {
  const richParagraph = paragraph(RICH_PARAGRAPH_ID, [
    { id: "rich-draft-smoke-p1-bold", type: "text", text: "Bold base", style: { fontWeight: "bold" } },
    { id: "rich-draft-smoke-p1-normal", type: "text", text: " and normal" },
  ])
  const keyboardParagraph = paragraph(KEYBOARD_PARAGRAPH_ID, [
    { id: "rich-draft-smoke-keyboard-p1-text", type: "text", text: "Keyboard base" },
  ])
  const toolbarParagraph = paragraph(TOOLBAR_PARAGRAPH_ID, [
    { id: "rich-draft-smoke-toolbar-p1-text", type: "text", text: "Toolbar base" },
  ])
  const rangeParagraph = paragraph(RANGE_PARAGRAPH_ID, [
    { id: "rich-draft-smoke-range-p1-text", type: "text", text: `Range ${RANGE_TARGET_TEXT}` },
  ])
  const spaceParagraph = paragraph(SPACE_PARAGRAPH_ID, [
    { id: "rich-draft-smoke-space-p1-text", type: "text", text: "Space base" },
  ])
  const flowTableParagraph = paragraph(FLOW_TABLE_PARAGRAPH_ID, [
    { id: "rich-draft-smoke-flow-table-p1-italic", type: "text", text: "Flow cell base", style: { fontStyle: "italic" } },
  ])
  const flowTable = {
    id: "rich-draft-smoke-flow-table",
    type: "flow-table",
    props: {
      border: {
        top: { style: "solid", width: pt(1), color: "000000" },
        right: { style: "solid", width: pt(1), color: "000000" },
        bottom: { style: "solid", width: pt(1), color: "000000" },
        left: { style: "solid", width: pt(1), color: "000000" },
      },
    },
    columns: [{ width: pt(240) }],
    rowIds: ["rich-draft-smoke-flow-table-row"],
    nodes: {
      "rich-draft-smoke-flow-table-row": {
        id: "rich-draft-smoke-flow-table-row",
        type: "flow-table-row",
        props: {},
        cellIds: ["rich-draft-smoke-flow-table-cell"],
      },
      "rich-draft-smoke-flow-table-cell": {
        id: "rich-draft-smoke-flow-table-cell",
        type: "flow-table-cell",
        props: {},
        childIds: [FLOW_TABLE_PARAGRAPH_ID],
      },
      [FLOW_TABLE_PARAGRAPH_ID]: flowTableParagraph,
    },
  }

  return {
    version: 1,
    document: {
      id: "rich-draft-smoke-doc",
      meta: { title: "Rich Draft Smoke" },
      sections: [{
        id: "rich-draft-smoke-section",
        type: "section",
        bodyRootId: "rich-draft-smoke-body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        nodes: {
          "rich-draft-smoke-body": {
            id: "rich-draft-smoke-body",
            type: "body",
            props: {},
            childIds: [
              RICH_PARAGRAPH_ID,
              KEYBOARD_PARAGRAPH_ID,
              TOOLBAR_PARAGRAPH_ID,
              RANGE_PARAGRAPH_ID,
              SPACE_PARAGRAPH_ID,
              flowTable.id,
            ],
          },
          [RICH_PARAGRAPH_ID]: richParagraph,
          [KEYBOARD_PARAGRAPH_ID]: keyboardParagraph,
          [TOOLBAR_PARAGRAPH_ID]: toolbarParagraph,
          [RANGE_PARAGRAPH_ID]: rangeParagraph,
          [SPACE_PARAGRAPH_ID]: spaceParagraph,
          [flowTable.id]: flowTable,
        },
      }],
    },
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function startNextDevServer() {
  const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next")
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", String(smokePort)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(smokePort),
      BROWSER: "none",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_INLINE_EDIT: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
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

async function stopNextDevServer(server) {
  if (!server || server.exitCode != null) return
  server.kill()
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000)
    server.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function waitForServer(url, server, timeoutMs = 60000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    if (server?.exitCode != null) {
      throw new Error([
        `Next dev server exited before ${url} was ready.`,
        server.output?.join("") ?? "",
      ].filter(Boolean).join("\n"))
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

function isIgnoredResourceUrl(url) {
  try {
    return new URL(url).pathname === "/favicon.ico"
  } catch {
    return false
  }
}

function isIgnoredResourceError(error) {
  return error.status === 404 && isIgnoredResourceUrl(error.url)
}

function isIgnorableConsoleError(error, ignoredResourceErrors) {
  return (
    error.text === "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
    (
      ignoredResourceErrors.some((resourceError) => isIgnoredResourceError(resourceError)) ||
      isIgnoredResourceUrl(error.location?.url ?? "")
    )
  )
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
    if (status >= 400) resourceErrors.push({ status, url: response.url() })
  })
}

async function expectNoLayoutError(page) {
  assert(await page.getByTestId("layout-error-badge").count() === 0, "layout error badge is visible")
}

async function expectNoTextarea(page) {
  const textareaCount = await page.locator("textarea[data-inline-edit-node-id]").count()
  assert(textareaCount === 0, `expected no inline textarea, found ${textareaCount}`)
}

async function openSeededEditor(page) {
  await page.addInitScript(({ key, doc }) => {
    window.localStorage.clear()
    window.localStorage.setItem(key, JSON.stringify(doc))
  }, { key: STORAGE_KEY, doc: makeRichDraftSmokeDocument() })
  await page.goto(baseEditorUrl, { waitUntil: "domcontentloaded" })
  const shell = page.getByTestId("editor-shell")
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "base text engine flag is not enabled")
  assert(await shell.getAttribute("data-wysiwyg-rich-text-draft-enabled") === "true", "rich draft flag is not enabled")
  await expectNoLayoutError(page)
}

async function focusWysiwygBridge(page, nodeId) {
  await page.locator(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`).first().click()
  const bridge = page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`)
  await bridge.waitFor({ state: "attached", timeout: 10000 })
  await expectNoTextarea(page)
  await bridge.focus()
  await page.keyboard.press("End")
  return bridge
}

async function waitForToolbarButtonPressed(page, testId, pressed, label) {
  await page.waitForFunction(
    ({ testId, pressed }) => {
      const button = document.querySelector(`[data-testid="${testId}"]`)
      return button?.getAttribute("aria-pressed") === String(pressed)
    },
    { testId, pressed },
    { timeout: 10000 },
  )
  const button = page.getByTestId(testId)
  const actual = await button.getAttribute("aria-pressed")
  assert(actual === String(pressed), `${label} expected ${testId} aria-pressed=${pressed}, got ${actual}`)
}

async function assertToolbarCaretRunState(page) {
  await focusWysiwygBridge(page, RICH_PARAGRAPH_ID)
  const toolbar = page.getByTestId("rich-text-toolbar")

  await page.keyboard.press("Home")
  await waitForToolbarButtonPressed(page, "rich-text-toolbar-bold", true, "bold run caret")
  assert(await toolbar.getAttribute("data-style-mode") === "paragraph", "collapsed caret should keep paragraph update mode")
  assert(await page.getByTestId("rich-text-toolbar-scope").getAttribute("data-scope") === "caret", "collapsed rich draft caret should show next-text scope")
  assert(await page.getByTestId("rich-text-toolbar-bold").getAttribute("data-mixed") === "false", "bold run caret should not show mixed state")

  await page.keyboard.press("End")
  await waitForToolbarButtonPressed(page, "rich-text-toolbar-bold", false, "normal run caret")
  assert(await page.getByTestId("rich-text-toolbar-scope").getAttribute("data-scope") === "caret", "normal rich draft caret should keep next-text scope")
  assert(await page.getByTestId("rich-text-toolbar-bold").getAttribute("data-mixed") === "false", "normal run caret should not show mixed state")

  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${RICH_PARAGRAPH_ID}"]`).waitFor({ state: "detached", timeout: 10000 })
  return { boldRunCaretPressed: true, normalRunCaretPressed: false }
}

async function readStoredDocument(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.kind === "document" ? parsed.document : parsed
  }, STORAGE_KEY)
}

function findParagraphInDoc(doc, nodeId) {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
    for (const candidate of Object.values(section.nodes)) {
      if (candidate.type !== "flow-table") continue
      const inner = candidate.nodes?.[nodeId]
      if (inner?.type === "paragraph") return inner
    }
  }
  return null
}

async function waitForStoredParagraph(page, nodeId, predicate, label) {
  try {
    await page.waitForFunction(
      ({ key, nodeId, label }) => {
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed?.kind === "document" ? parsed.document : parsed
        const findParagraph = (documentNode) => {
          for (const section of documentNode.document.sections) {
            const node = section.nodes[nodeId]
            if (node?.type === "paragraph") return node
            for (const candidate of Object.values(section.nodes)) {
              if (candidate.type !== "flow-table") continue
              const inner = candidate.nodes?.[nodeId]
              if (inner?.type === "paragraph") return inner
            }
          }
          return null
        }
        const paragraph = findParagraph(doc)
        if (!paragraph) throw new Error(`missing stored paragraph for ${label}`)
        return window.__flowDocRichDraftSmokePredicate(paragraph)
      },
      { key: STORAGE_KEY, nodeId, label },
      { timeout: 10000 },
    )
  } catch (error) {
    const doc = await readStoredDocument(page)
    const paragraph = doc ? findParagraphInDoc(doc, nodeId) : null
    throw new Error(`${label} did not match. Last stored paragraph: ${JSON.stringify(paragraph)}\n${error.message}`)
  }
  const doc = await readStoredDocument(page)
  const paragraph = findParagraphInDoc(doc, nodeId)
  assert(predicate(paragraph), `stored paragraph did not match ${label}: ${JSON.stringify(paragraph)}`)
  return paragraph
}

async function installPredicate(page, predicateSource) {
  await page.evaluate((source) => {
    window.__flowDocRichDraftSmokePredicate = new Function("paragraph", `return (${source})(paragraph)`)
  }, predicateSource)
}

async function editParagraphAndCommit(page, nodeId, marker) {
  await focusWysiwygBridge(page, nodeId)
  await page.keyboard.type(` ${marker}`, { delay: 4 })
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), marker, { timeout: 10000 })
  await expectNoTextarea(page)
  await expectNoLayoutError(page)
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`).waitFor({ state: "detached", timeout: 10000 })
}

async function editParagraphWithKeyboardCommandAndCommit(page, nodeId, marker) {
  await focusWysiwygBridge(page, nodeId)
  await page.keyboard.press(`${platformShortcut}+B`)
  await page.keyboard.type(` ${marker}`, { delay: 4 })
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), marker, { timeout: 10000 })
  await expectNoTextarea(page)
  await expectNoLayoutError(page)
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`).waitFor({ state: "detached", timeout: 10000 })
}

async function editParagraphWithToolbarCommandAndCommit(page, nodeId, marker) {
  await focusWysiwygBridge(page, nodeId)
  await page.getByTestId("rich-text-toolbar-underline").click()
  await page.keyboard.type(` ${marker}`, { delay: 4 })
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), marker, { timeout: 10000 })
  await expectNoTextarea(page)
  await expectNoLayoutError(page)
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`).waitFor({ state: "detached", timeout: 10000 })
}

async function editParagraphWithSpaceKeyAndCommit(page, nodeId, marker) {
  await focusWysiwygBridge(page, nodeId)
  for (let index = 0; index < SPACE_REPEAT_COUNT; index += 1) {
    await page.keyboard.press("Space")
  }
  await page.keyboard.type(marker, { delay: 4 })
  await page.waitForFunction((expected) => document.body.textContent?.includes(expected), marker, { timeout: 10000 })
  await expectNoTextarea(page)
  await expectNoLayoutError(page)
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`).waitFor({ state: "detached", timeout: 10000 })
}

async function styleSelectedRangeWithToolbarAndCommit(page) {
  await focusWysiwygBridge(page, RANGE_PARAGRAPH_ID)
  const toolbar = page.getByTestId("rich-text-toolbar")
  for (let index = 0; index < RANGE_TARGET_TEXT.length; index += 1) {
    await page.keyboard.press("Shift+ArrowLeft")
  }
  await page.waitForFunction(
    ({ start, end }) => {
      const toolbar = document.querySelector('[data-testid="rich-text-toolbar"]')
      return toolbar?.getAttribute("data-style-mode") === "range" &&
        toolbar.getAttribute("data-style-start") === String(start) &&
        toolbar.getAttribute("data-style-end") === String(end)
    },
    { start: "Range ".length, end: "Range ".length + RANGE_TARGET_TEXT.length },
    { timeout: 10000 },
  )
  assert(await page.locator('[data-wysiwyg-selection="true"]').count() > 0, "selected range overlay is not visible")
  assert(await toolbar.getAttribute("data-style-mode") === "range", "toolbar did not enter range style mode")
  assert(await page.getByTestId("rich-text-toolbar-scope").getAttribute("data-scope") === "range", "selected range should show range toolbar scope")
  await page.getByTestId("rich-text-toolbar-bold").click()
  await waitForToolbarButtonPressed(page, "rich-text-toolbar-bold", true, "selected range bold")
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${RANGE_PARAGRAPH_ID}"]`).waitFor({ state: "detached", timeout: 10000 })
}

async function runSmokeAssertions(page) {
  await openSeededEditor(page)
  const toolbarCaretStates = await assertToolbarCaretRunState(page)

  await installPredicate(page, `(paragraph) =>
    paragraph.children.some((child) => child.type === "text" && child.text.includes("${RICH_MARKER}")) &&
    paragraph.children.some((child) => child.id === "rich-draft-smoke-p1-bold" && child.style?.fontWeight === "bold")
  `)
  await editParagraphAndCommit(page, RICH_PARAGRAPH_ID, RICH_MARKER)
  const richParagraph = await waitForStoredParagraph(
    page,
    RICH_PARAGRAPH_ID,
    (paragraph) => paragraph.children.some((child) => child.type === "text" && child.text.includes(RICH_MARKER)) &&
      paragraph.children.some((child) => child.id === "rich-draft-smoke-p1-bold" && child.style?.fontWeight === "bold"),
    "rich styled paragraph commit",
  )

  await page.keyboard.press(`${platformShortcut}+Z`)
  await installPredicate(page, `(paragraph) =>
    !paragraph.children.some((child) => child.type === "text" && child.text.includes("${RICH_MARKER}")) &&
    paragraph.children.some((child) => child.id === "rich-draft-smoke-p1-bold" && child.style?.fontWeight === "bold")
  `)
  await waitForStoredParagraph(
    page,
    RICH_PARAGRAPH_ID,
    (paragraph) => !paragraph.children.some((child) => child.type === "text" && child.text.includes(RICH_MARKER)) &&
      paragraph.children.some((child) => child.id === "rich-draft-smoke-p1-bold" && child.style?.fontWeight === "bold"),
    "rich styled paragraph undo",
  )

  await page.keyboard.press(`${platformShortcut}+Y`)
  await installPredicate(page, `(paragraph) =>
    paragraph.children.some((child) => child.type === "text" && child.text.includes("${RICH_MARKER}")) &&
    paragraph.children.some((child) => child.id === "rich-draft-smoke-p1-bold" && child.style?.fontWeight === "bold")
  `)
  await waitForStoredParagraph(
    page,
    RICH_PARAGRAPH_ID,
    (paragraph) => paragraph.children.some((child) => child.type === "text" && child.text.includes(RICH_MARKER)) &&
      paragraph.children.some((child) => child.id === "rich-draft-smoke-p1-bold" && child.style?.fontWeight === "bold"),
    "rich styled paragraph redo",
  )

  await installPredicate(page, `(paragraph) =>
    paragraph.children.some((child) => child.type === "text" && child.text.includes("${KEYBOARD_MARKER}") && child.style?.fontWeight === "bold")
  `)
  await editParagraphWithKeyboardCommandAndCommit(page, KEYBOARD_PARAGRAPH_ID, KEYBOARD_MARKER)
  const keyboardParagraph = await waitForStoredParagraph(
    page,
    KEYBOARD_PARAGRAPH_ID,
    (paragraph) => paragraph.children.some((child) => child.type === "text" && child.text.includes(KEYBOARD_MARKER) && child.style?.fontWeight === "bold"),
    "rich keyboard command pending style commit",
  )

  await installPredicate(page, `(paragraph) =>
    paragraph.children.some((child) => child.type === "text" && child.text.includes("${TOOLBAR_MARKER}") && child.style?.textDecoration === "underline")
  `)
  await editParagraphWithToolbarCommandAndCommit(page, TOOLBAR_PARAGRAPH_ID, TOOLBAR_MARKER)
  const toolbarParagraph = await waitForStoredParagraph(
    page,
    TOOLBAR_PARAGRAPH_ID,
    (paragraph) => paragraph.children.some((child) => child.type === "text" && child.text.includes(TOOLBAR_MARKER) && child.style?.textDecoration === "underline"),
    "rich toolbar command pending style commit",
  )

  await installPredicate(page, `(paragraph) =>
    paragraph.children.some((child) => child.type === "text" && child.text === "${RANGE_TARGET_TEXT}" && child.style?.fontWeight === "bold") &&
    paragraph.children.some((child) => child.type === "text" && child.text === "Range " && child.style?.fontWeight !== "bold")
  `)
  await styleSelectedRangeWithToolbarAndCommit(page)
  const rangeParagraph = await waitForStoredParagraph(
    page,
    RANGE_PARAGRAPH_ID,
    (paragraph) => paragraph.children.some((child) => child.type === "text" && child.text === RANGE_TARGET_TEXT && child.style?.fontWeight === "bold") &&
      paragraph.children.some((child) => child.type === "text" && child.text === "Range " && child.style?.fontWeight !== "bold"),
    "rich toolbar selected range style commit",
  )

  await installPredicate(page, `(paragraph) =>
    paragraph.children.map((child) => child.text ?? "").join("").includes("Space base${SPACE_INSERTION}${SPACE_MARKER}")
  `)
  await editParagraphWithSpaceKeyAndCommit(page, SPACE_PARAGRAPH_ID, SPACE_MARKER)
  const spaceParagraph = await waitForStoredParagraph(
    page,
    SPACE_PARAGRAPH_ID,
    (paragraph) => paragraph.children.map((child) => child.text ?? "").join("").includes(`Space base${SPACE_INSERTION}${SPACE_MARKER}`),
    "space key paragraph commit",
  )

  await installPredicate(page, `(paragraph) =>
    paragraph.children.some((child) => child.type === "text" && child.text.includes("${FLOW_TABLE_MARKER}")) &&
    paragraph.children.some((child) => child.id === "rich-draft-smoke-flow-table-p1-italic" && child.style?.fontStyle === "italic")
  `)
  await editParagraphAndCommit(page, FLOW_TABLE_PARAGRAPH_ID, FLOW_TABLE_MARKER)
  const flowTableParagraph = await waitForStoredParagraph(
    page,
    FLOW_TABLE_PARAGRAPH_ID,
    (paragraph) => paragraph.children.some((child) => child.type === "text" && child.text.includes(FLOW_TABLE_MARKER)) &&
      paragraph.children.some((child) => child.id === "rich-draft-smoke-flow-table-p1-italic" && child.style?.fontStyle === "italic"),
    "flow-table rich paragraph commit",
  )

  return {
    toolbarCaretStates,
    richParagraphRuns: richParagraph.children.map((child) => ({ id: child.id, text: child.text, style: child.style ?? null })),
    keyboardRuns: keyboardParagraph.children.map((child) => ({ id: child.id, text: child.text, style: child.style ?? null })),
    toolbarRuns: toolbarParagraph.children.map((child) => ({ id: child.id, text: child.text, style: child.style ?? null })),
    rangeRuns: rangeParagraph.children.map((child) => ({ id: child.id, text: child.text, style: child.style ?? null })),
    spaceRuns: spaceParagraph.children.map((child) => ({ id: child.id, text: child.text, style: child.style ?? null })),
    flowTableRuns: flowTableParagraph.children.map((child) => ({ id: child.id, text: child.text, style: child.style ?? null })),
  }
}

async function run() {
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null

  try {
    if (server) await waitForServer(baseEditorUrl, server)

    console.log(`wysiwyg rich draft smoke browser: ${smokeBrowserLabel(smokeBrowser)}`)
    browser = await launchSmokeBrowser(smokeBrowser)
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const consoleErrors = []
    const pageErrors = []
    const resourceErrors = []
    collectPageErrors(page, consoleErrors, pageErrors, resourceErrors)

    const assertions = await runSmokeAssertions(page)

    const ignoredResourceErrors = resourceErrors.filter(isIgnoredResourceError)
    const unexpectedResourceErrors = resourceErrors.filter((error) => !isIgnoredResourceError(error))
    const unexpectedConsoleErrors = consoleErrors.filter((error) => !isIgnorableConsoleError(error, ignoredResourceErrors))

    assert(pageErrors.length === 0, `page errors during smoke:\n${pageErrors.join("\n")}`)
    assert(unexpectedResourceErrors.length === 0, `resource errors during smoke:\n${unexpectedResourceErrors.map(formatResourceError).join("\n")}`)
    assert(unexpectedConsoleErrors.length === 0, [
      "console errors during smoke:",
      unexpectedConsoleErrors.map(formatConsoleError).join("\n"),
      resourceErrors.length > 0 ? `resource errors seen:\n${resourceErrors.map(formatResourceError).join("\n")}` : "resource errors seen: none",
    ].join("\n"))

    console.log(JSON.stringify({
      ok: true,
      browser: {
        mode: smokeBrowserLabel(smokeBrowser),
        channel: smokeBrowser.channel ?? null,
        executablePath: smokeBrowser.executablePath ?? null,
        headless,
      },
      flags: {
        textEngine: true,
        richTextDraft: true,
      },
      assertions,
      ignoredResourceErrors,
    }, null, 2))
  } catch (error) {
    if (server?.output?.length) {
      console.error("Next dev server output:")
      console.error(server.output.join("").trim())
    }
    throw error
  } finally {
    await browser?.close()
    await stopNextDevServer(server)
  }
}

run().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
