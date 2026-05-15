import { chromium } from "playwright"

const STORAGE_KEY = "flowdoc_document"
const DEFAULT_BASE_URL = "http://localhost:4000/editor"
const BASE_URL = process.env.DIAG_BASE_URL ?? process.env.SMOKE_BASE_URL ?? DEFAULT_BASE_URL
const HEADLESS = process.env.HEADED !== "1"
const TARGET_ONE_ID = "diag-click-p1"
const TARGET_TWO_ID = "diag-click-p2"

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

function makeDiagnosticDocument() {
  const firstText = [
    "ส".repeat(95),
    "ว".repeat(86),
    "า".repeat(42),
    "สสสสสสส",
    "า".repeat(80),
  ].join("")
  const secondText = [
    "New paragraph",
    "ห".repeat(35),
    "ฟ".repeat(82),
    "ห".repeat(35),
    "ก".repeat(82),
    "ำ".repeat(28),
    "ไ".repeat(35),
    "ก".repeat(55),
  ].join("")

  return {
    version: 1,
    document: {
      id: "diag-click-doc",
      meta: { title: "WYSIWYG Click Diagnostic" },
      sections: [{
        id: "diag-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(36), bottom: pt(72), left: pt(36) },
        },
        bodyRootId: "diag-body",
        nodes: {
          "diag-body": {
            id: "diag-body",
            type: "body",
            props: {},
            childIds: [TARGET_ONE_ID, TARGET_TWO_ID],
          },
          [TARGET_ONE_ID]: paragraph(TARGET_ONE_ID, firstText),
          [TARGET_TWO_ID]: paragraph(TARGET_TWO_ID, secondText),
        },
      }],
    },
  }
}

async function collectSnapshot(page, label) {
  return await page.evaluate(({ label, targetOneId, targetTwoId }) => {
    const attr = (el, name) => el?.getAttribute(name) ?? null
    const shell = document.querySelector('[data-testid="editor-shell"]')
    const textareas = Array.from(document.querySelectorAll('textarea[data-inline-edit-node-id]')).map((el) => ({
      nodeId: attr(el, "data-inline-edit-node-id"),
      visualMode: attr(el, "data-inline-edit-visual-mode"),
      fallbackReason: attr(el, "data-inline-edit-fallback-reason"),
      wysiwygInline: attr(el, "data-wysiwyg-inline-edit-enabled"),
      wysiwygTextEngine: attr(el, "data-wysiwyg-text-engine-enabled"),
      valueLength: el.value.length,
      rect: rectOf(el),
    }))
    const textEngineLayers = Array.from(document.querySelectorAll('[data-wysiwyg-text-engine-layer="true"]')).map((el) => ({
      nodeId: attr(el, "data-inline-edit-node-id"),
      reflowKind: attr(el, "data-wysiwyg-reflow-kind"),
      pointerFragmentCount: attr(el, "data-wysiwyg-pointer-fragment-count"),
      rect: rectOf(el),
    }))
    const bridges = Array.from(document.querySelectorAll('[data-wysiwyg-input-bridge="true"]')).map((el) => ({
      nodeId: attr(el, "data-inline-edit-node-id"),
      textLength: el.textContent?.length ?? 0,
      rect: rectOf(el),
    }))

    function rectOf(el) {
      const rect = el.getBoundingClientRect()
      return {
        x: round(rect.x),
        y: round(rect.y),
        width: round(rect.width),
        height: round(rect.height),
      }
    }

    function round(value) {
      return Math.round(value * 100) / 100
    }

    function uniqueValues(values) {
      return Array.from(new Set(values.filter((value) => value != null && value !== "")))
    }

    function fragmentSnapshot(nodeId) {
      return Array.from(document.querySelectorAll(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`)).map((el) => {
        const renderedLines = Array.from(el.querySelectorAll('text[fill="#1e40af"]')).map((textEl) => ({
          textLength: textEl.textContent?.length ?? 0,
          textPreview: (textEl.textContent ?? "").slice(0, 24),
          x: attr(textEl, "x"),
          y: attr(textEl, "y"),
          fontSize: attr(textEl, "font-size") ?? attr(textEl, "fontSize"),
        }))
        return {
          nodeId,
          nodeType: attr(el, "data-node-type"),
          pageIndex: attr(el, "data-page-index"),
          fragmentIndex: attr(el, "data-fragment-index"),
          lineStart: attr(el, "data-line-start"),
          lineEnd: attr(el, "data-line-end"),
          parentNodeId: attr(el, "data-parent-node-id"),
          rect: rectOf(el),
          renderedLineCount: renderedLines.length,
          renderedLines,
        }
      })
    }

    return {
      label,
      activeElement: document.activeElement
        ? {
            tagName: document.activeElement.tagName,
            testId: attr(document.activeElement, "data-testid"),
            nodeId: attr(document.activeElement, "data-inline-edit-node-id"),
          }
        : null,
      shell: {
        wysiwygInlineEditEnabled: attr(shell, "data-wysiwyg-inline-edit-enabled"),
        wysiwygTextEngineEnabled: attr(shell, "data-wysiwyg-text-engine-enabled"),
      },
      counts: {
        textarea: textareas.length,
        textEngineLayer: textEngineLayers.length,
        bridge: bridges.length,
      },
      modes: {
        textareaVisualModes: uniqueValues(textareas.map((item) => item.visualMode)),
        textareaFallbackReasons: uniqueValues(textareas.map((item) => item.fallbackReason)),
        textEngineReflowKinds: uniqueValues(textEngineLayers.map((item) => item.reflowKind)),
      },
      textareas,
      textEngineLayers,
      bridges,
      fragments: {
        [targetOneId]: fragmentSnapshot(targetOneId),
        [targetTwoId]: fragmentSnapshot(targetTwoId),
      },
    }
  }, { label, targetOneId: TARGET_ONE_ID, targetTwoId: TARGET_TWO_ID })
}

function summarizeSnapshot(snapshot) {
  const first = snapshot.fragments[TARGET_ONE_ID]
  const second = snapshot.fragments[TARGET_TWO_ID]
  return {
    label: snapshot.label,
    engine: snapshot.shell.wysiwygTextEngineEnabled,
    inline: snapshot.shell.wysiwygInlineEditEnabled,
    counts: snapshot.counts,
    modes: snapshot.modes,
    activeElement: snapshot.activeElement,
    firstFragments: first.map((fragment) => ({
      pageIndex: fragment.pageIndex,
      lineStart: fragment.lineStart,
      lineEnd: fragment.lineEnd,
      renderedLineCount: fragment.renderedLineCount,
      rect: fragment.rect,
    })),
    secondFragments: second.map((fragment) => ({
      pageIndex: fragment.pageIndex,
      lineStart: fragment.lineStart,
      lineEnd: fragment.lineEnd,
      renderedLineCount: fragment.renderedLineCount,
      rect: fragment.rect,
    })),
  }
}

function compareFragmentSummaries(left, right, nodeId) {
  const leftFragments = left.fragments[nodeId]
  const rightFragments = right.fragments[nodeId]
  return JSON.stringify(leftFragments.map(fragmentKey)) === JSON.stringify(rightFragments.map(fragmentKey))
}

function fragmentKey(fragment) {
  return {
    pageIndex: fragment.pageIndex,
    lineStart: fragment.lineStart,
    lineEnd: fragment.lineEnd,
    renderedLineCount: fragment.renderedLineCount,
    rect: fragment.rect,
    lineYs: fragment.renderedLines.map((line) => line.y),
    lineTextLengths: fragment.renderedLines.map((line) => line.textLength),
  }
}

async function clickFragment(page, nodeId) {
  const locator = page.locator(`[data-testid="editor-fragment"][data-node-id="${nodeId}"]`).first()
  await locator.waitFor({ state: "attached", timeout: 15000 })
  await locator.click()
  await page.waitForTimeout(250)
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS })
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } })
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(`[browser:${message.type()}] ${message.text()}`)
    }
  })
  page.on("pageerror", (error) => console.error(`[pageerror] ${error.message}`))

  try {
    await page.addInitScript(({ key, doc }) => {
      window.localStorage.clear()
      window.localStorage.setItem(key, JSON.stringify(doc))
    }, { key: STORAGE_KEY, doc: makeDiagnosticDocument() })

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" })
    await page.locator('[data-testid="editor-shell"]').waitFor({ state: "visible", timeout: 15000 })
    await page.locator('[data-testid="editor-canvas"]').waitFor({ state: "visible", timeout: 15000 })
    await page.locator(`[data-testid="editor-fragment"][data-node-id="${TARGET_ONE_ID}"]`).first().waitFor({ state: "attached", timeout: 15000 })
    await page.waitForTimeout(500)

    const snapshots = []
    snapshots.push(await collectSnapshot(page, "initial"))

    await clickFragment(page, TARGET_ONE_ID)
    snapshots.push(await collectSnapshot(page, "after-click-first"))

    await page.keyboard.press("Escape")
    await page.waitForTimeout(250)
    snapshots.push(await collectSnapshot(page, "after-escape-first"))

    await clickFragment(page, TARGET_TWO_ID)
    snapshots.push(await collectSnapshot(page, "after-click-second"))

    const summary = snapshots.map(summarizeSnapshot)
    const verdict = {
      textEngineEnabled: snapshots[0].shell.wysiwygTextEngineEnabled,
      firstClickMountedTextarea: snapshots[1].counts.textarea > 0,
      firstClickMountedTextEngineLayer: snapshots[1].counts.textEngineLayer > 0,
      firstGeometryStableOnClick: compareFragmentSummaries(snapshots[0], snapshots[1], TARGET_ONE_ID),
      secondClickMountedTextarea: snapshots[3].counts.textarea > 0,
      secondClickMountedTextEngineLayer: snapshots[3].counts.textEngineLayer > 0,
      secondGeometryStableOnClick: compareFragmentSummaries(snapshots[2], snapshots[3], TARGET_TWO_ID),
    }

    console.log(JSON.stringify({ baseUrl: BASE_URL, targetNodeIds: [TARGET_ONE_ID, TARGET_TWO_ID], verdict, summary, snapshots }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
