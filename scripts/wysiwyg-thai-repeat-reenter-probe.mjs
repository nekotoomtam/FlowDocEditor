import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

const STORAGE_KEY = "flowdoc_document"
const DEFAULT_PORT = 4022
const TARGET_NODE_ID = "thai-repeat-target"
const BASE_TEXT = "New paragraph"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })

const fragmentSelector = `[data-testid="editor-fragment"][data-node-id="${TARGET_NODE_ID}"]`
const bridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${TARGET_NODE_ID}"]`

const firstRunText = [
  "\u0E32".repeat(Number(process.env.THAI_REPEAT_A_COUNT ?? 70)),
  "\u0E2A".repeat(Number(process.env.THAI_REPEAT_SO_COUNT ?? 95)),
  "\u0E27".repeat(Number(process.env.THAI_REPEAT_WO_COUNT ?? 80)),
].join("")
const secondRunText = "\u0E01".repeat(Number(process.env.THAI_REPEAT_KO_COUNT ?? 45))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function pt(value) {
  return { value, unit: "pt" }
}

function makeThaiRepeatDocument() {
  return {
    version: 1,
    document: {
      id: "thai-repeat-doc",
      meta: { title: "Thai Repeat Re-Enter Probe" },
      sections: [{
        id: "thai-repeat-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "thai-repeat-body",
        nodes: {
          "thai-repeat-body": {
            id: "thai-repeat-body",
            type: "body",
            props: {},
            childIds: [TARGET_NODE_ID],
          },
          [TARGET_NODE_ID]: {
            id: TARGET_NODE_ID,
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
            children: [{ id: `${TARGET_NODE_ID}-text`, type: "text", text: BASE_TEXT }],
          },
        },
      }],
    },
  }
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
  child.stdout.on("data", (chunk) => child.output.push(String(chunk)))
  child.stderr.on("data", (chunk) => child.output.push(String(chunk)))
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
      throw new Error(`Next dev server exited early with code ${server.exitCode}:\n${server.output.join("")}`)
    }

    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`)
}

function snapshotKey(snapshot) {
  return JSON.stringify(snapshot.fragments.map((fragment) => ({
    lineStart: fragment.lineStart,
    lineEnd: fragment.lineEnd,
    lines: fragment.lines.map((line) => ({
      text: line.text,
      x: line.x,
      y: line.y,
      fontSize: line.fontSize,
      textAnchor: line.textAnchor,
    })),
  })))
}

async function captureSnapshot(page, label) {
  return page.evaluate(({ label, fragmentSelector }) => {
    const round = (value) => Math.round(value * 100) / 100
    const numberAttr = (element, name) => {
      const value = Number(element.getAttribute(name))
      return Number.isFinite(value) ? round(value) : null
    }
    const lineElementsFor = (fragment) => Array.from(fragment.querySelectorAll("text"))
      .filter((element) => {
        const fill = element.getAttribute("fill")
        const computedFill = window.getComputedStyle(element).fill
        return fill === "#1e40af" || computedFill === "rgb(30, 64, 175)"
      })
      .map((element) => ({
        text: element.textContent ?? "",
        x: numberAttr(element, "x"),
        y: numberAttr(element, "y"),
        fontSize: numberAttr(element, "font-size") ?? numberAttr(element, "fontSize"),
        textAnchor: element.getAttribute("text-anchor") ?? element.getAttribute("textAnchor") ?? "start",
      }))
      .filter((line) => line.text.length > 0)
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

    const shell = document.querySelector('[data-testid="editor-shell"]')
    const fragments = Array.from(document.querySelectorAll(fragmentSelector))
      .map((fragment) => {
        const rect = fragment.getBoundingClientRect()
        const layer = fragment.querySelector('[data-wysiwyg-text-engine-layer="true"]')
        const visualModeElement = fragment.querySelector("[data-inline-edit-visual-mode]")
        return {
          pageIndex: Number(fragment.getAttribute("data-page-index") ?? 0),
          fragmentIndex: fragment.getAttribute("data-fragment-index") ?? null,
          lineStart: fragment.getAttribute("data-line-start") ?? null,
          lineEnd: fragment.getAttribute("data-line-end") ?? null,
          isEditing: layer !== null || fragment.querySelector("textarea[data-inline-edit-node-id]") !== null,
          visualMode: visualModeElement?.getAttribute("data-inline-edit-visual-mode") ?? null,
          reflowKind: layer?.getAttribute("data-wysiwyg-reflow-kind") ?? null,
          rect: {
            x: round(rect.x),
            y: round(rect.y),
            width: round(rect.width),
            height: round(rect.height),
          },
          lines: lineElementsFor(fragment),
        }
      })
      .sort((a, b) => (
        a.pageIndex - b.pageIndex ||
        Number(a.lineStart ?? 0) - Number(b.lineStart ?? 0) ||
        Number(a.fragmentIndex ?? 0) - Number(b.fragmentIndex ?? 0)
      ))

    return {
      label,
      shell: {
        wysiwygTextEngineEnabled: shell?.getAttribute("data-wysiwyg-text-engine-enabled") ?? null,
        wysiwygInlineEditEnabled: shell?.getAttribute("data-wysiwyg-inline-edit-enabled") ?? null,
      },
      capturedAt: Math.round(performance.now()),
      bridgeCount: document.querySelectorAll('[data-wysiwyg-input-bridge="true"]').length,
      liveEchoCount: document.querySelectorAll('[data-wysiwyg-live-echo="true"]').length,
      fragments,
    }
  }, { label, fragmentSelector })
}

async function waitForStableSnapshot(page, label, options = {}) {
  const {
    expectEditing = null,
    requireNoLiveEcho = true,
    timeoutMs = 15000,
    sampleDelayMs = 120,
    stableSamples = 3,
  } = options
  const startedAt = Date.now()
  let previousKey = null
  let stableCount = 0
  let latest = null

  while (Date.now() - startedAt < timeoutMs) {
    latest = await captureSnapshot(page, label)
    const hasFragments = latest.fragments.length > 0 && latest.fragments.every((fragment) => fragment.lines.length > 0)
    const editingMatches = expectEditing === null || latest.fragments.some((fragment) => fragment.isEditing) === expectEditing
    const liveEchoSettled = !requireNoLiveEcho || latest.liveEchoCount === 0
    const key = snapshotKey(latest)
    stableCount = key === previousKey ? stableCount + 1 : 1
    previousKey = key

    if (hasFragments && editingMatches && liveEchoSettled && stableCount >= stableSamples) {
      return latest
    }
    await page.waitForTimeout(sampleDelayMs)
  }

  throw new Error(`Timed out waiting for stable snapshot "${label}": ${JSON.stringify(latest, null, 2)}`)
}

async function openStoredDocument(page) {
  await page.addInitScript((payload) => {
    localStorage.setItem(payload.storageKey, JSON.stringify(payload.doc))
  }, { storageKey: STORAGE_KEY, doc: makeThaiRepeatDocument() })
  await page.goto(baseEditorUrl, { waitUntil: "domcontentloaded" })
  const shell = page.locator('[data-testid="editor-shell"]')
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "text engine flag is not enabled")
  await page.locator(fragmentSelector).first().waitFor({ state: "attached", timeout: 15000 })
}

async function focusTargetBridge(page) {
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await page.locator(bridgeSelector).focus()
  await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), bridgeSelector, { timeout: 5000 })
}

async function enterTargetEdit(page) {
  await page.locator(fragmentSelector).first().click()
  await focusTargetBridge(page)
}

async function exitTargetEdit(page) {
  await page.keyboard.press("Escape")
  await page.locator(bridgeSelector).waitFor({ state: "detached", timeout: 10000 })
}

function totalLineCount(snapshot) {
  return snapshot.fragments.reduce((sum, fragment) => sum + fragment.lines.length, 0)
}

function compareSnapshots(name, leftName, left, rightName, right) {
  const equal = snapshotKey(left) === snapshotKey(right)
  return {
    name,
    left: leftName,
    right: rightName,
    equal,
    leftFragmentCount: left.fragments.length,
    rightFragmentCount: right.fragments.length,
    leftLineCount: totalLineCount(left),
    rightLineCount: totalLineCount(right),
  }
}

function summarizeSnapshots(snapshots) {
  return Object.fromEntries(Object.entries(snapshots).map(([label, snapshot]) => [
    label,
    {
      fragmentCount: snapshot.fragments.length,
      lineCount: totalLineCount(snapshot),
      bridgeCount: snapshot.bridgeCount,
      liveEchoCount: snapshot.liveEchoCount,
      fragments: snapshot.fragments.map((fragment) => ({
        pageIndex: fragment.pageIndex,
        lineStart: fragment.lineStart,
        lineEnd: fragment.lineEnd,
        isEditing: fragment.isEditing,
        visualMode: fragment.visualMode,
        reflowKind: fragment.reflowKind,
        lineCount: fragment.lines.length,
        firstLine: fragment.lines[0]?.text ?? "",
        lastLine: fragment.lines.at(-1)?.text ?? "",
      })),
    },
  ]))
}

async function typeTextWithKeyboard(page, text, delayMs = 1) {
  if (!text) return
  await page.keyboard.type(text, { delay: delayMs })
}

async function runThaiRepeatLifecycle(page) {
  await openStoredDocument(page)

  const snapshots = {}
  snapshots.preEditShow = await waitForStableSnapshot(page, "thai-repeat:preEditShow", { expectEditing: false })

  await enterTargetEdit(page)
  snapshots.firstEditEntry = await waitForStableSnapshot(page, "thai-repeat:firstEditEntry", { expectEditing: true })

  await page.keyboard.press("End")
  await typeTextWithKeyboard(page, firstRunText)
  snapshots.firstEditAfterType = await waitForStableSnapshot(page, "thai-repeat:firstEditAfterType", { expectEditing: true })
  assert(
    totalLineCount(snapshots.firstEditAfterType) > totalLineCount(snapshots.firstEditEntry),
    "Thai repeated-key first run did not wrap to a new visual line",
  )

  await exitTargetEdit(page)
  snapshots.postFirstExit = await waitForStableSnapshot(page, "thai-repeat:postFirstExit", { expectEditing: false })

  await enterTargetEdit(page)
  snapshots.secondEditEntry = await waitForStableSnapshot(page, "thai-repeat:secondEditEntry", { expectEditing: true })

  await page.keyboard.press("Enter")
  await typeTextWithKeyboard(page, secondRunText)
  snapshots.secondEditAfterType = await waitForStableSnapshot(page, "thai-repeat:secondEditAfterType", { expectEditing: true })

  await exitTargetEdit(page)
  snapshots.postSecondExit = await waitForStableSnapshot(page, "thai-repeat:postSecondExit", { expectEditing: false })

  const comparisons = [
    compareSnapshots("thai-repeat: show vs first edit entry", "preEditShow", snapshots.preEditShow, "firstEditEntry", snapshots.firstEditEntry),
    compareSnapshots("thai-repeat: first edit draft vs post first exit", "firstEditAfterType", snapshots.firstEditAfterType, "postFirstExit", snapshots.postFirstExit),
    compareSnapshots("thai-repeat: post first exit vs second edit entry", "postFirstExit", snapshots.postFirstExit, "secondEditEntry", snapshots.secondEditEntry),
    compareSnapshots("thai-repeat: second edit draft vs post second exit", "secondEditAfterType", snapshots.secondEditAfterType, "postSecondExit", snapshots.postSecondExit),
  ]

  return {
    name: "thai-repeat-default-paragraph-reenter",
    description: "User-like default paragraph: hold repeated Thai keys until wrap, exit, re-enter, press Enter at the clicked caret, type another Thai run, and compare edit/show geometry.",
    ok: comparisons.every((comparison) => comparison.equal),
    typing: {
      firstRunLength: firstRunText.length,
      secondRunLength: secondRunText.length,
      firstLineCount: totalLineCount(snapshots.firstEditAfterType),
      secondLineCount: totalLineCount(snapshots.secondEditAfterType),
    },
    comparisons,
    snapshots: summarizeSnapshots(snapshots),
  }
}

async function runProbe() {
  const server = shouldStartServer ? startNextDevServer() : null
  if (server) await waitForServer(baseEditorUrl, server)

  const browser = await launchSmokeBrowser(smokeBrowser)
  const consoleErrors = []
  const pageErrors = []
  const resourceErrors = []

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
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

    const variant = await runThaiRepeatLifecycle(page)
    const failedComparisons = variant.comparisons.filter((comparison) => !comparison.equal)
    const ignoredResourceErrors = resourceErrors.filter((error) => isIgnoredResourceError(error))
    const activeResourceErrors = resourceErrors.filter((error) => !isIgnoredResourceError(error))
    const ignoredConsoleErrors = consoleErrors.filter((error) => isIgnorableConsoleError(error, ignoredResourceErrors))
    const activeConsoleErrors = consoleErrors.filter((error) => !isIgnorableConsoleError(error, ignoredResourceErrors))

    const report = {
      ok: activeConsoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        activeResourceErrors.length === 0 &&
        failedComparisons.length === 0,
      browser: {
        mode: smokeBrowserLabel(smokeBrowser),
        channel: smokeBrowser.channel ?? null,
        executablePath: smokeBrowser.executablePath ?? null,
        headless,
      },
      targetNodeId: TARGET_NODE_ID,
      variant,
      failedComparisons,
      console: {
        errors: activeConsoleErrors.map((error) => error.text),
        pageErrors,
      },
      resourceErrors: activeResourceErrors,
      ignoredConsoleErrors: ignoredConsoleErrors.map((error) => error.text),
      ignoredResourceErrors,
    }

    process.stdout.write(JSON.stringify(report, null, 2) + "\n")
    if (!report.ok) process.exitCode = 1
  } finally {
    await browser.close()
    if (server) await stopServer(server)
  }
}

runProbe().catch((error) => {
  console.error("[wysiwyg-thai-repeat-reenter-probe] failed:", error.message)
  process.exitCode = 1
})
