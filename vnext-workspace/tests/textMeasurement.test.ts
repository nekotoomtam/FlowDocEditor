import { describe, expect, it } from "vitest"
import type { DocumentNode } from "../src/schema/document.js"
import { runVNextOperation } from "../src/operations/documentOperations.js"
import {
  createApproximateVNextTextMeasurer,
  createVNextTextMeasurementCache,
  measureVNextText,
  resolveVNextTextMeasurementInvalidation,
  type VNextTextMeasurer,
} from "../src/pagination/textMeasurement.js"

function pt(value: number) {
  return { value, unit: "pt" as const }
}

function measurementDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "measurement-doc",
      meta: { title: "Measurement Contract" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["title", "body"] },
          title: {
            id: "title",
            type: "text-block",
            role: { role: "heading", level: 1 },
            props: { textStyleId: "heading-xl" },
            children: [{ id: "title-text", type: "text", text: "Title" }],
          },
          body: {
            id: "body",
            type: "text-block",
            role: { role: "paragraph" },
            props: {},
            children: [{ id: "body-text", type: "text", text: "Body" }],
          },
        },
      }],
    },
  }
}

function columnsMeasurementDoc(): DocumentNode {
  return {
    version: 3,
    document: {
      id: "measurement-columns-doc",
      meta: { title: "Measurement Columns" },
      sections: [{
        id: "section-main",
        type: "section",
        page: {
          size: "A4",
          orientation: "portrait",
          margin: {
            top: pt(72),
            right: pt(72),
            bottom: pt(72),
            left: pt(72),
          },
        },
        zoneIds: ["body-zone"],
        nodes: {
          "body-zone": { id: "body-zone", type: "zone", role: "body", childIds: ["columns"] },
          columns: { id: "columns", type: "columns", props: {}, columnIds: ["left", "right"] },
          left: { id: "left", type: "column", props: { widthShare: 50 }, childIds: ["left-text"] },
          right: { id: "right", type: "column", props: { widthShare: 50 }, childIds: ["right-text"] },
          "left-text": {
            id: "left-text",
            type: "text-block",
            role: { role: "paragraph" },
            props: {},
            children: [{ id: "left-run", type: "text", text: "Left text" }],
          },
          "right-text": {
            id: "right-text",
            type: "text-block",
            role: { role: "paragraph" },
            props: {},
            children: [{ id: "right-run", type: "text", text: "Right text" }],
          },
        },
      }],
    },
  }
}

function countingMeasurer(calls: { value: number }): VNextTextMeasurer {
  const approximate = createApproximateVNextTextMeasurer({ charWidthPt: 5, lineHeightPt: 12 })

  return {
    measure(input) {
      calls.value += 1
      return approximate.measure(input)
    },
  }
}

describe("vNext text measurement contract", () => {
  it("uses stable cache keys for identical measurement requests", () => {
    const cache = createVNextTextMeasurementCache()
    const calls = { value: 0 }
    const measurer = countingMeasurer(calls)
    const input = {
      documentId: "doc",
      sectionId: "section",
      nodeId: "title",
      text: "Measure me",
      availableWidthPt: 120,
      styleKey: "heading-xl",
      measurementProfileId: "browser-layout-v1",
    }

    const first = measureVNextText(input, measurer, cache)
    const second = measureVNextText(input, measurer, cache)
    const narrower = measureVNextText({ ...input, availableWidthPt: 60 }, measurer, cache)

    expect(calls.value).toBe(2)
    expect(first.cacheStatus).toBe("miss")
    expect(second.cacheStatus).toBe("hit")
    expect(second.cacheKey).toBe(first.cacheKey)
    expect(narrower.cacheKey).not.toBe(first.cacheKey)
    expect(first.lineBoxes[0]).toMatchObject({
      index: 0,
      text: "Measure me",
      heightPt: 12,
      yOffsetPt: 0,
    })
  })

  it("evicts only affected text measurements from operation invalidation", () => {
    const doc = measurementDoc()
    const cache = createVNextTextMeasurementCache()
    const calls = { value: 0 }
    const measurer = countingMeasurer(calls)
    const title = measureVNextText({
      documentId: doc.document.id,
      sectionId: "section-main",
      nodeId: "title",
      text: "Title",
      availableWidthPt: 200,
      styleKey: "heading-xl",
      measurementProfileId: "browser-layout-v1",
    }, measurer, cache)
    const body = measureVNextText({
      documentId: doc.document.id,
      sectionId: "section-main",
      nodeId: "body",
      text: "Body",
      availableWidthPt: 200,
      styleKey: "paragraph",
      measurementProfileId: "browser-layout-v1",
    }, measurer, cache)

    const result = runVNextOperation(doc, {
      kind: "text-block.text.replace",
      nodeId: "title",
      children: [{ id: "title-text-next", type: "text", text: "Updated title" }],
    })
    const invalidation = resolveVNextTextMeasurementInvalidation(result)
    const deleted = cache.invalidate(invalidation)

    expect(invalidation).toMatchObject({
      status: "stale",
      sourceOperationKind: "text-block.text.replace",
      affectedSectionIds: ["section-main"],
      affectedNodeIds: ["title"],
      reason: "text-content",
    })
    expect(deleted).toBe(1)
    expect(cache.get(title.cacheKey)).toBeUndefined()
    expect(cache.get(body.cacheKey)).toMatchObject({
      nodeId: "body",
      cacheStatus: "hit",
    })
  })

  it("leaves the cache unchanged for rejected operations", () => {
    const doc = measurementDoc()
    const cache = createVNextTextMeasurementCache()
    const calls = { value: 0 }
    const measurer = countingMeasurer(calls)
    const body = measureVNextText({
      documentId: doc.document.id,
      sectionId: "section-main",
      nodeId: "body",
      text: "Body",
      availableWidthPt: 200,
      styleKey: "paragraph",
    }, measurer, cache)
    const result = runVNextOperation(doc, {
      kind: "text-block.text.replace",
      nodeId: "missing-node",
      children: [{ id: "missing-text", type: "text", text: "Nope" }],
    })
    const invalidation = resolveVNextTextMeasurementInvalidation(result)

    expect(cache.invalidate(invalidation)).toBe(0)
    expect(cache.get(body.cacheKey)).toMatchObject({
      nodeId: "body",
      cacheStatus: "hit",
    })
  })

  it("broadly evicts section measurements for layout operations without text-block scope", () => {
    const doc = columnsMeasurementDoc()
    const cache = createVNextTextMeasurementCache()
    const calls = { value: 0 }
    const measurer = countingMeasurer(calls)
    const left = measureVNextText({
      documentId: doc.document.id,
      sectionId: "section-main",
      nodeId: "left-text",
      text: "Left text",
      availableWidthPt: 200,
      styleKey: "paragraph",
    }, measurer, cache)
    const right = measureVNextText({
      documentId: doc.document.id,
      sectionId: "section-main",
      nodeId: "right-text",
      text: "Right text",
      availableWidthPt: 200,
      styleKey: "paragraph",
    }, measurer, cache)
    const result = runVNextOperation(doc, {
      kind: "columns.layout.patch",
      columnsId: "columns",
      widthShares: [30, 70],
    })
    const invalidation = resolveVNextTextMeasurementInvalidation(result)

    expect(invalidation).toMatchObject({
      status: "stale",
      sourceOperationKind: "columns.layout.patch",
      affectedSectionIds: ["section-main"],
      affectedNodeIds: [],
      reason: "node-layout",
    })
    expect(cache.invalidate(invalidation)).toBe(2)
    expect(cache.get(left.cacheKey)).toBeUndefined()
    expect(cache.get(right.cacheKey)).toBeUndefined()
  })
})
