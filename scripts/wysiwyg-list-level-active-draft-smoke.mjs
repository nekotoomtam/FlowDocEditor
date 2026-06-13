import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const PERF_TRACE_STORAGE_KEY = "flowdoc.wysiwygPerfTrace"
const DEFAULT_SMOKE_PORT = 4024
const PARENT_LIST_PARAGRAPH_ID = "list-level-draft-parent"
const LIST_PARAGRAPH_ID = "list-level-draft-p1"
const CONTROL_PARAGRAPH_ID = "list-level-draft-control"
const BEFORE_MARKER = "LIST_LEVEL_BEFORE_MARKER"
const AFTER_MARKER = "LIST_LEVEL_AFTER_MARKER"
const KEYBOARD_OUTDENT_MARKER = "LIST_LEVEL_KEYBOARD_OUTDENT_MARKER"
const KEYBOARD_INDENT_MARKER = "LIST_LEVEL_KEYBOARD_INDENT_MARKER"
const KEYBOARD_NOOP_OUTDENT_MARKER = "LIST_LEVEL_KEYBOARD_NOOP_OUTDENT_MARKER"
const KEYBOARD_NOOP_INDENT_MARKER = "LIST_LEVEL_KEYBOARD_NOOP_INDENT_MARKER"
const ENTER_SPLIT_NEW_ITEM_MARKER = "LIST_LEVEL_ENTER_SPLIT_NEW_ITEM_MARKER"
const LIST_TEXT_EXCLUDES = ["\t", "1.", "1.1", "2.", "3."]

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_SMOKE_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const platformShortcut = process.platform === "darwin" ? "Meta" : "Control"
const repeatCount = readIntegerOption("repeat", ["LIST_LEVEL_REPEAT", "SMOKE_REPEAT"], 1, 1)
const warmupCount = readIntegerOption("warmup", ["LIST_LEVEL_WARMUP", "SMOKE_WARMUP"], 0, 0)
const repeatChild = process.env.LIST_LEVEL_REPEAT_CHILD === "1"

function pt(value) {
  return { value, unit: "pt" }
}

function readCliOption(name) {
  const exact = `--${name}`
  const prefix = `${exact}=`
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index]
    if (arg === exact) return process.argv[index + 1]
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return null
}

function readIntegerOption(name, envNames, defaultValue, minValue) {
  const envValue = envNames
    .map((envName) => process.env[envName])
    .find((value) => value != null && value !== "")
  const rawValue = readCliOption(name) ?? envValue
  if (rawValue == null || rawValue === "") return defaultValue
  const value = Number(rawValue)
  assert(
    Number.isInteger(value) && value >= minValue,
    `${name} must be an integer >= ${minValue}; received ${JSON.stringify(rawValue)}`,
  )
  return value
}

function paragraph(id, text, props = {}) {
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
      ...props,
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeListLevelDraftDocument() {
  return {
    version: 1,
    document: {
      id: "list-level-draft-smoke-doc",
      meta: { title: "List Level Draft Smoke" },
      listStyles: {
        "list-level-draft-style": {
          id: "list-level-draft-style",
          levels: [
            { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(28), tabStop: pt(28) },
            { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, restartAfterLevel: 0, markerIndent: pt(28), bodyIndent: pt(56), tabStop: pt(56) },
            { level: 2, format: "thaiLetter", pattern: "(%3)", startAt: 1, restartAfterLevel: 1, markerIndent: pt(56), bodyIndent: pt(84), tabStop: pt(84) },
          ],
        },
      },
      listInstances: {
        "list-level-draft-instance": { id: "list-level-draft-instance", styleId: "list-level-draft-style" },
      },
      sections: [{
        id: "list-level-draft-section",
        type: "section",
        bodyRootId: "list-level-draft-body",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        nodes: {
          "list-level-draft-body": {
            id: "list-level-draft-body",
            type: "body",
            props: {},
            childIds: [PARENT_LIST_PARAGRAPH_ID, LIST_PARAGRAPH_ID, CONTROL_PARAGRAPH_ID],
          },
          [PARENT_LIST_PARAGRAPH_ID]: paragraph(PARENT_LIST_PARAGRAPH_ID, "Parent list item", {
            list: { instanceId: "list-level-draft-instance", level: 0, itemId: "list-level-draft-parent-item" },
          }),
          [LIST_PARAGRAPH_ID]: paragraph(LIST_PARAGRAPH_ID, "List draft base", {
            list: { instanceId: "list-level-draft-instance", level: 0, itemId: "list-level-draft-item" },
          }),
          [CONTROL_PARAGRAPH_ID]: paragraph(CONTROL_PARAGRAPH_ID, "Control paragraph"),
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

async function expectActiveDraftBridge(page, nodeId, timeout = 10000) {
  const bridge = page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${nodeId}"]`)
  await bridge.waitFor({ state: "attached", timeout })
  const nonBridgeTextareaCount = await page.locator(`textarea[data-inline-edit-node-id="${nodeId}"]:not([data-wysiwyg-input-bridge="true"])`).count()
  const draftIslandLayerCount = await page.locator(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${nodeId}"]`).count()
  assert(nonBridgeTextareaCount === 0, `expected no non-bridge textarea for ${nodeId}, found ${nonBridgeTextareaCount}`)
  assert(draftIslandLayerCount >= 1, `expected draft island layer for ${nodeId}, found ${draftIslandLayerCount}`)
  return bridge
}

async function dispatchListParagraphDoubleClick(page, target) {
  await page.evaluate(({ x, y }) => {
    const targetElement = document.elementFromPoint(x, y)
    if (!targetElement) throw new Error(`missing element at list click target ${x},${y}`)
    targetElement.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      detail: 2,
      view: window,
    }))
  }, target)
}

async function collectListEditDiagnostics(page) {
  return page.evaluate((nodeId) => {
    const fragmentSelector = `[data-testid="editor-fragment"][data-node-id="${CSS.escape(nodeId)}"]`
    const zoneFragmentSelector = `[data-testid="editor-zone-fragment"][data-node-id="${CSS.escape(nodeId)}"]`
    const fragment = document.querySelector(fragmentSelector)
    const zoneFragment = document.querySelector(zoneFragmentSelector)
    const toolbar = document.querySelector('[data-testid="list-toolbar"]')
    const rect = fragment?.getBoundingClientRect()
    const zoneRect = zoneFragment?.getBoundingClientRect()
    const centerX = rect ? rect.left + rect.width / 2 : null
    const centerY = rect ? rect.top + Math.min(Math.max(rect.height / 2, 4), Math.max(rect.height - 2, 4)) : null
    const hit = centerX !== null && centerY !== null
      ? document.elementFromPoint(centerX, centerY)
      : null
    const bridges = Array.from(document.querySelectorAll("[data-wysiwyg-input-bridge='true']"))
      .map((node) => node.getAttribute("data-inline-edit-node-id"))
    const islands = Array.from(document.querySelectorAll("[data-wysiwyg-draft-editor-island='true']"))
      .map((node) => node.getAttribute("data-inline-edit-node-id"))
    const textCandidates = Array.from(fragment?.querySelectorAll("text") ?? [])
      .map((element) => {
        const textRect = element.getBoundingClientRect()
        return {
          text: element.textContent?.trim() ?? "",
          x: Math.round(textRect.x),
          y: Math.round(textRect.y),
          width: Math.round(textRect.width),
          height: Math.round(textRect.height),
        }
      })
    return {
      fragmentCount: document.querySelectorAll(fragmentSelector).length,
      zoneFragmentCount: document.querySelectorAll(zoneFragmentSelector).length,
      markerCount: document.querySelectorAll(`[data-list-marker-node-id="${CSS.escape(nodeId)}"]`).length,
      fragmentInlineEditable: fragment?.getAttribute("data-inline-editable") ?? null,
      zoneFragmentInlineEditable: zoneFragment?.getAttribute("data-inline-editable") ?? null,
      fragmentNodeType: fragment?.getAttribute("data-node-type") ?? null,
      fragmentPointerEvents: fragment ? getComputedStyle(fragment).pointerEvents : null,
      fragmentRect: rect ? {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
      zoneFragmentRect: zoneRect ? {
        x: Math.round(zoneRect.x),
        y: Math.round(zoneRect.y),
        width: Math.round(zoneRect.width),
        height: Math.round(zoneRect.height),
      } : null,
      centerHitTag: hit?.tagName ?? null,
      centerHitTestId: hit instanceof Element ? hit.getAttribute("data-testid") : null,
      centerHitNodeId: hit instanceof Element ? hit.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null : null,
      toolbarActiveNodeId: toolbar?.getAttribute("data-active-node-id") ?? null,
      toolbarCurrentLevel: toolbar?.getAttribute("data-current-level") ?? null,
      bridgeNodeIds: bridges,
      draftIslandNodeIds: islands,
      activeElementTag: document.activeElement?.tagName ?? null,
      activeElementNodeId: document.activeElement?.getAttribute("data-inline-edit-node-id") ?? null,
      textCandidates,
      lastPerfEvents: (window.__flowDocWysiwygPerfEvents ?? []).slice(-12),
    }
  }, LIST_PARAGRAPH_ID)
}

async function collectActiveDraftDiagnostics(page) {
  return page.evaluate((nodeId) => {
    const bridges = Array.from(document.querySelectorAll(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`))
      .map((node) => ({
        tag: node.tagName,
        value: node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement ? node.value : null,
        text: node.textContent,
        focused: node === document.activeElement,
        mode: node.getAttribute("data-wysiwyg-input-bridge-mode"),
      }))
    const islands = Array.from(document.querySelectorAll(`[data-wysiwyg-draft-editor-island="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`))
      .map((node) => ({
        mode: node.getAttribute("data-wysiwyg-active-visual-mode"),
        detail: node.getAttribute("data-wysiwyg-active-visual-detail"),
        text: node.textContent,
      }))
    return {
      activeElementTag: document.activeElement?.tagName ?? null,
      activeElementNodeId: document.activeElement?.getAttribute("data-inline-edit-node-id") ?? null,
      bridges,
      islands,
      perfEvents: (window.__flowDocWysiwygPerfEvents ?? []).slice(-40),
    }
  }, LIST_PARAGRAPH_ID)
}

async function findListParagraphClickTarget(page) {
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
          x: rect.left + Math.min(Math.max(rect.width / 3, 4), Math.max(rect.width - 2, 4)),
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      })
      .find((candidate) => (
        candidate.text.includes("List draft base") &&
        candidate.width > 8 &&
        candidate.height > 4
      )) ?? Array.from(fragment.querySelectorAll("text"))
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          text: element.textContent?.trim() ?? "",
          x: rect.left + Math.min(Math.max(rect.width / 3, 4), Math.max(rect.width - 2, 4)),
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      })
      .find((candidate) => (
        candidate.text.length > 0 &&
        candidate.text !== "paragraph" &&
        candidate.text !== "1." &&
        candidate.text !== "1.1" &&
        candidate.width > 8 &&
        candidate.height > 4
      ))
    if (textCandidate) return textCandidate

    const rect = fragment.getBoundingClientRect()
    return {
      text: "",
      x: rect.left + Math.min(Math.max(rect.width / 3, 8), Math.max(rect.width - 4, 8)),
      y: rect.top + Math.min(Math.max(rect.height / 2, 4), Math.max(rect.height - 2, 4)),
      width: rect.width,
      height: rect.height,
    }
  }, LIST_PARAGRAPH_ID)
}

async function readStoredDocument(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.packageVersion === 2 && parsed.document?.document?.sections) return parsed.document
    if (parsed?.kind === "document" && parsed.document?.document?.sections) return parsed.document
    return parsed
  }, STORAGE_KEY)
}

function findParagraphInDoc(doc, nodeId) {
  for (const section of doc.document.sections) {
    const node = section.nodes[nodeId]
    if (node?.type === "paragraph") return node
  }
  return null
}

function findBodyChildOrderForNode(doc, nodeId) {
  for (const section of doc.document.sections) {
    const body = section.nodes[section.bodyRootId]
    if (body?.type !== "body") continue
    const index = body.childIds.indexOf(nodeId)
    if (index >= 0) return { section, childIds: body.childIds, index }
  }
  return null
}

function findNextBodyParagraphAfter(doc, nodeId) {
  const order = findBodyChildOrderForNode(doc, nodeId)
  if (!order) return null
  const nextNodeId = order.childIds[order.index + 1] ?? null
  const paragraph = nextNodeId ? order.section.nodes[nextNodeId] : null
  if (paragraph?.type !== "paragraph") return null
  return { nodeId: nextNodeId, paragraph, childIds: order.childIds }
}

function paragraphText(paragraph) {
  return paragraph.children.map((child) => child.text ?? "").join("")
}

function storedParagraphMatches(paragraph, expectation) {
  const text = paragraphText(paragraph)
  const list = paragraph.props?.list
  return list?.level === expectation.level &&
    expectation.includes.every((value) => text.includes(value)) &&
    expectation.excludes.every((value) => !text.includes(value))
}

async function waitForStoredParagraphById(page, nodeId, expectation, label) {
  try {
    await page.waitForFunction(
      ({ key, nodeId, expectation }) => {
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed?.packageVersion === 2 && parsed.document?.document?.sections
          ? parsed.document
          : parsed?.kind === "document" && parsed.document?.document?.sections
            ? parsed.document
            : parsed
        const paragraph = doc?.document?.sections
          ?.map((section) => section.nodes[nodeId])
          .find((node) => node?.type === "paragraph")
        if (!paragraph) return false
        const text = paragraph.children.map((child) => child.text ?? "").join("")
        const list = paragraph.props?.list
        return list?.level === expectation.level &&
          expectation.includes.every((value) => text.includes(value)) &&
          expectation.excludes.every((value) => !text.includes(value))
      },
      { key: STORAGE_KEY, nodeId, expectation },
      { timeout: 10000 },
    )
  } catch (error) {
    const doc = await readStoredDocument(page)
    const paragraph = doc ? findParagraphInDoc(doc, nodeId) : null
    throw new Error(`${label} did not match. Last stored paragraph: ${JSON.stringify(paragraph)}\n${error.message}`)
  }
  const doc = await readStoredDocument(page)
  const paragraph = findParagraphInDoc(doc, nodeId)
  assert(storedParagraphMatches(paragraph, expectation), `stored paragraph did not match ${label}: ${JSON.stringify(paragraph)}`)
  return paragraph
}

async function waitForStoredParagraph(page, expectation, label) {
  return waitForStoredParagraphById(page, LIST_PARAGRAPH_ID, expectation, label)
}

async function waitForListEnterSplit(page, sourceNodeId, label) {
  try {
    await page.waitForFunction(
      ({ key, sourceNodeId }) => {
        const raw = window.localStorage.getItem(key)
        if (!raw) return false
        const parsed = JSON.parse(raw)
        const doc = parsed?.packageVersion === 2 && parsed.document?.document?.sections
          ? parsed.document
          : parsed?.kind === "document" && parsed.document?.document?.sections
            ? parsed.document
            : parsed
        for (const section of doc?.document?.sections ?? []) {
          const body = section.nodes[section.bodyRootId]
          if (body?.type !== "body") continue
          const index = body.childIds.indexOf(sourceNodeId)
          if (index < 0) continue
          const source = section.nodes[sourceNodeId]
          const nextNodeId = body.childIds[index + 1]
          const next = nextNodeId ? section.nodes[nextNodeId] : null
          if (source?.type !== "paragraph" || next?.type !== "paragraph") return false
          const sourceList = source.props?.list
          const nextList = next.props?.list
          return Boolean(
            sourceList &&
            nextList &&
            nextNodeId !== sourceNodeId &&
            nextList.instanceId === sourceList.instanceId &&
            nextList.level === sourceList.level &&
            nextList.itemId !== sourceList.itemId,
          )
        }
        return false
      },
      { key: STORAGE_KEY, sourceNodeId },
      { timeout: 10000 },
    )
  } catch (error) {
    const doc = await readStoredDocument(page)
    const source = doc ? findParagraphInDoc(doc, sourceNodeId) : null
    const next = doc ? findNextBodyParagraphAfter(doc, sourceNodeId) : null
    throw new Error(`${label} did not create a valid next list item. Source=${JSON.stringify(source)} Next=${JSON.stringify(next)}\n${error.message}`)
  }
  const doc = await readStoredDocument(page)
  const source = findParagraphInDoc(doc, sourceNodeId)
  const next = findNextBodyParagraphAfter(doc, sourceNodeId)
  assert(source?.props?.list, `${label}: source paragraph is no longer a list item`)
  assert(next?.paragraph?.props?.list, `${label}: next paragraph is not a list item`)
  assert(next.paragraph.props.list.instanceId === source.props.list.instanceId, `${label}: split item changed list instance`)
  assert(next.paragraph.props.list.level === source.props.list.level, `${label}: split item changed list level`)
  assert(next.paragraph.props.list.itemId !== source.props.list.itemId, `${label}: split item reused itemId`)
  return {
    source,
    newNodeId: next.nodeId,
    paragraph: next.paragraph,
    childIds: next.childIds,
  }
}

async function openSeededEditor(page) {
  await page.addInitScript(({ storageKey, perfKey, doc }) => {
    window.localStorage.clear()
    window.localStorage.setItem(storageKey, JSON.stringify(doc))
    window.localStorage.setItem(perfKey, "1")
    window.__flowDocWysiwygPerfTraceEnabled = true
    window.__flowDocWysiwygPerfEvents = []
  }, { storageKey: STORAGE_KEY, perfKey: PERF_TRACE_STORAGE_KEY, doc: makeListLevelDraftDocument() })

  await page.goto(baseEditorUrl, { waitUntil: "domcontentloaded" })
  const shell = page.getByTestId("editor-shell")
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "text engine flag is not enabled")
  assert(await shell.getAttribute("data-wysiwyg-rich-text-draft-enabled") === "true", "rich draft flag is not enabled")
  await page.getByTestId("list-toolbar").waitFor({ state: "visible", timeout: 15000 })
  await page.getByTestId("editor-canvas").waitFor({ state: "visible", timeout: 15000 })
  await expectNoLayoutError(page)
}

async function focusListBridge(page) {
  const fragment = page.locator(`[data-testid="editor-fragment"][data-node-id="${LIST_PARAGRAPH_ID}"]`).first()
  let bridge = null
  let lastError = null
  let lastTarget = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await fragment.scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)
    try {
      const target = await findListParagraphClickTarget(page)
      lastTarget = target
      await page.mouse.click(target.x, target.y)
      try {
        bridge = await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID, 1500)
      } catch (error) {
        lastError = error
      }
      if (!bridge) {
        await page.mouse.dblclick(target.x, target.y)
        try {
          bridge = await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID, 2500)
        } catch (error) {
          lastError = error
        }
      }
      if (!bridge) {
        await dispatchListParagraphDoubleClick(page, target)
        bridge = await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID, 5000)
      }
      break
    } catch (error) {
      lastError = error
      await page.keyboard.press("Escape")
      await page.waitForTimeout(100)
    }
  }
  if (!bridge) {
    const diagnostics = await collectListEditDiagnostics(page)
    throw new Error([
      `expected active draft bridge for ${LIST_PARAGRAPH_ID}`,
      lastError?.message ?? null,
      lastTarget ? `last target: ${JSON.stringify(lastTarget)}` : null,
      JSON.stringify(diagnostics, null, 2),
    ].filter(Boolean).join("\n"))
  }
  await bridge.focus()
  await page.keyboard.press("End")
  return bridge
}

async function waitForToolbarLevel(page, expectedLevel, nodeId = LIST_PARAGRAPH_ID) {
  try {
    await page.waitForFunction(
      ({ nodeId, expectedLevel }) => {
        const toolbar = document.querySelector('[data-testid="list-toolbar"]')
        return toolbar?.getAttribute("data-active-node-id") === nodeId &&
          toolbar.getAttribute("data-current-level") === String(expectedLevel)
      },
      { nodeId, expectedLevel },
      { timeout: 10000 },
    )
  } catch (error) {
    const diagnostics = await page.evaluate(({ key, nodeId }) => {
      const toolbar = document.querySelector('[data-testid="list-toolbar"]')
      const markers = Array.from(document.querySelectorAll(`[data-list-marker-node-id="${CSS.escape(nodeId)}"]`))
        .map((marker) => ({
          level: marker.getAttribute("data-list-marker-level"),
          text: marker.textContent,
        }))
      const bridges = Array.from(document.querySelectorAll("[data-wysiwyg-input-bridge='true']"))
        .map((bridge) => ({
          nodeId: bridge.getAttribute("data-inline-edit-node-id"),
          focused: bridge === document.activeElement,
        }))
      const raw = window.localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : null
      const doc = parsed?.packageVersion === 2 && parsed.document?.document?.sections
        ? parsed.document
        : parsed?.kind === "document" && parsed.document?.document?.sections
          ? parsed.document
          : parsed
      const bodyOrders = (doc?.document?.sections ?? []).map((section) => {
        const body = section.nodes[section.bodyRootId]
        return body?.type === "body" ? body.childIds : []
      })
      const paragraph = doc?.document?.sections
        ?.map((section) => section.nodes[nodeId])
        .find((node) => node?.type === "paragraph")
      return {
        expectedNodeId: nodeId,
        toolbar: {
          activeNodeId: toolbar?.getAttribute("data-active-node-id") ?? null,
          currentLevel: toolbar?.getAttribute("data-current-level") ?? null,
          activeStyleId: toolbar?.getAttribute("data-active-style-id") ?? null,
        },
        bridges,
        markers,
        activeElementNodeId: document.activeElement?.getAttribute("data-inline-edit-node-id") ?? null,
        bodyOrders,
        paragraph,
      }
    }, { key: STORAGE_KEY, nodeId })
    throw new Error(`toolbar level did not become ${expectedLevel} for ${nodeId}: ${JSON.stringify(diagnostics, null, 2)}\n${error.message}`)
  }
}

async function readListToolbarState(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-testid="list-toolbar"]')
    const indent = document.querySelector('[data-testid="list-toolbar-indent"]')
    const outdent = document.querySelector('[data-testid="list-toolbar-outdent"]')
    return {
      activeNodeId: toolbar?.getAttribute("data-active-node-id") ?? null,
      currentLevel: toolbar?.getAttribute("data-current-level") ?? null,
      activeStyleId: toolbar?.getAttribute("data-active-style-id") ?? null,
      indentDisabled: indent instanceof HTMLButtonElement ? indent.disabled : null,
      outdentDisabled: outdent instanceof HTMLButtonElement ? outdent.disabled : null,
    }
  })
}

async function waitForVisualListMarker(page, expectedLevel, nodeId = LIST_PARAGRAPH_ID) {
  try {
    await page.waitForFunction(
      ({ nodeId, expectedLevel }) => {
        const markers = Array.from(document.querySelectorAll(`[data-list-marker-node-id="${CSS.escape(nodeId)}"]`))
        return markers.some((marker) => marker.getAttribute("data-list-marker-level") === String(expectedLevel))
      },
      { nodeId, expectedLevel },
      { timeout: 10000 },
    )
  } catch (error) {
    const diagnostics = await page.evaluate((nodeId) => {
      const markers = Array.from(document.querySelectorAll(`[data-list-marker-node-id="${CSS.escape(nodeId)}"]`))
        .map((marker) => ({
          level: marker.getAttribute("data-list-marker-level"),
          text: marker.textContent,
        }))
      const layers = Array.from(document.querySelectorAll(`[data-wysiwyg-text-engine-layer="true"][data-inline-edit-node-id="${CSS.escape(nodeId)}"]`))
        .map((layer) => ({
          mode: layer.getAttribute("data-wysiwyg-active-visual-mode"),
          detail: layer.getAttribute("data-wysiwyg-active-visual-detail"),
          lineCount: layer.getAttribute("data-wysiwyg-line-count"),
          draftLineCount: layer.getAttribute("data-wysiwyg-flowdoc-draft-line-count"),
          draftTextLength: layer.getAttribute("data-wysiwyg-flowdoc-draft-text-length"),
          markerCount: layer.querySelectorAll(`[data-list-marker-node-id="${CSS.escape(nodeId)}"]`).length,
          text: layer.textContent,
        }))
      return { markers, layers }
    }, nodeId)
    throw new Error(`missing visual list marker level ${expectedLevel}: ${JSON.stringify(diagnostics, null, 2)}\n${error.message}`)
  }
}

function expectation({ level, includes = [], excludes = [] }) {
  return { level, includes, excludes }
}

async function applyKeyboardListLevelChange(page, key, expectedLevel, includes, label) {
  await page.keyboard.press(key)
  const paragraph = await waitForStoredParagraph(
    page,
    expectation({ level: expectedLevel, includes, excludes: LIST_TEXT_EXCLUDES }),
    label,
  )
  await waitForToolbarLevel(page, expectedLevel)
  await waitForVisualListMarker(page, expectedLevel)
  const bridge = await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID)
  await bridge.focus()
  await expectNoLayoutError(page)
  return paragraph
}

async function readListLevelActionCount(page) {
  return page.evaluate(() => {
    const perfEvents = window.__flowDocWysiwygPerfEvents ?? []
    return perfEvents.filter((event) =>
      event.kind === "editor-action-dispatch" &&
      (event.command === "CHANGE_LIST_ITEM_LEVEL" || event.commandType === "CHANGE_LIST_ITEM_LEVEL")
    ).length
  })
}

function countSplitParagraphActions(perfEvents) {
  return perfEvents.filter((event) =>
    event.kind === "editor-action-dispatch" &&
    (event.command === "SPLIT_PARAGRAPH" || event.commandType === "SPLIT_PARAGRAPH")
  ).length
}

function countStructuralEnterSplits(perfEvents) {
  return perfEvents.filter((event) =>
    event.kind === "flowdoc-island-structural-edit" &&
    event.action === "split-paragraph" &&
    event.source === "key:Enter"
  ).length
}

async function applyNoopKeyboardListLevelChange(page, key, expectedLevel, marker, label) {
  const actionCountBefore = await readListLevelActionCount(page)
  await page.keyboard.press(key)
  await page.waitForTimeout(100)
  const actionCountAfter = await readListLevelActionCount(page)
  assert(
    actionCountAfter === actionCountBefore,
    `${label} dispatched list level action: before=${actionCountBefore}, after=${actionCountAfter}`,
  )
  const bridge = await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID)
  await bridge.focus()
  await waitForToolbarLevel(page, expectedLevel)
  await waitForVisualListMarker(page, expectedLevel)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), marker, { timeout: 10000 })
  await expectNoLayoutError(page)
  return { actionCountBefore, actionCountAfter }
}

async function runSmokeAssertions(page) {
  await openSeededEditor(page)
  await waitForVisualListMarker(page, 0)
  await focusListBridge(page)
  await waitForToolbarLevel(page, 0)
  await waitForVisualListMarker(page, 0)

  const beforeText = ` ${BEFORE_MARKER} ข้อความก่อนปรับระดับ`
  await page.keyboard.insertText(beforeText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), BEFORE_MARKER, { timeout: 10000 })
  await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID)

  const toolbarBeforeIndent = await readListToolbarState(page)
  assert(toolbarBeforeIndent.indentDisabled === false, `expected indent to be enabled before level change: ${JSON.stringify(toolbarBeforeIndent)}`)
  await page.getByTestId("list-toolbar-indent").click()
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${LIST_PARAGRAPH_ID}"]`).waitFor({ state: "detached", timeout: 10000 })
  let afterIndent = null
  try {
    afterIndent = await waitForStoredParagraph(
      page,
      expectation({ level: 1, includes: [BEFORE_MARKER], excludes: LIST_TEXT_EXCLUDES }),
      "draft text committed before toolbar indent",
    )
  } catch (error) {
    const toolbarAfterIndent = await readListToolbarState(page)
    const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
    const actionEvents = perfEvents.filter((event) =>
      event.kind === "editor-action-dispatch" ||
      event.command === "CHANGE_LIST_ITEM_LEVEL" ||
      event.commandType === "CHANGE_LIST_ITEM_LEVEL"
    )
    throw new Error([
      error.message,
      `toolbar before indent: ${JSON.stringify(toolbarBeforeIndent)}`,
      `toolbar after indent: ${JSON.stringify(toolbarAfterIndent)}`,
      `action events: ${JSON.stringify(actionEvents.slice(-8), null, 2)}`,
    ].join("\n"))
  }
  await waitForToolbarLevel(page, 1)
  await waitForVisualListMarker(page, 1)
  await expectNoLayoutError(page)

  const afterText = ` ${AFTER_MARKER} ข้อความหลังปรับระดับ`
  await focusListBridge(page)
  await page.keyboard.press("End")
  await page.keyboard.insertText(afterText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), AFTER_MARKER, { timeout: 10000 })
  await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID)
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${LIST_PARAGRAPH_ID}"]`).waitFor({ state: "detached", timeout: 10000 })

  let afterCommit = null
  try {
    afterCommit = await waitForStoredParagraph(
      page,
      expectation({ level: 1, includes: [BEFORE_MARKER, AFTER_MARKER], excludes: LIST_TEXT_EXCLUDES }),
      "continued draft text committed after list level change",
    )
  } catch (error) {
    const diagnostics = await collectActiveDraftDiagnostics(page)
    throw new Error([
      error.message,
      `active draft diagnostics after Escape: ${JSON.stringify(diagnostics, null, 2)}`,
    ].join("\n"))
  }
  await expectNoLayoutError(page)

  await page.keyboard.press(`${platformShortcut}+Z`)
  const afterUndo = await waitForStoredParagraph(
    page,
    expectation({ level: 1, includes: [BEFORE_MARKER], excludes: [AFTER_MARKER, ...LIST_TEXT_EXCLUDES] }),
    "undo removes only the post-level-change draft edit",
  )

  await page.keyboard.press(`${platformShortcut}+Y`)
  const afterRedo = await waitForStoredParagraph(
    page,
    expectation({ level: 1, includes: [BEFORE_MARKER, AFTER_MARKER], excludes: LIST_TEXT_EXCLUDES }),
    "redo restores post-level-change draft edit",
  )

  await focusListBridge(page)
  await page.keyboard.press("End")
  const keyboardOutdentText = ` ${KEYBOARD_OUTDENT_MARKER} ข้อความก่อนกด Shift+Tab`
  await page.keyboard.insertText(keyboardOutdentText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), KEYBOARD_OUTDENT_MARKER, { timeout: 10000 })
  await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID)
  const afterKeyboardOutdent = await applyKeyboardListLevelChange(
    page,
    "Shift+Tab",
    0,
    [BEFORE_MARKER, AFTER_MARKER, KEYBOARD_OUTDENT_MARKER],
    "keyboard Shift+Tab commits active draft text before outdent",
  )

  await page.keyboard.press("End")
  const keyboardIndentText = ` ${KEYBOARD_INDENT_MARKER} ข้อความก่อนกด Tab`
  await page.keyboard.insertText(keyboardIndentText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), KEYBOARD_INDENT_MARKER, { timeout: 10000 })
  await expectActiveDraftBridge(page, LIST_PARAGRAPH_ID)
  const afterKeyboardIndent = await applyKeyboardListLevelChange(
    page,
    "Tab",
    1,
    [BEFORE_MARKER, AFTER_MARKER, KEYBOARD_OUTDENT_MARKER, KEYBOARD_INDENT_MARKER],
    "keyboard Tab commits active draft text before indent",
  )

  await page.keyboard.press("End")
  const noopIndentText = ` ${KEYBOARD_NOOP_INDENT_MARKER} ข้อความก่อนกด Tab ที่ระดับตัน`
  await page.keyboard.insertText(noopIndentText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), KEYBOARD_NOOP_INDENT_MARKER, { timeout: 10000 })
  const noopIndent = await applyNoopKeyboardListLevelChange(
    page,
    "Tab",
    1,
    KEYBOARD_NOOP_INDENT_MARKER,
    "keyboard Tab no-op keeps active draft at clamped max level",
  )
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${LIST_PARAGRAPH_ID}"]`).waitFor({ state: "detached", timeout: 10000 })
  const afterNoopIndentCommit = await waitForStoredParagraph(
    page,
    expectation({
      level: 1,
      includes: [BEFORE_MARKER, AFTER_MARKER, KEYBOARD_OUTDENT_MARKER, KEYBOARD_INDENT_MARKER, KEYBOARD_NOOP_INDENT_MARKER],
      excludes: LIST_TEXT_EXCLUDES,
    }),
    "keyboard Tab no-op keeps draft text available for later commit",
  )

  await focusListBridge(page)
  await page.keyboard.press("End")
  const afterSecondKeyboardOutdent = await applyKeyboardListLevelChange(
    page,
    "Shift+Tab",
    0,
    [BEFORE_MARKER, AFTER_MARKER, KEYBOARD_OUTDENT_MARKER, KEYBOARD_INDENT_MARKER, KEYBOARD_NOOP_INDENT_MARKER],
    "keyboard Shift+Tab returns to top level before no-op outdent",
  )

  await page.keyboard.press("End")
  const noopOutdentText = ` ${KEYBOARD_NOOP_OUTDENT_MARKER} ข้อความก่อนกด Shift+Tab ที่ระดับศูนย์`
  await page.keyboard.insertText(noopOutdentText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), KEYBOARD_NOOP_OUTDENT_MARKER, { timeout: 10000 })
  const noopOutdent = await applyNoopKeyboardListLevelChange(
    page,
    "Shift+Tab",
    0,
    KEYBOARD_NOOP_OUTDENT_MARKER,
    "keyboard Shift+Tab no-op keeps active draft at top level",
  )
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${LIST_PARAGRAPH_ID}"]`).waitFor({ state: "detached", timeout: 10000 })
  const afterNoopOutdentCommit = await waitForStoredParagraph(
    page,
    expectation({
      level: 0,
      includes: [BEFORE_MARKER, AFTER_MARKER, KEYBOARD_OUTDENT_MARKER, KEYBOARD_INDENT_MARKER, KEYBOARD_NOOP_INDENT_MARKER, KEYBOARD_NOOP_OUTDENT_MARKER],
      excludes: LIST_TEXT_EXCLUDES,
    }),
    "keyboard Shift+Tab no-op keeps draft text available for later commit",
  )

  await focusListBridge(page)
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  const enterSplit = await waitForListEnterSplit(page, LIST_PARAGRAPH_ID, "keyboard Enter splits active list draft")
  const enterSplitBridge = await expectActiveDraftBridge(page, enterSplit.newNodeId)
  await enterSplitBridge.focus()
  await waitForToolbarLevel(page, 0, enterSplit.newNodeId)
  await waitForVisualListMarker(page, 0, enterSplit.newNodeId)
  const enterSplitText = ` ${ENTER_SPLIT_NEW_ITEM_MARKER} ข้อความในรายการใหม่หลัง Enter`
  await page.keyboard.insertText(enterSplitText)
  await page.waitForFunction((marker) => document.body.textContent?.includes(marker), ENTER_SPLIT_NEW_ITEM_MARKER, { timeout: 10000 })
  await expectActiveDraftBridge(page, enterSplit.newNodeId)
  await page.keyboard.press("Escape")
  await page.locator(`[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${enterSplit.newNodeId}"]`).waitFor({ state: "detached", timeout: 10000 })
  const afterEnterSplitSource = await waitForStoredParagraphById(
    page,
    LIST_PARAGRAPH_ID,
    expectation({
      level: 0,
      includes: [BEFORE_MARKER, AFTER_MARKER, KEYBOARD_OUTDENT_MARKER, KEYBOARD_INDENT_MARKER, KEYBOARD_NOOP_INDENT_MARKER, KEYBOARD_NOOP_OUTDENT_MARKER],
      excludes: [ENTER_SPLIT_NEW_ITEM_MARKER, ...LIST_TEXT_EXCLUDES],
    }),
    "keyboard Enter keeps existing draft text on source list item",
  )
  const afterEnterSplitNew = await waitForStoredParagraphById(
    page,
    enterSplit.newNodeId,
    expectation({
      level: 0,
      includes: [ENTER_SPLIT_NEW_ITEM_MARKER],
      excludes: LIST_TEXT_EXCLUDES,
    }),
    "keyboard Enter commits typed text into the new list item",
  )
  assert(
    afterEnterSplitNew.props.list?.instanceId === afterEnterSplitSource.props.list?.instanceId,
    "keyboard Enter split changed list instance on new item",
  )
  assert(
    afterEnterSplitNew.props.list?.itemId !== afterEnterSplitSource.props.list?.itemId,
    "keyboard Enter split reused source list itemId",
  )
  await expectNoLayoutError(page)

  const perfEvents = await page.evaluate(() => window.__flowDocWysiwygPerfEvents ?? [])
  const finalizeEvents = perfEvents.filter((event) => event.kind === "inline-edit-finalize")
  const listActions = perfEvents.filter((event) =>
    event.kind === "editor-action-dispatch" &&
    (event.command === "CHANGE_LIST_ITEM_LEVEL" || event.commandType === "CHANGE_LIST_ITEM_LEVEL")
  )
  const splitParagraphActionCount = countSplitParagraphActions(perfEvents)
  const structuralEnterSplitCount = countStructuralEnterSplits(perfEvents)
  assert(splitParagraphActionCount >= 1, `expected at least one SPLIT_PARAGRAPH action after Enter, found ${splitParagraphActionCount}`)
  assert(structuralEnterSplitCount >= 1, `expected at least one structural Enter split event, found ${structuralEnterSplitCount}`)

  return {
    afterIndent: {
      level: afterIndent.props.list?.level ?? null,
      text: paragraphText(afterIndent),
    },
    afterCommit: {
      level: afterCommit.props.list?.level ?? null,
      text: paragraphText(afterCommit),
    },
    undo: {
      level: afterUndo.props.list?.level ?? null,
      text: paragraphText(afterUndo),
    },
    redo: {
      level: afterRedo.props.list?.level ?? null,
      text: paragraphText(afterRedo),
    },
    keyboardShiftTab: {
      level: afterKeyboardOutdent.props.list?.level ?? null,
      text: paragraphText(afterKeyboardOutdent),
    },
    keyboardTab: {
      level: afterKeyboardIndent.props.list?.level ?? null,
      text: paragraphText(afterKeyboardIndent),
    },
    keyboardNoopTab: {
      level: afterNoopIndentCommit.props.list?.level ?? null,
      text: paragraphText(afterNoopIndentCommit),
      actionCountBefore: noopIndent.actionCountBefore,
      actionCountAfter: noopIndent.actionCountAfter,
    },
    keyboardSecondShiftTab: {
      level: afterSecondKeyboardOutdent.props.list?.level ?? null,
      text: paragraphText(afterSecondKeyboardOutdent),
    },
    keyboardNoopShiftTab: {
      level: afterNoopOutdentCommit.props.list?.level ?? null,
      text: paragraphText(afterNoopOutdentCommit),
      actionCountBefore: noopOutdent.actionCountBefore,
      actionCountAfter: noopOutdent.actionCountAfter,
    },
    enterSplit: {
      sourceNodeId: LIST_PARAGRAPH_ID,
      newNodeId: enterSplit.newNodeId,
      sourceLevel: afterEnterSplitSource.props.list?.level ?? null,
      newLevel: afterEnterSplitNew.props.list?.level ?? null,
      sameInstance: afterEnterSplitNew.props.list?.instanceId === afterEnterSplitSource.props.list?.instanceId,
      itemIdChanged: afterEnterSplitNew.props.list?.itemId !== afterEnterSplitSource.props.list?.itemId,
      sourceText: paragraphText(afterEnterSplitSource),
      newText: paragraphText(afterEnterSplitNew),
    },
    perf: {
      inlineEditFinalizeCount: finalizeEvents.length,
      listLevelActionCount: listActions.length,
      splitParagraphActionCount,
      structuralEnterSplitCount,
    },
  }
}

async function run() {
  const server = shouldStartServer ? startNextDevServer() : null
  let browser = null

  try {
    if (server) await waitForServer(baseEditorUrl, server)

    console.log(`wysiwyg list-level active-draft smoke browser: ${smokeBrowserLabel(smokeBrowser)}`)
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
      listLevel: assertions,
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

async function runChildListLevelSmoke(label) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LIST_LEVEL_REPEAT: "1",
      LIST_LEVEL_WARMUP: "0",
      LIST_LEVEL_REPEAT_CHILD: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  const output = []
  child.stdout.on("data", (chunk) => {
    const text = String(chunk)
    output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(text)
  })
  child.stderr.on("data", (chunk) => {
    const text = String(chunk)
    output.push(text)
    if (process.env.SMOKE_VERBOSE === "1") process.stderr.write(text)
  })
  const exitCode = await new Promise((resolve) => {
    child.once("close", (code) => resolve(code ?? 1))
  })
  const rawOutput = output.join("")
  if (exitCode !== 0) {
    throw new Error([
      `${label} failed with exit code ${exitCode}.`,
      rawOutput.trim(),
    ].filter(Boolean).join("\n"))
  }
  return parseSmokeSummary(rawOutput, label)
}

function parseSmokeSummary(output, label) {
  const jsonStart = output.indexOf("{")
  if (jsonStart < 0) {
    throw new Error(`${label} produced no JSON summary.\n${output.trim()}`)
  }
  const jsonText = output.slice(jsonStart).trim()
  try {
    return JSON.parse(jsonText)
  } catch (error) {
    throw new Error([
      `${label} produced an unreadable JSON summary: ${error.message}`,
      jsonText,
    ].join("\n"))
  }
}

function summarizeChildSample(summary) {
  const listLevel = summary.listLevel ?? {}
  return {
    browser: summary.browser?.mode ?? null,
    afterCommitLevel: listLevel.afterCommit?.level ?? null,
    keyboardShiftTabLevel: listLevel.keyboardShiftTab?.level ?? null,
    keyboardTabLevel: listLevel.keyboardTab?.level ?? null,
    keyboardNoopTabLevel: listLevel.keyboardNoopTab?.level ?? null,
    keyboardNoopShiftTabLevel: listLevel.keyboardNoopShiftTab?.level ?? null,
    enterSplitSourceLevel: listLevel.enterSplit?.sourceLevel ?? null,
    enterSplitNewLevel: listLevel.enterSplit?.newLevel ?? null,
    enterSplitSameInstance: listLevel.enterSplit?.sameInstance ?? null,
    enterSplitItemIdChanged: listLevel.enterSplit?.itemIdChanged ?? null,
    noopTabActionCountStable: listLevel.keyboardNoopTab?.actionCountBefore === listLevel.keyboardNoopTab?.actionCountAfter,
    noopShiftTabActionCountStable: listLevel.keyboardNoopShiftTab?.actionCountBefore === listLevel.keyboardNoopShiftTab?.actionCountAfter,
    inlineEditFinalizeCount: listLevel.perf?.inlineEditFinalizeCount ?? null,
    listLevelActionCount: listLevel.perf?.listLevelActionCount ?? null,
    splitParagraphActionCount: listLevel.perf?.splitParagraphActionCount ?? null,
    structuralEnterSplitCount: listLevel.perf?.structuralEnterSplitCount ?? null,
    ignoredResourceErrorCount: summary.ignoredResourceErrors?.length ?? null,
  }
}

async function runRepeatedSmoke() {
  const samples = []
  const totalSamples = warmupCount + repeatCount
  for (let index = 0; index < totalSamples; index += 1) {
    const warmup = index < warmupCount
    const sampleIndex = warmup ? index + 1 : index - warmupCount + 1
    const label = warmup
      ? `warmup ${sampleIndex}/${warmupCount}`
      : `sample ${sampleIndex}/${repeatCount}`
    const startedAt = Date.now()
    const childSummary = await runChildListLevelSmoke(label)
    samples.push({
      label,
      warmup,
      durationMs: Date.now() - startedAt,
      summary: summarizeChildSample(childSummary),
    })
  }

  console.log(JSON.stringify({
    ok: true,
    browser: smokeBrowserLabel(smokeBrowser),
    repeat: repeatCount,
    warmup: warmupCount,
    samples,
  }, null, 2))
}

const runPromise = !repeatChild && (repeatCount > 1 || warmupCount > 0)
  ? runRepeatedSmoke()
  : run()

runPromise.catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
