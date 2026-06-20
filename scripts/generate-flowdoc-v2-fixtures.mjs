import fs from "node:fs"
import path from "node:path"

const now = process.env.FLOWDOC_MOCK_NOW ?? "2026-06-19T00:00:00.000Z"
const rootDir = process.cwd()
const outputDir = path.resolve(rootDir, "public/mock")
const manifestFilename = "flowdoc-v2-mock-manifest.json"

const pt = (value) => ({ value, unit: "pt" })
const side = (color = "CBD5E1", width = 1) => ({ style: "solid", width: pt(width), color })
const pad = (value) => ({ top: pt(value), right: pt(value), bottom: pt(value), left: pt(value) })

const nodeMutationTargets = {
  typing: {
    primary: "v2_typing_primary",
    boundary: "v2_typing_boundary",
    pageBoundary: "v2_typing_page_boundary",
    deepDocument: "v2_typing_deep_document",
  },
  node: {
    delete: "v2_delete_target",
    duplicate: "v2_duplicate_target",
    reorderSource: "v2_reorder_source",
    reorderTarget: "v2_reorder_target",
    split: "v2_split_target",
    merge: "v2_merge_target",
  },
  flowRow: {
    resizeTarget: "v2_flow_row_main",
    addColumnTarget: "v2_flow_row_main",
    leftStack: "v2_flow_stack_left",
    rightStack: "v2_flow_stack_right",
  },
  table: {
    primaryTable: "v2_table_main",
    primaryCell: "v2_table_cell_001_001",
    primaryRow: "v2_table_row_001",
    bodyCell: "v2_table_cell_002_002",
    spanCell: "v2_table_cell_003_002",
  },
}

function createWorkflowTargets(prefix) {
  return {
    typing: {
      primary: `${prefix}_typing_primary`,
      boundary: `${prefix}_typing_boundary`,
      pageBoundary: `${prefix}_typing_page_boundary`,
      deepDocument: `${prefix}_typing_deep_document`,
    },
    node: {
      delete: `${prefix}_delete_target`,
      duplicate: `${prefix}_duplicate_target`,
      reorderSource: `${prefix}_reorder_source`,
      reorderTarget: `${prefix}_reorder_target`,
      split: `${prefix}_split_target`,
      merge: `${prefix}_merge_target`,
    },
    flowRow: {
      resizeTarget: `${prefix}_flow_row_main`,
      addColumnTarget: `${prefix}_flow_row_main`,
      leftStack: `${prefix}_flow_stack_left`,
      rightStack: `${prefix}_flow_stack_right`,
    },
    table: {
      primaryTable: `${prefix}_table_main`,
      primaryCell: `${prefix}_table_cell_002_002`,
      primaryRow: `${prefix}_table_row_002`,
      bodyCell: `${prefix}_table_cell_004_003`,
      spanCell: `${prefix}_table_cell_003_002`,
    },
  }
}

const productReportTargets = {
  typing: {
    primary: "product_report_typing_primary",
    boundary: "product_report_typing_boundary",
    pageBoundary: "product_report_typing_page_boundary",
    deepDocument: "product_report_typing_deep_document",
  },
  node: {
    addAfter: "product_report_add_after_target",
    delete: "product_report_delete_target",
    duplicate: "product_report_duplicate_target",
    reorderSource: "product_report_reorder_source",
    reorderTarget: "product_report_reorder_target",
    split: "product_report_split_target",
    merge: "product_report_merge_target",
  },
  flowRow: {
    summaryRow: "product_report_summary_flow_row",
    resizeTarget: "product_report_summary_flow_row",
    addColumnTarget: "product_report_summary_flow_row",
    leftStack: "product_report_summary_left_stack",
    rightStack: "product_report_summary_right_stack",
  },
  table: {
    primaryTable: "product_report_kpi_table",
    headerRow: "product_report_kpi_row_001",
    primaryRow: "product_report_kpi_row_002",
    primaryCell: "product_report_kpi_cell_002_002",
    bodyCell: "product_report_kpi_cell_004_003",
    longTextCell: "product_report_kpi_cell_006_002",
    resizeTarget: "product_report_kpi_table",
  },
  field: {
    reportTitle: "report.title",
    reportDate: "report.date",
    ownerName: "owner.name",
    totalAmount: "summary.totalAmount",
    riskLevel: "summary.riskLevel",
  },
  history: {
    primaryEdit: "product_report_history_primary_edit",
  },
  export: {
    readinessTarget: "product_report_export_readiness",
  },
}

const fixtureSpecs = [
  {
    id: "stress-node-mutations-v2",
    filename: "stress-node-mutations-v2.flowdoc.json",
    title: "Stress Node Mutations v2",
    workflow: "node",
    targetPrefix: "v2",
    paragraphCount: 72,
    flowRowAt: 18,
    tableAt: 36,
    targets: nodeMutationTargets,
  },
  {
    id: "stress-typing-v2",
    filename: "stress-typing-v2.flowdoc.json",
    title: "Stress Typing v2",
    workflow: "typing",
    targetPrefix: "v2_typing",
    paragraphCount: 132,
    flowRowAt: 44,
    tableAt: 88,
    targets: createWorkflowTargets("v2_typing"),
  },
  {
    id: "stress-flow-row-v2",
    filename: "stress-flow-row-v2.flowdoc.json",
    title: "Stress Flow Row v2",
    workflow: "flow-row",
    targetPrefix: "v2_flow_row",
    paragraphCount: 96,
    flowRowAt: 20,
    tableAt: 64,
    targets: createWorkflowTargets("v2_flow_row"),
  },
  {
    id: "stress-table-v2",
    filename: "stress-table-v2.flowdoc.json",
    title: "Stress Table v2",
    workflow: "table",
    targetPrefix: "v2_table_fixture",
    paragraphCount: 96,
    flowRowAt: 28,
    tableAt: 48,
    tableRows: 16,
    targets: createWorkflowTargets("v2_table_fixture"),
  },
  {
    id: "stress-long-v2",
    filename: "stress-long-v2.flowdoc.json",
    title: "Stress Long Document v2",
    workflow: "long",
    targetPrefix: "v2_long",
    paragraphCount: 1288,
    flowRowAt: 320,
    tableAt: 760,
    tableRows: 24,
    targets: createWorkflowTargets("v2_long"),
  },
]

const productReportSpec = {
  id: "product-report-v2",
  filename: "product-report-v2.flowdoc.json",
  title: "Product Report v2",
  workflow: "product-report",
  targetPrefix: "product_report",
  targets: productReportTargets,
}

function createBuilder() {
  let seq = 1
  const nodes = {}
  const id = (prefix) => `${prefix}_${String(seq++).padStart(4, "0")}`
  const textRun = (text) => ({ id: id("text"), type: "text", text })
  const baseProps = {
    align: "left",
    fontSize: pt(11),
    fontFamilyKey: "default",
    textColor: "111827",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    strikethrough: false,
    lineHeight: 1.45,
    spacingBefore: pt(0),
    spacingAfter: pt(6),
    textIndent: pt(0),
    indentLeft: pt(0),
    indentRight: pt(0),
  }
  const add = (node) => {
    nodes[node.id] = node
    return node.id
  }
  const paragraph = (paragraphId, text, props = {}) => ({
    id: paragraphId,
    type: "paragraph",
    props: { ...baseProps, ...props },
    children: [textRun(text)],
  })
  const headingProps = (level) => ({
    headingLevel: level,
    keepWithNext: true,
    fontWeight: "bold",
    fontSize: pt(level === 1 ? 18 : 14),
    lineHeight: 1.25,
    spacingBefore: pt(level === 1 ? 12 : 8),
    spacingAfter: pt(6),
    textColor: "0F172A",
  })
  return { id, nodes, add, paragraph, baseProps, headingProps }
}

function addParagraph(builder, body, paragraphId, text, props = {}) {
  body.childIds.push(builder.add(builder.paragraph(paragraphId, text, props)))
}

function addInlineParagraph(builder, body, paragraphId, children, props = {}) {
  body.childIds.push(builder.add({
    ...builder.paragraph(paragraphId, "", props),
    children,
  }))
}

function addFlowRow(builder, body, flowRowTargets, prefix) {
  const leftParagraphId = `${prefix}_flow_stack_left_p`
  const rightParagraphId = `${prefix}_flow_stack_right_p`
  builder.add(builder.paragraph(leftParagraphId, "Left flow-stack paragraph for add-column and layout mutation checks."))
  builder.add(builder.paragraph(rightParagraphId, "Right flow-stack paragraph for stable sibling and selection checks."))
  builder.add({
    id: flowRowTargets.leftStack,
    type: "flow-stack",
    props: {
      widthShare: 50,
      minHeight: 24,
      box: {
        fill: "F8FAFC",
        padding: pad(8),
        border: { top: side(), right: side(), bottom: side(), left: side() },
      },
    },
    childIds: [leftParagraphId],
  })
  builder.add({
    id: flowRowTargets.rightStack,
    type: "flow-stack",
    props: {
      widthShare: 50,
      minHeight: 24,
      box: {
        fill: "F8FAFC",
        padding: pad(8),
        border: { top: side(), right: side(), bottom: side(), left: side() },
      },
    },
    childIds: [rightParagraphId],
  })
  body.childIds.push(builder.add({
    id: flowRowTargets.resizeTarget,
    type: "flow-row",
    props: { gap: 8, minHeight: 24 },
    childIds: [flowRowTargets.leftStack, flowRowTargets.rightStack],
  }))
}

function addProductSummaryFlowRow(builder, body, flowRowTargets) {
  const leftParagraphId = "product_report_summary_left_paragraph"
  const rightParagraphId = "product_report_summary_right_paragraph"
  builder.add(builder.paragraph(leftParagraphId, "Operational health remains stable while the editor keeps this long report editable.", {
    ...builder.baseProps,
    fontSize: pt(10),
    lineHeight: 1.35,
    spacingAfter: pt(0),
  }))
  builder.add(builder.paragraph(rightParagraphId, "Risk review: medium priority items need follow-up, but export readiness should remain clear.", {
    ...builder.baseProps,
    fontSize: pt(10),
    lineHeight: 1.35,
    spacingAfter: pt(0),
  }))
  builder.add({
    id: flowRowTargets.leftStack,
    type: "flow-stack",
    props: {
      widthShare: 50,
      minHeight: 40,
      box: {
        fill: "EFF6FF",
        padding: pad(8),
        border: { top: side("93C5FD"), right: side("93C5FD"), bottom: side("93C5FD"), left: side("93C5FD") },
      },
    },
    childIds: [leftParagraphId],
  })
  builder.add({
    id: flowRowTargets.rightStack,
    type: "flow-stack",
    props: {
      widthShare: 50,
      minHeight: 40,
      box: {
        fill: "F0FDF4",
        padding: pad(8),
        border: { top: side("86EFAC"), right: side("86EFAC"), bottom: side("86EFAC"), left: side("86EFAC") },
      },
    },
    childIds: [rightParagraphId],
  })
  body.childIds.push(builder.add({
    id: flowRowTargets.summaryRow,
    type: "flow-row",
    props: { gap: 10, minHeight: 40 },
    childIds: [flowRowTargets.leftStack, flowRowTargets.rightStack],
  }))
}

function addTable(builder, body, tableTargets, prefix, rowCount = 9) {
  const rowIds = []
  const makeCell = (rowNumber, columnNumber, text, options = {}) => {
    const paragraphId = `${prefix}_table_p_${String(rowNumber).padStart(3, "0")}_${String(columnNumber).padStart(3, "0")}`
    const cellId = `${prefix}_table_cell_${String(rowNumber).padStart(3, "0")}_${String(columnNumber).padStart(3, "0")}`
    builder.add(builder.paragraph(paragraphId, text, {
      ...builder.baseProps,
      fontSize: pt(9.5),
      lineHeight: 1.3,
      spacingAfter: pt(0),
      ...(options.header ? { fontWeight: "bold", textColor: "0F172A" } : {}),
    }))
    builder.add({
      id: cellId,
      type: "flow-table-cell",
      props: {
        verticalAlign: "top",
        box: {
          fill: options.header ? "E2E8F0" : rowNumber % 2 === 0 ? "FFFFFF" : "F8FAFC",
          padding: pad(5),
          border: { top: side(), right: side(), bottom: side(), left: side() },
        },
      },
      childIds: [paragraphId],
    })
    return cellId
  }

  const makeRow = (rowNumber, values, options = {}) => {
    const rowId = `${prefix}_table_row_${String(rowNumber).padStart(3, "0")}`
    const cellIds = values.map((value, index) => makeCell(rowNumber, index + 1, value, options))
    builder.add({
      id: rowId,
      type: "flow-table-row",
      props: { height: pt(options.header ? 22 : 30), allowBreak: !options.header },
      cellIds,
    })
    rowIds.push(rowId)
  }

  makeRow(1, ["Step", "Mutation target", "Expected behavior"], { header: true })
  for (let index = 2; index <= rowCount; index += 1) {
    makeRow(index, [
      String(index - 1),
      `Table body row ${index - 1}`,
      "Cell text is intentionally long enough to wrap and exercise table-cell paragraph traversal.",
    ])
  }

  body.childIds.push(builder.add({
    id: tableTargets.primaryTable,
    type: "flow-table",
    props: {
      headerRowCount: 1,
      repeatHeaderRows: true,
      marginTop: pt(8),
      marginBottom: pt(12),
      border: { top: side(), right: side(), bottom: side(), left: side() },
    },
    columns: [pt(48), pt(136), pt(248)].map((width) => ({ width })),
    rowIds,
  }))
}

function addProductTable(builder, body, tableTargets) {
  const rowIds = []
  const makeCell = (rowNumber, columnNumber, text, options = {}) => {
    const paragraphId = `product_report_kpi_p_${String(rowNumber).padStart(3, "0")}_${String(columnNumber).padStart(3, "0")}`
    const cellId = `product_report_kpi_cell_${String(rowNumber).padStart(3, "0")}_${String(columnNumber).padStart(3, "0")}`
    builder.add(builder.paragraph(paragraphId, text, {
      ...builder.baseProps,
      fontSize: pt(options.header ? 9.5 : 9),
      lineHeight: 1.25,
      spacingAfter: pt(0),
      ...(options.header ? { fontWeight: "bold", textColor: "0F172A" } : {}),
    }))
    builder.add({
      id: cellId,
      type: "flow-table-cell",
      props: {
        verticalAlign: "top",
        box: {
          fill: options.header ? "E0F2FE" : rowNumber % 2 === 0 ? "FFFFFF" : "F8FAFC",
          padding: pad(5),
          border: { top: side("64748B", 0.5), right: side("64748B", 0.5), bottom: side("64748B", 0.5), left: side("64748B", 0.5) },
        },
      },
      childIds: [paragraphId],
    })
    return cellId
  }

  const makeRow = (rowNumber, values, options = {}) => {
    const rowId = `product_report_kpi_row_${String(rowNumber).padStart(3, "0")}`
    const cellIds = values.map((value, index) => makeCell(rowNumber, index + 1, value, options))
    builder.add({
      id: rowId,
      type: "flow-table-row",
      props: { height: pt(options.header ? 22 : 30), allowBreak: !options.header },
      cellIds,
    })
    rowIds.push(rowId)
  }

  makeRow(1, ["No.", "KPI / risk note", "Current value"], { header: true })
  for (let index = 2; index <= 18; index += 1) {
    const longText = index === 6
      ? "Long narrative risk note: ข้อความไทยและ English content can wrap inside a table cell while the table keeps flattened v2 storage and valid row/cell ownership."
      : `Operational KPI ${index - 1}`
    makeRow(index, [
      String(index - 1),
      longText,
      index % 3 === 0 ? "Needs review" : `${index * 11}%`,
    ])
  }

  body.childIds.push(builder.add({
    id: tableTargets.primaryTable,
    type: "flow-table",
    props: {
      headerRowCount: 1,
      repeatHeaderRows: true,
      marginTop: pt(8),
      marginBottom: pt(12),
      border: { top: side("64748B", 0.5), right: side("64748B", 0.5), bottom: side("64748B", 0.5), left: side("64748B", 0.5) },
    },
    columns: [pt(48), pt(272), pt(112)].map((width) => ({ width })),
    rowIds,
  }))
}

function createFixturePackage(spec) {
  const builder = createBuilder()
  const body = { id: `${spec.targetPrefix}_body`, type: "body", props: {}, childIds: [] }
  builder.add(body)

  addParagraph(builder, body, `${spec.targetPrefix}_title`, spec.title, {
    ...builder.headingProps(1),
    spacingBefore: pt(0),
  })
  addParagraph(builder, body, spec.targets.typing.primary, `Primary typing target for ${spec.workflow} checks. This paragraph should stay responsive while the document is long enough to force pagination pressure.`)
  addParagraph(builder, body, spec.targets.node.duplicate, "Duplicate target. Operation tests and browser probes can duplicate this direct body paragraph.")
  addParagraph(builder, body, spec.targets.node.delete, "Delete target. Removing and undoing this paragraph should preserve selection and history behavior.")
  addParagraph(builder, body, spec.targets.node.reorderTarget, "Reorder target. The source paragraph should be movable before or after this paragraph.")
  addParagraph(builder, body, spec.targets.node.reorderSource, "Reorder source. This paragraph is intentionally close to the target for deterministic tests.")
  addParagraph(builder, body, spec.targets.node.split, "Split target. Browser probes can place the caret inside this paragraph and split it without depending on generated ids.")
  addParagraph(builder, body, spec.targets.node.merge, "Merge target. Browser probes can merge this paragraph with a neighbor and verify undo restores pagination.")

  for (let index = 1; index <= spec.paragraphCount; index += 1) {
    addParagraph(
      builder,
      body,
      `${spec.targetPrefix}_body_p_${String(index).padStart(3, "0")}`,
      `Body paragraph ${index} for ${spec.title}. This fixture uses DocumentNode version 2, section roots, flow-row/flow-stack, and flattened flow-table storage without nested table node maps.`,
      index % 12 === 0 ? builder.headingProps(2) : {},
    )
    if (index === Math.max(2, Math.floor(spec.paragraphCount * 0.45))) {
      addParagraph(
        builder,
        body,
        spec.targets.typing.pageBoundary,
        `Page-boundary typing target for ${spec.title}. This paragraph sits deep enough in the fixture to exercise scrolling, pagination pressure, and stale preview rejection.`,
      )
    }
    if (index === Math.max(3, Math.floor(spec.paragraphCount * 0.82))) {
      addParagraph(
        builder,
        body,
        spec.targets.typing.deepDocument,
        `Deep-document typing target for ${spec.title}. This target protects late-document edit responsiveness without hardcoded page or node ids.`,
      )
    }
    if (index === spec.flowRowAt) addFlowRow(builder, body, spec.targets.flowRow, spec.targetPrefix)
    if (index === spec.tableAt) addTable(builder, body, spec.targets.table, spec.targetPrefix, spec.tableRows ?? 9)
  }

  addParagraph(builder, body, spec.targets.typing.boundary, `Boundary typing target near the end of ${spec.title} for page-jump and scroll stability checks.`)

  const document = {
    version: 2,
    document: {
      id: spec.id,
      meta: { title: spec.title, createdAt: now, updatedAt: now },
      styles: {
        baseParagraphStyleId: "fixture.body",
        paragraphStyles: {
          "fixture.body": {
            id: "fixture.body",
            name: "Fixture Body",
            props: { ...builder.baseProps },
          },
        },
      },
      sections: [{
        id: `${spec.targetPrefix}_section_main`,
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(56), right: pt(56), bottom: pt(56), left: pt(56) },
        },
        roots: { body: body.id },
        nodes: builder.nodes,
      }],
    },
  }

  return {
    packageVersion: 2,
    kind: "document",
    id: document.document.id,
    meta: { title: spec.title, createdAt: now, updatedAt: now },
    document,
    fields: { version: 1, fields: [] },
    mockData: {
      version: 1,
      fixtureKind: spec.id,
      workflow: spec.workflow,
      generatedAt: now,
      targets: spec.targets,
    },
  }
}

function createProductReportFields(targets) {
  return {
    version: 1,
    fields: [
      { key: targets.field.reportTitle, fieldType: "text", label: "Report title", required: true, fallback: "Product Report" },
      { key: targets.field.reportDate, fieldType: "date", label: "Report date", required: true, fallback: "2026-06-20" },
      { key: targets.field.ownerName, fieldType: "text", label: "Owner name", required: true, fallback: "Owner" },
      { key: targets.field.totalAmount, fieldType: "number", label: "Total amount", required: true },
      {
        key: targets.field.riskLevel,
        fieldType: "enum",
        label: "Risk level",
        required: true,
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
        fallback: "medium",
      },
    ],
  }
}

function createProductReportData(targets) {
  return {
    version: 1,
    updatedAt: now,
    values: {
      [targets.field.reportTitle]: "Product Report v2",
      [targets.field.reportDate]: "2026-06-20",
      [targets.field.ownerName]: "FlowDoc Operations",
      [targets.field.totalAmount]: 4280000,
      [targets.field.riskLevel]: "medium",
    },
  }
}

function createProductSection(sectionId, options = {}) {
  const builder = createBuilder()
  const body = { id: `${sectionId}_body`, type: "body", props: {}, childIds: [] }
  builder.add(body)
  const roots = { body: body.id }

  if (options.headerText) {
    const header = { id: `${sectionId}_header`, type: "body", props: {}, childIds: [] }
    builder.add(header)
    addParagraph(builder, header, `${sectionId}_header_text`, options.headerText, {
      ...builder.baseProps,
      fontSize: pt(9),
      lineHeight: 1.2,
      spacingAfter: pt(0),
      textColor: "475569",
    })
    roots.header = header.id
  }

  if (options.footer) {
    const footer = { id: `${sectionId}_footer`, type: "body", props: {}, childIds: [] }
    builder.add(footer)
    addInlineParagraph(builder, footer, `${sectionId}_footer_text`, [
      { id: `${sectionId}_footer_label`, type: "text", text: "Page " },
      { id: `${sectionId}_footer_page_number`, type: "pageNumber" },
    ], {
      ...builder.baseProps,
      align: "right",
      fontSize: pt(9),
      lineHeight: 1.2,
      spacingAfter: pt(0),
      textColor: "475569",
    })
    roots.footer = footer.id
  }

  return {
    builder,
    body,
    section: {
      id: sectionId,
      type: "section",
      page: {
        size: "A4",
        orientation: "portrait",
        margin: { top: pt(60), right: pt(56), bottom: pt(60), left: pt(56) },
        ...(options.headerText || options.footer ? { headerReserved: 32, footerReserved: 24 } : {}),
        ...(options.pageNumberStart ? { pageNumberStart: options.pageNumberStart } : {}),
      },
      roots,
      nodes: builder.nodes,
    },
  }
}

function createProductReportV2Package(spec) {
  const targets = spec.targets
  const fields = createProductReportFields(targets)
  const data = createProductReportData(targets)

  const cover = createProductSection("product_report_cover")
  addInlineParagraph(cover.builder, cover.body, "product_report_cover_title", [
    { id: "product_report_cover_title_field", type: "fieldRef", key: targets.field.reportTitle, label: "Report title", fallback: "Product Report" },
  ], {
    ...cover.builder.headingProps(1),
    align: "center",
    fontSize: pt(22),
    spacingAfter: pt(14),
  })
  addInlineParagraph(cover.builder, cover.body, "product_report_cover_meta", [
    { id: "product_report_cover_owner_label", type: "text", text: "Prepared by " },
    { id: "product_report_cover_owner_field", type: "fieldRef", key: targets.field.ownerName, label: "Owner", fallback: "Owner" },
    { id: "product_report_cover_date_label", type: "text", text: " on " },
    { id: "product_report_cover_date_field", type: "fieldRef", key: targets.field.reportDate, label: "Report date", fallback: "2026-06-20" },
  ], {
    ...cover.builder.baseProps,
    align: "center",
    fontSize: pt(11),
    spacingAfter: pt(10),
  })

  const toc = createProductSection("product_report_toc_section")
  toc.body.childIds.push(toc.builder.add({
    id: "product_report_toc",
    type: "toc",
    props: { title: "Contents" },
  }))

  const body = createProductSection("product_report_body_section", {
    headerText: "Product Report v2 - generated fixture",
    footer: true,
    pageNumberStart: 1,
  })
  addParagraph(body.builder, body.body, "product_report_heading_summary", "Executive Summary", body.builder.headingProps(1))
  addInlineParagraph(body.builder, body.body, spec.targets.export.readinessTarget, [
    { id: "product_report_export_ready_label", type: "text", text: "Total portfolio amount: " },
    { id: "product_report_export_ready_amount", type: "fieldRef", key: targets.field.totalAmount, label: "Total amount", fallback: "0" },
    { id: "product_report_export_ready_risk_label", type: "text", text: " | Risk level: " },
    { id: "product_report_export_ready_risk", type: "fieldRef", key: targets.field.riskLevel, label: "Risk level", fallback: "medium" },
  ], {
    ...body.builder.baseProps,
    spacingAfter: pt(8),
  })
  addProductSummaryFlowRow(body.builder, body.body, targets.flowRow)
  addParagraph(body.builder, body.body, targets.typing.primary, "Primary typing target for product-report-v2. Editing here should feel normal while the report still has fields, a table, flow-row layout, history pressure, and export readiness requirements.")
  addParagraph(body.builder, body.body, targets.node.addAfter, "Add-after target. Palette or operation callers can insert a new paragraph after this node without hardcoding generated ids.")
  addParagraph(body.builder, body.body, targets.node.duplicate, "Duplicate target. Duplicating this paragraph should create one intentional history entry.")
  addParagraph(body.builder, body.body, targets.node.delete, "Delete target. Removing and undoing this paragraph should preserve selection, document validity, and pagination state.")
  addParagraph(body.builder, body.body, targets.node.reorderTarget, "Reorder target. The source paragraph should move around this paragraph deterministically.")
  addParagraph(body.builder, body.body, targets.node.reorderSource, "Reorder source. This paragraph is intentionally near the target for stable operation tests.")
  addParagraph(body.builder, body.body, targets.node.split, "Split target. Browser probes can split this paragraph and then verify the new paragraph participates in undo and pagination.")
  addParagraph(body.builder, body.body, targets.node.merge, "Merge target. Browser probes can merge this paragraph with its neighbor and verify focus returns to the previous node.")
  addParagraph(body.builder, body.body, targets.history.primaryEdit, "History primary edit target. This paragraph gives history-focused tests a stable product-report node.")
  addParagraph(body.builder, body.body, "product_report_heading_details", "KPI Detail Table", body.builder.headingProps(2))
  addProductTable(body.builder, body.body, targets.table)

  for (let index = 1; index <= 96; index += 1) {
    const paragraphId = `product_report_body_p_${String(index).padStart(3, "0")}`
    addParagraph(
      body.builder,
      body.body,
      paragraphId,
      `Report body paragraph ${index}. เนื้อหารายงานภาษาไทยและ English should remain editable while pagination and export readiness stay authoritative.`,
      index % 18 === 0 ? body.builder.headingProps(2) : {},
    )
    if (index === 28) {
      addParagraph(body.builder, body.body, targets.typing.pageBoundary, "Page-boundary product typing target. This target sits after enough content to exercise scroll and preview freshness near a page transition.")
    }
    if (index === 72) {
      addParagraph(body.builder, body.body, targets.typing.deepDocument, "Deep product typing target. Editing here should not depend on generated ids, page numbers, or fixture-specific visual positions.")
    }
  }
  addParagraph(body.builder, body.body, targets.typing.boundary, "Boundary typing target near the end of the product report for scroll and page-jump stability checks.")
  addParagraph(body.builder, body.body, "product_report_signature_heading", "Approval", body.builder.headingProps(2))
  addParagraph(body.builder, body.body, "product_report_signature_line", "Approved by: ______________________________    Date: __________________")

  const document = {
    version: 2,
    document: {
      id: spec.id,
      meta: { title: spec.title, createdAt: now, updatedAt: now },
      styles: {
        baseParagraphStyleId: "fixture.body",
        paragraphStyles: {
          "fixture.body": {
            id: "fixture.body",
            name: "Fixture Body",
            props: { ...body.builder.baseProps },
          },
        },
      },
      sections: [cover.section, toc.section, body.section],
    },
  }

  return {
    packageVersion: 2,
    kind: "document",
    id: document.document.id,
    meta: { title: spec.title, createdAt: now, updatedAt: now },
    document,
    fields,
    data,
    mockData: {
      version: 1,
      fixtureKind: spec.id,
      workflow: spec.workflow,
      generatedAt: now,
      targets,
    },
  }
}

fs.mkdirSync(outputDir, { recursive: true })

function writeVariant(spec, createPackage) {
  const pack = createPackage(spec)
  fs.writeFileSync(path.join(outputDir, spec.filename), `${JSON.stringify(pack, null, 2)}\n`, "utf8")
  const nodeCount = pack.document.document.sections.reduce((total, section) => total + Object.keys(section.nodes).length, 0)
  return {
    id: spec.id,
    filename: spec.filename,
    title: spec.title,
    workflow: spec.workflow,
    documentVersion: pack.document.version,
    packageVersion: pack.packageVersion,
    nodeCount,
    targets: spec.targets,
  }
}

const variants = [
  ...fixtureSpecs.map((spec) => writeVariant(spec, createFixturePackage)),
  writeVariant(productReportSpec, createProductReportV2Package),
]

const manifest = {
  generatedAt: now,
  variants,
}
fs.writeFileSync(path.join(outputDir, manifestFilename), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ variants }, null, 2))
