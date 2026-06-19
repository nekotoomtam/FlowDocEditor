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
  },
  node: {
    delete: "v2_delete_target",
    duplicate: "v2_duplicate_target",
    reorderSource: "v2_reorder_source",
    reorderTarget: "v2_reorder_target",
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
    },
    node: {
      delete: `${prefix}_delete_target`,
      duplicate: `${prefix}_duplicate_target`,
      reorderSource: `${prefix}_reorder_source`,
      reorderTarget: `${prefix}_reorder_target`,
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
]

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

  for (let index = 1; index <= spec.paragraphCount; index += 1) {
    addParagraph(
      builder,
      body,
      `${spec.targetPrefix}_body_p_${String(index).padStart(3, "0")}`,
      `Body paragraph ${index} for ${spec.title}. This fixture uses DocumentNode version 2, section roots, flow-row/flow-stack, and flattened flow-table storage without nested table node maps.`,
      index % 12 === 0 ? builder.headingProps(2) : {},
    )
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

fs.mkdirSync(outputDir, { recursive: true })

const variants = fixtureSpecs.map((spec) => {
  const pack = createFixturePackage(spec)
  fs.writeFileSync(path.join(outputDir, spec.filename), `${JSON.stringify(pack, null, 2)}\n`, "utf8")
  const nodeCount = Object.keys(pack.document.document.sections[0].nodes).length
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
})

const manifest = {
  generatedAt: now,
  variants,
}
fs.writeFileSync(path.join(outputDir, manifestFilename), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ variants }, null, 2))
