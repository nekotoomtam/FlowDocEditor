import fs from "node:fs"
import path from "node:path"

const now = process.env.FLOWDOC_MOCK_NOW ?? new Date().toISOString()
const rootDir = process.cwd()
const outputDirs = [
  path.resolve(rootDir, "public/mock"),
  path.resolve(rootDir, ".playwright-tmp"),
]

const variants = [
  {
    id: "long",
    filename: "flowdoc-long-mock.flowdoc.json",
    title: "Mock FlowDoc Long Thai Document",
    chapters: 8,
    sectionsPerChapter: 7,
    paragraphsPerSection: 6,
    tableRows: 28,
    appendixParagraphs: 14,
  },
  {
    id: "stress",
    filename: "flowdoc-stress-mock.flowdoc.json",
    title: "Mock FlowDoc Stress Thai Document",
    chapters: 12,
    sectionsPerChapter: 8,
    paragraphsPerSection: 7,
    tableRows: 34,
    appendixParagraphs: 18,
  },
]

const pt = (value) => ({ value, unit: "pt" })
const side = (color = "CBD5E1", width = 1) => ({ style: "solid", width: pt(width), color })
const pad = (value) => ({ top: pt(value), right: pt(value), bottom: pt(value), left: pt(value) })

const thaiSentences = [
  "ระบบจำลองนี้ใช้สำหรับตรวจสอบพฤติกรรมการจัดหน้า การตัดบรรทัด และการคงตำแหน่งขององค์ประกอบเมื่อมีเนื้อหาจำนวนมากในเอกสารเดียว",
  "ข้อความถูกตั้งใจให้ยาวพอเพื่อสร้างหลายบรรทัดและทำให้เครื่องยนต์ pagination ต้องประเมินความสูงจริงของย่อหน้าอย่างต่อเนื่อง",
  "ข้อมูลในส่วนนี้ไม่ใช่ข้อกำหนดจริง แต่ช่วยจำลองสภาพเอกสารราชการที่มีหัวข้อย่อย รายการ ตาราง และกล่องข้อมูลแทรก",
  "ทุกย่อหน้าควรยังแก้ไขได้ตามปกติ และหัวข้อที่อยู่ใน body โดยตรงเท่านั้นที่ถูกนำไปแสดงในสารบัญ",
  "กรณีทดสอบนี้ตั้งใจให้มีความยาวมากกว่าหนึ่งร้อยหน้า เพื่อดูการเลื่อน การเลือกข้อความ การย้อนกลับ และการส่งออกในสถานการณ์ที่หนักกว่าปกติ",
]

function createBuilder() {
  let seq = 1
  const nodes = {}

  const id = (prefix) => `${prefix}_${String(seq++).padStart(5, "0")}`
  const textRun = (text, style) => {
    const run = { id: id("text"), type: "text", text }
    if (style) run.style = style
    return run
  }
  const fieldRef = (key, label, fallback) => ({ id: id("field"), type: "fieldRef", key, label, fallback })

  const baseProps = {
    align: "left",
    fontSize: pt(12),
    fontFamilyKey: "default",
    textColor: "111827",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    strikethrough: false,
    lineHeight: 1.5,
    spacingBefore: pt(0),
    spacingAfter: pt(8),
    textIndent: pt(0),
    indentLeft: pt(0),
    indentRight: pt(0),
  }

  const paragraph = (paragraphId, content, props = {}) => ({
    id: paragraphId,
    type: "paragraph",
    props: { ...baseProps, ...props },
    children: Array.isArray(content) ? content : [textRun(String(content))],
  })
  const add = (node) => {
    nodes[node.id] = node
    return node.id
  }
  const headingProps = (level) => ({
    headingLevel: level,
    fontWeight: "bold",
    fontSize: pt(level === 1 ? 20 : level === 2 ? 16 : level === 3 ? 14 : 12),
    lineHeight: level <= 2 ? 1.25 : 1.35,
    spacingBefore: pt(level === 1 ? 14 : 8),
    spacingAfter: pt(level === 1 ? 10 : 6),
    textColor: level === 1 ? "0F172A" : "1F2937",
    keepWithNext: true,
  })

  return { id, nodes, textRun, fieldRef, baseProps, paragraph, add, headingProps }
}

function createTable(builder, chapter, rowCount) {
  const tableId = builder.id(`flow_table_ch${chapter}`)
  const tableNodes = {}
  const rowIds = []
  const tableParagraph = (content, props = {}) => builder.paragraph(builder.id("table_p"), content, {
    ...builder.baseProps,
    fontSize: pt(10),
    lineHeight: 1.35,
    spacingBefore: pt(0),
    spacingAfter: pt(0),
    ...props,
  })

  const tableCell = (content, options = {}) => {
    const paragraph = tableParagraph(content, options.paragraphProps ?? {})
    tableNodes[paragraph.id] = paragraph
    const cell = {
      id: builder.id("ftcell"),
      type: "flow-table-cell",
      props: {
        verticalAlign: options.verticalAlign ?? "top",
        box: {
          fill: options.fill,
          padding: pad(options.padding ?? 5),
          border: {
            top: side(options.borderColor),
            right: side(options.borderColor),
            bottom: side(options.borderColor),
            left: side(options.borderColor),
          },
        },
      },
      childIds: [paragraph.id],
    }
    tableNodes[cell.id] = cell
    return cell.id
  }

  const headerCells = ["ลำดับ", "รายการตรวจ", "รายละเอียดจำลอง", "ผู้รับผิดชอบ", "ระยะเวลา"].map((label, index) =>
    tableCell(label, {
      fill: "E2E8F0",
      borderColor: "94A3B8",
      paragraphProps: { fontWeight: "bold", align: index === 0 ? "center" : "left", textColor: "0F172A" },
    }),
  )
  const headerRow = { id: builder.id("ftrow"), type: "flow-table-row", props: { height: pt(24) }, cellIds: headerCells }
  tableNodes[headerRow.id] = headerRow
  rowIds.push(headerRow.id)

  for (let row = 1; row <= rowCount; row += 1) {
    const fill = row % 2 === 0 ? "FFFFFF" : "F8FAFC"
    const values = [
      String(row),
      `กิจกรรม ${chapter}.${row}`,
      `ตรวจสอบข้อมูลจำลองลำดับที่ ${row} ของบทที่ ${chapter} โดยมีข้อความยาวเพื่อทดสอบการขึ้นบรรทัดภายใน cell และการแบ่งตารางข้ามหน้า`,
      row % 3 === 0 ? "คณะทำงาน" : row % 3 === 1 ? "ฝ่ายเอกสาร" : "ฝ่ายระบบ",
      row % 4 === 0 ? "รายเดือน" : "ภายใน 7 วัน",
    ]
    const cells = values.map((value, index) => tableCell(value, {
      fill,
      borderColor: "CBD5E1",
      paragraphProps: { align: index === 0 ? "center" : "left", fontSize: pt(index === 2 ? 9.5 : 10) },
    }))
    const rowNode = { id: builder.id("ftrow"), type: "flow-table-row", props: { height: pt(32), allowBreak: true }, cellIds: cells }
    tableNodes[rowNode.id] = rowNode
    rowIds.push(rowNode.id)
  }

  return {
    id: tableId,
    type: "flow-table",
    props: {
      headerRowCount: 1,
      repeatHeaderRows: true,
      marginTop: pt(8),
      marginBottom: pt(14),
      border: { top: side("CBD5E1"), right: side("CBD5E1"), bottom: side("CBD5E1"), left: side("CBD5E1") },
    },
    columns: [pt(42), pt(112), pt(168), pt(78), pt(78)].map((width) => ({ width })),
    rowIds,
    nodes: tableNodes,
  }
}

function createFlowStackExample(builder, chapter, section) {
  const rowId = builder.id("flow_row")
  const leftId = builder.id("flow_stack")
  const rightId = builder.id("flow_stack")
  const leftTitle = builder.id("local_title")
  const leftBody = builder.id("local_body")
  const rightTitle = builder.id("local_title")
  const rightBody = builder.id("local_body")

  builder.add(builder.paragraph(leftTitle, `หมายเหตุภายในกรอบ ${chapter}.${section}`, {
    fontWeight: "bold",
    fontSize: pt(11),
    spacingAfter: pt(3),
    textColor: "334155",
  }))
  builder.add(builder.paragraph(leftBody, "ย่อหน้านี้ดูคล้ายหัวข้อย่อยแต่ไม่ได้ใส่ headingLevel เพื่อยืนยันว่า paragraph ภายใน flow-stack ไม่ถูกนับเข้า TOC", {
    fontSize: pt(10.5),
    lineHeight: 1.35,
    spacingAfter: pt(0),
  }))
  builder.add(builder.paragraph(rightTitle, `เงื่อนไขประกอบ ${chapter}.${section}`, {
    fontWeight: "bold",
    fontSize: pt(11),
    spacingAfter: pt(3),
    textColor: "334155",
  }))
  builder.add(builder.paragraph(rightBody, "ใช้จำลอง local content ในกรอบ เพื่อดูการเลื่อน การเลือก และการจัดหน้าเมื่อมีโครงสร้างซ้อนอยู่ใน body", {
    fontSize: pt(10.5),
    lineHeight: 1.35,
    spacingAfter: pt(0),
  }))
  builder.add({
    id: leftId,
    type: "flow-stack",
    props: {
      widthShare: 50,
      minHeight: 24,
      box: { fill: "F8FAFC", padding: pad(8), border: { top: side("CBD5E1"), right: side("CBD5E1"), bottom: side("CBD5E1"), left: side("CBD5E1") } },
    },
    childIds: [leftTitle, leftBody],
  })
  builder.add({
    id: rightId,
    type: "flow-stack",
    props: {
      widthShare: 50,
      minHeight: 24,
      box: { fill: "F8FAFC", padding: pad(8), border: { top: side("CBD5E1"), right: side("CBD5E1"), bottom: side("CBD5E1"), left: side("CBD5E1") } },
    },
    childIds: [rightTitle, rightBody],
  })
  return { id: rowId, type: "flow-row", props: { gap: 8, minHeight: 24 }, childIds: [leftId, rightId] }
}

function paragraphText(chapter, section, paragraph) {
  return `บทที่ ${chapter} ข้อ ${chapter}.${section} ย่อหน้า ${paragraph}: ` +
    thaiSentences.map((sentence, index) => `${sentence} (${chapter}.${section}.${paragraph}.${index + 1})`).join(" ")
}

function buildPackage(variant) {
  const builder = createBuilder()
  const docId = `mock_${variant.id}_thai_document`
  const bodyId = "body_main"
  const sectionId = "section_main"
  const body = { id: bodyId, type: "body", props: {}, childIds: [] }
  builder.add(body)
  const push = (node) => body.childIds.push(builder.add(node))

  push(builder.paragraph("cover_title", "เอกสารจำลองสำหรับทดสอบ FlowDoc Editor", {
    align: "center",
    fontSize: pt(24),
    fontWeight: "bold",
    lineHeight: 1.2,
    spacingBefore: pt(160),
    spacingAfter: pt(18),
    textColor: "0F172A",
  }))
  push(builder.paragraph("cover_project", [
    builder.textRun("โครงการ: "),
    builder.fieldRef("project.name", "ชื่อโครงการ", "โครงการทดสอบเอกสารยาว"),
  ], { align: "center", fontSize: pt(16), spacingAfter: pt(10) }))
  push(builder.paragraph("cover_agency", [
    builder.textRun("หน่วยงาน: "),
    builder.fieldRef("agency.name", "หน่วยงาน", "หน่วยงานตัวอย่าง"),
  ], { align: "center", fontSize: pt(14), spacingAfter: pt(8) }))
  push(builder.paragraph("cover_note", "ชุดข้อมูลนี้สร้างขึ้นเพื่อทดลอง pagination, TOC, heading, list, table, field และ editor interaction ในเอกสารขนาดใหญ่", {
    align: "center",
    fontSize: pt(12),
    spacingBefore: pt(42),
    spacingAfter: pt(0),
    textColor: "475569",
  }))
  push({ id: "cover_break", type: "page-break", props: {} })
  push({ id: "toc_main", type: "toc", props: { title: "สารบัญ", maxLevel: 6 } })

  for (let chapter = 1; chapter <= variant.chapters; chapter += 1) {
    push(builder.paragraph(builder.id("h1"), `บทที่ ${chapter} ภาพรวมการดำเนินงานจำลอง`, builder.headingProps(1)))
    push(builder.paragraph(builder.id("intro"), [
      builder.textRun(`บทนำของบทที่ ${chapter} อ้างอิงงบประมาณ `),
      builder.fieldRef("budget.total", "งบประมาณรวม", "12500000"),
      builder.textRun(" และวันที่อนุมัติจากข้อมูลกลางของเอกสาร"),
    ], { spacingAfter: pt(10) }))

    for (let section = 1; section <= variant.sectionsPerChapter; section += 1) {
      push(builder.paragraph(builder.id("h2"), `${chapter}.${section} ขอบเขตและเงื่อนไขการทดสอบ`, builder.headingProps(2)))
      if (section % 2 === 1) push(builder.paragraph(builder.id("h3"), `${chapter}.${section}.1 รายละเอียดเชิงกระบวนการ`, builder.headingProps(3)))
      if (section % 4 === 0) {
        push(builder.paragraph(builder.id("h4"), `${chapter}.${section}.1.1 ข้อย่อยระดับ 4`, builder.headingProps(4)))
        push(builder.paragraph(builder.id("h5"), `${chapter}.${section}.1.1.1 ข้อย่อยระดับ 5`, builder.headingProps(5)))
        push(builder.paragraph(builder.id("h6"), `${chapter}.${section}.1.1.1.1 ข้อย่อยระดับ 6`, builder.headingProps(6)))
      }

      for (let paragraph = 1; paragraph <= variant.paragraphsPerSection; paragraph += 1) {
        push(builder.paragraph(builder.id("p"), paragraphText(chapter, section, paragraph), {
          textIndent: paragraph === 1 ? pt(28) : pt(0),
        }))
      }

      push(builder.paragraph(builder.id("li"), `รายการหลักของข้อ ${chapter}.${section} ใช้สำหรับทดสอบ list level 1 และตำแหน่งตัวเลขในเอกสารยาว`, {
        list: { instanceId: "mock-outline", level: 0, itemId: `item_${chapter}_${section}_1` },
        spacingAfter: pt(4),
      }))
      push(builder.paragraph(builder.id("li"), `รายการย่อยของข้อ ${chapter}.${section} ต้องไม่ทำให้ cursor และ selection กระตุกเมื่อแก้ไขข้อความไทย`, {
        list: { instanceId: "mock-outline", level: 1, itemId: `item_${chapter}_${section}_2` },
        spacingAfter: pt(4),
      }))
      push(builder.paragraph(builder.id("li"), `รายการระดับลึกของข้อ ${chapter}.${section} ใช้จำลองลำดับย่อยแบบหลายชั้น`, {
        list: { instanceId: "mock-outline", level: 2, itemId: `item_${chapter}_${section}_3` },
        spacingAfter: pt(8),
      }))
      if (section % 3 === 0) push(createFlowStackExample(builder, chapter, section))
    }

    push(builder.paragraph(builder.id("h2"), `${chapter}.9 ตารางตรวจสอบประจำบท`, builder.headingProps(2)))
    push(builder.paragraph(builder.id("table_note"), `ตารางของบทที่ ${chapter} มีจำนวนแถวมากพอให้ข้ามหน้าและทดสอบการทำซ้ำ header row ใน pagination/export`, {
      spacingAfter: pt(4),
    }))
    push(createTable(builder, chapter, variant.tableRows))
    if (chapter < variant.chapters) push({ id: builder.id("chapter_break"), type: "page-break", props: {} })
  }

  push({ id: "appendix_break", type: "page-break", props: {} })
  push(builder.paragraph("appendix_h1", "ภาคผนวก ก สรุปการตรวจรับจำลอง", builder.headingProps(1)))
  for (let index = 1; index <= variant.appendixParagraphs; index += 1) {
    push(builder.paragraph(builder.id("appendix_p"), `ภาคผนวกย่อหน้าที่ ${index}: ${thaiSentences.join(" ")}`, { spacingAfter: pt(8) }))
  }

  const page = { size: "A4", orientation: "portrait", margin: { top: pt(56), right: pt(56), bottom: pt(56), left: pt(56) } }
  const document = {
    version: 1,
    document: {
      id: docId,
      meta: { title: variant.title, createdAt: now, updatedAt: now },
      styles: {
        baseParagraphStyleId: "tor.body",
        paragraphStyles: { "tor.body": { id: "tor.body", name: "TOR Body", props: { ...builder.baseProps } } },
      },
      listStyles: {
        "mock-outline-style": {
          id: "mock-outline-style",
          levels: [
            { level: 0, format: "decimal", pattern: "%1.", startAt: 1, markerIndent: pt(0), bodyIndent: pt(28), tabStop: pt(28) },
            { level: 1, format: "decimal", pattern: "%1.%2", startAt: 1, restartAfterLevel: 0, markerIndent: pt(28), bodyIndent: pt(56), tabStop: pt(56) },
            { level: 2, format: "thaiLetter", pattern: "(%3)", startAt: 1, restartAfterLevel: 1, markerIndent: pt(56), bodyIndent: pt(84), tabStop: pt(84) },
          ],
        },
      },
      listInstances: { "mock-outline": { id: "mock-outline", styleId: "mock-outline-style" } },
      sections: [{ id: sectionId, type: "section", page, bodyRootId: bodyId, nodes: builder.nodes }],
    },
  }

  const pack = {
    packageVersion: 2,
    kind: "document",
    id: docId,
    meta: { title: variant.title, createdAt: now, updatedAt: now },
    document,
    fields: {
      version: 1,
      fields: [
        { key: "agency.name", label: "หน่วยงาน", fieldType: "text" },
        { key: "project.name", label: "ชื่อโครงการ", fieldType: "text" },
        { key: "budget.total", label: "งบประมาณรวม", fieldType: "number" },
        { key: "approved.date", label: "วันที่อนุมัติ", fieldType: "date" },
      ],
    },
    data: {
      version: 1,
      updatedAt: now,
      values: {
        "agency.name": "สำนักงานตัวอย่างเพื่อการทดสอบเอกสาร",
        "project.name": "โครงการจำลองระบบเอกสารยาวและสารบัญอัตโนมัติ",
        "budget.total": 12500000,
        "approved.date": "2026-05-27",
      },
    },
  }
  pack.mockData = createMockData(pack)
  return pack
}

function paragraphTextContent(node) {
  return node.children
    .filter((child) => child.type === "text")
    .map((child) => child.text)
    .join("")
}

function collectDirectBodyHeadingEntries(document, maxLevel) {
  const entries = []
  for (const section of document.document.sections) {
    const body = section.nodes[section.bodyRootId]
    if (!body || body.type !== "body") continue
    for (const nodeId of body.childIds) {
      const node = section.nodes[nodeId]
      if (node?.type !== "paragraph") continue
      const level = node.props.headingLevel
      if (!level || level > maxLevel) continue
      entries.push({
        nodeId,
        text: paragraphTextContent(node),
        level,
      })
    }
  }
  return entries
}

function collectMockTocSummaries(pack) {
  const summaries = []
  for (const section of pack.document.document.sections) {
    const body = section.nodes[section.bodyRootId]
    if (!body || body.type !== "body") continue
    for (const nodeId of body.childIds) {
      const node = section.nodes[nodeId]
      if (node?.type !== "toc") continue
      const maxLevel = node.props.maxLevel ?? 3
      const entries = collectDirectBodyHeadingEntries(pack.document, maxLevel)
      summaries.push({
        nodeId,
        title: node.props.title ?? "สารบัญ",
        maxLevel,
        entryCount: entries.length,
        entries,
      })
    }
  }
  return summaries
}

function collectHeadingCounts(pack) {
  const counts = {}
  const entries = collectDirectBodyHeadingEntries(pack.document, 6)
  for (const entry of entries) {
    const key = `h${entry.level}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function createMockData(pack) {
  return {
    version: 1,
    generatedAt: now,
    purpose: "simulated TOC fixture data for large-document editor/export testing",
    headingCounts: collectHeadingCounts(pack),
    toc: collectMockTocSummaries(pack),
  }
}

function summarizePackage(pack, raw) {
  const section = pack.document.document.sections[0]
  const body = section.nodes[section.bodyRootId]
  return {
    id: pack.id,
    title: pack.meta.title,
    bytes: Buffer.byteLength(raw, "utf8"),
    bodyChildren: body.childIds.length,
    nodeCount: Object.keys(section.nodes).length,
    hasThaiText: raw.includes("เอกสารจำลอง"),
    questionTriples: (raw.match(/\?\?\?/g) ?? []).length,
  }
}

const manifest = {
  generatedAt: now,
  variants: [],
}

for (const outputDir of outputDirs) {
  fs.mkdirSync(outputDir, { recursive: true })
}

for (const variant of variants) {
  const pack = buildPackage(variant)
  const raw = `${JSON.stringify(pack)}\n`
  const summary = { variant: variant.id, filename: variant.filename, ...summarizePackage(pack, raw) }
  manifest.variants.push(summary)
  for (const outputDir of outputDirs) {
    fs.writeFileSync(path.join(outputDir, variant.filename), raw, "utf8")
  }
  console.log(JSON.stringify(summary, null, 2))
}

const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`
for (const outputDir of outputDirs) {
  fs.writeFileSync(path.join(outputDir, "flowdoc-mock-manifest.json"), manifestRaw, "utf8")
}
