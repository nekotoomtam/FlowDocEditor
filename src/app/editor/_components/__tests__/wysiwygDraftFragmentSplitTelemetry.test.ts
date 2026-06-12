import { describe, expect, it } from "vitest"
import type { PageFragment } from "@/pagination"
import {
  buildWysiwygDraftFragmentSplitVisualSignature,
  classifyWysiwygDraftFragmentSplitTelemetry,
  resolveWysiwygDraftFragmentSplitReuse,
  WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL,
  type WysiwygDraftFragmentSplitTelemetryInput,
} from "../wysiwygDraftFragmentSplitTelemetry"

function line(text: string, overrides: Partial<NonNullable<PageFragment["lines"]>[number]> = {}): NonNullable<PageFragment["lines"]>[number] {
  return {
    text,
    x: 0,
    y: 10,
    width: 50,
    height: 12,
    ...overrides,
  }
}

function fragment(overrides: Partial<PageFragment> = {}): PageFragment {
  return {
    nodeId: "p1",
    nodeType: "paragraph",
    pageIndex: 0,
    x: 0,
    y: 10,
    width: 200,
    height: 24,
    fragmentIndex: 0,
    lineStart: 0,
    lineEnd: 1,
    lines: [],
    ...overrides,
  } as PageFragment
}

function input(overrides: Partial<WysiwygDraftFragmentSplitTelemetryInput> = {}): WysiwygDraftFragmentSplitTelemetryInput {
  const sourceFragment = fragment()
  return {
    nodeId: "p1",
    draftVersion: 1,
    textLength: 10,
    lineCount: 1,
    paragraphHeight: 24,
    candidatePageCount: 2,
    source: "split-pages",
    sourceFragment,
    fragments: [sourceFragment],
    ...overrides,
  }
}

describe("classifyWysiwygDraftFragmentSplitTelemetry", () => {
  it("builds a visual signature without exposing raw line text", () => {
    const signature = buildWysiwygDraftFragmentSplitVisualSignature([
      fragment({
        lines: [line("Alpha", {
          runs: [{
            text: "Alpha",
            start: 0,
            end: 5,
            x: 0,
            width: 50,
            sourceType: "text",
            style: {
              fontSize: 12,
              fontFamilyKey: "body",
              textColor: "111827",
              fontWeight: "bold",
              fontStyle: "normal",
              textDecoration: "none",
              strikethrough: false,
              fontVariant: "regular",
              lineHeight: 14,
            },
          }],
        })],
      }),
    ])

    expect(signature).not.toContain("Alpha")
    expect(signature).toContain("5:")
    expect(signature).toContain("bold")
  })

  it("marks the first split as changed with zero repeats", () => {
    const result = classifyWysiwygDraftFragmentSplitTelemetry(null, input())

    expect(result.shouldEmitEvent).toBe(true)
    expect(result.metadata).toMatchObject({
      draftFragmentInputChanged: true,
      draftFragmentOutputChanged: true,
      draftFragmentSameInputRepeatCount: 0,
      draftFragmentSameOutputRepeatCount: 0,
      draftFragmentSuppressedOutputUnchangedCount: 0,
    })
  })

  it("samples the first repeated split with identical output signatures", () => {
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input())
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input())

    expect(second.shouldEmitEvent).toBe(true)
    expect(second.metadata).toMatchObject({
      draftFragmentInputChanged: false,
      draftFragmentOutputChanged: false,
      draftFragmentSameInputRepeatCount: 1,
      draftFragmentSameOutputRepeatCount: 1,
      draftFragmentTelemetrySampled: true,
      draftFragmentSuppressedOutputUnchangedCount: 0,
    })
  })

  it("separates changed input from unchanged visual output", () => {
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input())
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input({
      draftVersion: 2,
      textLength: 11,
    }))

    expect(second.shouldEmitEvent).toBe(true)
    expect(second.metadata).toMatchObject({
      draftFragmentInputChanged: true,
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: false,
      draftFragmentSameInputRepeatCount: 0,
      draftFragmentSameOutputRepeatCount: 1,
      draftFragmentSameVisualRepeatCount: 1,
      draftFragmentTelemetrySampled: true,
    })
  })

  it("separates stable geometry output from changed line visuals", () => {
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input({
      fragments: [fragment({ lines: [line("Alpha")] })],
    }))
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input({
      draftVersion: 2,
      textLength: 5,
      fragments: [fragment({ lines: [line("Bravo")] })],
    }))

    expect(second.shouldEmitEvent).toBe(true)
    expect(second.metadata).toMatchObject({
      draftFragmentInputChanged: true,
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: true,
      draftFragmentSameOutputRepeatCount: 1,
      draftFragmentSameVisualRepeatCount: 0,
      draftFragmentTelemetrySampled: false,
    })
  })

  it("emits stable-geometry visual changes between unchanged-output sample intervals", () => {
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input({
      fragments: [fragment({ lines: [line("Alpha")] })],
    }))
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input({
      draftVersion: 2,
      fragments: [fragment({ lines: [line("Bravo")] })],
    }))
    const third = classifyWysiwygDraftFragmentSplitTelemetry(second.nextState, input({
      draftVersion: 3,
      fragments: [fragment({ lines: [line("Charlie")] })],
    }))

    expect(third.shouldEmitEvent).toBe(true)
    expect(third.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: true,
      draftFragmentSameOutputRepeatCount: 2,
      draftFragmentSameVisualRepeatCount: 0,
      draftFragmentTelemetrySampled: false,
      draftFragmentSuppressedOutputUnchangedCount: 0,
    })
    expect(third.nextState.suppressedOutputUnchangedCount).toBe(0)
  })

  it("separates unchanged input from changed visual output", () => {
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input())
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input({
      fragments: [fragment({ height: 48, lineEnd: 2 })],
    }))

    expect(second.shouldEmitEvent).toBe(true)
    expect(second.metadata).toMatchObject({
      draftFragmentInputChanged: false,
      draftFragmentOutputChanged: true,
      draftFragmentVisualChanged: true,
      draftFragmentSameInputRepeatCount: 1,
      draftFragmentSameOutputRepeatCount: 0,
      draftFragmentSameVisualRepeatCount: 0,
      draftFragmentTelemetrySampled: false,
    })
  })

  it("tracks fragment array identity separately from stable surface keys", () => {
    const firstFragments = [fragment()]
    const secondFragments = [fragment()]
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input({
      fragments: firstFragments,
      surfaceKeySignature: "surface-a",
    }))
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input({
      fragments: secondFragments,
      surfaceKeySignature: "surface-a",
    }))

    expect(second.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: false,
      draftFragmentArrayReused: false,
      draftFragmentSameArrayRepeatCount: 0,
      draftFragmentSameVisualRepeatCount: 1,
      draftSurfaceKeysChanged: false,
      draftSurfaceSameKeyRepeatCount: 1,
    })
  })

  it("tracks repeated fragment array references when a caller reuses split output", () => {
    const fragments = [fragment()]
    const first = classifyWysiwygDraftFragmentSplitTelemetry(null, input({
      fragments,
      surfaceKeySignature: "surface-a",
    }))
    const second = classifyWysiwygDraftFragmentSplitTelemetry(first.nextState, input({
      fragments,
      surfaceKeySignature: "surface-a",
    }))

    expect(second.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: false,
      draftFragmentArrayReused: true,
      draftFragmentSameArrayRepeatCount: 1,
      draftFragmentSameVisualRepeatCount: 1,
      draftSurfaceKeysChanged: false,
      draftSurfaceSameKeyRepeatCount: 1,
    })
  })

  it("reuses the previous split result only when the visual signature is stable", () => {
    const firstFragments = [fragment({ lines: [line("Alpha")] })]
    const secondFragments = [fragment({ lines: [line("Alpha")] })]
    const firstTelemetry = classifyWysiwygDraftFragmentSplitTelemetry(null, input({
      fragments: firstFragments,
      surfaceKeySignature: "surface-a",
    }))
    const firstReuse = resolveWysiwygDraftFragmentSplitReuse(null, firstTelemetry, firstFragments)
    const secondTelemetry = classifyWysiwygDraftFragmentSplitTelemetry(firstTelemetry.nextState, input({
      draftVersion: 2,
      fragments: secondFragments,
      surfaceKeySignature: "surface-a",
    }))
    const secondReuse = resolveWysiwygDraftFragmentSplitReuse(firstReuse.nextState, secondTelemetry, secondFragments)

    expect(firstReuse.metadata).toMatchObject({
      draftFragmentReuseCandidate: false,
      draftFragmentResultReused: false,
      draftFragmentSameResultReuseRepeatCount: 0,
      draftFragmentArrayReused: false,
      draftFragmentSameArrayRepeatCount: 0,
    })
    expect(firstReuse.fragments).toBe(firstFragments)
    expect(secondTelemetry.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: false,
      draftSurfaceKeysChanged: false,
    })
    expect(secondReuse.metadata).toMatchObject({
      draftFragmentReuseCandidate: true,
      draftFragmentResultReused: true,
      draftFragmentSameResultReuseRepeatCount: 1,
      draftFragmentArrayReused: true,
      draftFragmentSameArrayRepeatCount: 1,
    })
    expect(secondReuse.fragments).toBe(firstFragments)
  })

  it("does not reuse stable-geometry split output when line visuals changed", () => {
    const firstFragments = [fragment({ lines: [line("Alpha")] })]
    const secondFragments = [fragment({ lines: [line("Bravo")] })]
    const firstTelemetry = classifyWysiwygDraftFragmentSplitTelemetry(null, input({
      fragments: firstFragments,
      surfaceKeySignature: "surface-a",
    }))
    const firstReuse = resolveWysiwygDraftFragmentSplitReuse(null, firstTelemetry, firstFragments)
    const secondTelemetry = classifyWysiwygDraftFragmentSplitTelemetry(firstTelemetry.nextState, input({
      draftVersion: 2,
      fragments: secondFragments,
      surfaceKeySignature: "surface-a",
    }))
    const secondReuse = resolveWysiwygDraftFragmentSplitReuse(firstReuse.nextState, secondTelemetry, secondFragments)

    expect(secondTelemetry.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentVisualChanged: true,
      draftSurfaceKeysChanged: false,
    })
    expect(secondReuse.metadata).toMatchObject({
      draftFragmentReuseCandidate: false,
      draftFragmentResultReused: false,
      draftFragmentSameResultReuseRepeatCount: 0,
      draftFragmentArrayReused: false,
      draftFragmentSameArrayRepeatCount: 0,
    })
    expect(secondReuse.fragments).toBe(secondFragments)
  })

  it("suppresses unchanged output repeats between sample intervals", () => {
    let result = classifyWysiwygDraftFragmentSplitTelemetry(null, input())
    result = classifyWysiwygDraftFragmentSplitTelemetry(result.nextState, input())
    result = classifyWysiwygDraftFragmentSplitTelemetry(result.nextState, input())

    expect(result.shouldEmitEvent).toBe(false)
    expect(result.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentSameOutputRepeatCount: 2,
      draftFragmentSuppressedOutputUnchangedCount: 0,
    })
    expect(result.nextState.suppressedOutputUnchangedCount).toBe(1)
  })

  it("emits unchanged output interval samples with the suppressed repeat count", () => {
    let result = classifyWysiwygDraftFragmentSplitTelemetry(null, input())
    for (let index = 0; index < WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL; index += 1) {
      result = classifyWysiwygDraftFragmentSplitTelemetry(result.nextState, input())
    }

    expect(result.shouldEmitEvent).toBe(true)
    expect(result.metadata).toMatchObject({
      draftFragmentOutputChanged: false,
      draftFragmentSameOutputRepeatCount: WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL,
      draftFragmentTelemetrySampled: true,
      draftFragmentSuppressedOutputUnchangedCount: WYSIWYG_DRAFT_FRAGMENT_SPLIT_UNCHANGED_OUTPUT_SAMPLE_INTERVAL - 2,
    })
    expect(result.nextState.suppressedOutputUnchangedCount).toBe(0)
  })
})
