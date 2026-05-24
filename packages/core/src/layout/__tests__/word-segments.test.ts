import { describe, expect, it } from "vitest"
import { defaultWordBreaker } from "../types"
import { thaiWordBreaker } from "../word-breaker"
import { repairThaiSegmentBoundaries } from "../word-segments"

describe("Thai word segment repair", () => {
  it("keeps Thai combining marks attached to the previous segment", () => {
    expect(repairThaiSegmentBoundaries(["ก", "\u0E48"])).toEqual(["ก่"])
  })

  it("keeps short Thai thanthakhat tails attached to the previous Thai segment", () => {
    expect(repairThaiSegmentBoundaries(["ฮ", "อร์", "มุซ"])).toEqual(["ฮอร์", "มุซ"])
    expect(repairThaiSegmentBoundaries(["ช", "อร์ต"])).toEqual(["ชอร์ต"])
    expect(repairThaiSegmentBoundaries(["สกา", "ร์"])).toEqual(["สการ์"])
  })

  it("does not merge ordinary Thai word segments or whitespace-separated tails", () => {
    expect(repairThaiSegmentBoundaries(["ข่าว", "ช่วง", "วัน", "ที่"])).toEqual(["ข่าว", "ช่วง", "วัน", "ที่"])
    expect(repairThaiSegmentBoundaries(["คำ", " ", "ร์"])).toEqual(["คำ", " ", "ร์"])
  })

  it("preserves full text while repairing real Intl Thai segments", () => {
    const text = "ช่องแคบฮอร์มุซ"
    const segments = defaultWordBreaker.segment(text)

    expect(segments.join("")).toBe(text)
    expect(segments).toContain("ฮอร์")
    expect(segments).not.toContain("อร์")
  })

  it("splits known Thai compound terms into readable wrap units", () => {
    expect(defaultWordBreaker.segment("ตะวันออกกลาง")).toEqual(["ตะวัน", "ออก", "กลาง"])
  })

  it("uses the same repaired segmentation on the server Thai word breaker alias", () => {
    const text = "ช่องแคบฮอร์มุซ"

    expect(thaiWordBreaker.segment(text)).toEqual(defaultWordBreaker.segment(text))
  })
})
