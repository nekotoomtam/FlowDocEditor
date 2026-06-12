import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const DEFAULT_PORT = 4012
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const TARGET_NODE_ID = process.env.PROBE_TARGET_NODE_ID?.trim() || "stage3-boundary-target"
const BURST_LENGTH = Number(process.env.PROBE_BURST_LENGTH ?? 80)
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 10)
const READY_TIMEOUT_MS = Number(process.env.PROBE_READY_TIMEOUT_MS ?? 15000)
const WRITE_TRACE = process.env.TRACE_WRITE_RAW !== "0"
const TRACE_TOP_LIMIT = Number(process.env.TRACE_TOP_LIMIT ?? 12)
const TRACE_COMPACT = process.env.TRACE_COMPACT === "1"
const TRACE_COMPACT_CHILD_LIMIT = Number(process.env.TRACE_COMPACT_CHILD_LIMIT ?? 4)
const DETACHED_LIVE_LAYER_SAFETY = process.env.TRACE_DETACHED_LIVE_LAYER_SAFETY === "1"
const parsedPageBoundarySafetyLineCount = Number(process.env.TRACE_PAGE_BOUNDARY_SAFETY_LINE_COUNT ?? 18)
const PAGE_BOUNDARY_SAFETY_LINE_COUNT = Number.isFinite(parsedPageBoundarySafetyLineCount) && parsedPageBoundarySafetyLineCount > 0
  ? Math.trunc(parsedPageBoundarySafetyLineCount)
  : 18
const CANVAS_ISLAND_COMMIT_TOLERANCE_MS = Number(process.env.TRACE_CANVAS_ISLAND_COMMIT_TOLERANCE_MS ?? 2)
const CANVAS_ISLAND_SPLIT_LOOKBACK_MS = Number(process.env.TRACE_CANVAS_ISLAND_SPLIT_LOOKBACK_MS ?? 160)
const TRACE_ISLAND_REACT_LIVE_ATTRS = process.env.NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS ?? "1"
const TRACE_ISLAND_SURFACE_LIVE_LAYER = process.env.NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER ?? "1"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const smokeBrowser = getSmokeBrowserConfig()

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  return url.toString()
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
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_PERF_TRACE: "1",
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_REACT_LIVE_ATTRS: TRACE_ISLAND_REACT_LIVE_ATTRS,
      NEXT_PUBLIC_FLOWDOC_WYSIWYG_ISLAND_SURFACE_LIVE_LAYER: TRACE_ISLAND_SURFACE_LIVE_LAYER,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  if (process.env.TRACE_VERBOSE === "1") {
    child.stdout.on("data", (chunk) => process.stdout.write(chunk))
    child.stderr.on("data", (chunk) => process.stderr.write(chunk))
  } else {
    child.stdout.on("data", () => {})
    child.stderr.on("data", () => {})
  }
  return child
}

async function stopServer(server) {
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
      throw new Error("Next dev server exited before trace URL was ready")
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

function fragmentSelectorForNode(nodeId) {
  return `[data-testid="editor-fragment"][data-node-id="${nodeId}"]`
}

function bridgeSelectorForNode(nodeId) {
  return `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`
}

async function readActiveIslandSurfaceAttrs(page, targetNodeId) {
  return page.evaluate((nodeId) => {
    const layer = document.querySelector(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`)
    if (!layer) return null
    const numberAttr = (name) => {
      const value = layer.getAttribute(name)
      if (value == null) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return {
      textLength: numberAttr("data-wysiwyg-flowdoc-draft-text-length"),
      caretOffset: numberAttr("data-wysiwyg-flowdoc-draft-caret-offset"),
      selectionStart: numberAttr("data-wysiwyg-flowdoc-draft-selection-start"),
      selectionEnd: numberAttr("data-wysiwyg-flowdoc-draft-selection-end"),
      selectedTextLength: numberAttr("data-wysiwyg-flowdoc-draft-selected-text-length"),
      selectionCollapsed: layer.getAttribute("data-wysiwyg-flowdoc-draft-selection-collapsed"),
      customCaretVisible: layer.getAttribute("data-wysiwyg-custom-caret-visible"),
      revision: numberAttr("data-wysiwyg-island-revision"),
      lineCount: numberAttr("data-wysiwyg-flowdoc-draft-total-line-count"),
      surfaceSelectionOverlayCount: numberAttr("data-wysiwyg-flowdoc-draft-surface-selection-overlay-count"),
      selectionOverlayElementCount: layer.querySelectorAll('[data-wysiwyg-selection-overlay="true"]').length,
      caretElementCount: layer.querySelectorAll('[data-wysiwyg-caret="true"]').length,
    }
  }, targetNodeId)
}

async function readTargetEditSurfaceState(page, targetNodeId) {
  const attrs = await readActiveIslandSurfaceAttrs(page, targetNodeId)
  const counts = await page.evaluate((nodeId) => {
    const escapedNodeId = CSS.escape(nodeId)
    const numberAttr = (element, name) => {
      const value = element.getAttribute(name)
      if (value == null) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    const surfaces = Array.from(
      document.querySelectorAll(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${escapedNodeId}"]`),
    )
    const bridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${escapedNodeId}"]`)
    const surfaceAttrs = surfaces.map((layer) => ({
      surfaceKey: layer.getAttribute("data-wysiwyg-island-surface-key"),
      pageIndex: layer.getAttribute("data-page-index"),
      lineStart: numberAttr(layer, "data-line-start"),
      lineEnd: numberAttr(layer, "data-line-end"),
      surfaceIndex: numberAttr(layer, "data-wysiwyg-island-surface-index"),
      fragmentCount: numberAttr(layer, "data-wysiwyg-island-fragment-count"),
      pointerFragmentCount: numberAttr(layer, "data-wysiwyg-pointer-fragment-count"),
      textLength: numberAttr(layer, "data-wysiwyg-flowdoc-draft-text-length"),
      selectedTextLength: numberAttr(layer, "data-wysiwyg-flowdoc-draft-selected-text-length"),
      selectionCollapsed: layer.getAttribute("data-wysiwyg-flowdoc-draft-selection-collapsed"),
      lineCount: numberAttr(layer, "data-wysiwyg-flowdoc-draft-line-count"),
      surfaceSelectionOverlayCount: numberAttr(layer, "data-wysiwyg-flowdoc-draft-surface-selection-overlay-count"),
      selectionOverlayElementCount: layer.querySelectorAll('[data-wysiwyg-selection-overlay="true"]').length,
      caretElementCount: layer.querySelectorAll('[data-wysiwyg-caret="true"]').length,
    }))
    const sumField = (field) => surfaceAttrs.reduce((sum, item) => sum + (item[field] ?? 0), 0)
    const maxField = (field) => surfaceAttrs.reduce((max, item) => Math.max(max, item[field] ?? 0), 0)
    const uniqueStrings = (values) => [...new Set(values.filter((value) => value != null && value !== ""))]
    const selectedSurfaceAttrs = surfaceAttrs.filter((item) => (
      (item.surfaceSelectionOverlayCount ?? 0) > 0 ||
      (item.selectionOverlayElementCount ?? 0) > 0 ||
      (item.selectedTextLength ?? 0) > 0
    ))
    return {
      islandCount: surfaces.length,
      bridgeCount: document.querySelectorAll(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${escapedNodeId}"]`).length,
      bridgeValue: bridge && "value" in bridge ? bridge.value : null,
      bridgeTextContent: bridge?.textContent ?? null,
      nonBridgeTextareaCount: document.querySelectorAll(`textarea[data-inline-edit-node-id="${escapedNodeId}"]:not([data-wysiwyg-input-bridge="true"])`).length,
      surfaceAttrs,
      aggregate: {
        lineCount: sumField("lineCount"),
        surfaceSelectionOverlayCount: sumField("surfaceSelectionOverlayCount"),
        selectionOverlayElementCount: sumField("selectionOverlayElementCount"),
        caretElementCount: sumField("caretElementCount"),
        pageIndexes: uniqueStrings(surfaceAttrs.map((item) => item.pageIndex)),
        selectedPageIndexes: uniqueStrings(selectedSurfaceAttrs.map((item) => item.pageIndex)),
        selectedSurfaceCount: selectedSurfaceAttrs.length,
        maxPointerFragmentCount: maxField("pointerFragmentCount"),
      },
    }
  }, targetNodeId)
  return {
    ...counts,
    attrs,
  }
}

function recordSafetyExpectation(result, condition, name, details) {
  if (condition) return
  result.ok = false
  result.failures.push({ name, details })
}

async function clickActiveIslandSurface(page, targetNodeId) {
  const surface = page.locator(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${targetNodeId}"]`).first()
  const box = await surface.boundingBox()
  if (!box) throw new Error("Active island surface was not visible for pointer safety check")
  await page.mouse.click(
    box.x + Math.max(4, Math.min(box.width - 4, box.width * 0.62)),
    box.y + Math.max(4, Math.min(box.height - 4, box.height * 0.45)),
  )
}

async function clickOutsideActiveIsland(page) {
  await page.mouse.click(6, 6)
}

function pageBoundarySafetyPayload(batchIndex) {
  return [
    "",
    ...Array.from({ length: PAGE_BOUNDARY_SAFETY_LINE_COUNT }, (_, index) => (
      `TRACE_BOUNDARY_${batchIndex}_${index}_${"layoutheavy".repeat(12)}`
    )),
  ].join("\n")
}

async function dispatchBridgePlainTextPaste(page, targetNodeId, text) {
  return page.evaluate(({ nodeId, text: pastedText }) => {
    const escapedNodeId = CSS.escape(nodeId)
    const bridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${escapedNodeId}"]`)
    if (!(bridge instanceof HTMLTextAreaElement)) {
      return { dispatched: false, reason: "missing-bridge" }
    }

    let clipboardData = null
    try {
      clipboardData = new DataTransfer()
      clipboardData.setData("text/plain", pastedText)
    } catch {
      clipboardData = {
        getData: (type) => (type === "text/plain" ? pastedText : ""),
      }
    }

    let event = null
    try {
      event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData,
      })
    } catch {
      event = new Event("paste", { bubbles: true, cancelable: true, composed: true })
    }
    if (!event.clipboardData) {
      Object.defineProperty(event, "clipboardData", { value: clipboardData })
    }

    const eventReturned = bridge.dispatchEvent(event)
    return {
      dispatched: true,
      eventReturned,
      defaultPrevented: event.defaultPrevented,
      payloadLength: pastedText.length,
      valueAfterPaste: bridge.value,
      textContentAfterPaste: bridge.textContent,
    }
  }, { nodeId: targetNodeId, text })
}

async function waitForTargetPageBoundarySurfaces(page, targetNodeId, timeoutMs = 15000) {
  await page.waitForFunction(
    ({ nodeId }) => {
      const surfaces = Array.from(document.querySelectorAll(
        `[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`,
      ))
      const pageIndexes = new Set(
        surfaces
          .map((surface) => surface.getAttribute("data-page-index"))
          .filter((pageIndex) => pageIndex != null && pageIndex !== ""),
      )
      return surfaces.length >= 2 && pageIndexes.size >= 2
    },
    { nodeId: targetNodeId },
    { timeout: timeoutMs },
  )
}

async function expandTargetAcrossPageBoundary(page, targetNodeId) {
  const before = await readTargetEditSurfaceState(page, targetNodeId)
  const beforePages = before.aggregate?.pageIndexes ?? []
  if (before.islandCount >= 2 && beforePages.length >= 2) {
    return {
      skipped: true,
      attempts: [],
      before,
      after: before,
    }
  }

  await page.locator(bridgeSelectorForNode(targetNodeId)).focus()
  await page.keyboard.press("End")
  await waitForDoubleAnimationFrame(page)

  const attempts = []
  let after = before
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = pageBoundarySafetyPayload(attempt)
    attempts.push(await dispatchBridgePlainTextPaste(page, targetNodeId, payload))
    await waitForDoubleAnimationFrame(page)
    try {
      await waitForTargetPageBoundarySurfaces(page, targetNodeId)
    } catch {
      // The final state snapshot below is the actionable failure detail.
    }
    after = await readTargetEditSurfaceState(page, targetNodeId)
    if (after.islandCount >= 2 && (after.aggregate?.pageIndexes?.length ?? 0) >= 2) break
  }

  return {
    skipped: false,
    attempts,
    before,
    after,
  }
}

async function selectPageBoundaryRange(page, targetNodeId) {
  await page.locator(bridgeSelectorForNode(targetNodeId)).focus()
  await page.keyboard.press("End")
  await waitForDoubleAnimationFrame(page)
  await page.keyboard.press("Shift+Home")
  await waitForDoubleAnimationFrame(page)
  return readTargetEditSurfaceState(page, targetNodeId)
}

async function dispatchBridgeCompositionProbe(page, targetNodeId, text = "ก") {
  return page.evaluate(({ nodeId, text: inputText }) => {
    const escapedNodeId = CSS.escape(nodeId)
    const bridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${escapedNodeId}"]`)
    if (!(bridge instanceof HTMLTextAreaElement)) {
      return { dispatched: false, reason: "missing-bridge" }
    }
    const makeInputEvent = (type) => {
      try {
        return new InputEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          data: inputText,
          inputType: "insertCompositionText",
          isComposing: true,
        })
      } catch {
        const event = new Event(type, { bubbles: true, cancelable: true, composed: true })
        Object.defineProperty(event, "data", { value: inputText })
        Object.defineProperty(event, "inputType", { value: "insertCompositionText" })
        Object.defineProperty(event, "isComposing", { value: true })
        return event
      }
    }
    bridge.dispatchEvent(new CompositionEvent("compositionstart", {
      bubbles: true,
      cancelable: true,
      data: inputText,
    }))
    bridge.dispatchEvent(makeInputEvent("beforeinput"))
    bridge.value = inputText
    bridge.textContent = inputText
    bridge.dispatchEvent(makeInputEvent("input"))
    bridge.dispatchEvent(new CompositionEvent("compositionend", {
      bubbles: true,
      cancelable: true,
      data: inputText,
    }))
    return {
      dispatched: true,
      valueAfterInput: bridge.value,
      textContentAfterInput: bridge.textContent,
    }
  }, { nodeId: targetNodeId, text })
}

async function runDetachedLiveLayerSafetyChecks(page, targetNodeId) {
  const result = {
    enabled: DETACHED_LIVE_LAYER_SAFETY,
    ok: true,
    failures: [],
    keyboardSelection: null,
    longKeyboardSelection: null,
    pointerCollapse: null,
    composition: null,
    pageBoundaryExpansion: null,
    pageBoundarySelection: null,
    blurExit: null,
  }
  if (!DETACHED_LIVE_LAYER_SAFETY) return result

  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Shift+ArrowLeft")
  }
  await waitForDoubleAnimationFrame(page)
  result.keyboardSelection = await readTargetEditSurfaceState(page, targetNodeId)
  recordSafetyExpectation(
    result,
    result.keyboardSelection.attrs?.selectionCollapsed === "false",
    "keyboard-selection-collapsed-attr",
    result.keyboardSelection,
  )
  recordSafetyExpectation(
    result,
    (result.keyboardSelection.attrs?.selectedTextLength ?? 0) > 0,
    "keyboard-selection-selected-length",
    result.keyboardSelection,
  )
  recordSafetyExpectation(
    result,
    (result.keyboardSelection.attrs?.surfaceSelectionOverlayCount ?? 0) > 0 ||
      (result.keyboardSelection.attrs?.selectionOverlayElementCount ?? 0) > 0,
    "keyboard-selection-overlay-visible",
    result.keyboardSelection,
  )
  recordSafetyExpectation(
    result,
    result.keyboardSelection.bridgeCount === 1 && result.keyboardSelection.nonBridgeTextareaCount === 0,
    "keyboard-selection-keeps-bridge-only",
    result.keyboardSelection,
  )

  await page.keyboard.press("Shift+Home")
  await waitForDoubleAnimationFrame(page)
  result.longKeyboardSelection = await readTargetEditSurfaceState(page, targetNodeId)
  const longSelectedTextLength = result.longKeyboardSelection.attrs?.selectedTextLength ?? 0
  const shortSelectedTextLength = result.keyboardSelection.attrs?.selectedTextLength ?? 0
  const longOverlayCount = Math.max(
    result.longKeyboardSelection.aggregate?.surfaceSelectionOverlayCount ?? 0,
    result.longKeyboardSelection.aggregate?.selectionOverlayElementCount ?? 0,
  )
  recordSafetyExpectation(
    result,
    result.longKeyboardSelection.attrs?.selectionCollapsed === "false",
    "long-keyboard-selection-collapsed-attr",
    result.longKeyboardSelection,
  )
  recordSafetyExpectation(
    result,
    longSelectedTextLength > shortSelectedTextLength && longSelectedTextLength >= Math.min(32, result.longKeyboardSelection.attrs?.textLength ?? 32),
    "long-keyboard-selection-selected-length",
    result.longKeyboardSelection,
  )
  recordSafetyExpectation(
    result,
    (result.longKeyboardSelection.aggregate?.lineCount ?? result.longKeyboardSelection.attrs?.lineCount ?? 0) > 1
      ? longOverlayCount > 1
      : longOverlayCount > 0,
    "long-keyboard-selection-overlay-span",
    result.longKeyboardSelection,
  )
  recordSafetyExpectation(
    result,
    result.longKeyboardSelection.bridgeCount === 1 && result.longKeyboardSelection.nonBridgeTextareaCount === 0,
    "long-keyboard-selection-keeps-bridge-only",
    result.longKeyboardSelection,
  )

  await clickActiveIslandSurface(page, targetNodeId)
  await waitForDoubleAnimationFrame(page)
  result.pointerCollapse = await readTargetEditSurfaceState(page, targetNodeId)
  recordSafetyExpectation(
    result,
    result.pointerCollapse.attrs?.selectionCollapsed === "true",
    "pointer-collapse-collapsed-attr",
    result.pointerCollapse,
  )
  recordSafetyExpectation(
    result,
    (result.pointerCollapse.attrs?.selectedTextLength ?? -1) === 0,
    "pointer-collapse-selected-length",
    result.pointerCollapse,
  )
  recordSafetyExpectation(
    result,
    result.pointerCollapse.bridgeCount === 1 && result.pointerCollapse.nonBridgeTextareaCount === 0,
    "pointer-collapse-keeps-bridge-only",
    result.pointerCollapse,
  )

  const beforeComposition = result.pointerCollapse
  const compositionDispatch = await dispatchBridgeCompositionProbe(page, targetNodeId)
  await waitForDoubleAnimationFrame(page)
  result.composition = {
    before: beforeComposition,
    dispatch: compositionDispatch,
    after: await readTargetEditSurfaceState(page, targetNodeId),
  }
  recordSafetyExpectation(
    result,
    result.composition.dispatch.dispatched === true,
    "composition-dispatches-on-bridge",
    result.composition,
  )
  recordSafetyExpectation(
    result,
    result.composition.after.bridgeCount === 1 && result.composition.after.nonBridgeTextareaCount === 0,
    "composition-keeps-bridge-only",
    result.composition,
  )
  recordSafetyExpectation(
    result,
    result.composition.after.attrs?.textLength === beforeComposition.attrs?.textLength,
    "composition-keeps-text-length",
    result.composition,
  )
  recordSafetyExpectation(
    result,
    result.composition.after.attrs?.selectionCollapsed === "true" &&
      (result.composition.after.attrs?.selectedTextLength ?? -1) === 0,
    "composition-keeps-collapsed-selection",
    result.composition,
  )
  recordSafetyExpectation(
    result,
    result.composition.after.bridgeValue === "" &&
      (result.composition.after.bridgeTextContent === "" || result.composition.after.bridgeTextContent == null),
    "composition-clears-bridge-echo",
    result.composition,
  )

  result.pageBoundaryExpansion = await expandTargetAcrossPageBoundary(page, targetNodeId)
  const expansionAfter = result.pageBoundaryExpansion.after
  const expansionAttempts = result.pageBoundaryExpansion.attempts ?? []
  recordSafetyExpectation(
    result,
    result.pageBoundaryExpansion.skipped === true ||
      expansionAttempts.some((attempt) => attempt.dispatched === true && attempt.defaultPrevented === true),
    "page-boundary-expansion-paste-handled",
    result.pageBoundaryExpansion,
  )
  recordSafetyExpectation(
    result,
    expansionAfter.islandCount >= 2,
    "page-boundary-expansion-multiple-surfaces",
    result.pageBoundaryExpansion,
  )
  recordSafetyExpectation(
    result,
    (expansionAfter.aggregate?.pageIndexes?.length ?? 0) >= 2,
    "page-boundary-expansion-multiple-pages",
    result.pageBoundaryExpansion,
  )
  recordSafetyExpectation(
    result,
    expansionAfter.bridgeCount === 1 && expansionAfter.nonBridgeTextareaCount === 0,
    "page-boundary-expansion-keeps-bridge-only",
    result.pageBoundaryExpansion,
  )

  result.pageBoundarySelection = await selectPageBoundaryRange(page, targetNodeId)
  const selectedSurfaceCount = result.pageBoundarySelection.aggregate?.selectedSurfaceCount ?? 0
  const selectedPageCount = result.pageBoundarySelection.aggregate?.selectedPageIndexes?.length ?? 0
  const selectedOverlayCount = Math.max(
    result.pageBoundarySelection.aggregate?.surfaceSelectionOverlayCount ?? 0,
    result.pageBoundarySelection.aggregate?.selectionOverlayElementCount ?? 0,
  )
  recordSafetyExpectation(
    result,
    result.pageBoundarySelection.attrs?.selectionCollapsed === "false",
    "page-boundary-selection-collapsed-attr",
    result.pageBoundarySelection,
  )
  recordSafetyExpectation(
    result,
    selectedSurfaceCount >= 2,
    "page-boundary-selection-spans-surfaces",
    result.pageBoundarySelection,
  )
  recordSafetyExpectation(
    result,
    selectedPageCount >= 2,
    "page-boundary-selection-spans-pages",
    result.pageBoundarySelection,
  )
  recordSafetyExpectation(
    result,
    selectedOverlayCount >= 2,
    "page-boundary-selection-overlay-span",
    result.pageBoundarySelection,
  )
  recordSafetyExpectation(
    result,
    result.pageBoundarySelection.bridgeCount === 1 && result.pageBoundarySelection.nonBridgeTextareaCount === 0,
    "page-boundary-selection-keeps-bridge-only",
    result.pageBoundarySelection,
  )

  await clickOutsideActiveIsland(page)
  await waitForDoubleAnimationFrame(page)
  await page.waitForTimeout(50)
  try {
    await page.waitForFunction(
      (nodeId) => (
        document.querySelectorAll(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`).length === 0
      ),
      targetNodeId,
      { timeout: 5000 },
    )
  } catch {
    // The state snapshot below is the actionable failure detail.
  }
  result.blurExit = await readTargetEditSurfaceState(page, targetNodeId)
  recordSafetyExpectation(
    result,
    result.blurExit.bridgeCount === 0,
    "blur-exit-removes-bridge",
    result.blurExit,
  )
  recordSafetyExpectation(
    result,
    result.blurExit.nonBridgeTextareaCount === 0,
    "blur-exit-avoids-native-textarea",
    result.blurExit,
  )

  return result
}

async function waitForEditorReady(page) {
  const shellSelector = '[data-testid="editor-shell"]'
  await page.waitForSelector(shellSelector, { timeout: READY_TIMEOUT_MS })
  await page.waitForFunction((selector) => (
    document.querySelector(selector)?.getAttribute("data-preview-layout-blocking") === "false"
  ), shellSelector, { timeout: READY_TIMEOUT_MS })
}

async function waitForDoubleAnimationFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

function keyInputProbeCharacter(index) {
  return index % 13 === 12 ? " " : String.fromCharCode(97 + (index % 26))
}

async function pressCharacter(page, ch) {
  if (ch === " ") {
    await page.keyboard.press("Space")
    return
  }
  await page.keyboard.type(ch)
}

async function startDevToolsTrace(page) {
  const client = await page.context().newCDPSession(page)
  const events = []
  client.on("Tracing.dataCollected", (payload) => {
    if (Array.isArray(payload.value)) events.push(...payload.value)
  })
  const complete = new Promise((resolve) => {
    client.once("Tracing.tracingComplete", resolve)
  })
  await client.send("Tracing.start", {
    transferMode: "ReportEvents",
    categories: [
      "devtools.timeline",
      "blink.user_timing",
      "v8",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-v8.cpu_profiler",
      "disabled-by-default-v8.cpu_profiler.hires",
    ].join(","),
  })
  return {
    events,
    async stop() {
      await client.send("Tracing.end")
      await complete
      await client.detach()
      return events
    },
  }
}

function durationMs(event) {
  if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs)) return event.durationMs
  return typeof event.dur === "number" && Number.isFinite(event.dur) ? event.dur / 1000 : 0
}

function roundMs(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value
}

function eventStart(event) {
  return typeof event.ts === "number" ? event.ts : 0
}

function eventEnd(event) {
  return eventStart(event) + (typeof event.dur === "number" ? event.dur : 0)
}

function eventLabel(event) {
  const data = event.args?.data ?? {}
  const url = data.url || data.scriptName || data.stackTrace?.[0]?.url || null
  const location = url
    ? `${path.basename(String(url))}${data.lineNumber != null ? `:${data.lineNumber}` : ""}`
    : null
  const fn = data.functionName || data.name || null
  return [event.name, fn, location].filter(Boolean).join(" ")
}

function summarizeDurations(events) {
  const values = events.map(durationMs).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  return summarizeNumberValues(values)
}

function summarizeNumberValues(values) {
  values = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (values.length === 0) return { count: 0, totalMs: 0, p50Ms: null, p95Ms: null, maxMs: null }
  const pick = (pct) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * pct))]
  return {
    count: values.length,
    totalMs: roundMs(values.reduce((sum, value) => sum + value, 0)),
    p50Ms: roundMs(pick(0.5)),
    p95Ms: roundMs(pick(0.95)),
    maxMs: roundMs(values[values.length - 1]),
  }
}

function summarizeDurationsByField(events, field) {
  const groups = new Map()
  for (const event of events) {
    const key = event[field] == null || event[field] === "" ? "unknown" : String(event[field])
    const group = groups.get(key) ?? []
    group.push(event)
    groups.set(key, group)
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .map(([key, group]) => [key, summarizeDurations(group)]),
  )
}

function countWhere(events, predicate) {
  return events.reduce((count, event) => count + (predicate(event) ? 1 : 0), 0)
}

function maxEventField(events, field) {
  return events.reduce((max, event) => {
    const value = event[field]
    return typeof value === "number" && Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
}

function countFragmentSplitChangeStates(events) {
  const counts = new Map()
  for (const event of events) {
    const input = event.draftFragmentInputChanged === true ? "input-changed" : "input-same"
    const output = event.draftFragmentOutputChanged === true ? "output-changed" : "output-same"
    const key = `${input}/${output}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function countFragmentSplitIdentityStates(events) {
  const counts = new Map()
  for (const event of events) {
    const arrayState = event.draftFragmentArrayReused === true
      ? "array-reused"
      : event.draftFragmentArrayReused === false
        ? "array-new"
        : "array-unknown"
    const surfaceState = event.draftSurfaceKeysChanged === true
      ? "surface-keys-changed"
      : event.draftSurfaceKeysChanged === false
        ? "surface-keys-same"
        : "surface-keys-unknown"
    const key = `${arrayState}/${surfaceState}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function countFragmentSplitReuseStates(events) {
  const counts = new Map()
  for (const event of events) {
    const candidateState = event.draftFragmentReuseCandidate === true
      ? "candidate"
      : event.draftFragmentReuseCandidate === false
        ? "not-candidate"
        : "candidate-unknown"
    const reuseState = event.draftFragmentResultReused === true
      ? "reused"
      : event.draftFragmentResultReused === false
        ? "not-reused"
        : "reuse-unknown"
    const key = `${candidateState}/${reuseState}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function countFragmentSplitVisualStates(events) {
  const counts = new Map()
  for (const event of events) {
    const output = event.draftFragmentOutputChanged === true
      ? "output-changed"
      : event.draftFragmentOutputChanged === false
        ? "output-same"
        : "output-unknown"
    const visual = event.draftFragmentVisualChanged === true
      ? "visual-changed"
      : event.draftFragmentVisualChanged === false
        ? "visual-same"
        : "visual-unknown"
    const key = `${output}/${visual}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

function appEventEndMs(event) {
  const startedAt = typeof event.startedAt === "number" && Number.isFinite(event.startedAt)
    ? event.startedAt
    : 0
  return startedAt + durationMs(event)
}

function eventNodeMatches(left, right) {
  if (left.nodeId == null || right.nodeId == null) return true
  return left.nodeId === right.nodeId
}

function nearestEventByCommitTime(source, candidates, toleranceMs) {
  const sourceCommitTime = source.commitTime
  if (typeof sourceCommitTime !== "number" || !Number.isFinite(sourceCommitTime)) return null
  let best = null
  for (const candidate of candidates) {
    if (!eventNodeMatches(source, candidate)) continue
    const candidateCommitTime = candidate.commitTime
    if (typeof candidateCommitTime !== "number" || !Number.isFinite(candidateCommitTime)) continue
    const deltaMs = sourceCommitTime - candidateCommitTime
    const absoluteDeltaMs = Math.abs(deltaMs)
    if (absoluteDeltaMs > toleranceMs) continue
    if (!best || absoluteDeltaMs < best.absoluteDeltaMs) {
      best = { event: candidate, deltaMs, absoluteDeltaMs }
    }
  }
  return best
}

function nearestEventBeforeCommit(source, candidates, lookbackMs, futureToleranceMs) {
  const sourceCommitTime = source.commitTime
  if (typeof sourceCommitTime !== "number" || !Number.isFinite(sourceCommitTime)) return null
  let best = null
  for (const candidate of candidates) {
    if (!eventNodeMatches(source, candidate)) continue
    const endedAt = appEventEndMs(candidate)
    const delayMs = sourceCommitTime - endedAt
    if (delayMs < -futureToleranceMs || delayMs > lookbackMs) continue
    const absoluteDelayMs = Math.abs(delayMs)
    if (!best || absoluteDelayMs < best.absoluteDelayMs) {
      best = { event: candidate, delayMs, absoluteDelayMs }
    }
  }
  return best
}

function summarizeCanvasVisualCommitCorrelation(commits, events, renderReason = "visual") {
  const visualCommits = commits.filter((event) => event.renderReason === renderReason)
  const islandCommits = events.filter((event) => event.kind === "flowdoc-island-react-commit")
  const surfaceCommits = events.filter((event) => event.kind === "flowdoc-island-surface-react-commit")
  const fragmentSplits = events.filter((event) => event.kind === "flowdoc-island-fragment-split")
  const islandMatchedIndexes = new Set()
  const surfaceMatchedIndexes = new Set()
  const fragmentSplitMatchedIndexes = new Set()
  const islandDeltaMs = []
  const surfaceDeltaMs = []
  const fragmentSplitDelayMs = []
  const combinationCounts = {
    islandAndFragmentSplit: 0,
    islandOnly: 0,
    fragmentSplitOnly: 0,
    neither: 0,
  }
  const subtreePathCounts = new Map()
  const byIslandSource = new Map()
  const bySurfaceSource = new Map()
  const byFragmentSplitSource = new Map()

  for (const commit of visualCommits) {
    const islandMatch = nearestEventByCommitTime(
      commit,
      islandCommits,
      CANVAS_ISLAND_COMMIT_TOLERANCE_MS,
    )
    const surfaceMatch = nearestEventByCommitTime(
      commit,
      surfaceCommits,
      CANVAS_ISLAND_COMMIT_TOLERANCE_MS,
    )
    const fragmentSplitMatch = nearestEventBeforeCommit(
      commit,
      fragmentSplits,
      CANVAS_ISLAND_SPLIT_LOOKBACK_MS,
      CANVAS_ISLAND_COMMIT_TOLERANCE_MS,
    )

    if (islandMatch) {
      const index = islandCommits.indexOf(islandMatch.event)
      if (index >= 0) islandMatchedIndexes.add(index)
      islandDeltaMs.push(islandMatch.deltaMs)
      const source = islandMatch.event.source ?? "unknown"
      byIslandSource.set(source, (byIslandSource.get(source) ?? 0) + 1)
    }
    if (surfaceMatch) {
      const index = surfaceCommits.indexOf(surfaceMatch.event)
      if (index >= 0) surfaceMatchedIndexes.add(index)
      surfaceDeltaMs.push(surfaceMatch.deltaMs)
      const source = surfaceMatch.event.source ?? "unknown"
      bySurfaceSource.set(source, (bySurfaceSource.get(source) ?? 0) + 1)
    }
    if (fragmentSplitMatch) {
      const index = fragmentSplits.indexOf(fragmentSplitMatch.event)
      if (index >= 0) fragmentSplitMatchedIndexes.add(index)
      fragmentSplitDelayMs.push(fragmentSplitMatch.delayMs)
      const source = fragmentSplitMatch.event.source ?? "unknown"
      byFragmentSplitSource.set(source, (byFragmentSplitSource.get(source) ?? 0) + 1)
    }

    if (islandMatch && fragmentSplitMatch) {
      combinationCounts.islandAndFragmentSplit += 1
    } else if (islandMatch) {
      combinationCounts.islandOnly += 1
    } else if (fragmentSplitMatch) {
      combinationCounts.fragmentSplitOnly += 1
    } else {
      combinationCounts.neither += 1
    }

    const subtreePath = [
      islandMatch ? "island" : null,
      surfaceMatch ? "surface" : null,
      fragmentSplitMatch ? "fragmentSplit" : null,
    ].filter(Boolean).join("+") || "neither"
    subtreePathCounts.set(subtreePath, (subtreePathCounts.get(subtreePath) ?? 0) + 1)
  }

  return {
    renderReason,
    visualCommitCount: visualCommits.length,
    islandReactCommitCount: islandCommits.length,
    surfaceReactCommitCount: surfaceCommits.length,
    fragmentSplitCount: fragmentSplits.length,
    islandReactCommitMatchCount: islandDeltaMs.length,
    islandReactCommitMissCount: Math.max(0, visualCommits.length - islandDeltaMs.length),
    uniqueIslandReactCommitMatchCount: islandMatchedIndexes.size,
    surfaceReactCommitMatchCount: surfaceDeltaMs.length,
    surfaceReactCommitMissCount: Math.max(0, visualCommits.length - surfaceDeltaMs.length),
    uniqueSurfaceReactCommitMatchCount: surfaceMatchedIndexes.size,
    fragmentSplitMatchCount: fragmentSplitDelayMs.length,
    fragmentSplitMissCount: Math.max(0, visualCommits.length - fragmentSplitDelayMs.length),
    uniqueFragmentSplitMatchCount: fragmentSplitMatchedIndexes.size,
    ...combinationCounts,
    subtreePathCounts: Object.fromEntries([...subtreePathCounts.entries()].sort((a, b) => b[1] - a[1])),
    islandCommitDeltaMs: summarizeNumberValues(islandDeltaMs),
    surfaceCommitDeltaMs: summarizeNumberValues(surfaceDeltaMs),
    fragmentSplitToCommitDelayMs: summarizeNumberValues(fragmentSplitDelayMs),
    byIslandCommitSource: Object.fromEntries([...byIslandSource.entries()].sort((a, b) => b[1] - a[1])),
    bySurfaceCommitSource: Object.fromEntries([...bySurfaceSource.entries()].sort((a, b) => b[1] - a[1])),
    byFragmentSplitSource: Object.fromEntries([...byFragmentSplitSource.entries()].sort((a, b) => b[1] - a[1])),
    matchWindow: {
      islandCommitToleranceMs: CANVAS_ISLAND_COMMIT_TOLERANCE_MS,
      surfaceCommitToleranceMs: CANVAS_ISLAND_COMMIT_TOLERANCE_MS,
      fragmentSplitLookbackMs: CANVAS_ISLAND_SPLIT_LOOKBACK_MS,
    },
  }
}

function topCompleteEvents(events, predicate, limit = TRACE_TOP_LIMIT) {
  return events
    .filter((event) => event.ph === "X" && predicate(event))
    .sort((a, b) => durationMs(b) - durationMs(a))
    .slice(0, limit)
}

function childEventsFor(parent, events) {
  const start = eventStart(parent)
  const end = eventEnd(parent)
  return events.filter((event) => (
    event !== parent &&
    event.ph === "X" &&
    event.tid === parent.tid &&
    eventStart(event) >= start &&
    eventEnd(event) <= end
  ))
}

function summarizeTopEvent(event, allEvents) {
  const children = childEventsFor(event, allEvents)
  const childSummary = new Map()
  for (const child of children) {
    const current = childSummary.get(child.name) ?? { count: 0, totalMs: 0, maxMs: 0 }
    const ms = durationMs(child)
    current.count += 1
    current.totalMs += ms
    current.maxMs = Math.max(current.maxMs, ms)
    childSummary.set(child.name, current)
  }
  return {
    name: event.name,
    label: eventLabel(event),
    durationMs: durationMs(event),
    threadId: event.tid,
    childByName: [...childSummary.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 8),
    topChildren: children
      .sort((a, b) => durationMs(b) - durationMs(a))
      .slice(0, 8)
      .map((child) => ({
        name: child.name,
        label: eventLabel(child),
        durationMs: durationMs(child),
      })),
  }
}

function summarizeTrace(events) {
  const completeEvents = events.filter((event) => event.ph === "X")
  const longTasks = topCompleteEvents(events, (event) => event.name === "RunTask" && durationMs(event) >= 16)
  const topTimelineEvents = topCompleteEvents(events, (event) => (
    [
      "FunctionCall",
      "EvaluateScript",
      "RunTask",
      "FireAnimationFrame",
      "EventDispatch",
      "UpdateLayoutTree",
      "Layout",
      "Paint",
      "CompositeLayers",
      "V8.Execute",
    ].includes(event.name)
  ))
  const countsByName = new Map()
  for (const event of completeEvents) {
    const current = countsByName.get(event.name) ?? { count: 0, totalMs: 0, maxMs: 0 }
    const ms = durationMs(event)
    current.count += 1
    current.totalMs += ms
    current.maxMs = Math.max(current.maxMs, ms)
    countsByName.set(event.name, current)
  }
  return {
    eventCount: events.length,
    completeEventCount: completeEvents.length,
    longTaskCount: longTasks.length,
    longTasks: longTasks.map((event) => summarizeTopEvent(event, events)),
    topTimelineEvents: topTimelineEvents.map((event) => summarizeTopEvent(event, events)),
    byName: [...countsByName.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 16),
  }
}

function compactByNameRows(rows, limit) {
  return rows.slice(0, limit).map((row) => ({
    ...row,
    totalMs: roundMs(row.totalMs),
    maxMs: roundMs(row.maxMs),
  }))
}

function compactEventRows(rows) {
  return rows.slice(0, TRACE_TOP_LIMIT).map((row) => ({
    name: row.name,
    label: row.label,
    durationMs: roundMs(row.durationMs),
    threadId: row.threadId,
    childByName: compactByNameRows(row.childByName ?? [], TRACE_COMPACT_CHILD_LIMIT),
    topChildren: (row.topChildren ?? []).slice(0, TRACE_COMPACT_CHILD_LIMIT).map((child) => ({
      ...child,
      durationMs: roundMs(child.durationMs),
    })),
  }))
}

function compactSummary(summary) {
  return {
    ...summary,
    devtoolsTrace: {
      eventCount: summary.devtoolsTrace.eventCount,
      completeEventCount: summary.devtoolsTrace.completeEventCount,
      longTaskCount: summary.devtoolsTrace.longTaskCount,
      byName: compactByNameRows(summary.devtoolsTrace.byName, 10),
      longTasks: compactEventRows(summary.devtoolsTrace.longTasks),
      topTimelineEvents: compactEventRows(summary.devtoolsTrace.topTimelineEvents),
    },
  }
}

function sumEventField(events, field) {
  return events.reduce((sum, event) => {
    const value = event[field]
    return typeof value === "number" && Number.isFinite(value) ? sum + value : sum
  }, 0)
}

function summarizeWysiwygPerfEvents(events, attributionEvents = []) {
  const byKind = new Map()
  for (const event of events) {
    byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1)
  }
  const correlationEvents = events.concat(attributionEvents)
  const commits = events.filter((event) => event.kind === "editor-canvas-react-commit")
  const islandRootCommits = events.filter((event) => event.kind === "flowdoc-island-react-commit")
  const islandSurfaceCommits = events.filter((event) => event.kind === "flowdoc-island-surface-react-commit")
  const islandSurfaceLiveLayerCommits = events.filter((event) => event.kind === "flowdoc-island-surface-live-layer-react-commit")
  const islandSurfaceChromeCommits = events.filter((event) => event.kind === "flowdoc-island-surface-chrome-react-commit")
  const islandCaretCommits = events.filter((event) => event.kind === "flowdoc-island-caret-react-commit")
  const pageSlotAttributions = events.filter((event) => event.kind === "editor-canvas-page-slot-attribution")
  const draftMeasures = events.filter((event) => event.kind === "flowdoc-island-draft-measure")
  const draftMeasureAttributionHints = attributionEvents.filter((event) => event.kind === "flowdoc-island-draft-measure")
  const observedDraftMeasureEvents = draftMeasures.concat(draftMeasureAttributionHints)
  const visualLineCommits = events.filter((event) => event.kind === "flowdoc-island-visual-lines-react-commit")
  const fragmentSplits = events.filter((event) => event.kind === "flowdoc-island-fragment-split")
  const fragmentSplitAttributionHints = attributionEvents.filter((event) => event.kind === "flowdoc-island-fragment-split")
  const observedFragmentSplitEvents = fragmentSplits.concat(fragmentSplitAttributionHints)
  const emittedSuppressedOutputUnchangedCount = sumEventField(fragmentSplits, "draftFragmentSuppressedOutputUnchangedCount")
  const suppressedOutputUnchangedCount = fragmentSplitAttributionHints.length
  const emittedOutputUnchangedCount = countWhere(fragmentSplits, (event) => event.draftFragmentOutputChanged === false)
  const observedOutputUnchangedCount = countWhere(
    observedFragmentSplitEvents,
    (event) => event.draftFragmentOutputChanged === false,
  )
  return {
    total: events.length,
    attributionHintTotal: attributionEvents.length,
    byKind: Object.fromEntries([...byKind.entries()].sort((a, b) => b[1] - a[1])),
    editorCanvasCommit: {
      ...summarizeDurations(commits),
      byRenderReason: summarizeDurationsByField(commits, "renderReason"),
      byAttributionKind: summarizeDurationsByField(commits, "commitAttributionKind"),
      visualCorrelation: summarizeCanvasVisualCommitCorrelation(commits, correlationEvents),
      visualUnchangedCorrelation: summarizeCanvasVisualCommitCorrelation(commits, correlationEvents, "visual-unchanged"),
    },
    pageSlotAttribution: {
      ...summarizeDurations(pageSlotAttributions),
      memoHitCount: countWhere(pageSlotAttributions, (event) => event.pageSlotMemoEqual === true),
      memoMissCount: countWhere(pageSlotAttributions, (event) => event.pageSlotWouldRender === true),
      affectedMemoMissCount: countWhere(pageSlotAttributions, (event) => (
        event.pageSlotWouldRender === true && event.pageScopedEditAffected === true
      )),
      unaffectedMemoMissCount: countWhere(pageSlotAttributions, (event) => (
        event.pageSlotWouldRender === true && event.pageScopedEditAffected !== true
      )),
      byAction: summarizeDurationsByField(pageSlotAttributions, "action"),
      byRenderReason: summarizeDurationsByField(pageSlotAttributions, "renderReason"),
    },
    islandRootCommit: {
      ...summarizeDurations(islandRootCommits),
      draftChangedCount: countWhere(islandRootCommits, (event) => event.draftRootDraftChanged === true),
      layoutChangedCount: countWhere(islandRootCommits, (event) => event.draftRootLayoutChanged === true),
      surfaceChangedCount: countWhere(islandRootCommits, (event) => event.draftRootSurfaceChanged === true),
      anchorChangedCount: countWhere(islandRootCommits, (event) => event.draftRootAnchorChanged === true),
      inputToVisibleActiveCount: countWhere(islandRootCommits, (event) => event.draftRootInputToVisibleActive === true),
      byCommitReason: summarizeDurationsByField(islandRootCommits, "draftRootCommitReason"),
    },
    islandSurfaceCommit: {
      ...summarizeDurations(islandSurfaceCommits),
      revisionChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceRevisionChanged === true),
      textLengthChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceTextLengthChanged === true),
      caretChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceCaretChanged === true),
      selectionChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceSelectionChanged === true),
      layoutChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceLayoutChanged === true),
      surfaceChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceSurfaceChanged === true),
      anchorChangedCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceAnchorChanged === true),
      inputToVisibleActiveCount: countWhere(islandSurfaceCommits, (event) => event.draftSurfaceInputToVisibleActive === true),
      byCommitReason: summarizeDurationsByField(islandSurfaceCommits, "draftSurfaceCommitReason"),
    },
    islandSurfaceLiveLayerCommit: {
      ...summarizeDurations(islandSurfaceLiveLayerCommits),
      bySource: summarizeDurationsByField(islandSurfaceLiveLayerCommits, "source"),
    },
    islandSurfaceChromeCommit: {
      ...summarizeDurations(islandSurfaceChromeCommits),
      bySource: summarizeDurationsByField(islandSurfaceChromeCommits, "source"),
    },
    islandCaretCommit: {
      ...summarizeDurations(islandCaretCommits),
      activeCount: countWhere(islandCaretCommits, (event) => event.active === true),
      inactiveCount: countWhere(islandCaretCommits, (event) => event.active === false),
      bySource: summarizeDurationsByField(islandCaretCommits, "source"),
    },
    fragmentSplit: {
      ...summarizeDurations(fragmentSplits),
      emittedCount: fragmentSplits.length,
      attributionHintCount: fragmentSplitAttributionHints.length,
      observedCount: observedFragmentSplitEvents.length,
      inputChangedCount: countWhere(fragmentSplits, (event) => event.draftFragmentInputChanged === true),
      inputUnchangedCount: countWhere(fragmentSplits, (event) => event.draftFragmentInputChanged === false),
      outputChangedCount: countWhere(fragmentSplits, (event) => event.draftFragmentOutputChanged === true),
      outputUnchangedCount: emittedOutputUnchangedCount,
      suppressedOutputUnchangedCount,
      emittedSuppressedOutputUnchangedCount,
      observedOutputUnchangedCount,
      maxSameInputRepeatCount: maxEventField(fragmentSplits, "draftFragmentSameInputRepeatCount"),
      maxSameOutputRepeatCount: maxEventField(fragmentSplits, "draftFragmentSameOutputRepeatCount"),
      maxEmittedSuppressedOutputUnchangedCount: maxEventField(fragmentSplits, "draftFragmentSuppressedOutputUnchangedCount"),
      byChangeState: countFragmentSplitChangeStates(fragmentSplits),
      identity: {
        observedEventCount: observedFragmentSplitEvents.length,
        arrayReusedCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentArrayReused === true),
        arrayNewCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentArrayReused === false),
        resultReusedCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentResultReused === true),
        resultNewCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentResultReused === false),
        reuseCandidateCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentReuseCandidate === true),
        surfaceKeysChangedCount: countWhere(observedFragmentSplitEvents, (event) => event.draftSurfaceKeysChanged === true),
        surfaceKeysSameCount: countWhere(observedFragmentSplitEvents, (event) => event.draftSurfaceKeysChanged === false),
        maxSameArrayRepeatCount: maxEventField(observedFragmentSplitEvents, "draftFragmentSameArrayRepeatCount"),
        maxSameResultReuseRepeatCount: maxEventField(observedFragmentSplitEvents, "draftFragmentSameResultReuseRepeatCount"),
        maxSameSurfaceKeyRepeatCount: maxEventField(observedFragmentSplitEvents, "draftSurfaceSameKeyRepeatCount"),
        byIdentityState: countFragmentSplitIdentityStates(observedFragmentSplitEvents),
        byReuseState: countFragmentSplitReuseStates(observedFragmentSplitEvents),
      },
      visualSignature: {
        observedEventCount: observedFragmentSplitEvents.length,
        visualChangedCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentVisualChanged === true),
        visualSameCount: countWhere(observedFragmentSplitEvents, (event) => event.draftFragmentVisualChanged === false),
        outputSameVisualChangedCount: countWhere(observedFragmentSplitEvents, (event) => (
          event.draftFragmentOutputChanged === false && event.draftFragmentVisualChanged === true
        )),
        outputSameVisualSameCount: countWhere(observedFragmentSplitEvents, (event) => (
          event.draftFragmentOutputChanged === false && event.draftFragmentVisualChanged === false
        )),
        maxSameVisualRepeatCount: maxEventField(observedFragmentSplitEvents, "draftFragmentSameVisualRepeatCount"),
        byVisualState: countFragmentSplitVisualStates(observedFragmentSplitEvents),
      },
      bySource: summarizeDurationsByField(fragmentSplits, "source"),
    },
    draftIslandMeasure: {
      ...summarizeDurations(draftMeasures),
      emittedCount: draftMeasures.length,
      attributionHintCount: draftMeasureAttributionHints.length,
      observedCount: observedDraftMeasureEvents.length,
      cacheHitCount: observedDraftMeasureEvents.filter((event) => event.draftLayoutCacheHit === true).length,
      cacheMissCount: observedDraftMeasureEvents.filter((event) => event.draftLayoutCacheHit === false).length,
      cacheUnknownCount: observedDraftMeasureEvents.filter((event) => event.draftLayoutCacheHit == null).length,
      identityReusedCount: observedDraftMeasureEvents.filter((event) => event.draftLayoutIdentityReused === true).length,
    },
    visualLinesCommit: {
      ...summarizeDurations(visualLineCommits),
      bySource: summarizeDurationsByField(visualLineCommits, "source"),
    },
  }
}

async function writeTrace(events) {
  if (!WRITE_TRACE) return null
  const outDir = path.resolve(process.env.TRACE_OUT_DIR ?? path.join(repoRoot, "tmp", "devtools-traces"))
  await fs.mkdir(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filePath = path.join(outDir, `wysiwyg-devtools-trace-${stamp}.json`)
  await fs.writeFile(filePath, JSON.stringify({ traceEvents: events }))
  return filePath
}

async function readWysiwygPerfEventBuffers(page) {
  return page.evaluate(() => ({
    events: window.__flowDocWysiwygPerfEvents ?? [],
    attributionEvents: window.__flowDocWysiwygPerfAttributionEvents ?? [],
  }))
}

function sliceWysiwygPerfEventBuffers(total, start) {
  return {
    events: total.events.slice(start.events.length),
    attributionEvents: total.attributionEvents.slice(start.attributionEvents.length),
  }
}

function summarizeWysiwygPerfEventBuffers(buffers) {
  return summarizeWysiwygPerfEvents(buffers.events, buffers.attributionEvents)
}

async function run() {
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null
  try {
    if (server) await waitForServer(baseEditorUrl, server)
    browser = await launchSmokeBrowser(smokeBrowser)
    const context = await browser.newContext()
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text())
    })
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS })
    await waitForEditorReady(page)
    const fragmentSelector = fragmentSelectorForNode(TARGET_NODE_ID)
    const bridgeSelector = bridgeSelectorForNode(TARGET_NODE_ID)
    await page.locator(fragmentSelector).first().waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
    await page.locator(fragmentSelector).first().click()
    await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
    await page.keyboard.press("End")
    await waitForDoubleAnimationFrame(page)
    await page.evaluate(() => {
      window.__flowDocWysiwygPerfEvents = []
      window.__flowDocWysiwygPerfAttributionEvents = []
      window.__FLOWDOC_PERF_EVENTS__ = []
    })

    const trace = await startDevToolsTrace(page)
    const startedAt = await page.evaluate(() => performance.now())
    for (let index = 0; index < BURST_LENGTH; index += 1) {
      await pressCharacter(page, keyInputProbeCharacter(index))
      if (INTERVAL_MS > 0) await page.waitForTimeout(INTERVAL_MS)
    }
    await waitForDoubleAnimationFrame(page)
    const endedAt = await page.evaluate(() => performance.now())
    const traceEvents = await trace.stop()
    const measuredTypingPerfBuffers = await readWysiwygPerfEventBuffers(page)
    const activeIslandSurfaceAttrs = await readActiveIslandSurfaceAttrs(page, TARGET_NODE_ID)
    const detachedLiveLayerSafety = await runDetachedLiveLayerSafetyChecks(page, TARGET_NODE_ID)
    const totalPerfBuffers = await readWysiwygPerfEventBuffers(page)
    const postTraceSafetyPerfBuffers = sliceWysiwygPerfEventBuffers(totalPerfBuffers, measuredTypingPerfBuffers)
    const tracePath = await writeTrace(traceEvents)

    const summary = {
      ok: consoleErrors.length === 0 && pageErrors.length === 0 && detachedLiveLayerSafety.ok,
      browser: smokeBrowserLabel(smokeBrowser),
      tracePath,
      action: {
        scenario: SCENARIO_ID,
        targetNodeId: TARGET_NODE_ID,
        burstLength: BURST_LENGTH,
        intervalMs: INTERVAL_MS,
        browserDurationMs: endedAt - startedAt,
        islandReactLiveAttrs: TRACE_ISLAND_REACT_LIVE_ATTRS,
        islandSurfaceLiveLayer: TRACE_ISLAND_SURFACE_LIVE_LAYER,
        detachedLiveLayerSafety: DETACHED_LIVE_LAYER_SAFETY ? "1" : "0",
      },
      activeIslandSurfaceAttrs,
      detachedLiveLayerSafety,
      console: {
        errors: consoleErrors.length,
        pageErrors: pageErrors.length,
        errorSamples: consoleErrors.slice(0, 5),
        pageErrorSamples: pageErrors.slice(0, 5),
      },
      perfWindows: {
        measuredTyping: {
          events: measuredTypingPerfBuffers.events.length,
          attributionEvents: measuredTypingPerfBuffers.attributionEvents.length,
        },
        postTraceSafety: {
          events: postTraceSafetyPerfBuffers.events.length,
          attributionEvents: postTraceSafetyPerfBuffers.attributionEvents.length,
        },
        total: {
          events: totalPerfBuffers.events.length,
          attributionEvents: totalPerfBuffers.attributionEvents.length,
        },
      },
      appPerf: summarizeWysiwygPerfEventBuffers(measuredTypingPerfBuffers),
      postTraceSafetyAppPerf: summarizeWysiwygPerfEventBuffers(postTraceSafetyPerfBuffers),
      totalAppPerf: summarizeWysiwygPerfEventBuffers(totalPerfBuffers),
      devtoolsTrace: summarizeTrace(traceEvents),
    }
    console.log(JSON.stringify(TRACE_COMPACT ? compactSummary(summary) : summary, null, 2))
    if (!summary.ok) process.exitCode = 1
  } finally {
    if (browser) await browser.close()
    await stopServer(server)
  }
}

run().catch((error) => {
  console.error("[wysiwyg-devtools-trace] failed:", error?.stack ?? error?.message ?? String(error))
  process.exit(1)
})
