import { chromium } from "playwright"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_SMOKE_PORT = 4016
const TARGET_NODE_ID = "stage3-boundary-target"
const SCENARIO_ID = "wysiwyg-stage3-boundary"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const browserChannel = process.env.SMOKE_BROWSER_CHANNEL?.trim() || undefined
const platformShortcut = process.platform === "darwin" ? "Meta" : "Control"

const targetFragmentSelector = `[data-testid="editor-fragment"][data-node-id="${TARGET_NODE_ID}"]`
const bridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${TARGET_NODE_ID}"]`
const textareaSelector = "textarea[data-inline-edit-node-id]"

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  return url.toString()
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
      throw new Error([
        `Next dev server exited before ${url} was ready.`,
        "If another Next dev server for this repo is already running, stop it or pass SMOKE_BASE_URL to a flagged server.",
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
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_TEXT_ENGINE: "1",
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE: "1",
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
  if (!server || server.exitCode != null) return Promise.resolve()
  server.kill()
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000)
    server.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function expectNoLayoutError(page) {
  assert(await page.getByTestId("layout-error-badge").count() === 0, "layout error badge is visible")
}

async function expectNoTextarea(page) {
  const textareaCount = await page.locator(textareaSelector).count()
  assert(textareaCount === 0, `expected no inline textarea, found ${textareaCount}`)
}

async function expectTextEngineBridge(page) {
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await expectNoTextarea(page)
  await expectNoLayoutError(page)
}

async function expectTargetFragmentCount(page, expectedCount) {
  await page.waitForFunction(
    ({ selector, count }) => document.querySelectorAll(selector).length === count,
    { selector: targetFragmentSelector, count: expectedCount },
    { timeout: 15000 },
  )
}

async function expectTargetFragmentCountAtLeast(page, minimumCount) {
  await page.waitForFunction(
    ({ selector, count }) => document.querySelectorAll(selector).length >= count,
    { selector: targetFragmentSelector, count: minimumCount },
    { timeout: 15000 },
  )
}

async function bodyContains(page, text) {
  return page.evaluate((needle) => document.body.textContent?.includes(needle) === true, text)
}

async function expectBodyContains(page, text, expected) {
  await page.waitForFunction(
    ({ needle, expected: want }) => document.body.textContent?.includes(needle) === want,
    { needle: text, expected },
    { timeout: 10000 },
  )
}

async function expectEditorShellFocused(page) {
  await page.waitForFunction(() => (
    document.activeElement === document.querySelector('[data-testid="editor-shell"]')
  ), null, { timeout: 5000 })
}

async function openStage4Scenario(page) {
  await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded" })
  const shell = page.getByTestId("editor-shell")
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-editor-test-scenario") === SCENARIO_ID, "expected Stage 3 boundary scenario")
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "text engine flag is not enabled")
  await expectTargetFragmentCount(page, 1)

  await page.locator(targetFragmentSelector).first().click()
  await expectTextEngineBridge(page)
}

async function assertStage4ClipboardFlow(page, context) {
  const pasteMarker = "S4C_AUTOMATED_PASTE"
  const crlfMarker = "S4C_AUTOMATED_CRLF"
  const cutMarker = "CUTME4C"
  const heavyLines = Array.from({ length: 18 }, (_, index) => (
    `S4C heavy line ${index + 1} ไทยอังกฤษ ${"layoutheavy4c".repeat(12)}`
  )).join("\r\n")
  const pasteText = [
    "",
    pasteMarker,
    crlfMarker,
    heavyLines,
    cutMarker,
  ].join("\r\n")

  await openStage4Scenario(page)
  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")

  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(scenarioUrl()).origin })
  await page.evaluate((text) => navigator.clipboard.writeText(text), pasteText)
  await page.keyboard.press(`${platformShortcut}+V`)

  await expectBodyContains(page, pasteMarker, true)
  await expectBodyContains(page, crlfMarker, true)
  await expectTargetFragmentCountAtLeast(page, 2)
  await expectTextEngineBridge(page)

  await bridge.focus()
  await page.keyboard.press("End")
  for (let index = 0; index < cutMarker.length; index += 1) {
    await page.keyboard.press("Shift+ArrowLeft")
  }
  assert(await page.locator('[data-wysiwyg-selection="true"]').count() > 0, "expected WYSIWYG selection overlay before copy/cut")

  await page.keyboard.press(`${platformShortcut}+C`)
  await page.waitForFunction((expectedText) => navigator.clipboard.readText().then((text) => text === expectedText), cutMarker)
  assert(await bodyContains(page, cutMarker), "copy should not remove selected text")

  await page.keyboard.press(`${platformShortcut}+X`)
  await page.waitForFunction((text) => !document.body.textContent?.includes(text), cutMarker, { timeout: 10000 })
  assert(await page.evaluate(() => navigator.clipboard.readText()) === cutMarker, "cut clipboard text did not match the selected marker")
  await expectTextEngineBridge(page)

  await page.keyboard.press("Escape")
  await page.locator(bridgeSelector).waitFor({ state: "detached", timeout: 10000 })
  await expectEditorShellFocused(page)

  await page.keyboard.press(`${platformShortcut}+Z`)
  await expectBodyContains(page, pasteMarker, false)
  await expectTargetFragmentCount(page, 1)
  await expectNoTextarea(page)
  await expectNoLayoutError(page)

  await page.keyboard.press(`${platformShortcut}+Y`)
  await expectBodyContains(page, pasteMarker, true)
  await expectBodyContains(page, cutMarker, false)
  await expectTargetFragmentCountAtLeast(page, 2)
  await expectNoTextarea(page)
  await expectNoLayoutError(page)

  return { pasteMarker, crlfMarker, cutMarker }
}

async function countSvgTextOccurrences(page, text) {
  return page.evaluate((needle) => {
    const svgText = Array.from(document.querySelectorAll("svg text"))
      .map((node) => node.textContent ?? "")
      .join("\n")
    return svgText.split(needle).length - 1
  }, text)
}

async function assertStage4CompositionFlow(page) {
  const compositionMarker = "IME4Cทดสอบ"

  await openStage4Scenario(page)
  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")

  await page.evaluate((text) => {
    const inputBridge = document.querySelector('[data-wysiwyg-input-bridge="true"]')
    if (!inputBridge) throw new Error("missing WYSIWYG input bridge")

    inputBridge.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))
    inputBridge.textContent = text.slice(0, 4)
    inputBridge.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: text.slice(0, 4),
      inputType: "insertCompositionText",
      isComposing: true,
    }))
    inputBridge.textContent = text
    inputBridge.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }))

    inputBridge.textContent = text
    inputBridge.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: "insertText",
      isComposing: false,
    }))
    inputBridge.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: text,
      inputType: "insertText",
      isComposing: false,
    }))
  }, compositionMarker)

  await expectBodyContains(page, compositionMarker, true)
  assert(await countSvgTextOccurrences(page, compositionMarker) === 1, "composition marker was not committed exactly once")
  assert(await page.locator(bridgeSelector).textContent() === "", "hidden input bridge kept composition text after commit")
  await expectTextEngineBridge(page)

  return { compositionMarker }
}

async function run() {
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null

  try {
    if (server) await waitForServer(scenarioUrl(), server)

    browser = await chromium.launch({
      headless,
      ...(browserChannel ? { channel: browserChannel } : {}),
    })
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    const resourceErrors = []

    collectPageErrors(page, consoleErrors, pageErrors, resourceErrors)

    const clipboard = await assertStage4ClipboardFlow(page, context)
    const composition = await assertStage4CompositionFlow(page)

    const ignoredResourceErrors = resourceErrors.filter(isIgnoredResourceError)
    const unexpectedResourceErrors = resourceErrors.filter((error) => !isIgnoredResourceError(error))
    const ignoredConsoleErrors = consoleErrors.filter((error) => (
      isIgnorableConsoleError(error, ignoredResourceErrors)
    ))
    const unexpectedConsoleErrors = consoleErrors.filter((error) => (
      !isIgnorableConsoleError(error, ignoredResourceErrors)
    ))

    assert(unexpectedResourceErrors.length === 0, `browser resource errors:\n${unexpectedResourceErrors.map(formatResourceError).join("\n")}`)
    assert(unexpectedConsoleErrors.length === 0, [
      "browser console errors:",
      unexpectedConsoleErrors.map(formatConsoleError).join("\n"),
      resourceErrors.length > 0 ? `resource errors seen:\n${resourceErrors.map(formatResourceError).join("\n")}` : "resource errors seen: none",
    ].join("\n"))
    assert(pageErrors.length === 0, `browser page errors:\n${pageErrors.join("\n")}`)

    console.log(JSON.stringify({
      ok: true,
      browser: {
        channel: browserChannel ?? "bundled-chromium",
        headless,
      },
      clipboard,
      composition,
      ignoredConsoleErrors: ignoredConsoleErrors.map(formatConsoleError),
      ignoredResourceErrors,
    }, null, 2))
  } finally {
    if (browser) await browser.close()
    await stopNextDevServer(server)
  }
}

run().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
