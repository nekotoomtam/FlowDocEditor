import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSmokeBrowserConfig, launchSmokeBrowser, smokeBrowserLabel } from "./smoke-browser.mjs"

// Captures edit/show line geometry around an exit + re-enter cycle. This is a
// diagnostic probe for the user-reported symptom where a paragraph can wrap
// differently after leaving WYSIWYG edit mode and entering it again.

const DEFAULT_PORT = 4018
const TARGET_NODE_ID = "stage3-boundary-target"
const SCENARIO_ID = "wysiwyg-stage3-boundary"
const FIRST_MARKER = "REENTER_A_MARKER"
const SECOND_MARKER = "REENTER_B_MARKER"
const FIRST_INSERT_WORDS = Number(process.env.REENTER_FIRST_INSERT_WORDS ?? 90)
const SECOND_INSERT_WORDS = Number(process.env.REENTER_SECOND_INSERT_WORDS ?? 45)
const GRADUAL_MAX_WORDS = Number(process.env.REENTER_GRADUAL_MAX_WORDS ?? 40)
const REPEATED_KEY_MAX_PRESSES = Number(process.env.REENTER_REPEAT_MAX_PRESSES ?? 260)
const FIRST_INSERT = buildInsertText(FIRST_MARKER, "alpha", FIRST_INSERT_WORDS)
const SECOND_INSERT = buildInsertText(SECOND_MARKER, "delta", SECOND_INSERT_WORDS)
const GRADUAL_MARKER = "REENTERGRADUALMARKER"
const GRADUAL_INSERT_MARKER = "REENTERGRADUALINSERT"
const REPEATED_KEY_MARKER = "REENTERREPEATMARKER"
const REPEATED_KEY_INSERT_MARKER = "REENTERREPEATINSERT"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const smokePort = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT)
const baseEditorUrl = process.env.SMOKE_BASE_URL ?? `http://localhost:${smokePort}/editor`
const shouldStartServer = process.env.SMOKE_BASE_URL == null
const headless = process.env.HEADED !== "1"
const smokeBrowser = getSmokeBrowserConfig({ headless })
const verboseSnapshots = process.env.REENTER_VERBOSE === "1"

const shellSelector = '[data-testid="editor-shell"]'
const fragmentSelector = `[data-testid="editor-fragment"][data-node-id="${TARGET_NODE_ID}"]`
const bridgeSelector = `[data-wysiwyg-input-bridge="true"][data-inline-edit-node-id="${TARGET_NODE_ID}"]`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function buildInsertText(marker, prefix, wordCount) {
  const words = Array.from({ length: wordCount }, (_, index) => `${prefix}${index + 1}`)
  return ` ${marker} ${words.join(" ")}`
}

function scenarioUrl() {
  const url = new URL(baseEditorUrl)
  url.searchParams.set("flowdocTestScenario", SCENARIO_ID)
  return url.toString()
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

function canonicalSnapshot(snapshot) {
  return snapshot.fragments.map((fragment) => ({
    pageIndex: fragment.pageIndex,
    lineStart: fragment.lineStart,
    lineEnd: fragment.lineEnd,
    lines: fragment.lines.map((line) => ({
      text: line.text,
      x: line.x,
      y: line.y,
      fontSize: line.fontSize,
      textAnchor: line.textAnchor,
    })),
  }))
}

function snapshotKey(snapshot) {
  return JSON.stringify(canonicalSnapshot(snapshot))
}

function firstMismatch(leftValue, rightValue, pathLabel = "root") {
  if (Object.is(leftValue, rightValue)) return null
  if (typeof leftValue !== typeof rightValue) {
    return { path: pathLabel, left: leftValue, right: rightValue }
  }
  if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
    if (!Array.isArray(leftValue) || !Array.isArray(rightValue)) {
      return { path: pathLabel, left: leftValue, right: rightValue }
    }
    if (leftValue.length !== rightValue.length) {
      return { path: `${pathLabel}.length`, left: leftValue.length, right: rightValue.length }
    }
    for (let index = 0; index < leftValue.length; index += 1) {
      const mismatch = firstMismatch(leftValue[index], rightValue[index], `${pathLabel}[${index}]`)
      if (mismatch) return mismatch
    }
    return null
  }
  if (leftValue && rightValue && typeof leftValue === "object") {
    const keys = Array.from(new Set([...Object.keys(leftValue), ...Object.keys(rightValue)])).sort()
    for (const key of keys) {
      const mismatch = firstMismatch(leftValue[key], rightValue[key], `${pathLabel}.${key}`)
      if (mismatch) return mismatch
    }
    return null
  }
  return { path: pathLabel, left: leftValue, right: rightValue }
}

function compareSnapshots(name, leftLabel, leftSnapshot, rightLabel, rightSnapshot) {
  const leftCanonical = canonicalSnapshot(leftSnapshot)
  const rightCanonical = canonicalSnapshot(rightSnapshot)
  const equal = JSON.stringify(leftCanonical) === JSON.stringify(rightCanonical)
  return {
    name,
    left: leftLabel,
    right: rightLabel,
    equal,
    leftFragmentCount: leftSnapshot.fragments.length,
    rightFragmentCount: rightSnapshot.fragments.length,
    leftLineCount: leftSnapshot.fragments.reduce((sum, fragment) => sum + fragment.lines.length, 0),
    rightLineCount: rightSnapshot.fragments.reduce((sum, fragment) => sum + fragment.lines.length, 0),
    firstMismatch: equal ? null : firstMismatch(leftCanonical, rightCanonical),
  }
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

async function expectNoLayoutError(page) {
  assert(await page.getByTestId("layout-error-badge").count() === 0, "layout error badge is visible")
}

async function expectBodyContains(page, text) {
  try {
    await page.waitForFunction((expected) => document.body.textContent?.includes(expected), text, { timeout: 10000 })
  } catch (error) {
    throw new Error(`Timed out waiting for document body to contain "${text}": ${error.message}`)
  }
}

async function expectTargetFragmentCountAtLeast(page, minimumCount) {
  try {
    await page.waitForFunction(
      ({ selector, minimumCount }) => document.querySelectorAll(selector).length >= minimumCount,
      { selector: fragmentSelector, minimumCount },
      { timeout: 15000 },
    )
  } catch (error) {
    const count = await page.locator(fragmentSelector).count()
    throw new Error(`Timed out waiting for target fragment count >= ${minimumCount}; current count is ${count}: ${error.message}`)
  }
}

async function enterTargetEdit(page) {
  await page.locator(fragmentSelector).first().click()
  await focusTargetBridge(page)
}

async function focusTargetBridge(page) {
  await page.locator(bridgeSelector).waitFor({ state: "attached", timeout: 10000 })
  await page.locator(bridgeSelector).focus()
  await page.waitForFunction((selector) => document.activeElement === document.querySelector(selector), bridgeSelector, { timeout: 5000 })
}

async function exitTargetEdit(page) {
  await page.keyboard.press("Escape")
  await page.locator(bridgeSelector).waitFor({ state: "detached", timeout: 10000 })
}

function totalLineCount(snapshot) {
  return snapshot.fragments.reduce((sum, fragment) => sum + fragment.lines.length, 0)
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
        lineTexts: fragment.lines.map((line) => line.text),
        lineGeometry: fragment.lines.map((line) => ({
          x: line.x,
          y: line.y,
          fontSize: line.fontSize,
          textAnchor: line.textAnchor,
        })),
      })),
    },
  ]))
}

function summarizeSnapshotCounts(snapshots) {
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

function withoutSnapshot(result) {
  const { snapshot: _snapshot, ...rest } = result
  return rest
}

async function typeTextWithKeyboard(page, text, delayMs = 8) {
  const parts = text.split("\n")
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]) await page.keyboard.type(parts[index], { delay: delayMs })
    if (index < parts.length - 1) await page.keyboard.press("Enter")
  }
}

async function typeWordsUntilLineCountIncreases(page, { marker, prefix, maxWords, delayMs = 8 }) {
  const before = await waitForStableSnapshot(page, `${marker}:before-gradual-type`, { expectEditing: true })
  const beforeLineCount = totalLineCount(before)
  const beforeFragmentCount = before.fragments.length
  await focusTargetBridge(page)
  await typeTextWithKeyboard(page, ` ${marker}`, delayMs)

  let typedWords = 0
  let latest = before
  for (let index = 1; index <= maxWords; index += 1) {
    await typeTextWithKeyboard(page, ` ${prefix}${index}`, delayMs)
    typedWords = index
    if (index % 2 !== 0) continue
    await page.waitForTimeout(40)
    latest = await captureSnapshot(page, `${marker}:typing-${index}`)
    if (totalLineCount(latest) > beforeLineCount || latest.fragments.length > beforeFragmentCount) break
  }

  const after = await waitForStableSnapshot(page, `${marker}:after-gradual-type`, { expectEditing: true })
  const afterLineCount = totalLineCount(after)
  const afterFragmentCount = after.fragments.length
  assert(
    afterLineCount > beforeLineCount || afterFragmentCount > beforeFragmentCount,
    `${marker} did not wrap naturally after ${typedWords} words; before ${beforeFragmentCount}/${beforeLineCount}, after ${afterFragmentCount}/${afterLineCount}`,
  )
  await expectBodyContains(page, marker)

  return {
    snapshot: after,
    typedWords,
    beforeFragmentCount,
    afterFragmentCount,
    beforeLineCount,
    afterLineCount,
  }
}

async function pressRepeatedKeyUntilLineCountIncreases(page, { marker, key = "A", maxPresses, delayMs = 6 }) {
  const before = await waitForStableSnapshot(page, `${marker}:before-repeat`, { expectEditing: true })
  const beforeLineCount = totalLineCount(before)
  const beforeFragmentCount = before.fragments.length
  await focusTargetBridge(page)
  await typeTextWithKeyboard(page, ` ${marker} `, delayMs)

  let presses = 0
  let latest = before
  for (let index = 1; index <= maxPresses; index += 1) {
    await page.keyboard.press(key)
    presses = index
    if (delayMs > 0) await page.waitForTimeout(delayMs)
    if (index % 10 !== 0) continue
    latest = await captureSnapshot(page, `${marker}:repeat-${index}`)
    if (totalLineCount(latest) > beforeLineCount || latest.fragments.length > beforeFragmentCount) break
  }

  const after = await waitForStableSnapshot(page, `${marker}:after-repeat`, { expectEditing: true })
  const afterLineCount = totalLineCount(after)
  const afterFragmentCount = after.fragments.length
  assert(
    afterLineCount > beforeLineCount || afterFragmentCount > beforeFragmentCount,
    `${marker} did not wrap from repeated ${key} key presses after ${presses} presses; before ${beforeFragmentCount}/${beforeLineCount}, after ${afterFragmentCount}/${afterLineCount}`,
  )
  await expectBodyContains(page, marker)

  return {
    snapshot: after,
    key,
    presses,
    beforeFragmentCount,
    afterFragmentCount,
    beforeLineCount,
    afterLineCount,
  }
}

async function insertNewLineAtCurrentCaret(page, { marker, text }) {
  const before = await waitForStableSnapshot(page, `${marker}:before-line-insert`, { expectEditing: true })
  await focusTargetBridge(page)
  await page.keyboard.press("Enter")
  await typeTextWithKeyboard(page, `${marker} ${text}`, 8)
  await expectBodyContains(page, marker)
  const after = await waitForStableSnapshot(page, `${marker}:after-line-insert`, { expectEditing: true })
  return {
    snapshot: after,
    beforeLineCount: totalLineCount(before),
    afterLineCount: totalLineCount(after),
    beforeFragmentCount: before.fragments.length,
    afterFragmentCount: after.fragments.length,
  }
}

async function openScenario(page) {
  await page.goto(scenarioUrl(), { waitUntil: "domcontentloaded" })
  const shell = page.locator(shellSelector)
  await shell.waitFor({ state: "visible", timeout: 15000 })
  assert(await shell.getAttribute("data-editor-test-scenario") === SCENARIO_ID, "expected Stage 3 boundary scenario")
  assert(await shell.getAttribute("data-wysiwyg-text-engine-enabled") === "true", "text engine flag is not enabled")
  assert(await shell.getAttribute("data-wysiwyg-perf-trace-enabled") === "true", "perf trace flag is not enabled")
  await page.locator(fragmentSelector).first().waitFor({ state: "attached", timeout: 15000 })
  await expectNoLayoutError(page)
}

async function runLifecycleVariant(page, variant) {
  await openScenario(page)

  const snapshots = {}
  const typing = {}
  snapshots.preEditShow = await waitForStableSnapshot(page, `${variant.name}:preEditShow`, { expectEditing: false })

  await enterTargetEdit(page)
  snapshots.firstEditEntry = await waitForStableSnapshot(page, `${variant.name}:firstEditEntry`, { expectEditing: true })

  typing.first = await variant.typeFirstDraft(page)
  snapshots.firstEditAfterType = typing.first.snapshot

  await exitTargetEdit(page)
  snapshots.postFirstExit = await waitForStableSnapshot(page, `${variant.name}:postFirstExit`, { expectEditing: false })

  await enterTargetEdit(page)
  snapshots.secondEditEntry = await waitForStableSnapshot(page, `${variant.name}:secondEditEntry`, { expectEditing: true })

  typing.second = await variant.typeSecondDraft(page)
  snapshots.secondEditAfterType = typing.second.snapshot

  await exitTargetEdit(page)
  snapshots.postSecondExit = await waitForStableSnapshot(page, `${variant.name}:postSecondExit`, { expectEditing: false })
  await expectNoLayoutError(page)

  const comparisons = [
    compareSnapshots(`${variant.name}: show vs first edit entry`, "preEditShow", snapshots.preEditShow, "firstEditEntry", snapshots.firstEditEntry),
    compareSnapshots(`${variant.name}: first edit draft vs post first exit`, "firstEditAfterType", snapshots.firstEditAfterType, "postFirstExit", snapshots.postFirstExit),
    compareSnapshots(`${variant.name}: post first exit vs second edit entry`, "postFirstExit", snapshots.postFirstExit, "secondEditEntry", snapshots.secondEditEntry),
    compareSnapshots(`${variant.name}: second edit draft vs post second exit`, "secondEditAfterType", snapshots.secondEditAfterType, "postSecondExit", snapshots.postSecondExit),
  ]

  return {
    name: variant.name,
    description: variant.description,
    ok: comparisons.every((comparison) => comparison.equal),
    typing: {
      first: withoutSnapshot(typing.first),
      second: withoutSnapshot(typing.second),
    },
    comparisons,
    snapshots: verboseSnapshots ? summarizeSnapshots(snapshots) : summarizeSnapshotCounts(snapshots),
  }
}

const variants = [
  {
    name: "page-boundary-bulk-keyboard-type",
    description: "Baseline: type a long payload through keyboard.type until the paragraph crosses a page boundary, then append another payload after re-enter.",
    async typeFirstDraft(page) {
      await focusTargetBridge(page)
      await page.keyboard.press("End")
      await typeTextWithKeyboard(page, FIRST_INSERT, 2)
      await expectBodyContains(page, FIRST_MARKER)
      await expectTargetFragmentCountAtLeast(page, 2)
      const snapshot = await waitForStableSnapshot(page, "page-boundary-bulk:first-after", { expectEditing: true })
      return {
        snapshot,
        marker: FIRST_MARKER,
        words: FIRST_INSERT_WORDS,
        requiresPageBoundary: true,
        fragmentCount: snapshot.fragments.length,
        lineCount: totalLineCount(snapshot),
      }
    },
    async typeSecondDraft(page) {
      await focusTargetBridge(page)
      await page.keyboard.press("End")
      await typeTextWithKeyboard(page, SECOND_INSERT, 2)
      await expectBodyContains(page, SECOND_MARKER)
      const snapshot = await waitForStableSnapshot(page, "page-boundary-bulk:second-after", { expectEditing: true })
      return {
        snapshot,
        marker: SECOND_MARKER,
        words: SECOND_INSERT_WORDS,
        fragmentCount: snapshot.fragments.length,
        lineCount: totalLineCount(snapshot),
      }
    },
  },
  {
    name: "gradual-word-wrap-then-line-insert",
    description: "User-like: type words gradually until wrapping happens by itself, exit, re-enter, then press Enter and insert a new line at the clicked caret.",
    async typeFirstDraft(page) {
      await focusTargetBridge(page)
      await page.keyboard.press("End")
      return typeWordsUntilLineCountIncreases(page, {
        marker: GRADUAL_MARKER,
        prefix: "wrapword",
        maxWords: GRADUAL_MAX_WORDS,
      })
    },
    async typeSecondDraft(page) {
      return insertNewLineAtCurrentCaret(page, {
        marker: GRADUAL_INSERT_MARKER,
        text: "new line inserted after reenter by gradual variant",
      })
    },
  },
  {
    name: "repeated-key-wrap-then-line-insert",
    description: "User-like: send repeated key presses until a long typed run wraps, exit, re-enter, then press Enter and insert a new line at the clicked caret.",
    async typeFirstDraft(page) {
      await focusTargetBridge(page)
      await page.keyboard.press("End")
      return pressRepeatedKeyUntilLineCountIncreases(page, {
        marker: REPEATED_KEY_MARKER,
        key: "A",
        maxPresses: REPEATED_KEY_MAX_PRESSES,
      })
    },
    async typeSecondDraft(page) {
      return insertNewLineAtCurrentCaret(page, {
        marker: REPEATED_KEY_INSERT_MARKER,
        text: "new line inserted after repeated key reenter",
      })
    },
  },
]

async function runProbe() {
  const server = shouldStartServer ? startNextDevServer() : null
  if (server) await waitForServer(baseEditorUrl, server)

  const browser = await launchSmokeBrowser(smokeBrowser)
  const consoleErrors = []
  const pageErrors = []
  const resourceErrors = []

  try {
    const page = await browser.newPage()
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

    const variantReports = []
    for (const variant of variants) {
      variantReports.push(await runLifecycleVariant(page, variant))
    }
    const failedComparisons = variantReports.flatMap((variant) =>
      variant.comparisons
        .filter((comparison) => !comparison.equal)
        .map((comparison) => ({ variant: variant.name, ...comparison })),
    )
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
      scenario: SCENARIO_ID,
      targetNodeId: TARGET_NODE_ID,
      verboseSnapshots,
      variants: variantReports,
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
  console.error("[wysiwyg-reenter-drift-probe] failed:", error.message)
  process.exitCode = 1
})
