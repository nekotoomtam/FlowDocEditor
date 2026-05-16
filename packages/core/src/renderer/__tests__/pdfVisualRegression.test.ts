import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { paginateDocument } from "../../pagination"
import { pt } from "../../schema"
import type { DocumentNode, LayoutNode, ParagraphNode } from "../../schema"
import { PdfRenderer, resolveFragmentBoxDrawingPrimitives, resolveParagraphBoxDrawingPrimitives } from "../pdf"

const ENABLE_PDF_VISUAL_REGRESSION = process.env.FLOWDOC_PDF_VISUAL_REGRESSION === "1"
const PDF_RASTER_DPI = 96

interface Rasterizer {
  name: string
  render(pdfPath: string, pngPath: string): void
}

interface PngImage {
  width: number
  height: number
  rgba: Uint8Array
}

interface Rgb {
  r: number
  g: number
  b: number
}

const describePdfVisual = ENABLE_PDF_VISUAL_REGRESSION ? describe : describe.skip

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(12), right: pt(12), bottom: pt(12), left: pt(12) },
}

let tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  tempDirs = []
})

function commandCanStart(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "ignore" })
  return result.error == null
}

function ghostscriptCanStart(): boolean {
  return commandCanStart("gswin64c", ["-version"]) ||
    commandCanStart("gswin32c", ["-version"]) ||
    commandCanStart("gs", ["--version"])
}

function runRasterCommand(command: string, args: string[], failureHint: string): void {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.error || result.status !== 0) {
    throw new Error([
      `PDF raster visual regression could not rasterize with ${command}.`,
      result.error ? `Error: ${result.error.message}` : null,
      result.stderr ? `stderr: ${result.stderr.trim()}` : null,
      failureHint,
    ].filter(Boolean).join("\n"))
  }
}

function findRasterizer(): Rasterizer | null {
  const pdftoppmCommand = process.env.FLOWDOC_PDFTOPPM_PATH?.trim() || "pdftoppm"
  if (commandCanStart(pdftoppmCommand, ["-v"])) {
    return {
      name: "pdftoppm",
      render(pdfPath, pngPath) {
        const prefix = pngPath.replace(/\.png$/i, "")
        runRasterCommand(pdftoppmCommand, ["-png", "-singlefile", "-r", String(PDF_RASTER_DPI), pdfPath, prefix], "Install Poppler or set up another supported PDF rasterizer.")
        const generatedPath = `${prefix}.png`
        if (generatedPath !== pngPath && existsSync(generatedPath)) renameSync(generatedPath, pngPath)
        if (!existsSync(pngPath)) throw new Error(`pdftoppm did not write ${pngPath}`)
      },
    }
  }

  if (commandCanStart("magick", ["-version"]) && ghostscriptCanStart()) {
    return {
      name: "magick",
      render(pdfPath, pngPath) {
        runRasterCommand("magick", ["-density", String(PDF_RASTER_DPI), `${pdfPath}[0]`, `PNG32:${pngPath}`], "ImageMagick PDF input requires Ghostscript, for example gswin64c.exe on Windows.")
        if (!existsSync(pngPath)) throw new Error(`magick did not write ${pngPath}`)
      },
    }
  }

  return null
}

function makePara(id: string, text: string, overrides: Partial<ParagraphNode["props"]> = {}): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(3),
      spacingAfter: pt(5),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...overrides,
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeDoc(bodyChildIds: string[], nodes: Record<string, LayoutNode>): DocumentNode {
  return {
    version: 1,
    document: {
      id: "pdf-visual-regression-doc",
      sections: [{
        id: "section",
        type: "section",
        page: PAGE,
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: bodyChildIds },
          ...nodes,
        },
      }],
    },
  }
}

function makeFlowRowVisualDoc(): DocumentNode {
  const leftStack: LayoutNode = {
    id: "flow-left-stack",
    type: "flow-stack",
    props: {
      widthShare: 30,
      box: {
        fill: "E0F2FE",
        padding: { top: pt(4), right: pt(4), bottom: pt(4), left: pt(4) },
        border: {
          left: { style: "solid", width: pt(2), color: "2563EB" },
          top: { style: "solid", width: pt(2), color: "2563EB" },
        },
      },
    },
    childIds: [],
  }
  const middleStack: LayoutNode = {
    id: "flow-middle-stack",
    type: "flow-stack",
    props: {
      widthShare: 30,
      box: {
        fill: "FEF3C7",
        padding: { top: pt(4), right: pt(4), bottom: pt(4), left: pt(4) },
        border: {
          top: { style: "solid", width: pt(2), color: "EF4444" },
          bottom: { style: "solid", width: pt(2), color: "EF4444" },
        },
      },
    },
    childIds: [],
  }
  const rightStack: LayoutNode = {
    id: "flow-right-stack",
    type: "flow-stack",
    props: {
      widthShare: 40,
      box: {
        fill: "DCFCE7",
        padding: { top: pt(4), right: pt(4), bottom: pt(4), left: pt(4) },
        border: {
          right: { style: "solid", width: pt(2), color: "15803D" },
          bottom: { style: "solid", width: pt(2), color: "15803D" },
        },
      },
    },
    childIds: [],
  }
  const row: LayoutNode = {
    id: "flow-row",
    type: "flow-row",
    props: { gap: 16, minHeight: 120 },
    childIds: ["flow-left-stack", "flow-middle-stack", "flow-right-stack"],
  }

  return makeDoc(["flow-row"], {
    "flow-row": row,
    "flow-left-stack": leftStack,
    "flow-middle-stack": middleStack,
    "flow-right-stack": rightStack,
  })
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset)
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}

function parsePng(buffer: Buffer): PngImage {
  const signature = buffer.subarray(0, 8).toString("hex")
  if (signature !== "89504e470d0a1a0a") throw new Error("Raster output is not a PNG")

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  let offset = 8
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii")
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = readUInt32(data, 0)
      height = readUInt32(data, 4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "IDAT") {
      idatChunks.push(data)
    } else if (type === "IEND") {
      break
    }
    offset += length + 12
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`)
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (bytesPerPixel === 0) throw new Error(`Unsupported PNG color type: ${colorType}`)

  const raw = inflateSync(Buffer.concat(idatChunks))
  const rowBytes = width * bytesPerPixel
  const rgba = new Uint8Array(width * height * 4)
  let source = 0
  let previous = new Uint8Array(rowBytes)

  for (let y = 0; y < height; y++) {
    const filter = raw[source++]
    const row = new Uint8Array(rowBytes)
    for (let x = 0; x < rowBytes; x++) {
      const value = raw[source++]
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0
      const up = previous[x] ?? 0
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0
      const predicted = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? paethPredictor(left, up, upLeft)
                : (() => { throw new Error(`Unsupported PNG filter: ${filter}`) })()
      row[x] = (value + predicted) & 0xff
    }

    for (let x = 0; x < width; x++) {
      const rowIndex = x * bytesPerPixel
      const outIndex = (y * width + x) * 4
      if (colorType === 0) {
        const gray = row[rowIndex]
        rgba[outIndex] = gray
        rgba[outIndex + 1] = gray
        rgba[outIndex + 2] = gray
        rgba[outIndex + 3] = 255
      } else {
        rgba[outIndex] = row[rowIndex]
        rgba[outIndex + 1] = row[rowIndex + 1]
        rgba[outIndex + 2] = row[rowIndex + 2]
        rgba[outIndex + 3] = colorType === 6 ? row[rowIndex + 3] : 255
      }
    }
    previous = row
  }

  return { width, height, rgba }
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
}

function pixelColor(image: PngImage, x: number, y: number): Rgb {
  const clampedX = Math.max(0, Math.min(image.width - 1, Math.round(x)))
  const clampedY = Math.max(0, Math.min(image.height - 1, Math.round(y)))
  const index = (clampedY * image.width + clampedX) * 4
  return {
    r: image.rgba[index],
    g: image.rgba[index + 1],
    b: image.rgba[index + 2],
  }
}

function minColorDistanceNear(image: PngImage, x: number, y: number, expected: Rgb, radius = 2): number {
  let minDistance = Number.POSITIVE_INFINITY
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      minDistance = Math.min(minDistance, colorDistance(pixelColor(image, x + dx, y + dy), expected))
    }
  }
  return minDistance
}

function pdfPointToImagePoint(pageHeight: number, x: number, y: number): { x: number, y: number } {
  const scale = PDF_RASTER_DPI / 72
  return { x: x * scale, y: (pageHeight - y) * scale }
}

describePdfVisual("PDF raster visual regression", () => {
  it("draws paragraph box fill and borders at the paginated geometry", async () => {
    const rasterizer = findRasterizer()
    expect(rasterizer, "Set up pdftoppm or ImageMagick with Ghostscript before running FLOWDOC_PDF_VISUAL_REGRESSION=1").not.toBeNull()

    const paragraph = makePara("boxed", "", {
      box: {
        fill: "E0F2FE",
        padding: { top: pt(8), right: pt(8), bottom: pt(8), left: pt(8) },
        border: {
          top: { style: "solid", width: pt(2), color: "EF4444" },
          right: { style: "solid", width: pt(2), color: "16A34A" },
          bottom: { style: "solid", width: pt(2), color: "2563EB" },
          left: { style: "solid", width: pt(2), color: "111827" },
        },
      },
    })
    const paginated = paginateDocument(makeDoc(["boxed"], { boxed: paragraph }), defaultTextMeasurer, defaultWordBreaker)
    const page = paginated.sections[0].pages[0]
    const fragment = page.fragments.find((item) => item.nodeId === "boxed")
    if (!fragment) throw new Error("Expected boxed paragraph fragment")
    const primitives = resolveParagraphBoxDrawingPrimitives(fragment, page.height)
    if (!primitives?.fill) throw new Error("Expected paragraph box drawing primitives")

    const tempDir = mkdtempSync(join(tmpdir(), "flowdoc-pdf-visual-"))
    tempDirs.push(tempDir)
    const pdfPath = join(tempDir, "actual.pdf")
    const pngPath = join(tempDir, "actual.png")
    const result = await new PdfRenderer().render(paginated)
    writeFileSync(pdfPath, result.buffer)
    rasterizer!.render(pdfPath, pngPath)

    const image = parsePng(readFileSync(pngPath))
    expect(image.width).toBeGreaterThan(Math.floor(page.width * PDF_RASTER_DPI / 72) - 2)
    expect(image.height).toBeGreaterThan(Math.floor(page.height * PDF_RASTER_DPI / 72) - 2)

    const fillPoint = pdfPointToImagePoint(
      page.height,
      primitives.fill.x + primitives.fill.width / 2,
      primitives.fill.y + primitives.fill.height / 2,
    )
    expect(minColorDistanceNear(image, fillPoint.x, fillPoint.y, hexToRgb("E0F2FE"), 1)).toBeLessThanOrEqual(24)

    for (const side of ["top", "right", "bottom", "left"] as const) {
      const line = primitives.borders.find((border) => border.side === side)
      if (!line) throw new Error(`Missing ${side} border primitive`)
      const linePoint = pdfPointToImagePoint(page.height, (line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2)
      expect(minColorDistanceNear(image, linePoint.x, linePoint.y, hexToRgb(line.border.color), 4)).toBeLessThanOrEqual(80)
    }
  })

  it("draws flow-stack fills, borders, and gaps at paginated flow-row geometry", async () => {
    const rasterizer = findRasterizer()
    expect(rasterizer, "Set up pdftoppm or ImageMagick with Ghostscript before running FLOWDOC_PDF_VISUAL_REGRESSION=1").not.toBeNull()

    const paginated = paginateDocument(makeFlowRowVisualDoc(), defaultTextMeasurer, defaultWordBreaker)
    const page = paginated.sections[0].pages[0]
    const row = page.fragments.find((item) => item.nodeId === "flow-row" && item.nodeType === "flow-row")
    if (!row) throw new Error("Expected flow-row fragment")

    const stacks = page.fragments
      .filter((item) => item.parentNodeId === "flow-row" && item.nodeType === "flow-stack")
      .sort((a, b) => a.x - b.x)
    expect(stacks).toHaveLength(3)
    expect(stacks.every((stack) => stack.height === row.height)).toBe(true)

    const tempDir = mkdtempSync(join(tmpdir(), "flowdoc-pdf-flow-row-"))
    tempDirs.push(tempDir)
    const pdfPath = join(tempDir, "actual.pdf")
    const pngPath = join(tempDir, "actual.png")
    const result = await new PdfRenderer().render(paginated)
    writeFileSync(pdfPath, result.buffer)
    rasterizer!.render(pdfPath, pngPath)

    const image = parsePng(readFileSync(pngPath))
    const expectedFills = ["E0F2FE", "FEF3C7", "DCFCE7"]
    for (const [index, stack] of stacks.entries()) {
      const primitives = resolveFragmentBoxDrawingPrimitives(stack, page.height)
      if (!primitives?.fill) throw new Error(`Expected flow-stack fill primitives for ${stack.nodeId}`)
      const fillPoint = pdfPointToImagePoint(
        page.height,
        primitives.fill.x + primitives.fill.width / 2,
        primitives.fill.y + primitives.fill.height / 2,
      )
      expect(minColorDistanceNear(image, fillPoint.x, fillPoint.y, hexToRgb(expectedFills[index]), 1)).toBeLessThanOrEqual(28)

      for (const line of primitives.borders) {
        const linePoint = pdfPointToImagePoint(page.height, (line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2)
        expect(minColorDistanceNear(image, linePoint.x, linePoint.y, hexToRgb(line.border.color), 4)).toBeLessThanOrEqual(80)
      }
    }

    for (let index = 0; index < stacks.length - 1; index++) {
      const left = stacks[index]
      const right = stacks[index + 1]
      const gap = right.x - (left.x + left.width)
      expect(gap).toBeGreaterThan(0)
      const gapPoint = pdfPointToImagePoint(
        page.height,
        left.x + left.width + gap / 2,
        page.height - (row.y + row.height / 2),
      )
      expect(minColorDistanceNear(image, gapPoint.x, gapPoint.y, hexToRgb("FFFFFF"), 1)).toBeLessThanOrEqual(18)
    }
  })
})

if (!ENABLE_PDF_VISUAL_REGRESSION) {
  describe("PDF raster visual regression gate", () => {
    it("is opt-in because PDF rasterizers are environment-specific", () => {
      expect(ENABLE_PDF_VISUAL_REGRESSION).toBe(false)
      expect(import.meta.url.endsWith("pdfVisualRegression.test.ts")).toBe(true)
    })
  })
}
