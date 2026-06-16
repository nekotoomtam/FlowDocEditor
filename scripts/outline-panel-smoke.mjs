import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const DEFAULT_SMOKE_PORT = 4023
const DEFAULT_FLOWDOC_FILE = "public/mock/flowdoc-stress-mock.flowdoc.json"
const ACTIVE_EDIT_NODE_ID = process.env.OUTLINE_ACTIVE_EDIT_NODE_ID?.trim() || "cover_title"
const ACTIVE_EDIT_MARKER = process.env.OUTLINE_ACTIVE_EDIT_MARKER?.trim() || "OUTLINE_REORDER_ACTIVE_DRAFT_MARKER"
const ACTIVE_EDIT_TEXT = ` ${ACTIVE_EDIT_MARKER} ข้อความก่อนลาก Outline`
const SOURCE_NODE_ID = process.env.OUTLINE_REORDER_SOURCE_NODE_ID?.trim() || "cover_project"
const TARGET_NODE_ID = process.env.OUTLINE_REORDER_TARGET_NODE_ID?.trim() || "cover_note"
const REORDER_POSITION = process.env.OUTLINE_REORDER_POSITION?.trim() || "after"
const EXPECT_REORDER_NOOP = process.env.OUTLINE_REORDER_EXPECT_NOOP === "1"
const EXPECTED_DROP_BLOCKED_REASON = process.env.OUTLINE_REORDER_EXPECT_BLOCKED_REASON?.trim() || "invalid-list-hierarchy"
const EXPECTED_SUBTREE_CHILD_COUNT_RAW = process.env.OUTLINE_REORDER_EXPECT_SUBTREE_CHILD_COUNT ?? "0"
const EXPECTED_SUBTREE_CHILD_COUNT = Number(EXPECTED_SUBTREE_CHILD_COUNT_RAW)
const VALID_REORDER_POSITIONS = new Set(["before", "after"])

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const flowDocFile = path.resolve(repoRoot, process.env.FLOWDOC_PROBE_FILE ?? DEFAULT_FLOWDOC_FILE)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(VALID_REORDER_POSITIONS.has(REORDER_POSITION), `OUTLINE_REORDER_POSITION must be before or after, got ${REORDER_POSITION}`)
assert(
  Number.isInteger(EXPECTED_SUBTREE_CHILD_COUNT) && EXPECTED_SUBTREE_CHILD_COUNT >= 0,
  `OUTLINE_REORDER_EXPECT_SUBTREE_CHILD_COUNT must be an integer >= 0, got ${EXPECTED_SUBTREE_CHILD_COUNT_RAW}`,
)

function cssAttrValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocWysiwygPerfTrace", "1")
  return url.toString()
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
        NEXT_PUBLIC_FLOWDOC_WYSIWYG_RICH_TEXT_DRAFT: "1",
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

async function waitForServer(url, server, timeoutMs = 90000) {
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

function isIgnoredResourceUrl(url) {
  try {
    return new URL(url).pathname === "/favicon.ico"
  } catch {
    return false
  }
}

function unexpectedResourceErrors(resourceErrors) {
  return resourceErrors.filter((error) => !(error.status === 404 && isIgnoredResourceUrl(error.url)))
}

function formatConsoleError(error) {
  return [
    error.text,
    error.location?.url ? `at ${error.location.url}:${error.location.lineNumber}:${error.location.columnNumber}` : null,
  ].filter(Boolean).join(" ")
}

function rowSelector(nodeId) {
  return `[data-outline-node-id="${cssAttrValue(nodeId)}"]`
}

function editorFragmentSelector(nodeId) {
  return `[data-testid="editor-fragment"][data-node-id="${cssAttrValue(nodeId)}"]`
}

function bridgeSelector(nodeId) {
  return `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${cssAttrValue(nodeId)}"]`
}

function listSignature(list) {
  return list
    ? {
        instanceId: list.instanceId,
        level: list.level,
        itemId: list.itemId,
        startAt: list.startAt ?? null,
      }
    : null
}

async function readStoredBodyOrder(page) {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey)
    if (!raw) throw new Error("missing stored FlowDoc document")
    const parsed = JSON.parse(raw)
    const doc = parsed.document?.sections ? parsed : parsed.document
    const section = doc.document.sections[0]
    const body = section.nodes[section.bodyRootId]
    if (body?.type !== "body") throw new Error("stored first section body is not a body node")
    return {
      packageVersion: parsed.packageVersion ?? null,
      sectionId: section.id,
      bodyId: section.bodyRootId,
      childIds: body.childIds,
      listByNodeId: Object.fromEntries(body.childIds.map((nodeId) => {
        const node = section.nodes[nodeId]
        return [nodeId, node?.type === "paragraph" ? (node.props.list ?? null) : null]
      })),
    }
  }, STORAGE_KEY)
}

async function readStoredParagraphSnapshot(page, nodeId) {
  return page.evaluate(({ storageKey, nodeId }) => {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const doc = parsed?.packageVersion === 2 && parsed.document?.document?.sections
      ? parsed.document
      : parsed?.kind === "document" && parsed.document?.document?.sections
        ? parsed.document
        : parsed.document?.sections
          ? parsed
          : parsed.document
    for (const section of doc?.document?.sections ?? []) {
      const paragraph = section.nodes?.[nodeId]
      if (paragraph?.type !== "paragraph") continue
      return {
        text: paragraph.children.map((child) => child.text ?? "").join(""),
        list: paragraph.props?.list
          ? {
              instanceId: paragraph.props.list.instanceId,
              level: paragraph.props.list.level,
              itemId: paragraph.props.list.itemId,
              startAt: paragraph.props.list.startAt ?? null,
            }
          : null,
      }
    }
    return null
  }, { storageKey: STORAGE_KEY, nodeId })
}

async function readStoredParagraphText(page, nodeId) {
  const snapshot = await readStoredParagraphSnapshot(page, nodeId)
  return snapshot?.text ?? null
}

async function waitForStoredParagraphText(page, nodeId, expectedText, label) {
  try {
    await page.waitForFunction(
      ({ storageKey, nodeId, expectedText }) => {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed?.packageVersion === 2 && parsed.document?.document?.sections
          ? parsed.document
          : parsed?.kind === "document" && parsed.document?.document?.sections
            ? parsed.document
            : parsed.document?.sections
              ? parsed
              : parsed.document
        for (const section of doc?.document?.sections ?? []) {
          const paragraph = section.nodes?.[nodeId]
          if (paragraph?.type !== "paragraph") continue
          const text = paragraph.children.map((child) => child.text ?? "").join("")
          return text.includes(expectedText)
        }
        return false
      },
      { storageKey: STORAGE_KEY, nodeId, expectedText },
      { timeout: 10000 },
    )
  } catch (error) {
    const currentText = await readStoredParagraphText(page, nodeId)
    throw new Error(`${label} did not match. Last stored text: ${JSON.stringify(currentText)}`, {
      cause: error,
    })
  }
  return readStoredParagraphText(page, nodeId)
}

async function waitForStoredParagraphSnapshot(page, nodeId, expectedSnapshot, label) {
  try {
    await page.waitForFunction(
      ({ storageKey, nodeId, expected }) => {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed?.packageVersion === 2 && parsed.document?.document?.sections
          ? parsed.document
          : parsed?.kind === "document" && parsed.document?.document?.sections
            ? parsed.document
            : parsed.document?.sections
              ? parsed
              : parsed.document
        for (const section of doc?.document?.sections ?? []) {
          const paragraph = section.nodes?.[nodeId]
          if (paragraph?.type !== "paragraph") continue
          const text = paragraph.children.map((child) => child.text ?? "").join("")
          const list = paragraph.props?.list
            ? {
                instanceId: paragraph.props.list.instanceId,
                level: paragraph.props.list.level,
                itemId: paragraph.props.list.itemId,
                startAt: paragraph.props.list.startAt ?? null,
              }
            : null
          return text === expected.text && JSON.stringify(list) === JSON.stringify(expected.list)
        }
        return false
      },
      { storageKey: STORAGE_KEY, nodeId, expected: expectedSnapshot },
      { timeout: 10000 },
    )
  } catch (error) {
    const currentSnapshot = await readStoredParagraphSnapshot(page, nodeId)
    throw new Error(`${label} did not match. Last stored snapshot: ${JSON.stringify(currentSnapshot)}`, {
      cause: error,
    })
  }
  return readStoredParagraphSnapshot(page, nodeId)
}

async function readOutlineVirtualizationState(page) {
  return page.evaluate(() => {
    const body = document.querySelector("[data-outline-windowed='true'], [data-outline-row-count]")
    const events = window.__flowDocWysiwygPerfEvents ?? []
    const outlineCommits = events.filter((event) => event.kind === "outline-panel-react-commit")
    const virtualCommits = outlineCommits.filter((event) => event.outlineVirtualized === true)
    const longestVirtualCommit = virtualCommits.reduce((longest, event) => (
      !longest || (event.durationMs ?? 0) > (longest.durationMs ?? 0) ? event : longest
    ), null)
    return {
      domVirtualized: body?.getAttribute("data-outline-windowed") === "true",
      domRowCount: Number(body?.getAttribute("data-outline-row-count") ?? 0),
      domRenderedRowCount: Number(body?.getAttribute("data-outline-rendered-row-count") ?? 0),
      commitCount: outlineCommits.length,
      virtualCommitCount: virtualCommits.length,
      longestVirtualCommit: longestVirtualCommit
        ? {
            durationMs: Math.round((longestVirtualCommit.durationMs ?? 0) * 10) / 10,
            flatRowCount: longestVirtualCommit.outlineFlatRowCount ?? null,
            renderedRowCount: longestVirtualCommit.outlineRenderedRowCount ?? null,
            baseDurationMs: Math.round((longestVirtualCommit.baseDurationMs ?? 0) * 10) / 10,
          }
        : null,
    }
  })
}

async function waitForOutlineReady(page) {
  await page.waitForFunction(() => {
    const railPane = document.querySelector("[data-initial-outline-deferred]")
    return railPane?.getAttribute("data-initial-outline-deferred") === "false"
  }, null, { timeout: 120000 })
}

async function waitForOutlineVirtualized(page) {
  await waitForOutlineReady(page)
  await page.locator("[data-outline-windowed='true']").waitFor({ state: "attached", timeout: 30000 })
}

async function waitForDoubleAnimationFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

async function findParagraphClickTarget(page, nodeId) {
  const fragment = page.locator(editorFragmentSelector(nodeId)).first()
  try {
    await fragment.waitFor({ state: "attached", timeout: 2000 })
  } catch {
    const outlineRow = page.locator(rowSelector(nodeId)).first()
    await outlineRow.waitFor({ state: "attached", timeout: 30000 })
    await outlineRow.scrollIntoViewIfNeeded()
    await outlineRow.click()
    await waitForDoubleAnimationFrame(page)
    await fragment.waitFor({ state: "attached", timeout: 60000 })
  }
  await page.locator(editorFragmentSelector(nodeId)).first().scrollIntoViewIfNeeded()
  await waitForDoubleAnimationFrame(page)
  return page.evaluate((nodeId) => {
    const fragment = document.querySelector(`[data-testid="editor-fragment"][data-node-id="${CSS.escape(nodeId)}"]`)
    if (!(fragment instanceof SVGElement)) {
      throw new Error(`missing editor fragment for ${nodeId}`)
    }
    const textCandidate = Array.from(fragment.querySelectorAll("text"))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          text: element.textContent?.trim() ?? "",
          x: rect.left + Math.min(Math.max(rect.width / 2, 4), Math.max(rect.width - 2, 4)),
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      })
      .find((candidate) => candidate.text.length > 0 && candidate.width > 8 && candidate.height > 4)
    if (textCandidate) return textCandidate

    const rect = fragment.getBoundingClientRect()
    return {
      text: "",
      x: rect.left + Math.min(Math.max(rect.width / 2, 8), Math.max(rect.width - 4, 8)),
      y: rect.top + Math.min(Math.max(rect.height / 2, 4), Math.max(rect.height - 2, 4)),
      width: rect.width,
      height: rect.height,
    }
  }, nodeId)
}

async function startActiveDraftBeforeOutlineReorder(page) {
  const beforeSnapshot = await readStoredParagraphSnapshot(page, ACTIVE_EDIT_NODE_ID)
  assert(beforeSnapshot !== null, `active edit paragraph ${ACTIVE_EDIT_NODE_ID} was not found in storage`)
  assert(!beforeSnapshot.text.includes(ACTIVE_EDIT_MARKER), `active edit marker already exists in ${ACTIVE_EDIT_NODE_ID}`)

  const target = await findParagraphClickTarget(page, ACTIVE_EDIT_NODE_ID)
  await page.mouse.dblclick(target.x, target.y)
  const bridge = page.locator(bridgeSelector(ACTIVE_EDIT_NODE_ID))
  await bridge.waitFor({ state: "attached", timeout: 10000 })
  await bridge.focus()
  await page.keyboard.press("End")
  await page.keyboard.insertText(ACTIVE_EDIT_TEXT)
  await page.waitForFunction(
    ({ nodeId, marker }) => {
      const bridge = document.querySelector(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`)
      const bridgeValue = bridge instanceof HTMLTextAreaElement || bridge instanceof HTMLInputElement
        ? bridge.value
        : bridge?.textContent ?? ""
      const islandText = Array.from(document.querySelectorAll(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`))
        .map((element) => element.textContent ?? "")
        .join("\n")
      return bridgeValue.includes(marker) || islandText.includes(marker)
    },
    { nodeId: ACTIVE_EDIT_NODE_ID, marker: ACTIVE_EDIT_MARKER },
    { timeout: 10000 },
  )

  return {
    nodeId: ACTIVE_EDIT_NODE_ID,
    beforeText: beforeSnapshot.text,
    beforeList: listSignature(beforeSnapshot.list),
    expectedSnapshot: {
      text: `${beforeSnapshot.text}${ACTIVE_EDIT_TEXT}`,
      list: listSignature(beforeSnapshot.list),
    },
    insertedText: ACTIVE_EDIT_TEXT,
    clickTargetText: target.text,
  }
}

async function readOutlineActionCounts(page) {
  return page.evaluate(() => {
    const events = window.__flowDocWysiwygPerfEvents ?? []
    const editorActions = events.filter((event) => event.kind === "editor-action-dispatch")
    return {
      reorder: editorActions.filter((event) => event.commandType === "REORDER_BODY_CHILD" || event.command === "REORDER_BODY_CHILD").length,
      commitText: editorActions.filter((event) => event.commandType === "COMMIT_WYSIWYG_TEXT_EDIT" || event.command === "COMMIT_WYSIWYG_TEXT_EDIT").length,
      commitRichText: editorActions.filter((event) => event.commandType === "COMMIT_WYSIWYG_RICH_TEXT_EDIT" || event.command === "COMMIT_WYSIWYG_RICH_TEXT_EDIT").length,
      inlineFinalize: events.filter((event) => event.kind === "inline-edit-finalize").length,
    }
  })
}

async function dispatchDragEvent(page, { type, rowNodeId, grip, position }) {
  await page.evaluate((input) => {
    const row = document.querySelector(`[data-outline-node-id="${CSS.escape(input.rowNodeId)}"]`)
    if (!(row instanceof HTMLElement)) throw new Error(`missing outline row ${input.rowNodeId}`)
    const target = input.grip
      ? row.querySelector("[data-testid='outline-row-grip']")
      : row
    if (!(target instanceof HTMLElement)) throw new Error(`missing drag event target for ${input.rowNodeId}`)

    window.__flowDocOutlineSmokeDragTransfer ??= new DataTransfer()

    const rect = row.getBoundingClientRect()
    const y = input.position === "before"
      ? rect.top + Math.max(2, rect.height * 0.25)
      : input.position === "after"
        ? rect.bottom - Math.max(2, rect.height * 0.25)
        : rect.top + rect.height / 2
    const event = new DragEvent(input.type, {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + Math.min(Math.max(rect.width / 2, 8), Math.max(8, rect.width - 8)),
      clientY: y,
      dataTransfer: window.__flowDocOutlineSmokeDragTransfer,
    })
    target.dispatchEvent(event)
  }, { type, rowNodeId, grip, position })
}

async function dragOutlineRow(page, sourceNodeId, targetNodeId, position) {
  await dispatchDragEvent(page, { type: "dragstart", rowNodeId: sourceNodeId, grip: true })
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute("data-outline-drag-source") === "true",
    rowSelector(sourceNodeId),
    { timeout: 5000 },
  )
  const ghost = page.getByTestId("outline-drag-ghost")
  await ghost.waitFor({ state: "attached", timeout: 5000 })
  const ghostSubtreeCountAttr = await ghost.getAttribute("data-outline-drag-subtree-count")
  const ghostSubtreeChildCount = ghostSubtreeCountAttr == null ? 0 : Number(ghostSubtreeCountAttr)
  assert(
    Number.isInteger(ghostSubtreeChildCount) && ghostSubtreeChildCount >= 0,
    `outline drag ghost exposed invalid subtree count ${ghostSubtreeCountAttr}`,
  )
  assert(
    ghostSubtreeChildCount === EXPECTED_SUBTREE_CHILD_COUNT,
    `expected outline drag ghost subtree count ${EXPECTED_SUBTREE_CHILD_COUNT}, got ${ghostSubtreeChildCount}`,
  )

  await dispatchDragEvent(page, { type: "dragover", rowNodeId: targetNodeId, position })
  await page.waitForFunction(
    ({ selector, expectedPosition }) => {
      const row = document.querySelector(selector)
      return row?.getAttribute("data-outline-drop-target") === "true" &&
        row.getAttribute("data-outline-drop-position") === expectedPosition
    },
    { selector: rowSelector(targetNodeId), expectedPosition: position },
    { timeout: 5000 },
  )
  const dropBlockedReason = await page.locator(rowSelector(targetNodeId)).getAttribute("data-outline-drop-blocked")
  if (EXPECT_REORDER_NOOP) {
    assert(
      dropBlockedReason === EXPECTED_DROP_BLOCKED_REASON,
      `expected invalid list drop to expose blocked reason, got ${dropBlockedReason}`,
    )
  } else {
    assert(dropBlockedReason == null, `expected valid outline drop to remain unblocked, got ${dropBlockedReason}`)
  }

  await dispatchDragEvent(page, { type: "drop", rowNodeId: targetNodeId, position })
  await page.evaluate(() => {
    window.__flowDocOutlineSmokeDragTransfer = null
  })
  return { dropBlockedReason, ghostSubtreeChildCount }
}

function expectedOrderAfterMove(childIds, listByNodeId, sourceNodeId, targetNodeId, position) {
  const sourceIndex = childIds.indexOf(sourceNodeId)
  assert(sourceIndex >= 0, `source ${sourceNodeId} not found in body order`)
  const sourceList = listByNodeId[sourceNodeId]
  const segment = [sourceNodeId]
  if (sourceList) {
    for (let index = sourceIndex + 1; index < childIds.length; index += 1) {
      const candidateId = childIds[index]
      const candidateList = listByNodeId[candidateId]
      if (
        !candidateList ||
        candidateList.instanceId !== sourceList.instanceId ||
        candidateList.level <= sourceList.level
      ) break
      segment.push(candidateId)
    }
  }
  if (segment.includes(targetNodeId)) return childIds.slice()

  const segmentIds = new Set(segment)
  const withoutSource = childIds.filter((id) => !segmentIds.has(id))
  const targetIndex = withoutSource.indexOf(targetNodeId)
  assert(targetIndex >= 0, `target ${targetNodeId} not found after source removal`)
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1
  const next = withoutSource.slice()
  next.splice(insertIndex, 0, ...segment)
  return next
}

async function waitForStoredOrder(page, expectedChildIds) {
  await page.waitForFunction(
    ({ storageKey, expected }) => {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      const doc = parsed.document?.sections ? parsed : parsed.document
      const section = doc.document.sections[0]
      const body = section.nodes[section.bodyRootId]
      return body?.type === "body" && JSON.stringify(body.childIds) === JSON.stringify(expected)
    },
    { storageKey: STORAGE_KEY, expected: expectedChildIds },
    { timeout: 10000 },
  )
}

async function clickToolbarButton(page, title) {
  const button = page.locator(`button[title="${title}"]`)
  await button.waitFor({ state: "visible", timeout: 10000 })
  await page.waitForFunction((buttonTitle) => {
    const button = document.querySelector(`button[title="${buttonTitle}"]`)
    return button instanceof HTMLButtonElement && !button.disabled
  }, title, { timeout: 10000 })
  await button.click()
}

async function runSmoke(page) {
  await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.getByTestId("editor-shell").waitFor({ state: "visible", timeout: 30000 })
  await page.getByTestId("outline-panel-title").waitFor({ state: "visible", timeout: 30000 })

  await waitForOutlineVirtualized(page)
  await page.locator(rowSelector(SOURCE_NODE_ID)).waitFor({ state: "attached", timeout: 30000 })
  await page.locator(rowSelector(TARGET_NODE_ID)).waitFor({ state: "attached", timeout: 30000 })

  const before = await readStoredBodyOrder(page)
  assert(before.childIds.includes(SOURCE_NODE_ID), `source node ${SOURCE_NODE_ID} not found in body order`)
  assert(before.childIds.includes(TARGET_NODE_ID), `target node ${TARGET_NODE_ID} not found in body order`)
  assert(before.childIds.indexOf(SOURCE_NODE_ID) !== before.childIds.indexOf(TARGET_NODE_ID), "source and target order indexes are identical")

  const virtualizationBefore = await readOutlineVirtualizationState(page)
  assert(virtualizationBefore.domVirtualized, "Outline did not enable DOM virtualization")
  assert(virtualizationBefore.domRowCount > 80, `expected large outline row count, got ${virtualizationBefore.domRowCount}`)
  assert(
    virtualizationBefore.domRenderedRowCount > 0 &&
      virtualizationBefore.domRenderedRowCount < virtualizationBefore.domRowCount,
    `expected rendered rows to be bounded below total rows: ${JSON.stringify(virtualizationBefore)}`,
  )

  const activeEdit = await startActiveDraftBeforeOutlineReorder(page)
  const actionCountsBeforeReorder = await readOutlineActionCounts(page)
  const dragResult = await dragOutlineRow(page, SOURCE_NODE_ID, TARGET_NODE_ID, REORDER_POSITION)
  const attemptedChildIds = expectedOrderAfterMove(
    before.childIds,
    before.listByNodeId,
    SOURCE_NODE_ID,
    TARGET_NODE_ID,
    REORDER_POSITION,
  )
  const expectedStoredChildIds = EXPECT_REORDER_NOOP ? before.childIds : attemptedChildIds
  await waitForStoredOrder(page, expectedStoredChildIds)
  const committedActiveEditSnapshot = await waitForStoredParagraphSnapshot(
    page,
    ACTIVE_EDIT_NODE_ID,
    activeEdit.expectedSnapshot,
    "active draft text should commit before Outline reorder",
  )
  await page.locator(bridgeSelector(ACTIVE_EDIT_NODE_ID)).waitFor({ state: "detached", timeout: 10000 })
  await waitForOutlineVirtualized(page)

  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute("data-outline-drag-source") !== "true",
    rowSelector(SOURCE_NODE_ID),
    { timeout: 5000 },
  )

  const after = await readStoredBodyOrder(page)
  const actionCountsAfterReorder = await readOutlineActionCounts(page)
  assert(
    actionCountsAfterReorder.inlineFinalize > actionCountsBeforeReorder.inlineFinalize,
    `expected inline finalize before reorder, before=${actionCountsBeforeReorder.inlineFinalize} after=${actionCountsAfterReorder.inlineFinalize}`,
  )
  if (!EXPECT_REORDER_NOOP) {
    assert(
      actionCountsAfterReorder.reorder > actionCountsBeforeReorder.reorder,
      `expected REORDER_BODY_CHILD action, before=${actionCountsBeforeReorder.reorder} after=${actionCountsAfterReorder.reorder}`,
    )
  }

  let undoActiveEditSnapshot = null
  let redoActiveEditSnapshot = null
  if (!EXPECT_REORDER_NOOP) {
    await clickToolbarButton(page, "Undo (Ctrl+Z)")
    await waitForStoredOrder(page, before.childIds)
    await waitForOutlineVirtualized(page)
    undoActiveEditSnapshot = await waitForStoredParagraphSnapshot(
      page,
      ACTIVE_EDIT_NODE_ID,
      activeEdit.expectedSnapshot,
      "undoing reorder should preserve finalized active draft text",
    )

    await clickToolbarButton(page, "Redo (Ctrl+Y)")
    await waitForStoredOrder(page, attemptedChildIds)
    await waitForOutlineVirtualized(page)
    redoActiveEditSnapshot = await waitForStoredParagraphSnapshot(
      page,
      ACTIVE_EDIT_NODE_ID,
      activeEdit.expectedSnapshot,
      "redoing reorder should preserve finalized active draft text",
    )
  }

  const virtualizationAfter = await readOutlineVirtualizationState(page)
  assert(virtualizationAfter.domVirtualized, "Outline virtualization was lost after reorder")
  assert(
    virtualizationAfter.domRenderedRowCount > 0 &&
      virtualizationAfter.domRenderedRowCount < virtualizationAfter.domRowCount,
    `expected bounded rendered rows after reorder: ${JSON.stringify(virtualizationAfter)}`,
  )

  return {
    flowDocFile,
    reorder: {
      sourceNodeId: SOURCE_NODE_ID,
      targetNodeId: TARGET_NODE_ID,
      position: REORDER_POSITION,
      expectNoop: EXPECT_REORDER_NOOP,
      beforeIndex: before.childIds.indexOf(SOURCE_NODE_ID),
      afterIndex: after.childIds.indexOf(SOURCE_NODE_ID),
      expectedIndex: expectedStoredChildIds.indexOf(SOURCE_NODE_ID),
      attemptedIndex: attemptedChildIds.indexOf(SOURCE_NODE_ID),
      dropBlockedReason: dragResult.dropBlockedReason,
      ghostSubtreeChildCount: dragResult.ghostSubtreeChildCount,
      expectedSubtreeChildCount: EXPECTED_SUBTREE_CHILD_COUNT,
      firstFiveBefore: before.childIds.slice(0, 5),
      firstFiveAfter: after.childIds.slice(0, 5),
      packageVersion: after.packageVersion,
    },
    activeEdit: {
      nodeId: activeEdit.nodeId,
      marker: ACTIVE_EDIT_MARKER,
      beforeLength: activeEdit.beforeText.length,
      committedLength: committedActiveEditSnapshot?.text.length ?? null,
      beforeList: activeEdit.beforeList,
      committedList: committedActiveEditSnapshot?.list ?? null,
      exactTextPreserved: committedActiveEditSnapshot?.text === activeEdit.expectedSnapshot.text,
      listSignaturePreserved:
        JSON.stringify(committedActiveEditSnapshot?.list ?? null) === JSON.stringify(activeEdit.expectedSnapshot.list),
      undoPreserved: EXPECT_REORDER_NOOP ? null : undoActiveEditSnapshot?.text === activeEdit.expectedSnapshot.text,
      redoPreserved: EXPECT_REORDER_NOOP ? null : redoActiveEditSnapshot?.text === activeEdit.expectedSnapshot.text,
      actionCountDelta: {
        reorder: actionCountsAfterReorder.reorder - actionCountsBeforeReorder.reorder,
        commitText: actionCountsAfterReorder.commitText - actionCountsBeforeReorder.commitText,
        commitRichText: actionCountsAfterReorder.commitRichText - actionCountsBeforeReorder.commitRichText,
        inlineFinalize: actionCountsAfterReorder.inlineFinalize - actionCountsBeforeReorder.inlineFinalize,
      },
    },
    virtualization: {
      before: virtualizationBefore,
      after: virtualizationAfter,
    },
  }
}

async function main() {
  console.log(`outline panel smoke browser: ${smokeBrowserLabel(smokeBrowser)}`)
  const rawDocument = fs.readFileSync(flowDocFile, "utf8")
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null
  const consoleErrors = []
  const pageErrors = []
  const resourceErrors = []

  try {
    if (server) await waitForServer(scenarioUrl(), server)
    browser = await launchSmokeBrowser(smokeBrowser)
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
    collectPageErrors(page, consoleErrors, pageErrors, resourceErrors)
    await page.addInitScript(({ storageKey, perfKey, raw }) => {
      window.localStorage.clear()
      window.localStorage.setItem(storageKey, raw)
      window.localStorage.setItem(perfKey, "1")
    }, { storageKey: STORAGE_KEY, perfKey: PERF_TRACE_STORAGE_KEY, raw: rawDocument })

    const result = await runSmoke(page)
    const unignoredResourceErrors = unexpectedResourceErrors(resourceErrors)
    assert(unignoredResourceErrors.length === 0, `resource errors:\n${JSON.stringify(unignoredResourceErrors, null, 2)}`)
    assert(consoleErrors.length === 0, `console errors:\n${consoleErrors.map(formatConsoleError).join("\n")}`)
    assert(pageErrors.length === 0, `page errors:\n${pageErrors.join("\n")}`)

    console.log(JSON.stringify({
      ok: true,
      browser: {
        mode: smokeBrowserLabel(smokeBrowser),
        channel: smokeBrowser.channel ?? null,
        executablePath: smokeBrowser.executablePath ?? null,
        headless: smokeBrowser.headless,
      },
      outline: result,
      ignoredResourceErrors: resourceErrors.filter((error) => !unexpectedResourceErrors([error]).length),
    }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      console: {
        errors: consoleErrors,
        pageErrors,
      },
      resourceErrors,
      failure: error instanceof Error ? error.message : String(error),
    }, null, 2))
    if (server?.output?.length) {
      console.error("Next dev server output:")
      console.error(server.output.join("").trim())
    }
    throw error
  } finally {
    if (browser) await browser.close()
    await stopNextDevServer(server)
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
