import type { DocumentNode, InlineNode, LayoutNode, ParagraphNode } from "../schema"
import { pt } from "../schema"
import {
  BULLET_BASIC_LIST_STYLE_ID,
  createListInstanceForPreset,
  getAllListStylePresets,
  PAREN_DECIMAL_LIST_STYLE_ID,
  TOR_CLAUSE_LIST_STYLE_ID,
} from "../document/listPresets"

export const TOR_LIST_FIXTURE_EXPECTED_MARKERS: Record<string, string> = {
  "p-background": "1.",
  "p-objective": "2.",
  "p-objective-1": "2.1",
  "p-objective-2": "2.2",
  "p-vendor": "3.",
  "p-vendor-legal": "3.1",
  "p-vendor-experience": "3.2",
  "p-vendor-experience-years": "3.2.1",
  "p-vendor-experience-docs": "3.2.2",
  "p-vendor-doc-1": "(1)",
  "p-vendor-doc-2": "(2)",
  "p-scope": "4.",
  "p-scope-document": "4.1",
  "p-scope-document-template": "4.1.1",
  "p-scope-document-template-fields": "4.1.1.1",
  "p-scope-document-template-layout": "4.1.1.2",
  "p-scope-ai": "4.2",
  "p-scope-ai-bullet-1": "•",
  "p-scope-ai-bullet-2": "•",
  "p-delivery": "5.",
  "p-delivery-duration": "5.1",
}

function text(id: string, value: string): InlineNode {
  return { id, type: "text", text: value }
}

function field(id: string, key: string): InlineNode {
  return { id, type: "fieldRef", key }
}

function paragraph(
  id: string,
  children: InlineNode[],
  props: Partial<ParagraphNode["props"]> = {},
): ParagraphNode {
  return {
    id,
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "default",
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(6),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...props,
    },
    children,
  }
}

function title(id: string, value: string): ParagraphNode {
  return paragraph(id, [text(`${id}-text`, value)], {
    align: "center",
    fontSize: pt(18),
    fontWeight: "bold",
    spacingAfter: pt(12),
  })
}

function subtitle(id: string, children: InlineNode[]): ParagraphNode {
  return paragraph(id, children, {
    align: "center",
    fontSize: pt(14),
    spacingAfter: pt(12),
  })
}

function heading(id: string, value: string, level: number, itemId: string): ParagraphNode {
  return paragraph(id, [text(`${id}-text`, value)], {
    fontSize: pt(14),
    fontWeight: "bold",
    headingLevel: 1,
    list: { instanceId: "tor-main", level, itemId },
  })
}

function bodyList(id: string, children: InlineNode[], level: number, itemId: string): ParagraphNode {
  return paragraph(id, children, {
    list: { instanceId: "tor-main", level, itemId },
  })
}

function parenItem(id: string, value: string, itemId: string): ParagraphNode {
  return paragraph(id, [text(`${id}-text`, value)], {
    list: { instanceId: "tor-subitem-qualification", level: 0, itemId },
  })
}

function bulletItem(id: string, value: string, itemId: string): ParagraphNode {
  return paragraph(id, [text(`${id}-text`, value)], {
    list: { instanceId: "tor-bullet-scope", level: 0, itemId },
  })
}

export function createTorListFixtureDocument(): DocumentNode {
  const paragraphs: ParagraphNode[] = [
    title("p-title", "ร่างขอบเขตของงาน"),
    subtitle("p-project-name", [
      text("p-project-name-prefix", "โครงการ "),
      field("p-project-name-field", "project.name"),
    ]),
    heading("p-background", "ความเป็นมา", 0, "tor.background"),
    paragraph("p-background-body", [
      text("p-background-body-1", "หน่วยงานมีความประสงค์จะดำเนินโครงการ "),
      field("p-background-body-project", "project.name"),
      text("p-background-body-2", " เพื่อเพิ่มประสิทธิภาพในการดำเนินงานและลดขั้นตอนการจัดทำเอกสารด้วยมือ"),
    ], { indentLeft: pt(36) }),
    heading("p-objective", "วัตถุประสงค์", 0, "tor.objective"),
    bodyList("p-objective-1", [
      text("p-objective-1-text", "เพื่อพัฒนาระบบสำหรับจัดทำและบริหารจัดการเอกสาร"),
    ], 1, "tor.objective.createSystem"),
    bodyList("p-objective-2", [
      text("p-objective-2-text", "เพื่อลดภาระการกรอกข้อมูลซ้ำและการจัดรูปแบบเอกสารด้วยมือ"),
    ], 1, "tor.objective.reduceManualWork"),
    heading("p-vendor", "คุณสมบัติของผู้เสนอราคา", 0, "tor.vendorQualification"),
    bodyList("p-vendor-legal", [
      text("p-vendor-legal-text", "ผู้เสนอราคาต้องเป็นนิติบุคคลที่จดทะเบียนถูกต้องตามกฎหมาย"),
    ], 1, "tor.vendorQualification.legalEntity"),
    bodyList("p-vendor-experience", [
      text("p-vendor-experience-text", "ผู้เสนอราคาต้องมีประสบการณ์ดำเนินงานในลักษณะเดียวกัน"),
    ], 1, "tor.vendorQualification.experience"),
    bodyList("p-vendor-experience-years", [
      text("p-vendor-experience-years-1", "มีประสบการณ์ไม่น้อยกว่า "),
      field("p-vendor-experience-years-field", "vendor.minimumExperienceYears"),
      text("p-vendor-experience-years-2", " ปี"),
    ], 2, "tor.vendorQualification.experience.years"),
    bodyList("p-vendor-experience-docs", [
      text("p-vendor-experience-docs-text", "ต้องมีเอกสารรับรองผลงานหรือสัญญาจ้างที่เกี่ยวข้อง"),
    ], 2, "tor.vendorQualification.experience.documents"),
    parenItem("p-vendor-doc-1", "สำเนาหนังสือรับรองนิติบุคคล", "tor.vendorQualification.documents.certificate"),
    parenItem("p-vendor-doc-2", "เอกสารแสดงผลงานที่ผ่านมา", "tor.vendorQualification.documents.portfolio"),
    heading("p-scope", "ขอบเขตของงาน", 0, "tor.scope"),
    bodyList("p-scope-document", [
      text("p-scope-document-text", "ระบบต้องสามารถบริหารจัดการเอกสารได้"),
    ], 1, "tor.scope.documentManagement"),
    bodyList("p-scope-document-template", [
      text("p-scope-document-template-text", "สามารถสร้างและแก้ไข template เอกสารได้"),
    ], 2, "tor.scope.documentManagement.template"),
    bodyList("p-scope-document-template-fields", [
      text("p-scope-document-template-fields-text", "รองรับการกำหนด field สำหรับผูกข้อมูลในเอกสาร"),
    ], 3, "tor.scope.documentManagement.template.fields"),
    bodyList("p-scope-document-template-layout", [
      text("p-scope-document-template-layout-text", "รองรับการจัดหน้าและแสดงผลก่อนส่งออกเป็น PDF"),
    ], 3, "tor.scope.documentManagement.template.layout"),
    bodyList("p-scope-ai", [
      text("p-scope-ai-text", "ระบบควรรองรับการช่วยร่างโครงเอกสารด้วย AI ในอนาคต"),
    ], 1, "tor.scope.aiAssist"),
    bulletItem("p-scope-ai-bullet-1", "ผู้ใช้สามารถอธิบายเอกสารที่ต้องการด้วยภาษาธรรมชาติ", "tor.scope.aiAssist.requirementInput"),
    bulletItem("p-scope-ai-bullet-2", "ระบบสามารถแปลงคำอธิบายเป็นโครงร่างเอกสารเบื้องต้น", "tor.scope.aiAssist.schemaDraft"),
    heading("p-delivery", "ระยะเวลาดำเนินงานและการส่งมอบ", 0, "tor.delivery"),
    bodyList("p-delivery-duration", [
      text("p-delivery-duration-1", "ผู้รับจ้างต้องดำเนินงานให้แล้วเสร็จภายใน "),
      field("p-delivery-duration-field", "project.durationDays"),
      text("p-delivery-duration-2", " วัน นับถัดจากวันที่ลงนามในสัญญา"),
    ], 1, "tor.delivery.duration"),
  ]
  const nodes = Object.fromEntries(paragraphs.map((node) => [node.id, node])) as Record<string, LayoutNode>

  return {
    version: 1,
    document: {
      id: "tor-list-fixture",
      meta: { title: "TOR List Fixture" },
      listStyles: getAllListStylePresets(),
      listInstances: {
        "tor-main": createListInstanceForPreset("tor-main", TOR_CLAUSE_LIST_STYLE_ID),
        "tor-subitem-qualification": createListInstanceForPreset("tor-subitem-qualification", PAREN_DECIMAL_LIST_STYLE_ID),
        "tor-bullet-scope": createListInstanceForPreset("tor-bullet-scope", BULLET_BASIC_LIST_STYLE_ID),
      },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: { top: pt(72), right: pt(72), bottom: pt(72), left: pt(72) },
        },
        bodyRootId: "body",
        nodes: {
          body: { id: "body", type: "body", props: {}, childIds: paragraphs.map((node) => node.id) },
          ...nodes,
        },
      }],
    },
  }
}
