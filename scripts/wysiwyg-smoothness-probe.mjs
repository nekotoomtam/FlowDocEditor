import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser } from "./smoke-browser.mjs"

// Phase C smoothness probe. Types a controlled burst into the Stage 3
// boundary scenario and measures objective signals from the existing
// WYSIWYG perf trace plus keypress->paint latency. The probe writes a
// JSON report so smoothness can be compared across runs and against the
// threshold table in docs/WYSIWYG_SMOOTHNESS_PROBE.md.

const DEFAULT_PORT = 4017
const DEFAULT_TARGET_NODE_ID = "stage3-boundary-target"
const MIXED_PAGINATION_TARGET_NODE_ID = "mixed-pagination-target"
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const PROBE_MODE = process.env.PROBE_MODE?.trim() || "typing"
const NO_WAIT_BURST_PROBE_MODES = new Set(["held-repeat", "no-wait-burst"])
const DEFAULT_TYPE_BURST_LENGTH = PROBE_MODE === "mixed-pagination" ? 80 : (PROBE_MODE === "long-unbroken" || NO_WAIT_BURST_PROBE_MODES.has(PROBE_MODE)) ? 220 : 400
const TYPE_BURST_LENGTH = Number(process.env.PROBE_BURST_LENGTH ?? DEFAULT_TYPE_BURST_LENGTH)
const DEFAULT_TYPE_INTERVAL_MS = (PROBE_MODE === "long-unbroken" || NO_WAIT_BURST_PROBE_MODES.has(PROBE_MODE)) ? 0 : 30
const TYPE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? DEFAULT_TYPE_INTERVAL_MS)
const TYPE_TEXT_SEQUENCE = Array.from(process.env.PROBE_TYPE_TEXT ?? "")
const KEY_INPUT_PROBE_MODES = new Set(["typing", "space-repeat", "delete", "enter", "wrap-typing", "mixed-pagination", "long-unbroken", "held-repeat", "no-wait-burst"])
const NATIVE_WRAP_VARIANT = process.env.PROBE_NATIVE_WRAP_VARIANT?.trim() || "control"
const CAPTURE_EDIT_EXIT = process.env.PROBE_CAPTURE_EDIT_EXIT === "1" || PROBE_MODE === "mixed-pagination"
const PROBE_SCREENSHOT_DIR = process.env.PROBE_SCREENSHOT_DIR?.trim() || null
const RESIZE_MOVE_COUNT = Number(process.env.PROBE_RESIZE_MOVE_COUNT ?? 70)
const RESIZE_MOVE_DISTANCE_PX = Number(process.env.PROBE_RESIZE_DISTANCE_PX ?? 180)
const SELECTION_MOVE_COUNT = Number(process.env.PROBE_SELECTION_MOVE_COUNT ?? 70)
const CAPTURE_TYPING_LAYER_STATE = process.env.PROBE_CAPTURE_LINE_WRAP !== "0"
const READY_TIMEOUT_MS = Number(process.env.PROBE_READY_TIMEOUT_MS ?? 15000)
const TARGET_PAGE_INDEX = process.env.PROBE_TARGET_PAGE_INDEX == null
  ? null
  : Number(process.env.PROBE_TARGET_PAGE_INDEX)
const FRAME_BUDGET_MS = 16
const JANK_BUDGET_MS = 100

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const probeFlowDocFile = process.env.FLOWDOC_PROBE_FILE?.trim() || null
const configuredTargetNodeId = process.env.PROBE_TARGET_NODE_ID?.trim() || null
const shouldUseMixedPaginationDocument = PROBE_MODE === "mixed-pagination" && !probeFlowDocFile

const paragraphFragmentSelector = `[data-testid="editor-fragment"][data-node-type="paragraph"]`
const resizeHandleSelector = `[data-testid="column-resize-handle"]`
const editorShellSelector = `[data-testid="editor-shell"]`

function pageFrameSelector(pageIndex) {
  return `[data-testid="editor-page-frame"][data-page-index="${pageIndex}"]`
}

function paragraphSelectorForPage(pageIndex) {
  return `${pageFrameSelector(pageIndex)} [data-testid="editor-fragment"][data-node-type="paragraph"]`
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function safeFileSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "screenshot"
}

async function captureProbeScreenshot(page, label) {
  if (!PROBE_SCREENSHOT_DIR) return null
  const dir = path.resolve(PROBE_SCREENSHOT_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${safeFileSegment(PROBE_MODE)}-${safeFileSegment(label)}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  return filePath
}

function nativeWrapVariantCss(variant) {
  switch (variant) {
    case "anywhere-normal":
      return {
        overflowWrap: "anywhere",
        wordBreak: "normal",
      }
    case "anywhere-break-word":
      return {
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }
    case "break-word-normal":
    case "control":
      return null
    default:
      throw new Error(`Unsupported PROBE_NATIVE_WRAP_VARIANT: ${variant}`)
  }
}

async function applyNativeWrapVariant(page, variant) {
  const css = nativeWrapVariantCss(variant)
  if (!css) return
  await page.addStyleTag({
    content: `
      [data-wysiwyg-native-edit-textarea="true"] {
        overflow-wrap: ${css.overflowWrap} !important;
        word-break: ${css.wordBreak} !important;
      }
    `,
  })
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  if (!probeFlowDocFile && !shouldUseMixedPaginationDocument) {
    url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  }
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  return url.toString()
}

function readProbeFlowDocFile() {
  if (!probeFlowDocFile) return null
  const resolvedPath = path.resolve(probeFlowDocFile)
  return {
    path: resolvedPath,
    raw: fs.readFileSync(resolvedPath, "utf8"),
  }
}

function pt(value) {
  return { value, unit: "pt" }
}

function makeMixedPaginationProbeDocument() {
  const mixedText = [
    "Centered paragraph for manual typing QA mixes Thai และ English words near pagination.",
    "การพิมพ์ต้องคงบรรทัดเดิมไว้ขณะ draft ยังไม่ settle และต้องไม่มี HTML wrapping truth อีกชั้น.",
    "The caret position for this probe is immediately after pagination",
  ].join(" ")

  return {
    version: 1,
    document: {
      id: "mixed-pagination-typing-doc",
      meta: { title: "Mixed Pagination Typing Probe" },
      sections: [{
        id: "mixed-pagination-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "mixed-pagination-body",
        nodes: {
          "mixed-pagination-body": {
            id: "mixed-pagination-body",
            type: "body",
            props: {},
            childIds: [
              "mixed-pagination-spacer",
              MIXED_PAGINATION_TARGET_NODE_ID,
              "mixed-pagination-downstream-1",
              "mixed-pagination-downstream-2",
            ],
          },
          "mixed-pagination-spacer": {
            id: "mixed-pagination-spacer",
            type: "spacer",
            props: { height: 560 },
          },
          [MIXED_PAGINATION_TARGET_NODE_ID]: {
            id: MIXED_PAGINATION_TARGET_NODE_ID,
            type: "paragraph",
            props: {
              align: "center",
              fontSize: pt(12),
              fontFamilyKey: "default",
              lineHeight: 1.4,
              spacingBefore: pt(0),
              spacingAfter: pt(8),
              textIndent: pt(0),
              indentLeft: pt(0),
              indentRight: pt(0),
            },
            children: [{ id: `${MIXED_PAGINATION_TARGET_NODE_ID}-text`, type: "text", text: mixedText }],
          },
          "mixed-pagination-downstream-1": {
            id: "mixed-pagination-downstream-1",
            type: "paragraph",
            props: {
              fontSize: pt(10),
              fontFamilyKey: "default",
              lineHeight: 1.3,
              spacingBefore: pt(0),
              spacingAfter: pt(6),
            },
            children: [{ id: "mixed-pagination-downstream-1-text", type: "text", text: "Downstream paragraph keeps page-break pressure visible after the typed draft commits." }],
          },
          "mixed-pagination-downstream-2": {
            id: "mixed-pagination-downstream-2",
            type: "paragraph",
            props: {
              fontSize: pt(10),
              fontFamilyKey: "default",
              lineHeight: 1.3,
              spacingBefore: pt(0),
              spacingAfter: pt(6),
            },
            children: [{ id: "mixed-pagination-downstream-2-text", type: "text", text: "Second downstream paragraph catches stale layout jumps after blur or keyboard exit." }],
          },
        },
      }],
    },
  }
}

function fragmentSelectorForNode(nodeId) {
  return `[data-testid="editor-fragment"][data-node-id="${nodeId}"]`
}

function bridgeSelectorForNode(nodeId) {
  return `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`
}

function textEngineLayerSelectorForNode(nodeId) {
  return `[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${nodeId}"]`
}

async function resolveTargetNodeId(page) {
  if (configuredTargetNodeId) return configuredTargetNodeId
  if (shouldUseMixedPaginationDocument) return MIXED_PAGINATION_TARGET_NODE_ID
  if (!probeFlowDocFile) return DEFAULT_TARGET_NODE_ID

  await page.locator(paragraphFragmentSelector).first().waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
  const candidates = await page.locator(paragraphFragmentSelector).evaluateAll((nodes) => nodes
    .map((node) => {
      const element = node
      const rect = element.getBoundingClientRect()
      return {
        nodeId: element.getAttribute("data-node-id"),
        pageIndex: Number(element.getAttribute("data-page-index") ?? "0"),
        height: rect.height,
        width: rect.width,
        top: rect.top,
      }
    })
    .filter((item) => item.nodeId && item.width > 0 && item.height > 0)
    .sort((a, b) => {
      const areaDelta = (b.width * b.height) - (a.width * a.height)
      if (Math.abs(areaDelta) > 1) return areaDelta
      if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex
      return a.top - b.top
    }))
  const target = candidates[0]?.nodeId
  assert(target, "Could not find a paragraph fragment target in the loaded document")
  return target
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null
  const index = Math.min(sortedValues.length - 1, Math.floor(p * (sortedValues.length - 1)))
  return sortedValues[index]
}

function summarizeDurations(events) {
  const durations = events
    .map((event) => event.durationMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b)
  return {
    count: events.length,
    totalMs: durations.reduce((sum, value) => sum + value, 0),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations[durations.length - 1] ?? null,
  }
}

function summarizeTypingInputPhases(keystrokes) {
  const phases = ["same-line", "wrap-boundary", "after-wrap"]
  return phases.reduce((acc, phase) => {
    const phaseKeys = keystrokes.filter((key) => key.inputPhase === phase)
    const totalDurations = phaseKeys.map((key) => key.totalMs).filter(Number.isFinite).sort((a, b) => a - b)
    const paintDurations = phaseKeys.map((key) => key.paintLatencyMs).filter(Number.isFinite).sort((a, b) => a - b)
    const visibleDraftDurations = phaseKeys
      .map((key) => key.inputToVisibleDraftLinesMs)
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .sort((a, b) => a - b)
    acc[phase] = {
      count: phaseKeys.length,
      firstIndex: phaseKeys[0]?.index ?? null,
      inputToVisibleDraftLinesMs: {
        p50: percentile(visibleDraftDurations, 0.5),
        p95: percentile(visibleDraftDurations, 0.95),
        max: visibleDraftDurations[visibleDraftDurations.length - 1] ?? null,
      },
      paintLatencyMs: {
        p50: percentile(paintDurations, 0.5),
        p95: percentile(paintDurations, 0.95),
        max: paintDurations[paintDurations.length - 1] ?? null,
      },
      totalMs: {
        p50: percentile(totalDurations, 0.5),
        p95: percentile(totalDurations, 0.95),
        max: totalDurations[totalDurations.length - 1] ?? null,
      },
    }
    return acc
  }, {})
}

function summarizeFrameGaps(samples) {
  const gaps = []
  for (let i = 1; i < samples.length; i += 1) {
    const gap = samples[i].t - samples[i - 1].t
    if (Number.isFinite(gap)) gaps.push(gap)
  }
  const sorted = gaps.slice().sort((a, b) => a - b)
  return {
    count: gaps.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? null,
    lateFrameCount: gaps.filter((gap) => gap > FRAME_BUDGET_MS * 2).length,
    estimatedDroppedFrames: gaps.reduce((sum, gap) => (
      gap > FRAME_BUDGET_MS * 1.5 ? sum + Math.max(0, Math.floor(gap / FRAME_BUDGET_MS) - 1) : sum
    ), 0),
  }
}

function summarizeHeldInputBurst({ checkpoints, samples, preTypingVisibleTextLength, preTypingVisibleLineCount }) {
  const sortedSamples = samples.slice().sort((a, b) => a.t - b.t)
  const dispatchDurations = checkpoints
    .map((checkpoint) => checkpoint.dispatchMs)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const inputToVisibleDurations = []
  const keystrokes = checkpoints.map((checkpoint) => {
    const visibleSample = sortedSamples.find((sample) => (
      sample.t >= checkpoint.afterDispatch &&
      typeof sample.textLength === "number" &&
      sample.textLength >= checkpoint.expectedTextLength
    ))
    const firstSampleAfterDispatch = sortedSamples.find((sample) => sample.t >= checkpoint.afterDispatch) ?? null
    const inputToVisibleMs = visibleSample ? visibleSample.t - checkpoint.beforeDispatch : null
    if (typeof inputToVisibleMs === "number" && Number.isFinite(inputToVisibleMs)) {
      inputToVisibleDurations.push(inputToVisibleMs)
    }
    return {
      index: checkpoint.index,
      inputPhase: "same-line",
      visibleLineCount: visibleSample?.lineCount ?? firstSampleAfterDispatch?.lineCount ?? null,
      inputToVisibleDraftLinesMs: inputToVisibleMs,
      paintLatencyMs: inputToVisibleMs,
      totalMs: checkpoint.dispatchMs,
    }
  })

  let previousLineCount = preTypingVisibleLineCount
  let crossedWrap = false
  for (const keystroke of keystrokes) {
    if (
      previousLineCount != null &&
      keystroke.visibleLineCount != null &&
      keystroke.visibleLineCount > previousLineCount
    ) {
      keystroke.inputPhase = "wrap-boundary"
      crossedWrap = true
    } else if (crossedWrap) {
      keystroke.inputPhase = "after-wrap"
    }
    if (keystroke.visibleLineCount != null) previousLineCount = keystroke.visibleLineCount
  }

  let checkpointIndex = 0
  const backlogSamples = sortedSamples.map((sample, index) => {
    while (checkpointIndex < checkpoints.length && checkpoints[checkpointIndex].afterDispatch <= sample.t) {
      checkpointIndex += 1
    }
    const expectedTextLength = preTypingVisibleTextLength + checkpointIndex
    const visibleTextLength = typeof sample.textLength === "number" ? sample.textLength : preTypingVisibleTextLength
    return {
      index,
      t: sample.t,
      activeVisualMode: sample.activeVisualMode,
      activeVisualDetail: sample.activeVisualDetail,
      textLength: visibleTextLength,
      lineCount: sample.lineCount,
      revision: sample.revision,
      expectedTextLength,
      backlogChars: Math.max(0, expectedTextLength - visibleTextLength),
    }
  })

  let backlogStart = null
  let maxBacklogMs = 0
  for (let i = 0; i < backlogSamples.length; i += 1) {
    const sample = backlogSamples[i]
    if (sample.backlogChars > 0 && backlogStart === null) backlogStart = sample.t
    if ((sample.backlogChars === 0 || i === backlogSamples.length - 1) && backlogStart !== null) {
      const end = sample.backlogChars === 0 ? sample.t : sample.t
      maxBacklogMs = Math.max(maxBacklogMs, end - backlogStart)
      backlogStart = null
    }
  }

  const firstWrapSampleIndex = sortedSamples.findIndex((sample) => (
    preTypingVisibleLineCount != null &&
    typeof sample.lineCount === "number" &&
    sample.lineCount > preTypingVisibleLineCount
  ))
  const inputToVisibleSorted = inputToVisibleDurations.slice().sort((a, b) => a - b)
  const finalSample = sortedSamples[sortedSamples.length - 1] ?? null
  const maxBacklogChars = backlogSamples.reduce((max, sample) => Math.max(max, sample.backlogChars), 0)
  const activeVisualModes = [...new Set(sortedSamples.map((sample) => sample.activeVisualMode).filter(Boolean))]
  const activeVisualDetails = [...new Set(sortedSamples.map((sample) => sample.activeVisualDetail).filter(Boolean))]
  return {
    dispatchCount: checkpoints.length,
    sampleCount: sortedSamples.length,
    dispatchMs: {
      p50: percentile(dispatchDurations, 0.5),
      p95: percentile(dispatchDurations, 0.95),
      max: dispatchDurations[dispatchDurations.length - 1] ?? null,
    },
    inputToVisibleDraftLinesMs: {
      p50: percentile(inputToVisibleSorted, 0.5),
      p95: percentile(inputToVisibleSorted, 0.95),
      max: inputToVisibleSorted[inputToVisibleSorted.length - 1] ?? null,
      unresolvedCount: checkpoints.length - inputToVisibleDurations.length,
    },
    frameGaps: summarizeFrameGaps(sortedSamples),
    maxBacklogChars,
    maxVisibleBehindLatestInputMs: maxBacklogMs,
    finalBacklogChars: finalSample
      ? Math.max(0, preTypingVisibleTextLength + checkpoints.length - (finalSample.textLength ?? preTypingVisibleTextLength))
      : null,
    activeVisualModes,
    activeVisualDetails,
    visualModeStable: activeVisualModes.length <= 1 && activeVisualDetails.length <= 1,
    firstWrapFrame: firstWrapSampleIndex >= 0 ? {
      index: firstWrapSampleIndex,
      previous: sortedSamples[firstWrapSampleIndex - 1] ?? null,
      current: sortedSamples[firstWrapSampleIndex],
      next: sortedSamples[firstWrapSampleIndex + 1] ?? null,
    } : null,
    frameWindowAroundFirstWrap: firstWrapSampleIndex >= 0
      ? sortedSamples.slice(Math.max(0, firstWrapSampleIndex - 2), firstWrapSampleIndex + 3)
      : [],
    backlogSamples: backlogSamples.slice(0, 5).concat(backlogSamples.length > 10 ? [{ omitted: backlogSamples.length - 10 }] : [], backlogSamples.slice(Math.max(5, backlogSamples.length - 5))),
    keystrokes,
  }
}

function summarizePerfEvents(perfEvents) {
  const eventCounts = perfEvents.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1
    return acc
  }, {})
  const slowEvents = perfEvents.filter((e) => e.durationMs > FRAME_BUDGET_MS).length
  const jankEvents = perfEvents.filter((e) => e.durationMs > JANK_BUDGET_MS).length
  const longestEvent = perfEvents.reduce(
    (max, e) => (e.durationMs > max.durationMs ? e : max),
    { durationMs: 0 },
  )
  const geometryEvents = perfEvents.filter((event) => event.kind === "native-edit-geometry-sync")
  const geometryInputEvents = geometryEvents.filter((event) => String(event.source ?? "").includes("input"))
  const geometryImmediateInputEvents = geometryInputEvents.filter((event) => String(event.source ?? "").includes("input-sync"))
  const geometryAfterPaintInputEvents = geometryInputEvents.filter((event) => String(event.source ?? "").includes("after-paint"))
  const geometryBeforeVisibleDraftEvents = geometryInputEvents.filter((event) => (
    !String(event.source ?? "").includes("after-paint")
  ))
  const geometryDurations = geometryEvents
    .map((event) => event.durationMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
  const heightPreviewEvents = perfEvents.filter((event) => event.kind === "inline-edit-height-preview")
  const heightPreviewDispatchEvents = heightPreviewEvents.filter((event) => event.active !== false)
  const setInlineEditHeightEvents = heightPreviewEvents.filter((event) => event.commandType === "SET_INLINE_EDIT_HEIGHT")
  const heightPreviewBySource = heightPreviewEvents.reduce((acc, event) => {
    const source = event.source ?? "unknown"
    acc[source] = (acc[source] ?? 0) + 1
    return acc
  }, {})
  const draftMeasureEvents = perfEvents.filter((event) => event.kind === "text-engine-draft-measure")
  const flowdocIslandMeasureEvents = perfEvents.filter((event) => event.kind === "flowdoc-island-draft-measure")
  const flowdocIslandVisibleEvents = perfEvents.filter((event) => event.kind === "flowdoc-island-visible-lines")
  const flowdocIslandCommitEvents = perfEvents.filter((event) => event.kind === "flowdoc-island-react-commit")
  const flowdocIslandParentSyncEvents = perfEvents.filter((event) => event.kind === "flowdoc-island-parent-sync")
  const flowdocIslandStructuralEvents = perfEvents.filter((event) => event.kind === "flowdoc-island-structural-edit")
  const browserPreviewPaginationEvents = perfEvents.filter((event) => event.kind === "browser-preview-pagination")
  const canvasCommitEvents = perfEvents.filter((event) => event.kind === "editor-canvas-react-commit")
  return {
    total: perfEvents.length,
    countByKind: eventCounts,
    overFrameBudget: slowEvents,
    jankCount: jankEvents,
    longestEvent: longestEvent.kind ? {
      kind: longestEvent.kind,
      durationMs: longestEvent.durationMs,
    } : null,
    nativeGeometrySync: {
      count: geometryEvents.length,
      inputCount: geometryInputEvents.length,
      totalMs: geometryDurations.reduce((sum, value) => sum + value, 0),
      maxMs: geometryDurations.length ? Math.max(...geometryDurations) : null,
      immediateInputCount: geometryImmediateInputEvents.length,
      afterPaintInputCount: geometryAfterPaintInputEvents.length,
      ranBeforeVisibleDraftUpdate: geometryBeforeVisibleDraftEvents.length > 0,
      firstBeforeVisibleDraftEvent: geometryBeforeVisibleDraftEvents[0] ?? null,
      sources: [...new Set(geometryEvents.map((event) => event.source ?? "unknown"))],
    },
    heightPreview: {
      eventCount: heightPreviewEvents.length,
      dispatchCount: heightPreviewDispatchEvents.length,
      setInlineEditHeightCount: setInlineEditHeightEvents.length,
      sources: [...new Set(heightPreviewEvents.map((event) => event.source ?? "unknown"))],
      bySource: heightPreviewBySource,
      boundaryHandoffCount: heightPreviewBySource["set-inline-edit-height-dispatch-boundary-handoff"] ?? 0,
    },
    draftMeasure: summarizeDurations(draftMeasureEvents),
    flowdocIsland: {
      draftMeasure: summarizeDurations(flowdocIslandMeasureEvents),
      visibleLines: summarizeDurations(flowdocIslandVisibleEvents),
      reactCommit: summarizeDurations(flowdocIslandCommitEvents),
      parentSyncCount: flowdocIslandParentSyncEvents.length,
      browserPreviewPaginationCount: browserPreviewPaginationEvents.length,
      structuralEdit: {
        count: flowdocIslandStructuralEvents.length,
        splitParagraphCount: flowdocIslandStructuralEvents.filter((event) => event.action === "split-paragraph").length,
        mergeParagraphCount: flowdocIslandStructuralEvents.filter((event) => event.action === "merge-paragraph").length,
        sources: [...new Set(flowdocIslandStructuralEvents.map((event) => event.source ?? "unknown"))],
      },
    },
    editorCanvasCommit: summarizeDurations(canvasCommitEvents),
  }
}

async function readTextEngineLayerState(page, layerSelector) {
  return await page.evaluate((selector) => {
    const layers = Array.from(document.querySelectorAll(selector))
      .filter((node) => node instanceof SVGElement)
    const layer = layers.find((node) => (
      node.getAttribute("data-wysiwyg-active-visual-mode") === "flowdoc-draft-editor-island"
    )) ?? layers[0] ?? null
    if (!(layer instanceof SVGElement)) return null
    const layerNodeId = layer.getAttribute("data-inline-edit-node-id")
    const activeIslandLayers = layer.getAttribute("data-wysiwyg-active-visual-mode") === "flowdoc-draft-editor-island"
      ? layers.filter((node) => (
          node.getAttribute("data-wysiwyg-active-visual-mode") === "flowdoc-draft-editor-island" &&
          node.getAttribute("data-inline-edit-node-id") === layerNodeId
        ))
      : [layer]
    const serializeRect = (rect) => rect
      ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        }
      : null
    const serializeTextRects = (nodes) => Array.from(nodes)
      .filter((node) => node instanceof Element)
      .slice(0, 8)
      .map((node) => ({
        text: node.textContent ?? "",
        rect: serializeRect(node.getBoundingClientRect()),
      }))
    const rectsOverlap = (a, b) => Boolean(
      a &&
      b &&
      a.right > b.left &&
      a.left < b.right &&
      a.bottom > b.top &&
      a.top < b.bottom
    )
    const replacement = layer.querySelector('[data-wysiwyg-draft-text-replacement="true"]')
    const fragment = layer.closest('[data-testid="editor-fragment"]')
    const fragmentChrome = fragment
      ? Array.from(fragment.children).find((child) => (
          child instanceof SVGRectElement &&
          child.getAttribute("data-wysiwyg-hit-area") !== "true" &&
          child.getAttribute("data-wysiwyg-native-edit-outline") !== "true" &&
          child.getAttribute("data-wysiwyg-native-edit-fragment-chrome-suppressed") !== "true"
        )) ?? null
      : null
    const replacementBox = replacement?.querySelector?.('[data-wysiwyg-draft-text-replacement-box="true"]') ?? null
    const replacementBoxElement = replacementBox instanceof HTMLElement ? replacementBox : null
    const replacementRect = replacement instanceof Element ? replacement.getBoundingClientRect() : null
    const replacementBoxRect = replacementBoxElement?.getBoundingClientRect() ?? null
    const replacementStyle = replacementBoxElement ? getComputedStyle(replacementBoxElement) : null
    const replacementLineHeight = replacementStyle ? Number.parseFloat(replacementStyle.lineHeight) : null
    const replacementMode = replacement?.getAttribute("data-wysiwyg-draft-text-replacement-mode") || null
    const replacementSvgLineCount = replacement
      ? replacement.querySelectorAll('[data-wysiwyg-draft-text-replacement-line="true"]').length
      : 0
    const replacementActualLineCount = replacementSvgLineCount > 0
      ? replacementSvgLineCount
      : replacementBoxRect && replacementLineHeight && Number.isFinite(replacementLineHeight) && replacementLineHeight > 0
      ? Math.max(1, Math.round(replacementBoxRect.height / replacementLineHeight))
      : null
    const sourceLineCount = replacement
      ? Number(replacement.getAttribute("data-wysiwyg-draft-text-replacement-source-line-count") ?? "0")
      : null
    const flowdocDraftLineNodes = activeIslandLayers.flatMap((surface) =>
      Array.from(surface.querySelectorAll('[data-wysiwyg-flowdoc-draft-line="true"]'))
    )
    const flowdocDraftLinesGroups = activeIslandLayers.map((surface) =>
      surface.querySelector('[data-wysiwyg-flowdoc-draft-lines="true"]')
    ).filter(Boolean)
    const flowdocDraftSelectionRects = activeIslandLayers.flatMap((surface) =>
      Array.from(surface.querySelectorAll('[data-wysiwyg-selection-overlay="true"] rect'))
    )
    const oldSvgTextLines = Array.from(layer.querySelectorAll("text")).filter((text) => (
      !replacement?.contains(text) &&
      !flowdocDraftLinesGroups.some((group) => group?.contains(text)) &&
      text.getAttribute("data-list-marker") !== "true"
    ))
    const replacementLineNodes = replacement
      ? replacement.querySelectorAll('[data-wysiwyg-draft-text-replacement-line="true"]')
      : []
    const replacementAttrNumber = (name) => {
      const raw = replacement?.getAttribute(name)
      if (raw == null) return null
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : null
    }
    const layerAttrNumber = (name) => {
      const raw = layer.getAttribute(name)
      if (raw == null) return null
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : null
    }
    const replacementWidth = replacementAttrNumber("data-wysiwyg-draft-text-replacement-width")
    const replacementHeight = replacementAttrNumber("data-wysiwyg-draft-text-replacement-height")
    const actualReplacementRect = replacementBoxRect ?? replacementRect
    const hitArea = layer.querySelector('[data-wysiwyg-hit-area="true"]')
    const hitAreaWidth = hitArea instanceof SVGRectElement ? hitArea.width.baseVal.value : null
    const hitAreaRect = hitArea instanceof Element ? hitArea.getBoundingClientRect() : null
    const activeHitAreaRects = activeIslandLayers
      .map((surface) => surface.querySelector('[data-wysiwyg-hit-area="true"]'))
      .filter((node) => node instanceof Element)
      .map((node) => node.getBoundingClientRect())
    const pageBreakMarkerRects = Array.from(document.querySelectorAll('[data-testid="editor-page-break-marker"]'))
      .filter((node) => node instanceof Element)
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
    const overlappingPageBreakMarkerRects = pageBreakMarkerRects.filter((markerRect) => (
      activeHitAreaRects.some((activeRect) => rectsOverlap(activeRect, markerRect))
    ))
    const inputBridge = layer.querySelector('[data-wysiwyg-input-bridge="true"]') ??
      (layerNodeId
        ? document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${CSS.escape(layerNodeId)}"]`)
        : null)
    const inputBridgeElement = inputBridge instanceof HTMLElement ? inputBridge : null
    const inputBridgeRect = inputBridgeElement?.getBoundingClientRect() ?? null
    const hitCenterElement = hitAreaRect
      ? document.elementFromPoint(
          hitAreaRect.left + hitAreaRect.width / 2,
          hitAreaRect.top + Math.min(hitAreaRect.height / 2, 16),
        )
      : null
    const inputBridgeOwnsVisiblePointer = Boolean(
      inputBridgeElement &&
      hitCenterElement &&
      (hitCenterElement === inputBridgeElement || inputBridgeElement.contains(hitCenterElement)),
    )
    const nativeOutline = layer.querySelector('[data-wysiwyg-native-edit-outline="true"]')
    const nativeTextarea = layer.querySelector('[data-wysiwyg-native-edit-textarea="true"]')
    const nativeTextareaElement = nativeTextarea instanceof HTMLTextAreaElement ? nativeTextarea : null
    const nativeForeignObject = layer.querySelector('[data-wysiwyg-native-edit-foreign-object="true"]')
    const nativeStyle = nativeTextareaElement ? getComputedStyle(nativeTextareaElement) : null
    const nativeVisibleTextEnabled = layer.getAttribute("data-wysiwyg-native-visible-text") !== "false" &&
      nativeTextareaElement?.getAttribute("data-wysiwyg-native-visible-text") !== "false" &&
      nativeStyle?.color !== "rgba(0, 0, 0, 0)" &&
      nativeStyle?.color !== "transparent"
    const nativeLineHeight = nativeStyle ? Number.parseFloat(nativeStyle.lineHeight) : null
    const nativeWhiteSpace = nativeStyle?.whiteSpace ?? null
    const nativeOverflowWrap = nativeStyle?.overflowWrap ?? null
    const nativeWordBreak = nativeStyle?.wordBreak ?? null
    const nativeWidthRaw = layer.getAttribute("data-wysiwyg-native-edit-width")
    const nativeWidth = nativeWidthRaw == null ? null : Number(nativeWidthRaw)
    const nativeRect = nativeTextareaElement?.getBoundingClientRect() ?? null
    const nativeOutlineRect = nativeOutline instanceof Element ? nativeOutline.getBoundingClientRect() : null
    const fragmentRect = fragment instanceof Element ? fragment.getBoundingClientRect() : null
    const fragmentChromeRect = fragmentChrome instanceof Element ? fragmentChrome.getBoundingClientRect() : null
    const nativeScrollHeight = nativeTextareaElement?.scrollHeight ?? null
    const nativeActualLineCount = nativeTextareaElement &&
      nativeLineHeight &&
      Number.isFinite(nativeLineHeight) &&
      nativeLineHeight > 0
      ? Math.max(1, Math.round(nativeTextareaElement.scrollHeight / nativeLineHeight))
      : null
    const nativeContentWithinWidth = nativeWidth != null && Number.isFinite(nativeWidth) && hitAreaWidth != null
      ? nativeWidth <= hitAreaWidth + 0.01
      : null
    const liveEcho = layer.querySelector('[data-wysiwyg-live-echo="true"]')
    const liveCaret = layer.querySelector('[data-wysiwyg-live-caret="true"]')
    const replacementContentWithinWidth = replacementWidth != null && hitAreaWidth != null
      ? replacementWidth <= hitAreaWidth + 0.01
      : null
    const replacementHtmlLineRects = replacementBoxElement
      ? Array.from(replacementBoxElement.getClientRects()).map(serializeRect)
      : []
    return {
      lineCount: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-total-line-count") ?? layer.getAttribute("data-wysiwyg-line-count") ?? "0"),
      immediateDraftLayout: layer.getAttribute("data-wysiwyg-immediate-draft-layout") === "true",
      reflowKind: layer.getAttribute("data-wysiwyg-reflow-kind") || null,
      activeVisualMode: layer.getAttribute("data-wysiwyg-active-visual-mode") || null,
      activeVisualDetail: layer.getAttribute("data-wysiwyg-active-visual-detail") || null,
      customCaretVisible: layer.getAttribute("data-wysiwyg-custom-caret-visible") === "true" ||
        Boolean(layer.querySelector('[data-wysiwyg-caret="true"]')),
      flowdocDraft: flowdocDraftLineNodes.length > 0 ? {
        active: true,
        lineCount: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-total-line-count") ?? String(flowdocDraftLineNodes.length)),
        textLength: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-text-length") ?? "0"),
        caretOffset: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-caret-offset") ?? "0"),
        selectionStart: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-selection-start") ?? "0"),
        selectionEnd: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-selection-end") ?? "0"),
        selectedTextLength: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-selected-text-length") ?? "0"),
        selectionCollapsed: layer.getAttribute("data-wysiwyg-flowdoc-draft-selection-collapsed") !== "false",
        selectionOverlayCount: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-selection-overlay-count") ?? String(flowdocDraftSelectionRects.length)),
        surfaceCount: Number(layer.getAttribute("data-wysiwyg-island-fragment-count") ?? String(activeIslandLayers.length)),
        pageBoundaryPreview: layer.getAttribute("data-wysiwyg-island-page-boundary-preview") === "true",
        reflowKind: layer.getAttribute("data-wysiwyg-island-reflow-kind") ?? null,
        lineSignatures: flowdocDraftLineNodes.slice(0, 16).map((node) => node.textContent ?? ""),
        lineRanges: flowdocDraftLineNodes.slice(0, 16).map((node) => ({
          start: Number(node.getAttribute("data-wysiwyg-draft-line-start") ?? "0"),
          end: Number(node.getAttribute("data-wysiwyg-draft-line-end") ?? "0"),
        })),
        lineRects: serializeTextRects(flowdocDraftLineNodes),
        nativeVisibleTextEnabled,
        customCaretVisible: layer.getAttribute("data-wysiwyg-custom-caret-visible") === "true" ||
          Boolean(layer.querySelector('[data-wysiwyg-caret="true"]')),
        inputBridgeMode: inputBridgeElement?.getAttribute("data-wysiwyg-input-bridge-mode") ?? null,
        inputBridgeRect: serializeRect(inputBridgeRect),
        hitAreaRect: serializeRect(hitAreaRect),
        hitAreaRects: activeHitAreaRects.slice(0, 8).map(serializeRect),
        pageBreakMarkerOverlapDetected: overlappingPageBreakMarkerRects.length > 0,
        pageBreakMarkerOverlapCount: overlappingPageBreakMarkerRects.length,
        pageBreakMarkerRects: overlappingPageBreakMarkerRects.slice(0, 8).map(serializeRect),
        visiblePointerOwner: layer.getAttribute("data-wysiwyg-visible-pointer-owner") ?? null,
        clipboardOwned: layer.getAttribute("data-wysiwyg-flowdoc-draft-clipboard") === "true",
        inputBridgeOwnsVisiblePointer,
      } : {
        active: false,
        lineCount: 0,
        textLength: 0,
        caretOffset: null,
        selectionStart: null,
        selectionEnd: null,
        selectedTextLength: 0,
        selectionCollapsed: true,
        selectionOverlayCount: 0,
        lineSignatures: [],
        lineRanges: [],
        lineRects: [],
        nativeVisibleTextEnabled,
        customCaretVisible: false,
        inputBridgeMode: inputBridgeElement?.getAttribute("data-wysiwyg-input-bridge-mode") ?? null,
        inputBridgeRect: serializeRect(inputBridgeRect),
        hitAreaRect: serializeRect(hitAreaRect),
        hitAreaRects: activeHitAreaRects.slice(0, 8).map(serializeRect),
        pageBreakMarkerOverlapDetected: overlappingPageBreakMarkerRects.length > 0,
        pageBreakMarkerOverlapCount: overlappingPageBreakMarkerRects.length,
        pageBreakMarkerRects: overlappingPageBreakMarkerRects.slice(0, 8).map(serializeRect),
        visiblePointerOwner: layer.getAttribute("data-wysiwyg-visible-pointer-owner") ?? null,
        clipboardOwned: layer.getAttribute("data-wysiwyg-flowdoc-draft-clipboard") === "true",
        inputBridgeOwnsVisiblePointer,
      },
      native: nativeTextareaElement ? {
        active: true,
        valueLength: nativeTextareaElement.value.length,
        textSample: nativeTextareaElement.value.slice(0, 240),
        visibleTextEnabled: nativeVisibleTextEnabled,
        x: layerAttrNumber("data-wysiwyg-native-edit-x"),
        y: layerAttrNumber("data-wysiwyg-native-edit-y"),
        fragmentY: layerAttrNumber("data-wysiwyg-native-edit-fragment-y"),
        firstLineY: layerAttrNumber("data-wysiwyg-native-edit-first-line-y"),
        measuredTextBlockHeight: layerAttrNumber("data-wysiwyg-native-edit-measured-text-block-height"),
        clipMode: layer.getAttribute("data-wysiwyg-native-edit-clip-mode") || null,
        whiteSpace: nativeWhiteSpace,
        overflowWrap: nativeOverflowWrap,
        wordBreak: nativeWordBreak,
        width: Number.isFinite(nativeWidth) ? nativeWidth : nativeRect?.width ?? null,
        height: nativeRect?.height ?? null,
        scrollHeight: nativeScrollHeight,
        domRect: serializeRect(nativeRect),
        outlineRect: serializeRect(nativeOutlineRect),
        fragmentRect: serializeRect(fragmentRect),
        fragmentChromeRect: serializeRect(fragmentChromeRect),
        scrollExceedsFragmentPx: nativeScrollHeight != null && fragmentChromeRect
          ? nativeScrollHeight - fragmentChromeRect.height
          : null,
        outlineExceedsFragmentPx: nativeOutlineRect && fragmentChromeRect
          ? nativeOutlineRect.bottom - fragmentChromeRect.bottom
          : null,
        foreignObjectRect: nativeForeignObject instanceof Element
          ? serializeRect(nativeForeignObject.getBoundingClientRect())
          : null,
        actualLineCount: nativeActualLineCount,
        lineHeight: nativeLineHeight,
        contentWithinWidth: nativeContentWithinWidth,
        oldSvgTextLineCount: oldSvgTextLines.length,
        oldSvgTextLineRects: serializeTextRects(oldSvgTextLines),
      } : {
        active: false,
        valueLength: 0,
        textSample: "",
        visibleTextEnabled: false,
        x: null,
        y: null,
        fragmentY: null,
        firstLineY: null,
        measuredTextBlockHeight: null,
        clipMode: null,
        whiteSpace: null,
        overflowWrap: null,
        wordBreak: null,
        width: null,
        height: null,
        scrollHeight: null,
        domRect: null,
        outlineRect: null,
        fragmentRect: null,
        fragmentChromeRect: null,
        scrollExceedsFragmentPx: null,
        outlineExceedsFragmentPx: null,
        foreignObjectRect: null,
        actualLineCount: null,
        lineHeight: null,
        contentWithinWidth: null,
        oldSvgTextLineCount: oldSvgTextLines.length,
        oldSvgTextLineRects: serializeTextRects(oldSvgTextLines),
      },
      liveEchoActive: Boolean(liveEcho),
      liveCaretActive: Boolean(liveCaret),
      replacement: replacement ? {
        active: true,
        mode: replacementMode || "unknown",
        sourceLineCount,
        svgLineCount: replacementSvgLineCount,
        actualLineCount: replacementActualLineCount,
        textLength: replacement.textContent?.length ?? 0,
        textSample: (replacement.textContent ?? "").slice(0, 240),
        width: replacementWidth ?? replacementBoxRect?.width ?? null,
        height: replacementHeight ?? replacementBoxRect?.height ?? null,
        domRect: serializeRect(actualReplacementRect),
        lineRects: serializeTextRects(replacementLineNodes),
        htmlLineRects: replacementHtmlLineRects,
        contentWithinWidth: replacementContentWithinWidth,
        lineHeight: replacementLineHeight,
        oldSvgTextLineCount: oldSvgTextLines.length,
        oldSvgTextLineRects: serializeTextRects(oldSvgTextLines),
      } : {
        active: false,
        mode: null,
        sourceLineCount: null,
        svgLineCount: 0,
        actualLineCount: null,
        textLength: 0,
        textSample: "",
        width: null,
        height: null,
        domRect: null,
        lineRects: [],
        htmlLineRects: [],
        contentWithinWidth: null,
        lineHeight: null,
        oldSvgTextLineCount: oldSvgTextLines.length,
        oldSvgTextLineRects: serializeTextRects(oldSvgTextLines),
      },
    }
  }, layerSelector)
}

async function readFragmentVisualState(page, fragmentSelector, layerSelector) {
  return await page.evaluate(({ fragmentSelector: fragmentSel, layerSelector: layerSel }) => {
    const serializeRect = (rect) => rect
      ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        }
      : null
    const fragment = document.querySelector(fragmentSel)
    if (!(fragment instanceof Element)) return null
    const layer = document.querySelector(layerSel)
    const replacement = layer?.querySelector?.('[data-wysiwyg-draft-text-replacement="true"]') ?? null
    const nativeTextarea = layer?.querySelector?.('[data-wysiwyg-native-edit-textarea="true"]') ?? null
    const flowdocDraftLineNodes = layer
      ? Array.from(layer.querySelectorAll('[data-wysiwyg-flowdoc-draft-line="true"]'))
      : []
    const flowdocDraftLinesGroup = layer?.querySelector?.('[data-wysiwyg-flowdoc-draft-lines="true"]') ?? null
    const textNodes = Array.from(fragment.querySelectorAll("text")).filter((node) => (
      node instanceof SVGTextElement &&
      node.getAttribute("data-list-marker") !== "true" &&
      !replacement?.contains(node) &&
      !flowdocDraftLinesGroup?.contains(node)
    ))
    const replacementLineNodes = replacement
      ? Array.from(replacement.querySelectorAll('[data-wysiwyg-draft-text-replacement-line="true"]'))
      : []
    return {
      activeVisualMode: layer?.getAttribute?.("data-wysiwyg-active-visual-mode") ?? "measured-svg",
      activeVisualDetail: layer?.getAttribute?.("data-wysiwyg-active-visual-detail") ?? "measured",
      replacementActive: Boolean(replacement),
      nativeActive: nativeTextarea instanceof HTMLTextAreaElement,
      nativeTextLength: nativeTextarea instanceof HTMLTextAreaElement ? nativeTextarea.value.length : 0,
      nativeVisibleTextEnabled: layer?.getAttribute?.("data-wysiwyg-native-visible-text") !== "false",
      flowdocDraftLineCount: flowdocDraftLineNodes.length,
      flowdocDraftLineSignatures: flowdocDraftLineNodes.slice(0, 16).map((node) => node.textContent ?? ""),
      flowdocDraftLineRanges: flowdocDraftLineNodes.slice(0, 16).map((node) => ({
        start: Number(node.getAttribute("data-wysiwyg-draft-line-start") ?? "0"),
        end: Number(node.getAttribute("data-wysiwyg-draft-line-end") ?? "0"),
      })),
      measuredTextLineCount: textNodes.length,
      measuredLineSignatures: textNodes.slice(0, 16).map((node) => node.textContent ?? ""),
      replacementLineCount: replacementLineNodes.length,
      nativeLineCount: nativeTextarea instanceof HTMLTextAreaElement
        ? (() => {
            const style = getComputedStyle(nativeTextarea)
            const lineHeight = Number.parseFloat(style.lineHeight)
            return Number.isFinite(lineHeight) && lineHeight > 0
              ? Math.max(1, Math.round(nativeTextarea.scrollHeight / lineHeight))
              : null
          })()
        : null,
      nativeScrollHeight: nativeTextarea instanceof HTMLTextAreaElement ? nativeTextarea.scrollHeight : null,
      nativeHeight: nativeTextarea instanceof HTMLTextAreaElement ? nativeTextarea.getBoundingClientRect().height : null,
      measuredLineRects: textNodes.slice(0, 8).map((node) => ({
        text: node.textContent ?? "",
        rect: serializeRect(node.getBoundingClientRect()),
      })),
      replacementLineRects: replacementLineNodes.slice(0, 8).map((node) => ({
        text: node.textContent ?? "",
        rect: serializeRect(node.getBoundingClientRect()),
      })),
      fragmentRect: serializeRect(fragment.getBoundingClientRect()),
    }
  }, { fragmentSelector, layerSelector })
}

function summarizeTypingLayerSamples(samples) {
  if (!samples.length) return null
  const afterPressCounts = samples
    .map((sample) => sample.afterPress?.lineCount)
    .filter((value) => typeof value === "number")
  const afterPaintCounts = samples
    .map((sample) => sample.afterPaint?.lineCount)
    .filter((value) => typeof value === "number")
  const startLineCount = afterPaintCounts[0] ?? afterPressCounts[0] ?? null
  const firstLineIncrease = samples.find((sample) => (
    startLineCount !== null &&
    ((sample.afterPress?.lineCount ?? 0) > startLineCount ||
      (sample.afterPaint?.lineCount ?? 0) > startLineCount)
  ))
  const replacementSamples = samples.flatMap((sample) => [
    sample.afterPress?.replacement ? { index: sample.index, phase: "afterPress", ...sample.afterPress.replacement } : null,
    sample.afterPaint?.replacement ? { index: sample.index, phase: "afterPaint", ...sample.afterPaint.replacement } : null,
  ].filter(Boolean))
  const activeReplacementSamples = replacementSamples.filter((sample) => sample.active)
  const nativeSamples = samples.flatMap((sample) => [
    sample.afterPress?.native ? {
      index: sample.index,
      phase: "afterPress",
      sourceLineCount: sample.afterPress.lineCount,
      ...sample.afterPress.native,
    } : null,
    sample.afterPaint?.native ? {
      index: sample.index,
      phase: "afterPaint",
      sourceLineCount: sample.afterPaint.lineCount,
      ...sample.afterPaint.native,
    } : null,
  ].filter(Boolean))
  const activeNativeSamples = nativeSamples.filter((sample) => sample.active)
  const activeNativeVisualSamples = activeNativeSamples.filter((sample) => sample.visibleTextEnabled !== false)
  const flowdocDraftSamples = samples.flatMap((sample) => [
    sample.afterPress?.flowdocDraft ? {
      index: sample.index,
      phase: "afterPress",
      sourceLineCount: sample.afterPress.lineCount,
      ...sample.afterPress.flowdocDraft,
    } : null,
    sample.afterPaint?.flowdocDraft ? {
      index: sample.index,
      phase: "afterPaint",
      sourceLineCount: sample.afterPaint.lineCount,
      ...sample.afterPaint.flowdocDraft,
    } : null,
  ].filter(Boolean))
  const activeFlowdocDraftSamples = flowdocDraftSamples.filter((sample) => sample.active)
  const replacementLineCounts = activeReplacementSamples
    .map((sample) => sample.actualLineCount)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
  const nativeLineCounts = activeNativeVisualSamples
    .map((sample) => sample.actualLineCount)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
  const flowdocLineCounts = activeFlowdocDraftSamples
    .map((sample) => sample.lineCount)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
  const nativeScrollHeights = activeNativeVisualSamples
    .map((sample) => sample.scrollHeight)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
  const nativeDomHeights = activeNativeVisualSamples
    .map((sample) => sample.height)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
  const nativeScrollExceedsFragmentSamples = activeNativeVisualSamples.filter((sample) => (
    typeof sample.scrollExceedsFragmentPx === "number" &&
    sample.scrollExceedsFragmentPx > 1
  ))
  const nativeOutlineExceedsFragmentSamples = activeNativeSamples.filter((sample) => (
    typeof sample.outlineExceedsFragmentPx === "number" &&
    sample.outlineExceedsFragmentPx > 1
  ))
  const nativeHeightLagSamples = activeNativeVisualSamples.filter((sample) => (
    typeof sample.scrollHeight === "number" &&
    typeof sample.height === "number" &&
    sample.scrollHeight - sample.height > 1
  ))
  const nativeHeightLagAfterPressSamples = nativeHeightLagSamples.filter((sample) => sample.phase === "afterPress")
  const nativeHeightLagAfterPaintSamples = nativeHeightLagSamples.filter((sample) => sample.phase === "afterPaint")
  const nativeScrollExceedsFragmentAfterPressSamples = nativeScrollExceedsFragmentSamples.filter((sample) => sample.phase === "afterPress")
  const nativeScrollExceedsFragmentAfterPaintSamples = nativeScrollExceedsFragmentSamples.filter((sample) => sample.phase === "afterPaint")
  const nativeOutlineExceedsFragmentAfterPressSamples = nativeOutlineExceedsFragmentSamples.filter((sample) => sample.phase === "afterPress")
  const nativeOutlineExceedsFragmentAfterPaintSamples = nativeOutlineExceedsFragmentSamples.filter((sample) => sample.phase === "afterPaint")
  const nativeClipModes = activeNativeSamples
    .map((sample) => sample.clipMode)
    .filter(Boolean)
  const nativeWrapStyles = activeNativeSamples
    .map((sample) => `${sample.whiteSpace ?? "unknown"}|${sample.overflowWrap ?? "unknown"}|${sample.wordBreak ?? "unknown"}`)
    .filter(Boolean)
  const activeFlowdocVisualSamples = activeFlowdocDraftSamples.map((sample) => ({
    ...sample,
    actualLineCount: sample.lineCount,
    contentWithinWidth: true,
  }))
  const activeVisualSamples = [...activeNativeVisualSamples, ...activeReplacementSamples, ...activeFlowdocVisualSamples]
  const singleLineCollapseSamples = activeVisualSamples.filter((sample) => (
    sample.sourceLineCount > 1 &&
    sample.actualLineCount !== null &&
    sample.actualLineCount <= 1
  ))
  const majorLineBreakDriftSamples = activeVisualSamples.filter((sample) => (
    sample.sourceLineCount > 1 &&
    sample.actualLineCount !== null &&
    sample.actualLineCount + 1 < sample.sourceLineCount
  ))
  const replacementOutOfWidthSamples = activeReplacementSamples.filter((sample) => (
    sample.contentWithinWidth === false
  ))
  const nativeOutOfWidthSamples = activeNativeSamples.filter((sample) => (
    sample.contentWithinWidth === false
  ))
  const svgReplacementSamples = activeReplacementSamples
  const oldVisualLineOverlapSamples = activeReplacementSamples.filter((sample) => (
    sample.oldSvgTextLineCount > 0
  ))
  const nativeOldVisualLineOverlapSamples = activeNativeSamples.filter((sample) => (
    sample.oldSvgTextLineCount > 0
  ))
  const flowdocNativeTextVisibleSamples = activeFlowdocDraftSamples.filter((sample) => (
    sample.nativeVisibleTextEnabled !== false
  ))
  const flowdocMissingCaretSamples = activeFlowdocDraftSamples.filter((sample) => (
    sample.customCaretVisible !== true
  ))
  const flowdocInputBridgePointerTargetSamples = activeFlowdocDraftSamples.filter((sample) => (
    sample.inputBridgeOwnsVisiblePointer === true
  ))
  const flowdocPageBoundaryPreviewSamples = activeFlowdocDraftSamples.filter((sample) => (
    sample.pageBoundaryPreview === true
  ))
  const flowdocHardBoundarySamples = activeFlowdocDraftSamples.filter((sample) => (
    sample.reflowKind === "hard-page-boundary"
  ))
  const flowdocPageBreakOverlapSamples = activeFlowdocDraftSamples.filter((sample) => (
    sample.pageBreakMarkerOverlapDetected === true ||
    (sample.pageBreakMarkerOverlapCount ?? 0) > 0
  ))
  const liveEchoSamples = samples.flatMap((sample) => [
    sample.afterPress?.liveEchoActive ? { index: sample.index, phase: "afterPress" } : null,
    sample.afterPaint?.liveEchoActive ? { index: sample.index, phase: "afterPaint" } : null,
  ].filter(Boolean))
  const liveCaretSamples = samples.flatMap((sample) => [
    sample.afterPress?.liveCaretActive ? { index: sample.index, phase: "afterPress" } : null,
    sample.afterPaint?.liveCaretActive ? { index: sample.index, phase: "afterPaint" } : null,
  ].filter(Boolean))
  const visualModes = samples
    .map((sample) => sample.afterPaint?.activeVisualMode ?? sample.afterPress?.activeVisualMode)
    .filter(Boolean)
  const visualModeTransitions = visualModes.reduce((count, mode, index) => (
    index > 0 && visualModes[index - 1] !== mode ? count + 1 : count
  ), 0)
  const visualDetails = samples
    .map((sample) => sample.afterPaint?.activeVisualDetail ?? sample.afterPress?.activeVisualDetail)
    .filter(Boolean)
  const visualDetailTransitions = visualDetails.reduce((count, detail, index) => (
    index > 0 && visualDetails[index - 1] !== detail ? count + 1 : count
  ), 0)
  return {
    captured: samples.length,
    startLineCount,
    maxAfterPressLineCount: afterPressCounts.length ? Math.max(...afterPressCounts) : null,
    maxAfterPaintLineCount: afterPaintCounts.length ? Math.max(...afterPaintCounts) : null,
    immediateDraftLayoutAfterPressCount: samples.filter((sample) => sample.afterPress?.immediateDraftLayout).length,
    immediateDraftLayoutAfterPaintCount: samples.filter((sample) => sample.afterPaint?.immediateDraftLayout).length,
    firstLineIncreaseIndex: firstLineIncrease?.index ?? null,
    firstLineIncreaseAfterPress: firstLineIncrease?.afterPress ?? null,
    firstLineIncreaseAfterPaint: firstLineIncrease?.afterPaint ?? null,
    replacementSampleCount: replacementSamples.length,
    activeReplacementSampleCount: activeReplacementSamples.length,
    nativeSampleCount: nativeSamples.length,
    activeNativeSampleCount: activeNativeSamples.length,
    activeNativeVisualSampleCount: activeNativeVisualSamples.length,
    flowdocDraftSampleCount: flowdocDraftSamples.length,
    activeFlowdocDraftSampleCount: activeFlowdocDraftSamples.length,
    maxFlowdocDraftLineCount: flowdocLineCounts.length
      ? Math.max(...flowdocLineCounts)
      : null,
    minFlowdocDraftLineCount: flowdocLineCounts.length
      ? Math.min(...flowdocLineCounts)
      : null,
    firstFlowdocDraftSample: activeFlowdocDraftSamples[0] ?? null,
    lastFlowdocDraftSample: activeFlowdocDraftSamples.at(-1) ?? null,
    flowdocNativeTextVisibleDetected: flowdocNativeTextVisibleSamples.length > 0,
    flowdocNativeTextVisibleCount: flowdocNativeTextVisibleSamples.length,
    flowdocCustomCaretMissingDetected: flowdocMissingCaretSamples.length > 0,
    flowdocCustomCaretMissingCount: flowdocMissingCaretSamples.length,
    flowdocInputBridgePointerTargetDetected: flowdocInputBridgePointerTargetSamples.length > 0,
    flowdocInputBridgePointerTargetCount: flowdocInputBridgePointerTargetSamples.length,
    firstFlowdocInputBridgePointerTargetSample: flowdocInputBridgePointerTargetSamples[0] ?? null,
    flowdocPageBoundaryPreviewDetected: flowdocPageBoundaryPreviewSamples.length > 0,
    flowdocPageBoundaryPreviewCount: flowdocPageBoundaryPreviewSamples.length,
    flowdocHardBoundaryReflowDetected: flowdocHardBoundarySamples.length > 0,
    flowdocHardBoundaryReflowCount: flowdocHardBoundarySamples.length,
    flowdocPageBreakOverlapDetected: flowdocPageBreakOverlapSamples.length > 0,
    flowdocPageBreakOverlapCount: flowdocPageBreakOverlapSamples.length,
    firstFlowdocPageBreakOverlapSample: flowdocPageBreakOverlapSamples[0] ?? null,
    maxNativeLineCount: nativeLineCounts.length
      ? Math.max(...nativeLineCounts)
      : null,
    minNativeLineCount: nativeLineCounts.length
      ? Math.min(...nativeLineCounts)
      : null,
    maxNativeScrollHeight: nativeScrollHeights.length
      ? Math.max(...nativeScrollHeights)
      : null,
    maxNativeDomHeight: nativeDomHeights.length
      ? Math.max(...nativeDomHeights)
      : null,
    nativeHeightLagDetected: nativeHeightLagSamples.length > 0,
    nativeHeightLagCount: nativeHeightLagSamples.length,
    nativeHeightLagAfterPressCount: nativeHeightLagAfterPressSamples.length,
    nativeHeightLagAfterPaintCount: nativeHeightLagAfterPaintSamples.length,
    firstNativeHeightLagSample: nativeHeightLagSamples[0] ?? null,
    nativeScrollExceedsFragmentDetected: nativeScrollExceedsFragmentSamples.length > 0,
    nativeScrollExceedsFragmentCount: nativeScrollExceedsFragmentSamples.length,
    nativeScrollExceedsFragmentAfterPressCount: nativeScrollExceedsFragmentAfterPressSamples.length,
    nativeScrollExceedsFragmentAfterPaintCount: nativeScrollExceedsFragmentAfterPaintSamples.length,
    firstNativeScrollExceedsFragmentSample: nativeScrollExceedsFragmentSamples[0] ?? null,
    nativeOutlineExceedsFragmentDetected: nativeOutlineExceedsFragmentSamples.length > 0,
    nativeOutlineExceedsFragmentCount: nativeOutlineExceedsFragmentSamples.length,
    nativeOutlineExceedsFragmentAfterPressCount: nativeOutlineExceedsFragmentAfterPressSamples.length,
    nativeOutlineExceedsFragmentAfterPaintCount: nativeOutlineExceedsFragmentAfterPaintSamples.length,
    firstNativeOutlineExceedsFragmentSample: nativeOutlineExceedsFragmentSamples[0] ?? null,
    maxReplacementLineCount: replacementLineCounts.length
      ? Math.max(...replacementLineCounts)
      : null,
    minReplacementLineCount: replacementLineCounts.length
      ? Math.min(...replacementLineCounts)
      : null,
    singleLineCollapseDetected: singleLineCollapseSamples.length > 0,
    singleLineCollapseCount: singleLineCollapseSamples.length,
    firstSingleLineCollapseSample: singleLineCollapseSamples[0] ?? null,
    majorLineBreakDriftDetected: majorLineBreakDriftSamples.length > 0,
    majorLineBreakDriftCount: majorLineBreakDriftSamples.length,
    firstMajorLineBreakDriftSample: majorLineBreakDriftSamples[0] ?? null,
    replacementOutOfWidthDetected: replacementOutOfWidthSamples.length > 0,
    replacementOutOfWidthCount: replacementOutOfWidthSamples.length,
    firstReplacementOutOfWidthSample: replacementOutOfWidthSamples[0] ?? null,
    nativeOutOfWidthDetected: nativeOutOfWidthSamples.length > 0,
    nativeOutOfWidthCount: nativeOutOfWidthSamples.length,
    firstNativeOutOfWidthSample: nativeOutOfWidthSamples[0] ?? null,
    svgReplacementDetected: svgReplacementSamples.length > 0,
    svgReplacementCount: svgReplacementSamples.length,
    firstSvgReplacementSample: svgReplacementSamples[0] ?? null,
    htmlDraftReplacementDetected: svgReplacementSamples.length > 0,
    htmlDraftReplacementCount: svgReplacementSamples.length,
    liveEchoDetected: liveEchoSamples.length > 0,
    liveEchoCount: liveEchoSamples.length,
    firstLiveEchoSample: liveEchoSamples[0] ?? null,
    liveCaretDetected: liveCaretSamples.length > 0,
    liveCaretCount: liveCaretSamples.length,
    firstLiveCaretSample: liveCaretSamples[0] ?? null,
    oldVisualLineOverlapDetected: oldVisualLineOverlapSamples.length > 0 ||
      nativeOldVisualLineOverlapSamples.length > 0,
    oldVisualLineOverlapCount: oldVisualLineOverlapSamples.length + nativeOldVisualLineOverlapSamples.length,
    firstOldVisualLineOverlapSample: oldVisualLineOverlapSamples[0] ??
      nativeOldVisualLineOverlapSamples[0] ??
      null,
    visualModeTransitions,
    visualDetailTransitions,
    visualModeOscillationDetected: visualModeTransitions > 1,
    activeVisualModeStable: new Set(visualModes).size <= 1,
    nativeVisualModeStable: visualModes.every((mode) => (
      mode === "native-edit-layer" ||
      mode === "flowdoc-draft-lines" ||
      mode === "flowdoc-draft-editor-island"
    )),
    nativeClipModes: [...new Set(nativeClipModes)],
    nativeWrapStyles: [...new Set(nativeWrapStyles)],
    duringBurstNativeGeometryOk:
      nativeHeightLagAfterPressSamples.length === 0 &&
      nativeScrollExceedsFragmentAfterPressSamples.length === 0 &&
      nativeOutlineExceedsFragmentAfterPressSamples.length === 0,
    activeVisualModes: [...new Set(visualModes)],
    activeVisualDetails: [...new Set(visualDetails)],
  }
}

function keyInputProbeCharacter(index) {
  if (TYPE_TEXT_SEQUENCE.length) return TYPE_TEXT_SEQUENCE[index % TYPE_TEXT_SEQUENCE.length]
  if (PROBE_MODE === "space-repeat") return " "
  if (PROBE_MODE === "wrap-typing") {
    const wrapPattern = Array.from(" wrap ")
    return wrapPattern[index % wrapPattern.length]
  }
  if (PROBE_MODE === "mixed-pagination") {
    const thaiPattern = Array.from("ทดสอบการพิมพ์")
    return thaiPattern[index % thaiPattern.length]
  }
  if (PROBE_MODE === "long-unbroken") {
    return (index % 96) < 72 ? "d" : "s"
  }
  if (NO_WAIT_BURST_PROBE_MODES.has(PROBE_MODE)) {
    return (index % 96) < 72 ? "d" : "s"
  }
  return index % 13 === 12 ? " " : String.fromCharCode(97 + (index % 26))
}

async function pressCharacter(page, ch) {
  if (ch === " ") {
    await page.keyboard.press("Space")
    return
  }
  if (ch === "\n") {
    await page.keyboard.press("Enter")
    return
  }
  await page.keyboard.type(ch)
}

async function prepareKeyInputProbe(page) {
  await page.keyboard.press("End")
  if (PROBE_MODE !== "delete") return
  const unit = " delete-probe"
  const repeat = Math.ceil((TYPE_BURST_LENGTH + 20) / unit.length)
  await page.keyboard.type(unit.repeat(repeat))
  await waitForDoubleAnimationFrame(page)
  await page.keyboard.press("End")
}

async function dispatchKeyInputProbeStep(page, index) {
  if (PROBE_MODE === "delete") {
    await page.keyboard.press("Backspace")
    return
  }
  if (PROBE_MODE === "enter") {
    await page.keyboard.press("Enter")
    return
  }
  await pressCharacter(page, keyInputProbeCharacter(index))
}

async function waitForDoubleAnimationFrame(page) {
  return await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resolve(performance.now() - start)
    }))
  }))
}

async function startHeldInputSampler(page, layerSelector) {
  await page.evaluate((selector) => {
    window.__flowDocHeldInputSamples = []
    window.__flowDocHeldInputSampling = true
    const serializeLayer = () => {
      const layers = Array.from(document.querySelectorAll(selector))
        .filter((node) => node instanceof SVGElement)
      const layer = layers.find((node) => (
        node.getAttribute("data-wysiwyg-active-visual-mode") === "flowdoc-draft-editor-island"
      )) ?? layers[0] ?? null
      if (!(layer instanceof SVGElement)) {
        return {
          t: performance.now(),
          active: false,
          activeVisualMode: null,
          activeVisualDetail: null,
          textLength: null,
          lineCount: null,
          revision: null,
        }
      }
      const numberAttr = (name) => {
        const raw = layer.getAttribute(name)
        const value = raw == null ? NaN : Number(raw)
        return Number.isFinite(value) ? value : null
      }
      return {
        t: performance.now(),
        active: true,
        activeVisualMode: layer.getAttribute("data-wysiwyg-active-visual-mode"),
        activeVisualDetail: layer.getAttribute("data-wysiwyg-active-visual-detail"),
        textLength: numberAttr("data-wysiwyg-flowdoc-draft-text-length"),
        lineCount: numberAttr("data-wysiwyg-flowdoc-draft-line-count"),
        caretOffset: numberAttr("data-wysiwyg-flowdoc-draft-caret-offset"),
        revision: numberAttr("data-wysiwyg-island-revision"),
        nativeVisibleText: layer.getAttribute("data-wysiwyg-native-visible-text"),
        visiblePointerOwner: layer.getAttribute("data-wysiwyg-visible-pointer-owner"),
      }
    }
    const sample = () => {
      window.__flowDocHeldInputSamples.push(serializeLayer())
      if (window.__flowDocHeldInputSampling) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, layerSelector)
}

async function stopHeldInputSampler(page) {
  return await page.evaluate(() => {
    window.__flowDocHeldInputSampling = false
    return window.__flowDocHeldInputSamples ?? []
  })
}

async function captureSelectionReleaseSamples(page, frameCount = 4) {
  return await page.evaluate((count) => new Promise((resolve) => {
    const samples = []
    const sample = () => {
      const layer = document.querySelector('[data-wysiwyg-text-engine-layer="true"]')
      samples.push({
        overlayCount: document.querySelectorAll('[data-wysiwyg-selection="true"]').length,
        localPreview: layer?.getAttribute("data-wysiwyg-local-selection-preview") === "true",
      })
      if (samples.length >= count) {
        resolve(samples)
        return
      }
      requestAnimationFrame(sample)
    }
    sample()
  }), frameCount)
}

async function waitForEditorReady(page) {
  await page.waitForSelector(editorShellSelector, { timeout: READY_TIMEOUT_MS })
  await page.waitForFunction((selector) => (
    document.querySelector(selector)?.getAttribute("data-preview-layout-blocking") === "false"
  ), editorShellSelector, { timeout: READY_TIMEOUT_MS })
}

async function prepareProbeViewport(page) {
  await waitForEditorReady(page)
  if (TARGET_PAGE_INDEX === null || !Number.isFinite(TARGET_PAGE_INDEX)) return

  const frameSelector = pageFrameSelector(TARGET_PAGE_INDEX)
  await page.waitForSelector(frameSelector, { timeout: READY_TIMEOUT_MS })
  await page.evaluate((selector) => {
    document.querySelector(selector)?.scrollIntoView({ block: "start" })
  }, frameSelector)
  await page.waitForFunction((selector) => (
    document.querySelectorAll(selector).length > 0
  ), paragraphSelectorForPage(TARGET_PAGE_INDEX), { timeout: READY_TIMEOUT_MS })
  await waitForDoubleAnimationFrame(page)
}

async function waitForServer(url, server, timeoutMs = 60000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    if (server?.exitCode != null) {
      throw new Error("Next dev server exited before probe URL was ready")
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((r) => setTimeout(r, 500))
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
        ...(PROBE_MODE === "selection"
          ? { NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT: "1" }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  )
  child.stdout.on("data", () => {})
  child.stderr.on("data", () => {})
  return child
}

function stopServer(server) {
  if (!server || server.exitCode != null) return Promise.resolve()
  server.kill()
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5000)
    server.once("exit", () => { clearTimeout(timeout); resolve() })
  })
}

async function runFlowdocDraftPointerHitProbe(page, layerSelector) {
  const targetPlan = await page.evaluate((selector) => {
    const layers = Array.from(document.querySelectorAll(selector))
      .filter((node) => node instanceof SVGElement)
    const layer = layers.find((node) => (
      node.getAttribute("data-wysiwyg-active-visual-mode") === "flowdoc-draft-editor-island"
    )) ?? layers[0] ?? null
    if (!(layer instanceof SVGElement)) return null
    const draftLineGroups = Array.from(layer.querySelectorAll('[data-wysiwyg-flowdoc-draft-line="true"]'))
      .filter((node) => node instanceof Element)
    if (draftLineGroups.length === 0) return null
    const layerNodeId = layer.getAttribute("data-inline-edit-node-id")
    const bridge = layer.querySelector('[data-wysiwyg-input-bridge="true"]') ??
      (layerNodeId
        ? document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${CSS.escape(layerNodeId)}"]`)
        : null)
    const serializeElement = (element) => element instanceof Element
      ? {
          tagName: element.tagName,
          wysiwygInputBridge: element.getAttribute("data-wysiwyg-input-bridge"),
          wysiwygHitArea: element.getAttribute("data-wysiwyg-hit-area"),
          wysiwygDraftIslandHitArea: element.getAttribute("data-wysiwyg-draft-editor-island-hit-area"),
        }
      : null
    const candidateFor = (candidateGroup, fallbackLineIndex) => {
      const text = candidateGroup.querySelector("text")
      if (!(text instanceof Element)) return null
      let rect = text.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        rect = candidateGroup.getBoundingClientRect()
      }
      if (rect.width <= 0 || rect.height <= 0) return null
      const start = Number(candidateGroup.getAttribute("data-wysiwyg-draft-line-start") ?? "0")
      const end = Number(candidateGroup.getAttribute("data-wysiwyg-draft-line-end") ?? "0")
      const points = [
        { x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2)), y: rect.top + rect.height / 2 },
        { x: rect.left + Math.max(1, Math.min(rect.width - 1, 3)), y: rect.top + rect.height / 2 },
        { x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width - 3)), y: rect.top + rect.height / 2 },
      ]
      for (const point of points) {
        const elementAtPoint = document.elementFromPoint(point.x, point.y)
        const bridgeOwnsPoint = Boolean(
          bridge &&
          elementAtPoint &&
          (bridge === elementAtPoint || bridge.contains(elementAtPoint)),
        )
        const layerOwnsPoint = Boolean(elementAtPoint && layer.contains(elementAtPoint))
        if (elementAtPoint) {
          return {
            x: point.x,
            y: point.y,
            lineIndex: Number(candidateGroup.getAttribute("data-wysiwyg-draft-line-index") ?? fallbackLineIndex),
            lineStart: start,
            lineEnd: end,
            lineText: text.textContent ?? "",
            beforeCaretOffset: Number(layer.getAttribute("data-wysiwyg-flowdoc-draft-caret-offset") ?? "0"),
            bridgeOwnsPoint,
            layerOwnsPoint,
            elementAtPoint: serializeElement(elementAtPoint),
          }
        }
      }
      return null
    }
    const candidates = []
    for (let index = 0; index < draftLineGroups.length; index += 1) {
      const candidate = candidateFor(draftLineGroups[index], index)
      if (candidate) candidates.push(candidate)
    }
    const islandOwnedCandidates = candidates.filter((candidate) => candidate.layerOwnsPoint && !candidate.bridgeOwnsPoint)
    const usableCandidates = islandOwnedCandidates.length > 0 ? islandOwnedCandidates : candidates
    const clickTarget = usableCandidates[usableCandidates.length - 1] ?? null
    const dragStart = usableCandidates[0] ?? null
    const dragEnd = dragStart
      ? [...usableCandidates].reverse().find((candidate) => candidate.lineIndex !== dragStart.lineIndex) ?? null
      : null
    return clickTarget ? {
      clickTarget,
      dragStart,
      dragEnd,
      candidateCount: candidates.length,
      islandOwnedCandidateCount: islandOwnedCandidates.length,
    } : null
  }, layerSelector)
  if (!targetPlan?.clickTarget) return { attempted: false, ok: false, reason: "missing-flowdoc-draft-line-target" }

  const target = targetPlan.clickTarget
  await page.mouse.click(target.x, target.y)
  await waitForDoubleAnimationFrame(page)
  const afterState = await readTextEngineLayerState(page, layerSelector)
  const afterCaretOffset = afterState?.flowdocDraft?.caretOffset ?? null
  const caretWithinClickedLine = typeof afterCaretOffset === "number" &&
    afterCaretOffset >= target.lineStart &&
    afterCaretOffset <= target.lineEnd
  let dragSelection = {
    attempted: false,
    ok: false,
    reason: targetPlan.dragStart && targetPlan.dragEnd ? null : "missing-wrapped-drag-targets",
    candidateCount: targetPlan.candidateCount ?? null,
    islandOwnedCandidateCount: targetPlan.islandOwnedCandidateCount ?? null,
  }
  if (targetPlan.dragStart && targetPlan.dragEnd) {
    const start = targetPlan.dragStart
    const end = targetPlan.dragEnd
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 8 })
    await page.mouse.up()
    await waitForDoubleAnimationFrame(page)
    const afterDragState = await readTextEngineLayerState(page, layerSelector)
    const selectionStart = afterDragState?.flowdocDraft?.selectionStart ?? null
    const selectionEnd = afterDragState?.flowdocDraft?.selectionEnd ?? null
    const selectionMin = typeof selectionStart === "number" && typeof selectionEnd === "number"
      ? Math.min(selectionStart, selectionEnd)
      : null
    const selectionMax = typeof selectionStart === "number" && typeof selectionEnd === "number"
      ? Math.max(selectionStart, selectionEnd)
      : null
    const spansTargetLines = selectionMin != null && selectionMax != null &&
      selectionMin <= start.lineEnd &&
      selectionMax >= end.lineStart
    dragSelection = {
      attempted: true,
      ok: Boolean(
        start.layerOwnsPoint &&
        end.layerOwnsPoint &&
        !start.bridgeOwnsPoint &&
        !end.bridgeOwnsPoint &&
        selectionMin != null &&
        selectionMax != null &&
        selectionMax > selectionMin &&
        spansTargetLines &&
        (afterDragState?.flowdocDraft?.selectionOverlayCount ?? 0) > 0,
      ),
      start,
      end,
      selectionStart,
      selectionEnd,
      selectionCollapsed: afterDragState?.flowdocDraft?.selectionCollapsed ?? null,
      selectionOverlayCount: afterDragState?.flowdocDraft?.selectionOverlayCount ?? null,
      spansTargetLines,
      activeVisualMode: afterDragState?.activeVisualMode ?? null,
      inputBridgeOwnsVisiblePointer: afterDragState?.flowdocDraft?.inputBridgeOwnsVisiblePointer ?? null,
    }
  }
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
  await waitForDoubleAnimationFrame(page)
  const afterSelectAllState = await readTextEngineLayerState(page, layerSelector)
  const selectAll = {
    attempted: true,
    ok: Boolean(
      afterSelectAllState?.flowdocDraft?.clipboardOwned &&
      afterSelectAllState?.flowdocDraft?.selectionStart === 0 &&
      afterSelectAllState?.flowdocDraft?.selectionEnd === afterSelectAllState?.flowdocDraft?.textLength &&
      afterSelectAllState?.flowdocDraft?.selectionCollapsed === false &&
      (afterSelectAllState?.flowdocDraft?.selectionOverlayCount ?? 0) > 0 &&
      afterSelectAllState?.flowdocDraft?.inputBridgeOwnsVisiblePointer === false,
    ),
    selectionStart: afterSelectAllState?.flowdocDraft?.selectionStart ?? null,
    selectionEnd: afterSelectAllState?.flowdocDraft?.selectionEnd ?? null,
    textLength: afterSelectAllState?.flowdocDraft?.textLength ?? null,
    selectedTextLength: afterSelectAllState?.flowdocDraft?.selectedTextLength ?? null,
    selectionCollapsed: afterSelectAllState?.flowdocDraft?.selectionCollapsed ?? null,
    selectionOverlayCount: afterSelectAllState?.flowdocDraft?.selectionOverlayCount ?? null,
    clipboardOwned: afterSelectAllState?.flowdocDraft?.clipboardOwned ?? null,
    inputBridgeOwnsVisiblePointer: afterSelectAllState?.flowdocDraft?.inputBridgeOwnsVisiblePointer ?? null,
  }
  const readClipboardText = async () => page.evaluate(async () => {
    try {
      if (!navigator.clipboard?.readText) return { ok: false, text: "", error: "clipboard-read-unavailable" }
      return { ok: true, text: await navigator.clipboard.readText(), error: null }
    } catch (error) {
      return { ok: false, text: "", error: String(error?.message ?? error) }
    }
  })
  const readBridgeValue = async () => page.evaluate(() => {
    const bridge = document.querySelector('[data-wysiwyg-input-bridge="true"]')
    return bridge instanceof HTMLTextAreaElement || bridge instanceof HTMLInputElement
      ? bridge.value
      : ""
  })
  const readClipboardDebugState = async () => page.evaluate(() => {
    const bridge = document.querySelector('[data-wysiwyg-input-bridge="true"]')
    const active = document.activeElement
    return {
      activeTagName: active instanceof Element ? active.tagName : null,
      activeInputBridge: active instanceof Element ? active.getAttribute("data-wysiwyg-input-bridge") : null,
      bridgeValueLength: bridge instanceof HTMLTextAreaElement || bridge instanceof HTMLInputElement
        ? bridge.value.length
        : null,
      bridgeSelectionStart: bridge instanceof HTMLTextAreaElement || bridge instanceof HTMLInputElement
        ? bridge.selectionStart
        : null,
      bridgeSelectionEnd: bridge instanceof HTMLTextAreaElement || bridge instanceof HTMLInputElement
        ? bridge.selectionEnd
        : null,
      nativeSelectionLength: window.getSelection()?.toString().length ?? null,
    }
  })
  const modifierKey = process.platform === "darwin" ? "Meta" : "Control"
  const selectedAllText = selectAll.ok ? await readBridgeValue() : ""
  const expectedSelectedTextLength = afterSelectAllState?.flowdocDraft?.selectedTextLength ?? afterSelectAllState?.flowdocDraft?.textLength ?? 0
  const expectedRestoredTextLength = afterSelectAllState?.flowdocDraft?.textLength ?? 0
  let clipboard = {
    attempted: selectAll.ok,
    ok: false,
    copyOk: false,
    cutOk: false,
    pasteOk: false,
    readAvailable: false,
    copiedLength: null,
    expectedLength: expectedSelectedTextLength,
    expectedRestoredLength: expectedRestoredTextLength,
    bridgeValueLength: selectedAllText.length,
    afterCutLength: null,
    afterPasteLength: null,
    error: selectAll.ok ? null : "select-all-not-ready",
  }
  if (selectAll.ok) {
    const beforeCopyDebug = await readClipboardDebugState()
    await page.keyboard.press(`${modifierKey}+C`)
    await waitForDoubleAnimationFrame(page)
    await page.waitForTimeout(90)
    const afterCopyDebug = await readClipboardDebugState()
    const afterCopyClipboard = await readClipboardText()
    const copiedCanonicalLength = afterCopyClipboard.ok
      ? afterCopyClipboard.text.replace(/\r\n/g, "\n").length
      : null
    const copyMatches = afterCopyClipboard.ok && (
      afterCopyClipboard.text.length === expectedSelectedTextLength ||
      copiedCanonicalLength === expectedSelectedTextLength
    )
    await page.keyboard.press(`${modifierKey}+X`)
    await waitForDoubleAnimationFrame(page)
    const afterCutState = await readTextEngineLayerState(page, layerSelector)
    const afterCutLength = afterCutState?.flowdocDraft?.textLength ?? null
    const afterCutSelectionCollapsed = afterCutState?.flowdocDraft?.selectionCollapsed ?? null
    await page.keyboard.press(`${modifierKey}+V`)
    await waitForDoubleAnimationFrame(page)
    const afterPasteState = await readTextEngineLayerState(page, layerSelector)
    const afterPasteLength = afterPasteState?.flowdocDraft?.textLength ?? null
    clipboard = {
      attempted: true,
      ok: Boolean(
        copyMatches &&
        afterCutLength === 0 &&
        afterCutSelectionCollapsed !== false &&
        afterPasteLength === expectedRestoredTextLength &&
        afterPasteState?.flowdocDraft?.inputBridgeOwnsVisiblePointer === false,
      ),
      copyOk: copyMatches,
      cutOk: afterCutLength === 0 && afterCutSelectionCollapsed !== false,
      pasteOk: afterPasteLength === expectedRestoredTextLength,
      readAvailable: afterCopyClipboard.ok,
      copiedLength: afterCopyClipboard.ok ? afterCopyClipboard.text.length : null,
      copiedCanonicalLength,
      expectedLength: expectedSelectedTextLength,
      expectedRestoredLength: expectedRestoredTextLength,
      bridgeValueLength: selectedAllText.length,
      afterCutLength,
      afterPasteLength,
      inputBridgeOwnsVisiblePointerAfterPaste: afterPasteState?.flowdocDraft?.inputBridgeOwnsVisiblePointer ?? null,
      beforeCopyDebug,
      afterCopyDebug,
      error: afterCopyClipboard.ok ? null : afterCopyClipboard.error,
    }
  }
  const lineIndexForOffset = (state, offset) => {
    if (!state?.flowdocDraft?.lineRanges || typeof offset !== "number") return null
    const ranges = state.flowdocDraft.lineRanges
    const index = ranges.findIndex((range) => offset >= range.start && offset <= range.end)
    return index >= 0 ? index : null
  }
  await page.keyboard.press("End")
  await waitForDoubleAnimationFrame(page)
  const beforeVerticalState = await readTextEngineLayerState(page, layerSelector)
  const beforeVerticalOffset = beforeVerticalState?.flowdocDraft?.caretOffset ?? null
  const beforeVerticalLineIndex = lineIndexForOffset(beforeVerticalState, beforeVerticalOffset)
  await page.keyboard.press("ArrowUp")
  await waitForDoubleAnimationFrame(page)
  const afterArrowUpState = await readTextEngineLayerState(page, layerSelector)
  const afterArrowUpOffset = afterArrowUpState?.flowdocDraft?.caretOffset ?? null
  const afterArrowUpLineIndex = lineIndexForOffset(afterArrowUpState, afterArrowUpOffset)
  await page.keyboard.press("ArrowDown")
  await waitForDoubleAnimationFrame(page)
  const afterArrowDownState = await readTextEngineLayerState(page, layerSelector)
  const afterArrowDownOffset = afterArrowDownState?.flowdocDraft?.caretOffset ?? null
  const afterArrowDownLineIndex = lineIndexForOffset(afterArrowDownState, afterArrowDownOffset)
  const verticalNavigation = {
    attempted: true,
    ok: Boolean(
      beforeVerticalLineIndex != null &&
      afterArrowUpLineIndex != null &&
      afterArrowDownLineIndex != null &&
      afterArrowUpLineIndex < beforeVerticalLineIndex &&
      afterArrowDownLineIndex >= afterArrowUpLineIndex &&
      afterArrowDownLineIndex <= beforeVerticalLineIndex &&
      afterArrowUpState?.activeVisualMode === "flowdoc-draft-editor-island" &&
      afterArrowDownState?.activeVisualMode === "flowdoc-draft-editor-island",
    ),
    beforeOffset: beforeVerticalOffset,
    beforeLineIndex: beforeVerticalLineIndex,
    afterArrowUpOffset,
    afterArrowUpLineIndex,
    afterArrowDownOffset,
    afterArrowDownLineIndex,
    activeVisualModeAfterUp: afterArrowUpState?.activeVisualMode ?? null,
    activeVisualModeAfterDown: afterArrowDownState?.activeVisualMode ?? null,
  }

  return {
    attempted: true,
    ok: !target.bridgeOwnsPoint && caretWithinClickedLine && (!dragSelection.attempted || dragSelection.ok) && selectAll.ok && clipboard.ok && verticalNavigation.ok,
    target,
    afterCaretOffset,
    caretWithinClickedLine,
    activeVisualMode: afterState?.activeVisualMode ?? null,
    inputBridgeOwnsVisiblePointer: afterState?.flowdocDraft?.inputBridgeOwnsVisiblePointer ?? null,
    dragSelection,
    selectAll,
    clipboard,
    verticalNavigation,
  }
}

async function runTypingProbe(page) {
  const targetNodeId = await resolveTargetNodeId(page)
  const fragmentSelector = fragmentSelectorForNode(targetNodeId)
  const bridgeSelector = bridgeSelectorForNode(targetNodeId)
  const layerSelector = textEngineLayerSelectorForNode(targetNodeId)
  await page.locator(fragmentSelector).first().waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })

  // Click into target paragraph to enter the text-engine bridge.
  await page.locator(fragmentSelector).first().click()
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await applyNativeWrapVariant(page, NATIVE_WRAP_VARIANT)
  await prepareKeyInputProbe(page)
  const preTypingLayerState = CAPTURE_TYPING_LAYER_STATE
    ? await readTextEngineLayerState(page, layerSelector)
    : null
  const visibleTextLength = (state) => {
    if (state?.flowdocDraft?.active) return state.flowdocDraft.textLength
    if (state?.native?.active) return state.native.valueLength
    if (state?.replacement?.active) return state.replacement.textLength
    return 0
  }
  const visibleLineCount = (state) => {
    if (state?.flowdocDraft?.active) return state.flowdocDraft.lineCount
    if (state?.replacement?.active) return state.replacement.actualLineCount
    if (state?.native?.active && state.native.visibleTextEnabled !== false) return state.native.actualLineCount
    return null
  }
  const preTypingVisibleTextLength = visibleTextLength(preTypingLayerState)
  const preTypingVisibleLineCount = visibleLineCount(preTypingLayerState)

  // Reset perf events right before typing burst.
  await page.evaluate(() => { window.__flowDocWysiwygPerfEvents = [] })
  const startFragmentCount = await page.locator(fragmentSelector).count()
  const captureTypingLayerState = CAPTURE_TYPING_LAYER_STATE ||
    PROBE_MODE === "wrap-typing" ||
    PROBE_MODE === "enter"

  // Type burst with per-keystroke latency capture. Each keystroke records
  // (1) the time before press, (2) the time after the next animation frame
  // settles. The diff is a paint-budget proxy that includes React render +
  // FlowDoc draft preview + layout.
  const keystrokes = []
  const layerSamples = []
  let pointerHitTest = null
  let heldInput = null
  let previousVisibleLineCount = preTypingVisibleLineCount
  let hasCrossedWrapBoundary = false
  const screenshots = {
    beforeTyping: await captureProbeScreenshot(page, "before-typing"),
    firstWrapDuringBurst: null,
    afterBurst: null,
  }
  let firstVisibleTextMs = null
  let firstVisibleTextPhase = null
  if (NO_WAIT_BURST_PROBE_MODES.has(PROBE_MODE)) {
    const dispatchCheckpoints = []
    await startHeldInputSampler(page, layerSelector)
    for (let i = 0; i < TYPE_BURST_LENGTH; i += 1) {
      const beforeDispatch = await page.evaluate(() => performance.now())
      await dispatchKeyInputProbeStep(page, i)
      const afterDispatch = await page.evaluate(() => performance.now())
      dispatchCheckpoints.push({
        index: i,
        beforeDispatch,
        afterDispatch,
        dispatchMs: afterDispatch - beforeDispatch,
        expectedTextLength: preTypingVisibleTextLength + i + 1,
      })
      if (TYPE_INTERVAL_MS > 0) await page.waitForTimeout(TYPE_INTERVAL_MS)
    }
    await waitForDoubleAnimationFrame(page)
    const heldSamples = await stopHeldInputSampler(page)
    const heldInputSummary = summarizeHeldInputBurst({
      checkpoints: dispatchCheckpoints,
      samples: heldSamples,
      preTypingVisibleTextLength,
      preTypingVisibleLineCount,
    })
    keystrokes.push(...heldInputSummary.keystrokes)
    const firstVisible = heldInputSummary.keystrokes.find((key) => (
      typeof key.inputToVisibleDraftLinesMs === "number" &&
      Number.isFinite(key.inputToVisibleDraftLinesMs)
    ))
    const { keystrokes: _heldKeystrokes, ...heldInputReport } = heldInputSummary
    heldInput = heldInputReport
    if (firstVisible) {
      firstVisibleTextMs = firstVisible.inputToVisibleDraftLinesMs
      firstVisibleTextPhase = "held-rAF-sample"
    }
    const afterBurstState = captureTypingLayerState
      ? await readTextEngineLayerState(page, layerSelector)
      : null
    if (captureTypingLayerState) {
      layerSamples.push({
        index: TYPE_BURST_LENGTH - 1,
        afterPress: null,
        afterPaint: afterBurstState,
      })
    }
  } else {
    for (let i = 0; i < TYPE_BURST_LENGTH; i += 1) {
      let shouldRunPointerHitAfterSample = false
      const tBefore = await page.evaluate(() => performance.now())
      await dispatchKeyInputProbeStep(page, i)
      const afterPressState = captureTypingLayerState
        ? await readTextEngineLayerState(page, layerSelector)
        : null
      const tAfterPress = await page.evaluate(() => performance.now())
      const afterPressVisibleLineCount = visibleLineCount(afterPressState)
      const afterPressVisibleDraftLinesMs = afterPressState?.flowdocDraft?.active
        ? tAfterPress - tBefore
        : null
      let inputPhase = "same-line"
      if (
        previousVisibleLineCount != null &&
        afterPressVisibleLineCount != null &&
        afterPressVisibleLineCount > previousVisibleLineCount
      ) {
        inputPhase = "wrap-boundary"
        hasCrossedWrapBoundary = true
      } else if (hasCrossedWrapBoundary) {
        inputPhase = "after-wrap"
      }
      if (afterPressVisibleLineCount != null) {
        previousVisibleLineCount = afterPressVisibleLineCount
      }
      if (
        firstVisibleTextMs === null &&
        visibleTextLength(afterPressState) > preTypingVisibleTextLength
      ) {
        firstVisibleTextMs = tAfterPress - tBefore
        firstVisibleTextPhase = "afterPress"
      }
      if (
        screenshots.firstWrapDuringBurst == null &&
        preTypingVisibleLineCount != null &&
        visibleLineCount(afterPressState) != null &&
        visibleLineCount(afterPressState) > preTypingVisibleLineCount
      ) {
        screenshots.firstWrapDuringBurst = await captureProbeScreenshot(page, `first-wrap-after-press-${i}`)
        shouldRunPointerHitAfterSample = true
      }
      const paintLatency = await waitForDoubleAnimationFrame(page)
      const afterPaintState = captureTypingLayerState
        ? await readTextEngineLayerState(page, layerSelector)
        : null
      const tAfter = await page.evaluate(() => performance.now())
      if (
        firstVisibleTextMs === null &&
        visibleTextLength(afterPaintState) > preTypingVisibleTextLength
      ) {
        firstVisibleTextMs = tAfter - tBefore
        firstVisibleTextPhase = "afterPaint"
      }
      keystrokes.push({
        index: i,
        inputPhase,
        visibleLineCount: afterPressVisibleLineCount,
        inputToVisibleDraftLinesMs: afterPressVisibleDraftLinesMs,
        paintLatencyMs: paintLatency,
        totalMs: tAfter - tBefore,
      })
      if (captureTypingLayerState) {
        layerSamples.push({ index: i, afterPress: afterPressState, afterPaint: afterPaintState })
      }
      if (shouldRunPointerHitAfterSample && !pointerHitTest) {
        pointerHitTest = await runFlowdocDraftPointerHitProbe(page, layerSelector)
      }
      if (pointerHitTest?.attempted && !pointerHitTest.restoredCaretToEnd) {
        await page.keyboard.press("End")
        pointerHitTest.restoredCaretToEnd = true
      }
      await page.waitForTimeout(TYPE_INTERVAL_MS)
    }
  }
  screenshots.afterBurst = await captureProbeScreenshot(page, "after-burst")
  if (!pointerHitTest) {
    pointerHitTest = await runFlowdocDraftPointerHitProbe(page, layerSelector)
  }

  let editExit = null
  if (CAPTURE_EDIT_EXIT) {
    const beforeExit = await readFragmentVisualState(page, fragmentSelector, layerSelector)
    const exitStartedAt = await page.evaluate(() => performance.now())
    await page.keyboard.press("Escape")
    await waitForDoubleAnimationFrame(page)
    const afterExit = await readFragmentVisualState(page, fragmentSelector, layerSelector)
    let settled = true
    try {
      await page.waitForFunction(({ shellSelector, layerSelector }) => (
        !document.querySelector(layerSelector) &&
        document.querySelector(shellSelector)?.getAttribute("data-preview-layout-blocking") === "false"
      ), { shellSelector: editorShellSelector, layerSelector }, { timeout: READY_TIMEOUT_MS })
    } catch {
      settled = false
    }
    await waitForDoubleAnimationFrame(page)
    const settledAt = await page.evaluate(() => performance.now())
    const afterSettle = await readFragmentVisualState(page, fragmentSelector, layerSelector)
    editExit = {
      method: "Escape",
      settled,
      exitToSettledMs: settledAt - exitStartedAt,
      beforeExit,
      afterExit,
      afterSettle,
      staleWrongLayoutDetected: Boolean(
        settled &&
        afterExit &&
        afterSettle &&
        !afterExit.nativeActive &&
        afterExit.activeVisualMode === "measured-svg" &&
        afterSettle.activeVisualMode === "measured-svg" &&
        afterExit.measuredTextLineCount !== afterSettle.measuredTextLineCount
      ),
      staleMeasuredPreviewShownAfterBlur: Boolean(
        afterExit &&
        !afterExit.nativeActive &&
        afterExit.activeVisualMode === "measured-svg" &&
        afterSettle &&
        afterSettle.activeVisualMode === "measured-svg" &&
        afterExit.measuredTextLineCount !== afterSettle.measuredTextLineCount
      ),
      wrapParity: {
        activeNativeLineCount: beforeExit?.nativeLineCount ?? null,
        activeFlowdocDraftLineCount: beforeExit?.flowdocDraftLineCount ?? null,
        afterExitMeasuredLineCount: afterExit?.measuredTextLineCount ?? null,
        afterSettleMeasuredLineCount: afterSettle?.measuredTextLineCount ?? null,
        nativeToSettledLineDelta: beforeExit?.nativeLineCount != null && afterSettle?.measuredTextLineCount != null
          ? afterSettle.measuredTextLineCount - beforeExit.nativeLineCount
          : null,
        flowdocDraftToSettledLineDelta: beforeExit?.flowdocDraftLineCount != null && afterSettle?.measuredTextLineCount != null
          ? afterSettle.measuredTextLineCount - beforeExit.flowdocDraftLineCount
          : null,
        activeFlowdocLineSignatures: beforeExit?.flowdocDraftLineSignatures ?? [],
        afterSettleMeasuredLineSignatures: afterSettle?.measuredLineSignatures ?? [],
      },
    }
  }

  const endFragmentCount = await page.locator(fragmentSelector).count()
  const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const perfSummary = summarizePerfEvents(perfEvents)
  if (perfSummary.heightPreview) {
    perfSummary.heightPreview.dispatchesPer100Keys = TYPE_BURST_LENGTH > 0
      ? (perfSummary.heightPreview.dispatchCount / TYPE_BURST_LENGTH) * 100
      : null
    perfSummary.heightPreview.setInlineEditHeightPer100Keys = TYPE_BURST_LENGTH > 0
      ? (perfSummary.heightPreview.setInlineEditHeightCount / TYPE_BURST_LENGTH) * 100
      : null
  }
  const typingLayerSummary = summarizeTypingLayerSamples(layerSamples)
  const activeReflowHandoff = {
    boundaryHeightHandoffDetected: (perfSummary.heightPreview?.boundaryHandoffCount ?? 0) > 0,
    boundaryHeightHandoffCount: perfSummary.heightPreview?.boundaryHandoffCount ?? 0,
    setInlineEditHeightCount: perfSummary.heightPreview?.setInlineEditHeightCount ?? 0,
    setInlineEditHeightPer100Keys: perfSummary.heightPreview?.setInlineEditHeightPer100Keys ?? null,
    editorCanvasCommitCount: perfSummary.editorCanvasCommit?.count ?? 0,
    editorCanvasCommitMaxMs: perfSummary.editorCanvasCommit?.maxMs ?? null,
    pageBoundaryPreviewDetected: typingLayerSummary?.flowdocPageBoundaryPreviewDetected ?? false,
    hardBoundaryReflowDetected: typingLayerSummary?.flowdocHardBoundaryReflowDetected ?? false,
    pageBreakOverlapDetected: typingLayerSummary?.flowdocPageBreakOverlapDetected ?? false,
    pageBreakOverlapCount: typingLayerSummary?.flowdocPageBreakOverlapCount ?? 0,
  }

  const paintLatencies = keystrokes.map((k) => k.paintLatencyMs).sort((a, b) => a - b)
  const totalLatencies = keystrokes.map((k) => k.totalMs).sort((a, b) => a - b)
  return {
    targetNodeId,
    action: {
      mode: PROBE_MODE,
      burstLength: TYPE_BURST_LENGTH,
      intervalMs: TYPE_INTERVAL_MS,
      textPattern: TYPE_TEXT_SEQUENCE.length ? TYPE_TEXT_SEQUENCE.join("") : null,
      nativeWrapVariant: NATIVE_WRAP_VARIANT,
    },
    paintLatencyMs: {
      p50: percentile(paintLatencies, 0.5),
      p95: percentile(paintLatencies, 0.95),
      p99: percentile(paintLatencies, 0.99),
      max: paintLatencies[paintLatencies.length - 1] ?? null,
    },
    keystrokeTotalMs: {
      p50: percentile(totalLatencies, 0.5),
      p95: percentile(totalLatencies, 0.95),
      p99: percentile(totalLatencies, 0.99),
      max: totalLatencies[totalLatencies.length - 1] ?? null,
    },
    firstVisibleText: {
      ms: firstVisibleTextMs,
      phase: firstVisibleTextPhase,
    },
    typingInputPhases: summarizeTypingInputPhases(keystrokes),
    heldInput,
    activeReflowHandoff,
    perfEvents: perfSummary,
    typingLayer: typingLayerSummary,
    pointerHitTest,
    screenshots,
    editExit,
    pageBoundary: {
      startFragmentCount,
      endFragmentCount,
      crossed: endFragmentCount > startFragmentCount,
    },
  }
}

async function runResizeProbe(page) {
  const handle = page.locator(resizeHandleSelector).first()
  await handle.waitFor({ state: "attached", timeout: 15000 })
  const handleCount = await page.locator(resizeHandleSelector).count()
  const box = await handle.boundingBox()
  assert(box, "Could not resolve resize handle bounding box")

  await page.evaluate(() => { window.__flowDocWysiwygPerfEvents = [] })
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  const moves = []
  let previewVisibleCount = 0
  for (let i = 1; i <= RESIZE_MOVE_COUNT; i += 1) {
    const progress = i / RESIZE_MOVE_COUNT
    const x = startX + RESIZE_MOVE_DISTANCE_PX * Math.sin(progress * Math.PI)
    const tBefore = await page.evaluate(() => performance.now())
    await page.mouse.move(x, startY, { steps: 1 })
    const tAfterDispatch = await page.evaluate(() => performance.now())
    const paintLatency = await waitForDoubleAnimationFrame(page)
    const tAfter = await page.evaluate(() => performance.now())
    const previewVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="column-resize-preview"]')
      if (!(el instanceof HTMLElement)) return false
      return getComputedStyle(el).display !== "none"
    })
    if (previewVisible) previewVisibleCount += 1
    moves.push({
      index: i,
      dispatchMs: tAfterDispatch - tBefore,
      paintLatencyMs: paintLatency,
      totalMs: tAfter - tBefore,
    })
  }

  await page.mouse.up()
  const previewVisibleAfterUp = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="column-resize-preview"]')
    if (!(el instanceof HTMLElement)) return false
    return getComputedStyle(el).display !== "none"
  })
  const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])

  const paintLatencies = moves.map((move) => move.paintLatencyMs).sort((a, b) => a - b)
  const dispatchLatencies = moves.map((move) => move.dispatchMs).sort((a, b) => a - b)
  const totalLatencies = moves.map((move) => move.totalMs).sort((a, b) => a - b)
  return {
    targetNodeId: null,
    action: {
      mode: "resize",
      handleCount,
      moveCount: RESIZE_MOVE_COUNT,
      distancePx: RESIZE_MOVE_DISTANCE_PX,
      previewVisibleCount,
      previewVisibleAfterUp,
    },
    paintLatencyMs: {
      p50: percentile(paintLatencies, 0.5),
      p95: percentile(paintLatencies, 0.95),
      p99: percentile(paintLatencies, 0.99),
      max: paintLatencies[paintLatencies.length - 1] ?? null,
    },
    pointerMoveDispatchMs: {
      p50: percentile(dispatchLatencies, 0.5),
      p95: percentile(dispatchLatencies, 0.95),
      p99: percentile(dispatchLatencies, 0.99),
      max: dispatchLatencies[dispatchLatencies.length - 1] ?? null,
    },
    pointerMoveTotalMs: {
      p50: percentile(totalLatencies, 0.5),
      p95: percentile(totalLatencies, 0.95),
      p99: percentile(totalLatencies, 0.99),
      max: totalLatencies[totalLatencies.length - 1] ?? null,
    },
    perfEvents: summarizePerfEvents(perfEvents),
    pageBoundary: null,
  }
}

async function runSelectionProbe(page) {
  const targetNodeId = await resolveTargetNodeId(page)
  const fragmentSelector = fragmentSelectorForNode(targetNodeId)
  const bridgeSelector = bridgeSelectorForNode(targetNodeId)
  const layerSelector = textEngineLayerSelectorForNode(targetNodeId)
  const fragment = page.locator(fragmentSelector).first()
  await fragment.waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })

  await fragment.click()
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  const layer = page.locator(layerSelector).first()
  await layer.waitFor({ state: "attached", timeout: 10000 })
  const box = await layer.boundingBox() ?? await fragment.boundingBox()
  assert(box, "Could not resolve text-engine layer bounding box")

  await page.evaluate(() => { window.__flowDocWysiwygPerfEvents = [] })
  const inset = Math.max(8, Math.min(24, box.width * 0.12))
  const startX = box.x + inset
  const endX = box.x + Math.max(inset + 4, box.width - inset)
  const y = box.y + Math.max(6, Math.min(box.height - 4, box.height * 0.5))
  await page.mouse.move(startX, y)
  await page.mouse.down()

  const moves = []
  let overlayVisibleCount = 0
  for (let i = 1; i <= SELECTION_MOVE_COUNT; i += 1) {
    const progress = i / SELECTION_MOVE_COUNT
    const x = startX + (endX - startX) * progress
    const tBefore = await page.evaluate(() => performance.now())
    await page.mouse.move(x, y, { steps: 1 })
    const tAfterDispatch = await page.evaluate(() => performance.now())
    const paintLatency = await waitForDoubleAnimationFrame(page)
    const tAfter = await page.evaluate(() => performance.now())
    const overlayCount = await page.locator('[data-wysiwyg-selection="true"]').count()
    if (overlayCount > 0) overlayVisibleCount += 1
    moves.push({
      index: i,
      dispatchMs: tAfterDispatch - tBefore,
      paintLatencyMs: paintLatency,
      totalMs: tAfter - tBefore,
      overlayCount,
    })
  }

  await page.mouse.up()
  const releaseSamples = await captureSelectionReleaseSamples(page)
  const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])

  const paintLatencies = moves.map((move) => move.paintLatencyMs).sort((a, b) => a - b)
  const dispatchLatencies = moves.map((move) => move.dispatchMs).sort((a, b) => a - b)
  const totalLatencies = moves.map((move) => move.totalMs).sort((a, b) => a - b)
  return {
    targetNodeId,
    action: {
      mode: "selection",
      moveCount: SELECTION_MOVE_COUNT,
      overlayVisibleCount,
      releaseSamples,
      releaseMissingOverlayCount: releaseSamples.filter((sample) => sample.overlayCount === 0).length,
    },
    paintLatencyMs: {
      p50: percentile(paintLatencies, 0.5),
      p95: percentile(paintLatencies, 0.95),
      p99: percentile(paintLatencies, 0.99),
      max: paintLatencies[paintLatencies.length - 1] ?? null,
    },
    pointerMoveDispatchMs: {
      p50: percentile(dispatchLatencies, 0.5),
      p95: percentile(dispatchLatencies, 0.95),
      p99: percentile(dispatchLatencies, 0.99),
      max: dispatchLatencies[dispatchLatencies.length - 1] ?? null,
    },
    pointerMoveTotalMs: {
      p50: percentile(totalLatencies, 0.5),
      p95: percentile(totalLatencies, 0.95),
      p99: percentile(totalLatencies, 0.99),
      max: totalLatencies[totalLatencies.length - 1] ?? null,
    },
    perfEvents: summarizePerfEvents(perfEvents),
    pageBoundary: null,
  }
}

async function runProbe() {
  const server = shouldStartServer ? startNextDevServer() : null
  if (server) await waitForServer(baseEditorUrl, server)
  const probeDocument = readProbeFlowDocFile()
  const inlineProbeDocument = shouldUseMixedPaginationDocument
    ? JSON.stringify(makeMixedPaginationProbeDocument())
    : null

  const browser = await launchSmokeBrowser(smokeBrowser)
  let context = null
  const consoleErrors = []
  const pageErrors = []
  try {
    context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    })
    const page = await context.newPage()
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()) })
    page.on("pageerror", (e) => pageErrors.push(e.message))
    if (probeDocument) {
      await page.addInitScript((rawDocument) => {
        window.localStorage.setItem("flowdoc_document", rawDocument)
      }, probeDocument.raw)
    } else if (inlineProbeDocument) {
      await page.addInitScript((rawDocument) => {
        window.localStorage.setItem("flowdoc_document", rawDocument)
      }, inlineProbeDocument)
    }

    await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS })
    await prepareProbeViewport(page)
    const probeResult = PROBE_MODE === "resize"
      ? await runResizeProbe(page)
      : PROBE_MODE === "selection"
        ? await runSelectionProbe(page)
        : KEY_INPUT_PROBE_MODES.has(PROBE_MODE)
          ? await runTypingProbe(page)
          : (() => { throw new Error(`Unsupported PROBE_MODE: ${PROBE_MODE}`) })()

    const typingLayerOk = !probeResult.typingLayer ||
      (
        !probeResult.typingLayer.singleLineCollapseDetected &&
        !probeResult.typingLayer.majorLineBreakDriftDetected &&
        !probeResult.typingLayer.replacementOutOfWidthDetected &&
        !probeResult.typingLayer.nativeOutOfWidthDetected &&
        !probeResult.typingLayer.svgReplacementDetected &&
        !probeResult.typingLayer.liveEchoDetected &&
        !probeResult.typingLayer.liveCaretDetected &&
        !probeResult.typingLayer.oldVisualLineOverlapDetected &&
        !probeResult.typingLayer.visualModeOscillationDetected &&
        !probeResult.typingLayer.flowdocNativeTextVisibleDetected &&
        !probeResult.typingLayer.flowdocCustomCaretMissingDetected &&
        !probeResult.typingLayer.flowdocInputBridgePointerTargetDetected &&
        !probeResult.typingLayer.flowdocPageBreakOverlapDetected &&
        probeResult.typingLayer.activeVisualModeStable !== false &&
        probeResult.typingLayer.nativeVisualModeStable &&
        probeResult.typingLayer.duringBurstNativeGeometryOk !== false
      )
    const editExitOk = !probeResult.editExit ||
      (probeResult.editExit.settled && !probeResult.editExit.staleWrongLayoutDetected)
    const structuralEnterHandled = PROBE_MODE === "enter" &&
      (probeResult.perfEvents?.flowdocIsland?.structuralEdit?.splitParagraphCount ?? 0) > 0
    const pointerHitTestOk = !probeResult.pointerHitTest || probeResult.pointerHitTest.ok || structuralEnterHandled
    const report = {
      ok: consoleErrors.length === 0 && pageErrors.length === 0 && typingLayerOk && editExitOk && pointerHitTestOk,
      probe: {
        mode: PROBE_MODE,
        nativeWrapVariant: NATIVE_WRAP_VARIANT,
        ...probeResult.action,
        targetNodeId: probeResult.targetNodeId,
        flowDocFile: probeDocument?.path ?? (inlineProbeDocument ? "inline:mixed-pagination" : null),
        readyTimeoutMs: READY_TIMEOUT_MS,
        targetPageIndex: TARGET_PAGE_INDEX,
      },
      paintLatencyMs: probeResult.paintLatencyMs,
      ...(probeResult.keystrokeTotalMs ? { keystrokeTotalMs: probeResult.keystrokeTotalMs } : {}),
      ...(probeResult.firstVisibleText ? { firstVisibleText: probeResult.firstVisibleText } : {}),
      ...(probeResult.screenshots ? { screenshots: probeResult.screenshots } : {}),
      ...(probeResult.pointerHitTest ? { pointerHitTest: probeResult.pointerHitTest } : {}),
      ...(probeResult.typingInputPhases ? { typingInputPhases: probeResult.typingInputPhases } : {}),
      ...(probeResult.heldInput ? { heldInput: probeResult.heldInput } : {}),
      ...(probeResult.activeReflowHandoff ? { activeReflowHandoff: probeResult.activeReflowHandoff } : {}),
      ...(probeResult.pointerMoveDispatchMs ? { pointerMoveDispatchMs: probeResult.pointerMoveDispatchMs } : {}),
      ...(probeResult.pointerMoveTotalMs ? { pointerMoveTotalMs: probeResult.pointerMoveTotalMs } : {}),
      ...(probeResult.typingLayer ? { typingLayer: probeResult.typingLayer } : {}),
      ...(probeResult.editExit ? { editExit: probeResult.editExit } : {}),
      perfEvents: probeResult.perfEvents,
      pageBoundary: probeResult.pageBoundary,
      console: {
        errors: consoleErrors.length,
        pageErrors: pageErrors.length,
      },
    }

    process.stdout.write(JSON.stringify(report, null, 2) + "\n")
    if (!report.ok) process.exitCode = 1
  } finally {
    if (context) await context.close().catch(() => {})
    await browser.close()
    if (server) await stopServer(server)
  }
}

runProbe().catch((err) => {
  console.error("[smoothness-probe] failed:", err.message)
  process.exitCode = 1
})
