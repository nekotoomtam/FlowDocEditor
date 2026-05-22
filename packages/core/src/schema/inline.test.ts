import { describe, expect, it } from "vitest"
import { pt } from "./units"
import { TextRunSchema } from "./inline"

describe("inline schema", () => {
  it("accepts optional rich text style on text runs", () => {
    const parsed = TextRunSchema.parse({
      id: "t1",
      type: "text",
      text: "Styled",
      style: {
        fontSize: pt(18),
        fontFamilyKey: "sarabun",
        textColor: "2563EB",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: "underline",
        strikethrough: true,
      },
    })

    expect(parsed.style).toEqual({
      fontSize: pt(18),
      fontFamilyKey: "sarabun",
      textColor: "2563EB",
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline",
      strikethrough: true,
    })
  })

  it("rejects malformed text run style values", () => {
    expect(() =>
      TextRunSchema.parse({
        id: "t1",
        type: "text",
        text: "Bad",
        style: {
          fontSize: pt(0),
          textColor: "blue",
          fontWeight: "heavy",
        },
      }),
    ).toThrow()
  })
})
