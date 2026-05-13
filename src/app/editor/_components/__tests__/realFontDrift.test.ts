import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { defaultWordBreaker, type TextMeasurer } from "@/layout"
import { createFontkitMeasurer } from "@/layout/font-measurer"
import { paginateDocument, type PaginatedDocument } from "@/pagination"
import { pt, type DocumentNode, type LayoutNode, type ParagraphNode } from "@/schema"
import { resolveRuntimeFontPath } from "../../../api/runtimeFont"
import { comparePagination } from "../comparePagination"

interface Browser {
  newPage(): Promise<Page>
  close(): Promise<void>
}

interface Page {
  evaluate<TArg, TResult>(
    callback: (arg: TArg) => TResult | Promise<TResult>,
    arg: TArg,
  ): Promise<TResult>
  setContent(html: string): Promise<void>
}

interface ChromiumRuntime {
  executablePath(): string
  launch(options: { headless: boolean }): Promise<Browser>
}

const FONT_FAMILY = "FlowDocRealFontDrift"
const FONT_PATH = resolveRuntimeFontPath()
const WIDTH_KEY_SEPARATOR = "\u0000"
const chromium = loadOptionalChromium()
const CAN_RUN_REAL_FONT_DRIFT = chromiumExecutableExists()

function loadOptionalChromium(): ChromiumRuntime | null {
  try {
    const require = createRequire(import.meta.url)
    return (require("playwright") as { chromium?: ChromiumRuntime }).chromium ?? null
  } catch {
    return null
  }
}

function chromiumExecutableExists(): boolean {
  if (!chromium) return false
  try {
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

function widthKey(fontSize: number, text: string): string {
  return `${fontSize}${WIDTH_KEY_SEPARATOR}${text}`
}

function parseWidthKey(key: string): { fontSize: number; text: string } {
  const separatorIndex = key.indexOf(WIDTH_KEY_SEPARATOR)
  return {
    fontSize: Number(key.slice(0, separatorIndex)),
    text: key.slice(separatorIndex + WIDTH_KEY_SEPARATOR.length),
  }
}

function makeCachedBrowserMeasurer(widths: Map<string, number>, missing: Set<string>): TextMeasurer {
  return {
    measureText(text, _fontFamilyKey, fontSize) {
      const key = widthKey(fontSize, text)
      const width = widths.get(key)
      if (width == null) {
        missing.add(key)
        return { width: 0 }
      }
      return { width }
    },
    measureLineHeight(_fontFamilyKey, fontSize, lineHeightRatio) {
      return fontSize * lineHeightRatio
    },
  }
}

async function measureBrowserWidths(page: Page, requests: Array<{ fontSize: number; text: string }>): Promise<Map<string, number>> {
  const rows = await page.evaluate(
    ({ family, requests }: { family: string; requests: Array<{ fontSize: number; text: string }> }) => {
      const canvas = document.querySelector<HTMLCanvasElement>("#measure")!
      const context = canvas.getContext("2d")!
      return requests.map(({ fontSize, text }) => {
        context.font = `${fontSize}px "${family}", sans-serif`
        return { fontSize, text, width: context.measureText(text).width }
      })
    },
    { family: FONT_FAMILY, requests },
  )

  return new Map(rows.map(({ fontSize, text, width }) => [widthKey(fontSize, text), width]))
}

async function fillMissingWidths(page: Page, missing: Set<string>, widths: Map<string, number>): Promise<void> {
  if (missing.size === 0) return
  const requests = [...missing].map(parseWidthKey)
  const measured = await measureBrowserWidths(page, requests)
  for (const [key, width] of measured) widths.set(key, width)
}

async function paginateWithBrowserCanvas(page: Page, doc: DocumentNode): Promise<PaginatedDocument> {
  const widths = new Map<string, number>()

  for (let attempt = 0; attempt < 8; attempt++) {
    const missing = new Set<string>()
    const result = paginateDocument(doc, makeCachedBrowserMeasurer(widths, missing), defaultWordBreaker)
    if (missing.size === 0) return result
    await fillMissingWidths(page, missing, widths)
  }

  throw new Error("browser text measurement cache did not converge")
}

function makePara(id: string, text: string, fontSize = 12): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(fontSize),
      fontFamilyKey: "default",
      lineHeight: 1.35,
      spacingBefore: pt(0),
      spacingAfter: pt(6),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeDoc(paragraphs: ParagraphNode[]): DocumentNode {
  const nodes: Record<string, LayoutNode> = {}
  const childIds: string[] = []
  for (const paragraph of paragraphs) {
    nodes[paragraph.id] = paragraph
    childIds.push(paragraph.id)
  }

  return {
    version: 1,
    document: {
      id: "real-font-drift-doc",
      sections: [{
        id: "real-font-section",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds },
          ...nodes,
        },
      }],
    },
  }
}

describe.skipIf(!CAN_RUN_REAL_FONT_DRIFT)("real-font Thai browser/server drift", () => {
  let browser: Browser
  let page: Page
  let fontBuffer: Buffer

  beforeAll(async () => {
    fontBuffer = readFileSync(FONT_PATH)
    if (!chromium) throw new Error("playwright chromium runtime is unavailable")
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()

    const fontDataUrl = `data:font/truetype;base64,${fontBuffer.toString("base64")}`
    await page.setContent(`
      <style>
        @font-face {
          font-family: "${FONT_FAMILY}";
          src: url("${fontDataUrl}") format("truetype");
        }
      </style>
      <canvas id="measure"></canvas>
    `)
    await page.evaluate(async (family: string) => {
      await document.fonts.load(`12px "${family}"`)
      await document.fonts.ready
    }, FONT_FAMILY)
  }, 30000)

  afterAll(async () => {
    await browser?.close()
  })

  it("keeps canvas and fontkit widths within a sub-point tolerance for representative Thai text", async () => {
    const serverMeasurer = createFontkitMeasurer(fontBuffer)
    const cases = [
      { fontSize: 10, text: "สวัสดีครับ เอกสารราชการไทย 12345" },
      { fontSize: 10, text: "เลขที่ 1234567890 กขคงจ ฉบับทดสอบ" },
      { fontSize: 12, text: "การวัดข้อความไทยผสม English และตัวเลข 123" },
      { fontSize: 12, text: "ก".repeat(80) },
      { fontSize: 14, text: "A".repeat(90) },
    ]
    const browserWidths = await measureBrowserWidths(page, cases)

    const maxDelta = cases.reduce((max, { fontSize, text }) => {
      const browserWidth = browserWidths.get(widthKey(fontSize, text))!
      const serverWidth = serverMeasurer.measureText(text, "default", fontSize).width
      return Math.max(max, Math.abs(serverWidth - browserWidth))
    }, 0)

    expect(maxDelta).toBeLessThan(0.05)
  })

  it("reports no pagination drift for a representative Thai document when both sides use THSarabun", async () => {
    const doc = makeDoc([
      makePara("thai-intro", "รายงานสรุปผลการดำเนินงานประจำเดือน พฤษภาคม 2569 สำหรับตรวจสอบการตัดบรรทัดภาษาไทย"),
      makePara("thai-mixed", "เลขที่เอกสาร FD-2569-0001 อ้างอิง API Export และ WYSIWYG preview ในระบบเดียวกัน"),
      makePara("thai-long", "การทดสอบข้อความไทยยาวต่อเนื่องเพื่อดูการตัดคำและการขึ้นบรรทัดใหม่ในกรณีที่มีภาษาไทยผสมตัวเลข1234567890".repeat(2)),
      makePara("thai-token", "ก".repeat(90)),
    ])

    const browserPaginated = await paginateWithBrowserCanvas(page, doc)
    const serverPaginated = paginateDocument(doc, createFontkitMeasurer(fontBuffer), defaultWordBreaker)
    const report = comparePagination(browserPaginated, serverPaginated)

    expect(report.driftCount).toBe(0)
    expect(report.geometryDriftMap.size).toBe(0)
    expect(report.pageBreakChanged).toBe(false)
    expect(report.continuationChangedCount).toBe(0)
  })
})
