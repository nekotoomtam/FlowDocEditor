import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const DEFAULT_SMOKE_PORT = 4016
const TARGET_NODE_ID = "stage3-boundary-target"
const STACK_TARGET_NODE_ID = "stage3-stack-target"
const STACK_CONTROL_NODE_ID = "stage3-stack-control"
const STACK_ROW_ID = "stage3-stack-row"
const STACK_LEFT_ID = "stage3-stack-left"
const STACK_RIGHT_ID = "stage3-stack-right"
const STACK_MARKER = "STAGE4_STACK_MARKER"
const SCENARIO_ID = "wysiwyg-stage3-boundary"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const platformShortcut = process.platform === "darwin" ? "Meta" : "Control"

const targetFragmentSelector = `[data-testid="editor-fragment"][data-node-id="${TARGET_NODE_ID}"]`
const bridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${TARGET_NODE_ID}"]`
const stackTargetFragmentSelector = `[data-testid="editor-fragment"][data-node-id="${STACK_TARGET_NODE_ID}"]`
const stackBridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${STACK_TARGET_NODE_ID}"]`
const stackLayerSelector = `[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${STACK_TARGET_NODE_ID}"]`
const textareaSelector = "textarea[data-inline-edit-node-id]"
const accessibilityStatusSelector = '[data-wysiwyg-accessibility-status="true"]'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertClose(actual, expected, epsilon, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${actual} to be within ${epsilon} of ${expected}`)
  }
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

async function expectTextEngineBridge(page, selector = bridgeSelector) {
  await page.locator(selector).waitFor({ state: "attached", timeout: 10000 })
  await expectNoTextarea(page)
  await expectNoLayoutError(page)
}

async function resetWysiwygPerfEvents(page) {
  await page.evaluate(() => {
    window.__flowDocWysiwygPerfEvents = []
  })
}

async function readWysiwygPerfEvents(page) {
  return page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
}

async function expectAccessibilityStatusContains(page, text) {
  await page.waitForFunction(
    ({ selector, expectedText }) => document.querySelector(selector)?.textContent?.includes(expectedText),
    { selector: accessibilityStatusSelector, expectedText: text },
    { timeout: 5000 },
  )
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

async function expectTargetFragmentsDoNotOverlap(page) {
  const overlaps = await page.evaluate((targetNodeId) => {
    const epsilon = 0.5
    const fragments = Array.from(document.querySelectorAll('[data-testid="editor-fragment"]')).map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        nodeId: element.getAttribute("data-node-id"),
        nodeType: element.getAttribute("data-node-type"),
        pageIndex: element.getAttribute("data-page-index"),
        lineStart: element.getAttribute("data-line-start"),
        lineEnd: element.getAttribute("data-line-end"),
        top: rect.top,
        bottom: rect.bottom,
      }
    })

    return fragments
      .filter((fragment) => fragment.nodeId === targetNodeId && Number(fragment.lineStart ?? 0) > 0)
      .flatMap((targetFragment) => fragments
        .filter((fragment) => (
          fragment.nodeType === "paragraph" &&
          fragment.nodeId !== targetNodeId &&
          fragment.pageIndex === targetFragment.pageIndex &&
          fragment.bottom > targetFragment.top + epsilon &&
          fragment.top < targetFragment.bottom - epsilon
        ))
        .map((fragment) => ({
          target: {
            pageIndex: targetFragment.pageIndex,
            lineStart: targetFragment.lineStart,
            lineEnd: targetFragment.lineEnd,
            top: targetFragment.top,
            bottom: targetFragment.bottom,
          },
          overlap: fragment,
        })))
  }, TARGET_NODE_ID)

  assert(overlaps.length === 0, `target fragment overlaps downstream fragments:\n${JSON.stringify(overlaps, null, 2)}`)
}

async function expectTargetSelectionSpansMultiplePages(page) {
  const selectedPages = await page.evaluate((targetNodeId) => (
    Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${targetNodeId}"]`))
      .filter((fragment) => fragment.querySelector('[data-wysiwyg-selection="true"]'))
      .map((fragment) => fragment.getAttribute("data-page-index"))
      .filter((pageIndex, index, all) => pageIndex !== null && all.indexOf(pageIndex) === index)
  ), TARGET_NODE_ID)

  assert(
    selectedPages.length >= 2,
    `expected WYSIWYG selection on at least two target pages, found ${JSON.stringify(selectedPages)}`,
  )
}

async function dragTargetSelectionAcrossFragments(page) {
  await expectTargetFragmentCountAtLeast(page, 2)
  const pointerFragmentCount = Number(
    await page.locator('[data-wysiwyg-text-engine-layer="true"]').first().getAttribute("data-wysiwyg-pointer-fragment-count") ?? 0,
  )
  assert(pointerFragmentCount >= 2, `expected at least two WYSIWYG pointer fragments, got ${pointerFragmentCount}`)
  const points = await page.evaluate((targetNodeId) => {
    const textPoint = (fragment, preferLast) => {
      const candidates = Array.from(fragment.querySelectorAll("text"))
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            text: element.textContent?.trim() ?? "",
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            },
          }
        })
        .filter((candidate) => (
          candidate.text.length > 0 &&
          candidate.text !== "paragraph" &&
          candidate.rect.width > 20 &&
          candidate.rect.height > 8
        ))
      const candidate = preferLast ? candidates[candidates.length - 1] : candidates[0]
      if (!candidate) return null
      return {
        x: candidate.rect.left + Math.min(Math.max(candidate.rect.width / 2, 4), Math.max(candidate.rect.width - 4, 4)),
        y: candidate.rect.top + candidate.rect.height / 2,
      }
    }

    const fragments = Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${targetNodeId}"]`))
      .map((fragment) => {
        const rect = fragment.getBoundingClientRect()
        const hitArea = fragment.querySelector('[data-wysiwyg-hit-area="true"]')
        const hitRect = hitArea?.getBoundingClientRect()
        return {
          pageIndex: fragment.getAttribute("data-page-index"),
          lineStart: Number(fragment.getAttribute("data-line-start") ?? 0),
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          hitRect: hitRect ? {
            left: hitRect.left,
            top: hitRect.top,
            width: hitRect.width,
            height: hitRect.height,
          } : null,
          textStart: textPoint(fragment, false),
          textEnd: textPoint(fragment, true),
        }
      })
      .filter((fragment) => fragment.rect.width > 0 && fragment.rect.height > 0)

    const activeFragment = fragments.find((fragment) => fragment.hitRect)
    if (!activeFragment?.hitRect) throw new Error("missing active WYSIWYG hit area for cross-fragment drag")

    const targetFragment = fragments.find((fragment) => fragment.pageIndex !== activeFragment.pageIndex) ??
      fragments.find((fragment) => fragment.lineStart !== activeFragment.lineStart)
    if (!targetFragment) throw new Error("missing second target fragment for cross-fragment drag")

    return {
      start: activeFragment.textStart ?? {
        x: activeFragment.hitRect.left + activeFragment.hitRect.width / 2,
        y: activeFragment.hitRect.top + activeFragment.hitRect.height / 2,
      },
      end: targetFragment.textStart ?? {
        x: targetFragment.rect.left + Math.min(Math.max(targetFragment.rect.width / 3, 4), 32),
        y: targetFragment.rect.top + Math.min(Math.max(targetFragment.rect.height / 2, 4), 16),
      },
    }
  }, TARGET_NODE_ID)

  await page.mouse.move(points.start.x, points.start.y)
  await page.mouse.down()
  await page.mouse.move(points.end.x, points.end.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelectorAll('[data-wysiwyg-selection="true"]').length > 0, null, {
    timeout: 5000,
  })
  await expectTargetSelectionSpansMultiplePages(page)
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

async function openStage4ScenarioShell(page) {
  await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded" })
  const shell = page.getByTestId("editor-shell")
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-editor-test-scenario") === SCENARIO_ID, "expected Stage 3 boundary scenario")
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "text engine flag is not enabled")
  await expectTargetFragmentCount(page, 1)
  return shell
}

async function openStage4Scenario(page) {
  await openStage4ScenarioShell(page)

  await page.locator(targetFragmentSelector).first().click()
  await expectTextEngineBridge(page)
}

async function readStackGeometry(page) {
  return page.evaluate((ids) => {
    const fragment = (nodeId) => document.querySelector(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`)
    const rectFor = (nodeId) => {
      const element = fragment(nodeId)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        nodeId,
        pageIndex: element.getAttribute("data-page-index"),
        parentNodeId: element.getAttribute("data-parent-node-id"),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }
    const targetFragments = Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${ids.targetId}"]`))
    const targetPages = targetFragments
      .map((element) => element.getAttribute("data-page-index"))
      .filter((pageIndex, index, all) => pageIndex !== null && all.indexOf(pageIndex) === index)
    const layer = document.querySelector(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${ids.targetId}"]`)

    return {
      row: rectFor(ids.rowId),
      left: rectFor(ids.leftId),
      right: rectFor(ids.rightId),
      target: rectFor(ids.targetId),
      control: rectFor(ids.controlId),
      targetCount: targetFragments.length,
      targetPages,
      layerCount: document.querySelectorAll(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${ids.targetId}"]`).length,
      pointerFragmentCount: Number(layer?.getAttribute("data-wysiwyg-pointer-fragment-count") ?? 0),
    }
  }, {
    rowId: STACK_ROW_ID,
    leftId: STACK_LEFT_ID,
    rightId: STACK_RIGHT_ID,
    targetId: STACK_TARGET_NODE_ID,
    controlId: STACK_CONTROL_NODE_ID,
  })
}

function assertStackGeometryStable(before, after) {
  for (const key of ["row", "left", "right", "target", "control"]) {
    assert(after[key], `missing stack geometry after edit for ${key}`)
  }

  assert(before.left && before.right, "missing stack geometry before edit")
  assert(after.targetCount === 1, `stack target split independently into ${after.targetCount} fragments`)
  assert(after.targetPages.length === 1, `stack target appeared on multiple pages: ${JSON.stringify(after.targetPages)}`)
  assert(after.layerCount === 1, `expected one stack text-engine layer, found ${after.layerCount}`)
  assert(after.pointerFragmentCount === 1, `expected one stack pointer fragment, found ${after.pointerFragmentCount}`)
  assert(after.left.parentNodeId === STACK_ROW_ID, `left stack parent changed to ${after.left.parentNodeId}`)
  assert(after.right.parentNodeId === STACK_ROW_ID, `right stack parent changed to ${after.right.parentNodeId}`)
  assert(after.target.parentNodeId === STACK_LEFT_ID, `target paragraph parent changed to ${after.target.parentNodeId}`)
  assert(after.control.parentNodeId === STACK_RIGHT_ID, `control paragraph parent changed to ${after.control.parentNodeId}`)
  assert(after.left.right <= after.right.left + 1, "stack columns overlap after edit")
  assertClose(after.left.width, before.left.width, 1.5, "left stack width changed during stack edit")
  assertClose(after.right.width, before.right.width, 1.5, "right stack width changed during stack edit")
  assertClose(after.left.height, after.right.height, 1.5, "row stack heights diverged after edit")
  assertClose(after.row.height, after.left.height, 1.5, "row height does not match left stack height")
  assertClose(after.row.height, after.right.height, 1.5, "row height does not match right stack height")
  assert(after.target.top >= after.left.top - 4.5, "target paragraph moved above left stack")
  assert(after.target.bottom <= after.left.bottom + 4.5, "target paragraph moved below left stack")
  assert(after.control.top >= after.right.top - 4.5, "control paragraph moved above right stack")
  assert(after.control.bottom <= after.right.bottom + 4.5, "control paragraph moved below right stack")
}

async function openStackTargetEditing(page) {
  await openStage4ScenarioShell(page)
  const target = page.locator(stackTargetFragmentSelector).first()
  await target.scrollIntoViewIfNeeded()
  await target.click()
  await expectTextEngineBridge(page, stackBridgeSelector)
  await page.locator(stackLayerSelector).waitFor({ state: "attached", timeout: 10000 })
}

async function assertStage4StackParagraphFlow(page) {
  await openStackTargetEditing(page)
  const before = await readStackGeometry(page)
  const bridge = page.locator(stackBridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")

  const heavyStackText = [
    "",
    STACK_MARKER,
    ...Array.from({ length: 10 }, (_unused, index) => (
      `Stack heavy line ${index + 1} ไทยอังกฤษ ${"stackgeometry".repeat(8)}`
    )),
  ].join("\n")
  await page.keyboard.insertText(heavyStackText)

  await expectBodyContains(page, STACK_MARKER, true)
  await expectTextEngineBridge(page, stackBridgeSelector)
  await page.waitForTimeout(800)
  await expectNoTextarea(page)
  await expectNoLayoutError(page)

  const after = await readStackGeometry(page)
  assertStackGeometryStable(before, after)

  return {
    marker: STACK_MARKER,
    targetFragments: after.targetCount,
    pointerFragments: after.pointerFragmentCount,
    rowHeight: Math.round(after.row.height),
  }
}

async function assertStage4PerformanceTraceFlow(page) {
  await openStage4Scenario(page)
  const shell = page.getByTestId("editor-shell")
  assert(await shell.getAttribute("data-wysiwyg-perf-trace-enabled") === "true", "perf trace flag is not enabled")

  const bridge = page.locator(bridgeSelector)
  await bridge.focus()
  await page.keyboard.press("End")
  await resetWysiwygPerfEvents(page)

  const perfMarker = `\n${Array.from({ length: 30 }, (_unused, index) => `PERFTRACE-${index}`).join("\n")}`
  await page.keyboard.insertText(perfMarker)
  const immediateEvents = await readWysiwygPerfEvents(page)
  const immediateDraftUpdates = immediateEvents.filter((event) => event.kind === "inline-edit-draft-update")
  const immediatePaginations = immediateEvents.filter((event) => event.kind === "browser-preview-pagination")
  assert(immediateDraftUpdates.length >= 1, "expected text-engine draft update perf event")
  assert(
    immediatePaginations.length === 0,
    `browser preview pagination ran in the immediate input lane: ${JSON.stringify(immediatePaginations)}`,
  )

  await page.waitForTimeout(600)
  const settledEvents = await readWysiwygPerfEvents(page)
  const draftUpdates = settledEvents.filter((event) => event.kind === "inline-edit-draft-update")
  const paginations = settledEvents.filter((event) => event.kind === "browser-preview-pagination")
  const lastDraftUpdate = draftUpdates[draftUpdates.length - 1]
  const firstPagination = paginations[0]
  const firstPaginationDelayMs = firstPagination
    ? firstPagination.startedAt - lastDraftUpdate.startedAt
    : null
  if (firstPaginationDelayMs !== null) {
    assert(
      firstPaginationDelayMs >= 300,
      `browser preview pagination started too close to input: ${firstPaginationDelayMs}ms`,
    )
  }
  await expectTextEngineBridge(page)

  return {
    draftUpdates: draftUpdates.length,
    browserPreviewPaginations: paginations.length,
    firstPaginationDelayMs: firstPaginationDelayMs === null ? null : Math.round(firstPaginationDelayMs),
  }
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
  await expectTargetFragmentsDoNotOverlap(page)
  await expectTextEngineBridge(page)

  await dragTargetSelectionAcrossFragments(page)
  await expectAccessibilityStatusContains(page, "characters selected")

  await bridge.focus()
  await page.keyboard.press("End")
  await expectAccessibilityStatusContains(page, "Caret at")
  await page.keyboard.press("Shift+Home")
  await expectTargetSelectionSpansMultiplePages(page)
  await expectAccessibilityStatusContains(page, "characters selected")
  await page.keyboard.press("End")
  await page.waitForFunction(() => document.querySelectorAll('[data-wysiwyg-selection="true"]').length === 0)
  await expectAccessibilityStatusContains(page, "Caret at")

  await bridge.focus()
  await page.keyboard.press("End")
  for (let index = 0; index < cutMarker.length; index += 1) {
    await page.keyboard.press("Shift+ArrowLeft")
  }
  await page.locator('[data-wysiwyg-selection="true"]').waitFor({ state: "attached", timeout: 5000 })

  await page.keyboard.press(`${platformShortcut}+C`)
  await page.waitForFunction((expectedText) => navigator.clipboard.readText().then((text) => text === expectedText), cutMarker)
  assert(await bodyContains(page, cutMarker), "copy should not remove selected text")

  await page.keyboard.press(`${platformShortcut}+X`)
  await page.waitForFunction((text) => !document.body.textContent?.includes(text), cutMarker, { timeout: 10000 })
  await page.waitForFunction((expectedText) => navigator.clipboard.readText().then((text) => text === expectedText), cutMarker)
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

  return { pasteMarker, crlfMarker, cutMarker, pointerDragSelection: "multiple-pages" }
}

async function assertStage4DoubleClickSelectionFlow(page) {
  await openStage4Scenario(page)
  await page.locator(`${targetFragmentSelector} [data-wysiwyg-hit-area="true"]`).waitFor({ state: "attached", timeout: 10000 })
  const point = await page.evaluate((targetNodeId) => {
    const fragment = document.querySelector(`[data-testid="editor-fragment"][data-node-id="${targetNodeId}"]`)
    if (!fragment) throw new Error("missing target fragment for double-click selection")

    const textCandidate = Array.from(fragment.querySelectorAll("text"))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          text: element.textContent?.trim() ?? "",
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
        }
      })
      .find((candidate) => (
        candidate.text.length > 0 &&
        candidate.text !== "paragraph" &&
        candidate.rect.width > 20 &&
        candidate.rect.height > 8
      ))
    if (!textCandidate) throw new Error("missing rendered text candidate for double-click selection")

    return {
      x: textCandidate.rect.left + Math.min(Math.max(textCandidate.rect.width / 3, 4), 32),
      y: textCandidate.rect.top + textCandidate.rect.height / 2,
    }
  }, TARGET_NODE_ID)
  await page.mouse.dblclick(point.x, point.y)
  await page.locator('[data-wysiwyg-selection="true"]').waitFor({ state: "attached", timeout: 5000 })
  await expectTextEngineBridge(page)

  return { selectionOverlay: "visible" }
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

    console.log(`wysiwyg stage4c smoke browser: ${smokeBrowserLabel(smokeBrowser)}`)
    browser = await launchSmokeBrowser(smokeBrowser)
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    const resourceErrors = []

    collectPageErrors(page, consoleErrors, pageErrors, resourceErrors)

    const performanceTrace = await assertStage4PerformanceTraceFlow(page)
    const doubleClickSelection = await assertStage4DoubleClickSelectionFlow(page)
    const clipboard = await assertStage4ClipboardFlow(page, context)
    const composition = await assertStage4CompositionFlow(page)
    const stackParagraph = await assertStage4StackParagraphFlow(page)

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
        mode: smokeBrowserLabel(smokeBrowser),
        channel: smokeBrowser.channel ?? null,
        executablePath: smokeBrowser.executablePath ?? null,
        headless,
      },
      performanceTrace,
      doubleClickSelection,
      clipboard,
      composition,
      stackParagraph,
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
