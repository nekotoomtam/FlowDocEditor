import { describe, expect, it } from "vitest"
import { PDFDocument as PdfLibDocument } from "pdf-lib"
import { bindDocumentWithSnapshot } from "@/binding"
import { getUserReportFixture } from "@/fixtures/userReportFixtures"
import { POST as exportPost } from "../export/route"
import { RUNTIME_FONT_RESPONSE_HEADER } from "../runtimeFont"
import { parsePersistedDocument } from "../../editor/_components/documentPersistence"

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("user report package import/export path", () => {
  it("imports the company report package, binds data, and exports PDF", async () => {
    const fixture = getUserReportFixture("company-report")
    const parsed = parsePersistedDocument(JSON.stringify(fixture.package))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.source).toBe("package")
    expect(parsed.package?.packageVersion).toBe(2)

    const bound = bindDocumentWithSnapshot(parsed.doc, {
      registry: fixture.package.fields,
      snapshot: fixture.package.data!,
    })
    expect(bound.issues).toEqual([])

    const response = await exportPost(jsonRequest("http://localhost/api/export", {
      doc: bound.doc,
      format: "pdf",
    }) as never)

    expect(response.status).toBe(200)
    expect(response.headers.get(RUNTIME_FONT_RESPONSE_HEADER)).toBeNull()
    const bytes = new Uint8Array(await response.arrayBuffer())
    const pdf = await PdfLibDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(fixture.expected.totalPages)
  })
})
