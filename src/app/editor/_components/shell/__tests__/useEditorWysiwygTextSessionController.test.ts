import { describe, expect, it } from "vitest"
import { resolveWysiwygDraftStoreStartFromTextUpdate } from "../useEditorWysiwygTextSessionController"

describe("resolveWysiwygDraftStoreStartFromTextUpdate", () => {
  it("preserves a structural start caret at the beginning of non-empty split text", () => {
    expect(resolveWysiwygDraftStoreStartFromTextUpdate({
      nodeId: "p-new",
      text: "tail text after split",
      caretOffset: 0,
    })).toEqual({
      nodeId: "p-new",
      text: "tail text after split",
      caretIndex: 0,
      selection: { anchorOffset: 0, focusOffset: 0 },
      source: "start-plain-text-session-from-text",
    })
  })

  it("keeps an unspecified caret as null so normal draft initialization can choose its fallback", () => {
    expect(resolveWysiwygDraftStoreStartFromTextUpdate({
      nodeId: "p-clicked",
      text: "clicked text",
    })).toEqual({
      nodeId: "p-clicked",
      text: "clicked text",
      caretIndex: null,
      selection: null,
      source: "start-plain-text-session-from-text",
    })
  })
})
