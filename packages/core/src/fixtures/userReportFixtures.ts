import type { DataSnapshotV1 } from "../dataSnapshot"
import type { FieldRegistryV1 } from "../fieldRegistry"
import { pt, type DocumentNode, type DocumentSection, type LayoutNode, type ParagraphNode, type TableCellNode, type TableNode, type TableRowNode } from "../schema"

export interface FlowDocUserReportPackageV2 {
  packageVersion: 2
  kind: "document"
  id: string
  meta: {
    title: string
    createdAt: string
    updatedAt: string
  }
  document: DocumentNode
  fields: FieldRegistryV1
  data?: DataSnapshotV1
}

export interface UserReportFixture {
  key: "company-report" | "government-report" | "university-report"
  title: string
  package: FlowDocUserReportPackageV2
  expected: {
    sectionPages: number[]
    totalPages: number
    minBodyParagraphFragments?: number
    minTableBodyRows?: number
    footerTexts?: string[]
    tocEntries?: Array<[string, number]>
  }
}

const CREATED_AT = "2026-05-13T00:00:00.000Z"

const PAGE = {
  size: "A4" as const,
  orientation: "portrait" as const,
  margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
}

const REPORT_PAGE = {
  ...PAGE,
  headerReserved: 36,
  footerReserved: 28,
}

function makePara(
  id: string,
  text: string,
  overrides: Partial<ParagraphNode["props"]> = {},
): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(10),
      fontFamilyKey: "default",
      lineHeight: 1.2,
      spacingBefore: pt(0),
      spacingAfter: pt(4),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...overrides,
    },
    children: [{ id: `${id}-text`, type: "text", text }],
  }
}

function makeInlinePara(
  id: string,
  children: ParagraphNode["children"],
  overrides: Partial<ParagraphNode["props"]> = {},
): ParagraphNode {
  return {
    ...makePara(id, "", overrides),
    children,
  }
}

function makePageNumberPara(id: string, prefix = "หน้า "): ParagraphNode {
  return makeInlinePara(id, [
    { id: `${id}-label`, type: "text", text: prefix },
    { id: `${id}-page-number`, type: "pageNumber" },
  ])
}

function makeHeader(rootId: string, text: string): { rootId: string; nodes: Record<string, LayoutNode> } {
  const paragraphId = `${rootId}-text`
  return {
    rootId,
    nodes: {
      [rootId]: { id: rootId, type: "stack", props: {}, childIds: [paragraphId] },
      [paragraphId]: makePara(paragraphId, text, { fontSize: pt(9), spacingAfter: pt(0) }),
    },
  }
}

function makeFooter(rootId: string, prefix = "หน้า "): { rootId: string; nodes: Record<string, LayoutNode> } {
  const paragraphId = `${rootId}-text`
  return {
    rootId,
    nodes: {
      [rootId]: { id: rootId, type: "stack", props: {}, childIds: [paragraphId] },
      [paragraphId]: makePageNumberPara(paragraphId, prefix),
    },
  }
}

function makeSection(
  id: string,
  childIds: string[],
  nodes: Record<string, LayoutNode>,
  opts: {
    pageNumberStart?: number
    header?: ReturnType<typeof makeHeader>
    footer?: ReturnType<typeof makeFooter>
    page?: typeof PAGE
  } = {},
): DocumentSection {
  return {
    id,
    type: "section",
    page: {
      ...(opts.header || opts.footer ? REPORT_PAGE : PAGE),
      ...(opts.page ?? {}),
      ...(opts.pageNumberStart !== undefined ? { pageNumberStart: opts.pageNumberStart } : {}),
    },
    headerRootId: opts.header?.rootId,
    bodyRootId: `body-${id}`,
    footerRootId: opts.footer?.rootId,
    nodes: {
      ...(opts.header?.nodes ?? {}),
      ...(opts.footer?.nodes ?? {}),
      [`body-${id}`]: { id: `body-${id}`, type: "body", props: {}, childIds },
      ...nodes,
    },
  }
}

function makeTocSection(id: string, title: string): DocumentSection {
  return makeSection(id, [`${id}-toc`], {
    [`${id}-toc`]: { id: `${id}-toc`, type: "toc", props: { title } },
  })
}

function makeTable(id: string, colWidths: number[], rowDefs: string[][]): TableNode {
  const nodes: TableNode["nodes"] = {}
  const rowIds: string[] = []

  rowDefs.forEach((cells, rowIndex) => {
    const cellIds: string[] = []
    cells.forEach((text, colIndex) => {
      const paragraphId = `${id}-p${rowIndex}-${colIndex}`
      const cellId = `${id}-c${rowIndex}-${colIndex}`
      nodes[paragraphId] = makePara(paragraphId, text, { spacingAfter: pt(0) })
      nodes[cellId] = { id: cellId, type: "table-cell", props: {}, childIds: [paragraphId] } as TableCellNode
      cellIds.push(cellId)
    })
    const rowId = `${id}-row${rowIndex}`
    nodes[rowId] = { id: rowId, type: "table-row", props: { allowBreak: true }, cellIds } as TableRowNode
    rowIds.push(rowId)
  })

  return {
    id,
    type: "table",
    props: {
      headerRowCount: 1,
      border: {
        top: { style: "solid", width: pt(0.5), color: "000000" },
        right: { style: "solid", width: pt(0.5), color: "000000" },
        bottom: { style: "solid", width: pt(0.5), color: "000000" },
        left: { style: "solid", width: pt(0.5), color: "000000" },
      },
    },
    columns: colWidths.map((width) => ({ width: pt(width) })),
    rowIds,
    nodes,
  }
}

function makePackage(
  title: string,
  document: DocumentNode,
  fields: FieldRegistryV1 = { version: 1, fields: [] },
  data?: DataSnapshotV1,
): FlowDocUserReportPackageV2 {
  return {
    packageVersion: 2,
    kind: "document",
    id: document.document.id,
    meta: { title, createdAt: CREATED_AT, updatedAt: CREATED_AT },
    document,
    fields,
    ...(data ? { data } : {}),
  }
}

function makeCompanyReport(): UserReportFixture {
  const fields: FieldRegistryV1 = {
    version: 1,
    fields: [
      { key: "customer.name", fieldType: "text", label: "Customer name", required: true, fallback: "Customer" },
      { key: "report.period", fieldType: "text", label: "Report period", fallback: "Current quarter" },
    ],
  }
  const data: DataSnapshotV1 = {
    version: 1,
    updatedAt: CREATED_AT,
    values: {
      "customer.name": "Acme Manufacturing Co.",
      "report.period": "Q1 2026",
    },
  }
  const coverTitle = makePara("company-cover-title", "Company Quarterly Performance Report", {
    align: "center",
    headingLevel: 1,
    fontSize: pt(18),
    lineHeight: 1.25,
    spacingAfter: pt(12),
  })
  const coverClient = makeInlinePara("company-cover-client", [
    { id: "company-cover-client-label", type: "text", text: "Prepared for " },
    { id: "company-cover-client-field", type: "fieldRef", key: "customer.name", label: "Customer", fallback: "Customer" },
    { id: "company-cover-period-label", type: "text", text: " — " },
    { id: "company-cover-period-field", type: "fieldRef", key: "report.period", label: "Period", fallback: "Current quarter" },
  ], { align: "center", spacingAfter: pt(8) })
  const summaryHeading = makePara("company-summary-heading", "Executive Summary", {
    headingLevel: 1,
    keepWithNext: true,
    spacingAfter: pt(6),
  })
  const summary = makePara(
    "company-summary",
    Array.from({ length: 18 }, (_, index) =>
      `Performance narrative line ${index + 1}: revenue, margin, risk, and operations stay visible for review.`,
    ).join("\n"),
  )
  const table = makeTable("company-kpi-table", [90, 221, 140], [
    ["No.", "Business area", "Result"],
    ...Array.from({ length: 145 }, (_, index) => [
      String(index + 1),
      `Operational metric ${index + 1}`,
      `${(index + 1) * 7}%`,
    ]),
  ])
  const header = makeHeader("company-header", "Company report — FlowDoc fixture")
  const footer = makeFooter("company-footer")
  const doc: DocumentNode = {
    version: 1,
    document: {
      id: "fixture-company-report",
      meta: { title: "Company Quarterly Performance Report" },
      sections: [
        makeSection("company-cover", [coverTitle.id, coverClient.id], {
          [coverTitle.id]: coverTitle,
          [coverClient.id]: coverClient,
        }),
        makeSection("company-body", [summaryHeading.id, summary.id, table.id], {
          [summaryHeading.id]: summaryHeading,
          [summary.id]: summary,
          [table.id]: table as unknown as LayoutNode,
        }, { header, footer, pageNumberStart: 1 }),
      ],
    },
  }

  return {
    key: "company-report",
    title: "Company Quarterly Performance Report",
    package: makePackage("Company Quarterly Performance Report", doc, fields, data),
    expected: {
      sectionPages: [1, 4],
      totalPages: 5,
      minTableBodyRows: 145,
      footerTexts: ["หน้า 1", "หน้า 2", "หน้า 3", "หน้า 4"],
    },
  }
}

function makeGovernmentReport(): UserReportFixture {
  const coverTitle = makePara("government-cover-title", "รายงานราชการประจำปี", {
    align: "center",
    headingLevel: 1,
    fontSize: pt(18),
    lineHeight: 1.25,
    spacingAfter: pt(12),
  })
  const chapterHeading = makePara("government-heading-1", "บทที่ 1 สรุปผลการดำเนินงาน", {
    headingLevel: 1,
    keepWithNext: true,
    spacingAfter: pt(6),
  })
  const formalBody = makePara(
    "government-formal-body",
    Array.from({ length: 110 }, (_, index) =>
      `รายงานราชการ ${index + 1} ผลการดำเนินงานและข้อเสนอแนะ`,
    ).join("\n"),
  )
  const table = makeTable("government-budget-table", [170, 140, 141], [
    ["หมวด", "งบประมาณ", "ผลการเบิกจ่าย"],
    ...Array.from({ length: 24 }, (_, index) => [
      `รายการที่ ${index + 1}`,
      `${(index + 1) * 10000}`,
      `${(index + 1) * 8500}`,
    ]),
  ])
  const header = makeHeader("government-header", "รายงานราชการ — สำเนาตรวจทาน")
  const footer = makeFooter("government-footer")
  const doc: DocumentNode = {
    version: 1,
    document: {
      id: "fixture-government-report",
      meta: { title: "รายงานราชการประจำปี" },
      sections: [
        makeSection("government-cover", [coverTitle.id], { [coverTitle.id]: coverTitle }),
        makeTocSection("government-toc", "สารบัญ"),
        makeSection("government-body", [chapterHeading.id, formalBody.id, table.id], {
          [chapterHeading.id]: chapterHeading,
          [formalBody.id]: formalBody,
          [table.id]: table as unknown as LayoutNode,
        }, { header, footer, pageNumberStart: 1 }),
      ],
    },
  }

  return {
    key: "government-report",
    title: "รายงานราชการประจำปี",
    package: makePackage("รายงานราชการประจำปี", doc),
    expected: {
      sectionPages: [1, 1, 3],
      totalPages: 5,
      minBodyParagraphFragments: 3,
      tocEntries: [["government-cover-title", 1], ["government-heading-1", 1]],
      footerTexts: ["หน้า 1", "หน้า 2", "หน้า 3"],
    },
  }
}

function makeUniversityReport(): UserReportFixture {
  const coverTitle = makePara("university-cover-title", "University Research Report", {
    align: "center",
    headingLevel: 1,
    fontSize: pt(18),
    lineHeight: 1.25,
    spacingAfter: pt(12),
  })
  const bodyHeading = makePara("university-heading-1", "Chapter 1 Research Background", {
    headingLevel: 1,
    keepWithNext: true,
    spacingAfter: pt(6),
  })
  const thaiBody = makePara(
    "university-thai-body",
    Array.from({ length: 132 }, (_, index) =>
      `รายงานวิจัย ${index + 1} บริบท วิธี ผลลัพธ์ ข้อจำกัด`,
    ).join("\n"),
  )
  const methodHeading = makePara("university-heading-2", "Chapter 2 Method", {
    headingLevel: 1,
    keepWithNext: true,
    spacingAfter: pt(6),
  })
  const methodBody = makePara(
    "university-method-body",
    Array.from({ length: 48 }, (_, index) => `Method note ${index + 1}: sampling and analysis.`).join("\n"),
  )
  const footer = makeFooter("university-footer")
  const doc: DocumentNode = {
    version: 1,
    document: {
      id: "fixture-university-report",
      meta: { title: "University Research Report" },
      sections: [
        makeSection("university-cover", [coverTitle.id], { [coverTitle.id]: coverTitle }),
        makeTocSection("university-toc", "Contents"),
        makeSection("university-body", [bodyHeading.id, thaiBody.id, methodHeading.id, methodBody.id], {
          [bodyHeading.id]: bodyHeading,
          [thaiBody.id]: thaiBody,
          [methodHeading.id]: methodHeading,
          [methodBody.id]: methodBody,
        }, { footer, pageNumberStart: 1 }),
      ],
    },
  }

  return {
    key: "university-report",
    title: "University Research Report",
    package: makePackage("University Research Report", doc),
    expected: {
      sectionPages: [1, 1, 4],
      totalPages: 6,
      minBodyParagraphFragments: 3,
      tocEntries: [["university-cover-title", 1], ["university-heading-1", 1], ["university-heading-2", 4]],
      footerTexts: ["หน้า 1", "หน้า 2", "หน้า 3", "หน้า 4"],
    },
  }
}

export const USER_REPORT_FIXTURES: UserReportFixture[] = [
  makeCompanyReport(),
  makeGovernmentReport(),
  makeUniversityReport(),
]

export function getUserReportFixture(key: UserReportFixture["key"]): UserReportFixture {
  const fixture = USER_REPORT_FIXTURES.find((candidate) => candidate.key === key)
  if (!fixture) throw new Error(`Unknown user report fixture: ${key}`)
  return fixture
}
