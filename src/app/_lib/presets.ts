export interface DslPreset {
  label: string
  dsl: string
}

const simple = {
  body: [
    { p: "หัวเรื่อง", fontSize: 18, align: "center" },
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    { spacer: 16 },
    { p: "ย่อหน้าที่สอง — เนื้อหา" },
    { p: "ย่อหน้าที่สาม — ตัวอย่างข้อความเพิ่มเติม" },
  ],
}

const columns = {
  body: [
    { p: "Columns Layout", fontSize: 16 },
    { spacer: 12 },
    { cols: ["Column A: ซ้าย", "Column B: ขวา"] },
    { spacer: 12 },
    {
      cols: [
        [{ p: "Col 1 บรรทัดที่ 1" }, { p: "Col 1 บรรทัดที่ 2" }],
        [{ p: "Col 2 บรรทัดที่ 1" }],
        [{ p: "Col 3 บรรทัดที่ 1" }],
      ],
    },
  ],
}

const table = {
  body: [
    { p: "ตัวอย่างตาราง", fontSize: 16 },
    { spacer: 12 },
    {
      table: {
        cols: [270, 90, 91],
        border: true,
        rows: [
          ["รายการ", "จำนวน", "ราคา"],
          ["สินค้า A", "2 ชิ้น", "500 บาท"],
          ["สินค้า B", "1 ชิ้น", "1,200 บาท"],
          [{ p: "รวมทั้งสิ้น", align: "right" }, "", "1,700 บาท"],
        ],
      },
    },
  ],
}

const full = {
  title: "FlowDoc Test",
  page: {
    size: "A4",
    margin: { top: 36, right: 72, bottom: 36, left: 72 },
    headerReserved: 36,
    footerReserved: 28,
  },
  header: [
    { cols: ["FlowDoc — Pipeline Test", { p: "ทดสอบระบบ Layout Engine", align: "right" }] },
  ],
  headerFirstPage: null,
  footer: [{ p: "เอกสารทดสอบ — FlowDoc", align: "center" }],
  footerFirstPage: null,
  body: [
    "FlowDoc — Pipeline Test",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    { spacer: 24 },
    { cols: ["Column A: ข้อมูลฝั่งซ้าย", "Column B: ข้อมูลฝั่งขวา"] },
    { spacer: 16 },
    {
      table: {
        cols: [270, 90, 91],
        border: true,
        rows: [
          ["รายการ", "จำนวน", "ราคา"],
          ["สินค้า A", "2 ชิ้น", "500 บาท"],
          ["สินค้า B", "1 ชิ้น", "1,200 บาท"],
          ["รวมทั้งสิ้น", "", "1,700 บาท"],
        ],
      },
    },
    ...Array.from({ length: 10 }, (_, i) =>
      `Paragraph ${i + 1}: ทดสอบ pagination — FlowDoc layout engine`,
    ),
  ],
}

export const PRESETS: DslPreset[] = [
  { label: "Simple",   dsl: JSON.stringify(simple,  null, 2) },
  { label: "Columns",  dsl: JSON.stringify(columns, null, 2) },
  { label: "Table",    dsl: JSON.stringify(table,   null, 2) },
  { label: "Full",     dsl: JSON.stringify(full,    null, 2) },
]
