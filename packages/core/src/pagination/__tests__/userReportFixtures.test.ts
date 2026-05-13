import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { assertDocument } from "../../document"
import { DEFAULT_FONT_KEY, resolveFontFileName } from "../../font-registry"
import { USER_REPORT_FIXTURES } from "../../fixtures/userReportFixtures"
import { defaultTextMeasurer, defaultWordBreaker } from "../../layout"
import { createFontkitMeasurer } from "../../layout/font-measurer"
import { thaiWordBreaker } from "../../layout/word-breaker"
import { assertPaginatedDocument, paginateDocument } from "../index"

const testDir = path.dirname(fileURLToPath(import.meta.url))
const FONT_PATH = path.resolve(testDir, "../../../../../public/fonts", resolveFontFileName(DEFAULT_FONT_KEY))

function readRuntimeFont(): Uint8Array {
  if (!existsSync(FONT_PATH)) {
    throw new Error(`Missing default runtime font: ${FONT_PATH}`)
  }
  return readFileSync(FONT_PATH)
}

function paginateFixture(
  document: (typeof USER_REPORT_FIXTURES)[number]["package"]["document"],
  measurer = defaultTextMeasurer,
  wordBreaker = defaultWordBreaker,
) {
  assertDocument(document)
  const paginated = paginateDocument(document, measurer, wordBreaker)
  assertPaginatedDocument(paginated)
  return paginated
}

function paginateFixtureWithProductionStack(document: (typeof USER_REPORT_FIXTURES)[number]["package"]["document"]) {
  return paginateFixture(document, createFontkitMeasurer(readRuntimeFont()), thaiWordBreaker)
}

function totalPages(paginated: ReturnType<typeof paginateFixture>): number {
  return paginated.sections.reduce((sum, section) => sum + section.pages.length, 0)
}

function expectSectionPageCounts(
  paginated: ReturnType<typeof paginateFixture>,
  fixture: (typeof USER_REPORT_FIXTURES)[number],
) {
  expect(paginated.sections.map((section) => section.pages.length)).toEqual(fixture.expected.sectionPages)
  expect(totalPages(paginated)).toBe(fixture.expected.totalPages)
}

function expectCompanyReport(paginated: ReturnType<typeof paginateFixture>, fixture: (typeof USER_REPORT_FIXTURES)[number]) {
  const bodyPages = paginated.sections[1].pages
  const tableRows = bodyPages.flatMap((page) =>
    page.fragments.filter((fragment) =>
      fragment.parentNodeId === "company-kpi-table" &&
      fragment.nodeType === "row" &&
      fragment.nodeId !== "company-kpi-table-row0",
    ),
  )

  expect(tableRows).toHaveLength(fixture.expected.minTableBodyRows ?? 0)
  expect(bodyPages.map((page) =>
    page.footerFragments.find((fragment) => fragment.nodeId === "company-footer-text")?.lines?.[0]?.text,
  )).toEqual(fixture.expected.footerTexts)
}

function expectGovernmentReport(paginated: ReturnType<typeof paginateFixture>, fixture: (typeof USER_REPORT_FIXTURES)[number]) {
  const bodyFragments = paginated.sections[2].pages.flatMap((page) =>
    page.fragments.filter((fragment) => fragment.nodeId === "government-formal-body"),
  )

  expect(paginated.tocEntries.map((entry) => [entry.nodeId, entry.pageNumber])).toEqual(fixture.expected.tocEntries)
  expect(bodyFragments.length).toBeGreaterThanOrEqual(fixture.expected.minBodyParagraphFragments ?? 0)
  expect(paginated.sections[2].pages.map((page) =>
    page.footerFragments.find((fragment) => fragment.nodeId === "government-footer-text")?.lines?.[0]?.text,
  )).toEqual(fixture.expected.footerTexts)
}

function expectUniversityReport(paginated: ReturnType<typeof paginateFixture>, fixture: (typeof USER_REPORT_FIXTURES)[number]) {
  const thaiFragments = paginated.sections[2].pages.flatMap((page) =>
    page.fragments.filter((fragment) => fragment.nodeId === "university-thai-body"),
  )

  expect(paginated.tocEntries.map((entry) => [entry.nodeId, entry.pageNumber])).toEqual(fixture.expected.tocEntries)
  expect(thaiFragments.length).toBeGreaterThanOrEqual(fixture.expected.minBodyParagraphFragments ?? 0)
  expect(paginated.sections[2].pages[0].index).toBe(2)
  expect(paginated.sections[2].pages.map((page) =>
    page.footerFragments.find((fragment) => fragment.nodeId === "university-footer-text")?.lines?.[0]?.text,
  )).toEqual(fixture.expected.footerTexts)
}

describe("user-level report fixtures", () => {
  it("provides saved FlowDoc package v2 fixtures for company, government, and university reports", () => {
    expect(USER_REPORT_FIXTURES.map((fixture) => fixture.key)).toEqual([
      "company-report",
      "government-report",
      "university-report",
    ])

    for (const fixture of USER_REPORT_FIXTURES) {
      expect(fixture.package.packageVersion).toBe(2)
      expect(fixture.package.kind).toBe("document")
      expect(fixture.package.id).toBe(fixture.package.document.document.id)
      expect(fixture.package.meta.title).toBe(fixture.title)
      expect(fixture.package.fields.version).toBe(1)
    }
  })

  it.each(USER_REPORT_FIXTURES)("$key paginates with expected section page counts", (fixture) => {
    const paginated = paginateFixture(fixture.package.document)

    expectSectionPageCounts(paginated, fixture)
  })

  it("company report protects a multi-page KPI table with footer page numbers", () => {
    const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === "company-report")!
    const paginated = paginateFixture(fixture.package.document)

    expectCompanyReport(paginated, fixture)
  })

  it("government report protects TOC entries, Thai body continuation, and footer restarts", () => {
    const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === "government-report")!
    const paginated = paginateFixture(fixture.package.document)

    expectGovernmentReport(paginated, fixture)
  })

  it("university report protects cover, TOC, body restart, and long Thai continuation", () => {
    const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === "university-report")!
    const paginated = paginateFixture(fixture.package.document)

    expectUniversityReport(paginated, fixture)
  })

  it.each(USER_REPORT_FIXTURES)("$key preserves expected pagination with the production measurement stack", (fixture) => {
    const paginated = paginateFixtureWithProductionStack(fixture.package.document)

    expectSectionPageCounts(paginated, fixture)
  })

  it("production stack protects company report table and footer page numbers", () => {
    const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === "company-report")!
    const paginated = paginateFixtureWithProductionStack(fixture.package.document)

    expectCompanyReport(paginated, fixture)
  })

  it("production stack protects government report TOC, Thai continuation, and footer restarts", () => {
    const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === "government-report")!
    const paginated = paginateFixtureWithProductionStack(fixture.package.document)

    expectGovernmentReport(paginated, fixture)
  })

  it("production stack protects university report TOC, body restart, and Thai continuation", () => {
    const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === "university-report")!
    const paginated = paginateFixtureWithProductionStack(fixture.package.document)

    expectUniversityReport(paginated, fixture)
  })
})
