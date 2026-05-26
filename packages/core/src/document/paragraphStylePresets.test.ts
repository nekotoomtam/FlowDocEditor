import { describe, expect, it } from "vitest"
import { pt } from "../schema"
import {
  getAllParagraphStylePresets,
  getParagraphStylePreset,
  TOR_BODY_PARAGRAPH_STYLE_ID,
  TOR_HEADING1_PARAGRAPH_STYLE_ID,
  TOR_HEADING2_PARAGRAPH_STYLE_ID,
  TOR_HEADING3_PARAGRAPH_STYLE_ID,
  TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE_ID,
  TOR_TABLE_BODY_PARAGRAPH_STYLE_ID,
} from "./paragraphStylePresets"

describe("paragraph style presets", () => {
  it("defines reusable TOR paragraph presets", () => {
    const presets = getAllParagraphStylePresets()

    expect(Object.keys(presets)).toEqual([
      TOR_BODY_PARAGRAPH_STYLE_ID,
      TOR_HEADING1_PARAGRAPH_STYLE_ID,
      TOR_HEADING2_PARAGRAPH_STYLE_ID,
      TOR_HEADING3_PARAGRAPH_STYLE_ID,
      TOR_TABLE_BODY_PARAGRAPH_STYLE_ID,
      TOR_SIGNATURE_TEXT_PARAGRAPH_STYLE_ID,
    ])
    expect(presets[TOR_BODY_PARAGRAPH_STYLE_ID].props).toMatchObject({
      fontFamilyKey: "sarabun",
      fontSize: pt(12),
      lineHeight: 1.5,
      spacingAfter: pt(8),
    })
    expect(presets[TOR_HEADING1_PARAGRAPH_STYLE_ID].props).toMatchObject({
      fontSize: pt(16),
      fontWeight: "bold",
      headingLevel: 1,
      keepWithNext: true,
    })
    expect(presets[TOR_TABLE_BODY_PARAGRAPH_STYLE_ID].props).toMatchObject({
      fontSize: pt(11),
      lineHeight: 1.25,
      spacingAfter: pt(0),
    })
  })

  it("returns cloned preset definitions before inserting them into documents", () => {
    const first = getParagraphStylePreset(TOR_BODY_PARAGRAPH_STYLE_ID)
    first.props.fontSize!.value = 99

    const second = getParagraphStylePreset(TOR_BODY_PARAGRAPH_STYLE_ID)

    expect(second.props.fontSize).toEqual(pt(12))
  })
})
