import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { mm } from "@/schema"
import { makeHeaderFooterZoneDocument } from "../wysiwygStage3StressScenarios"
import { PagePanel, resolveHeaderFooterMiniMap, resolveHeaderFooterReservedValueFromMiniMapY } from "../PagePanel"

describe("PagePanel", () => {
  it("shows header/footer reserved height summary", () => {
    const doc = makeHeaderFooterZoneDocument()
    const markup = renderToStaticMarkup(createElement(PagePanel, {
      doc,
      sectionIndex: 0,
      editable: true,
      onUpdateMargin: () => undefined,
      onUpdateReservedZones: () => undefined,
      onToggleReservedZone: () => undefined,
      onUpdateHeaderFooterMode: () => undefined,
    }))

    expect(markup).toContain("data-testid=\"page-header-footer-card\"")
    expect(markup).toContain("Header/Footer")
    expect(markup).toContain("42 pt / 32 pt")
  })

  it("resolves a mini page map from header/footer reserved heights", () => {
    const doc = makeHeaderFooterZoneDocument()
    const section = doc.document.sections[0]
    const map = resolveHeaderFooterMiniMap(section, {
      headerReserved: 42,
      footerReserved: 32,
    })

    expect(map.labels.header).toBe("42 pt")
    expect(map.labels.footer).toBe("32 pt")
    expect(map.labels.body).toBe("624 pt")
    expect(map.values.header).toBe(42)
    expect(map.values.body).toBe(624)
    expect(map.values.footer).toBe(32)
    expect(map.percentages.header).toBe("6%")
    expect(map.percentages.body).toBe("89%")
    expect(map.percentages.footer).toBe("5%")
    expect(map.header.height).toBeGreaterThan(0)
    expect(map.body.height).toBeGreaterThan(map.header.height)
    expect(map.footer.y).toBeGreaterThan(map.body.y)
  })

  it("resolves header/footer mini page geometry from converted page margins", () => {
    const doc = makeHeaderFooterZoneDocument()
    const section = doc.document.sections[0]
    section.page = {
      ...section.page,
      margin: {
        ...section.page.margin,
        top: mm(72 / 2.8346),
        bottom: mm(72 / 2.8346),
      },
    }

    const map = resolveHeaderFooterMiniMap(section, {
      headerReserved: 42,
      footerReserved: 32,
    })

    expect(map.labels.body).toBe("624 pt")
    expect(map.geometry.usableHeight).toBeCloseTo(698)
  })

  it("maps mini page drag positions back to reserved heights", () => {
    const doc = makeHeaderFooterZoneDocument()
    const section = doc.document.sections[0]
    const map = resolveHeaderFooterMiniMap(section, {
      headerReserved: 42,
      footerReserved: 32,
    })
    const quarterY = map.geometry.usableMapTop + map.geometry.usableMapHeight * 0.25
    const footerQuarterY = map.geometry.usableMapBottom - map.geometry.usableMapHeight * 0.25

    expect(resolveHeaderFooterReservedValueFromMiniMapY(section, {
      headerReserved: 42,
      footerReserved: 32,
    }, "headerReserved", quarterY)).toBe(174.5)
    expect(resolveHeaderFooterReservedValueFromMiniMapY(section, {
      headerReserved: 42,
      footerReserved: 32,
    }, "footerReserved", footerQuarterY)).toBe(174.5)
  })
})
