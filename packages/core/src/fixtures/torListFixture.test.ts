import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"
import { assertDocument } from "../document/assert"
import { resolveListMarkers } from "../document/listNumbering"
import { defaultTextMeasurer, defaultWordBreaker } from "../layout"
import { paginateDocument } from "../pagination"
import { DocxRenderer, PdfRenderer, resolvePdfListMarkerDrawingPrimitive } from "../renderer"
import {
  createTorListFixtureDocument,
  TOR_LIST_FIXTURE_EXPECTED_MARKERS,
} from "./torListFixture"

const SARABUN_REGULAR_FONT_PATH = fileURLToPath(new URL("../../../../public/fonts/Sarabun/Sarabun-Regular.ttf", import.meta.url))

async function readDocxXml(buffer: Uint8Array, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file(path)
  if (!file) throw new Error(`Missing DOCX XML path: ${path}`)
  return file.async("string")
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function docxParagraphsContaining(xml: string, marker: string): string[] {
  return [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => match[0])
    .filter((paragraphXml) => paragraphXml.includes(marker))
}

function docxTextRuns(paragraphXml: string): string[] {
  return [...paragraphXml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)]
    .map((match) =>
      [...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((textMatch) => decodeXmlText(textMatch[1]))
        .join("")
    )
}

function paginateTorFixture() {
  return paginateDocument(createTorListFixtureDocument(), defaultTextMeasurer, defaultWordBreaker)
}

describe("TOR list fixture", () => {
  it("is a valid current-schema document", () => {
    expect(() => assertDocument(createTorListFixtureDocument())).not.toThrow()
  })

  it("resolves expected TOR markers without authored marker text", () => {
    const doc = createTorListFixtureDocument()
    const markers = resolveListMarkers(doc)

    Object.entries(TOR_LIST_FIXTURE_EXPECTED_MARKERS).forEach(([paragraphId, markerText]) => {
      expect(markers.get(paragraphId)?.markerText).toBe(markerText)
    })

    const section = doc.document.sections[0]
    const background = section.nodes["p-background"]
    const objectiveChild = section.nodes["p-objective-1"]
    expect(background?.type).toBe("paragraph")
    expect(objectiveChild?.type).toBe("paragraph")
    if (background?.type !== "paragraph" || objectiveChild?.type !== "paragraph") return
    expect(background.children).toEqual([{ id: "p-background-text", type: "text", text: "ความเป็นมา" }])
    expect(objectiveChild.children).toEqual([{
      id: "p-objective-1-text",
      type: "text",
      text: "เพื่อพัฒนาระบบสำหรับจัดทำและบริหารจัดการเอกสาร",
    }])
  })

  it("keeps fields as fieldRef inline content separate from list markers", () => {
    const doc = createTorListFixtureDocument()
    const section = doc.document.sections[0]
    const duration = section.nodes["p-delivery-duration"]

    expect(duration?.type).toBe("paragraph")
    if (duration?.type !== "paragraph") return
    expect(resolveListMarkers(doc).get("p-delivery-duration")?.markerText).toBe("5.1")
    expect(duration.children).toContainEqual({
      id: "p-delivery-duration-field",
      type: "fieldRef",
      key: "project.durationDays",
    })
    expect(duration.children.some((child) => child.type === "text" && child.text.includes("5.1"))).toBe(false)
  })

  it("paginates generated markers from the current-schema fixture", () => {
    const paginated = paginateTorFixture()
    const fragments = paginated.sections[0].pages.flatMap((page) => page.fragments)
    const fragment = fragments.find((candidate) => candidate.nodeId === "p-scope-document-template-fields")

    expect(fragment?.listMarker?.text).toBe("4.1.1.1")
    expect(fragment?.listMarker?.bodyX).toBeGreaterThan(fragment?.listMarker?.markerX ?? 0)
    expect(fragment?.lines?.map((line) => line.text).join(" ")).toContain("รองรับการกำหนด field")
    expect(fragment?.lines?.some((line) => line.text.includes("4.1.1.1"))).toBe(false)
  })

  it("exposes PDF marker primitives and renders the TOR fixture to PDF", async () => {
    const paginated = paginateTorFixture()
    const page = paginated.sections[0].pages.find((candidate) =>
      candidate.fragments.some((fragment) => fragment.nodeId === "p-scope-document-template-fields")
    )
    const fragment = page?.fragments.find((candidate) => candidate.nodeId === "p-scope-document-template-fields")

    expect(fragment).toBeDefined()
    expect(page).toBeDefined()
    if (!fragment || !page) return
    expect(resolvePdfListMarkerDrawingPrimitive(fragment, page.height)?.text).toBe("4.1.1.1")

    const sarabunRegular = readFileSync(SARABUN_REGULAR_FONT_PATH)
    const result = await new PdfRenderer({
      async getFont() {
        return sarabunRegular
      },
    }).render(paginated)
    expect(result.extension).toBe("pdf")
    expect(result.buffer[0]).toBe(0x25)
    expect(result.buffer[1]).toBe(0x50)
  })

  it("exports TOR fixture markers to DOCX as marker runs with tabs", async () => {
    const doc = createTorListFixtureDocument()
    const paginated = paginateDocument(doc, defaultTextMeasurer, defaultWordBreaker)
    const result = await new DocxRenderer({ sourceDocument: doc }).render(paginated)
    const xml = await readDocxXml(result.buffer, "word/document.xml")
    const paragraphs = docxParagraphsContaining(xml, "รองรับการกำหนด field")

    expect(paragraphs).toHaveLength(1)
    const runs = docxTextRuns(paragraphs[0])
    expect(runs[0]).toBe("4.1.1.1")
    expect(runs).toContain("รองรับการกำหนด field สำหรับผูกข้อมูลในเอกสาร")
    expect(paragraphs[0]).toContain("<w:tab/>")
  })
})
