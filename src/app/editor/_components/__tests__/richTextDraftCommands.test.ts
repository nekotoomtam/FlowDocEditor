import { describe, expect, it } from "vitest"
import type { InlineNode, ParagraphNode, TextRun } from "@/schema"
import { pt } from "@/schema"
import {
  applyRichTextDraftSessionCommand,
  getRichTextDraftSessionCommandPatch,
  getRichTextDraftSessionCommandState,
  resolveRichTextDraftKeyboardCommand,
} from "../richTextDraftCommands"
import {
  INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION,
  projectRichTextDraftSessionToWysiwygTextSession,
  replaceRichTextDraftSessionSelection,
  startWysiwygRichTextDraftSessionState,
} from "../richTextDraftSession"

function textRun(id: string, text: string, style?: TextRun["style"]): TextRun {
  return style
    ? { id, type: "text", text, style }
    : { id, type: "text", text }
}

function paragraph(children: InlineNode[], props: Partial<ParagraphNode["props"]> = {}): ParagraphNode {
  return {
    id: "p1",
    type: "paragraph",
    props: {
      align: "left",
      fontSize: pt(12),
      fontFamilyKey: "sarabun",
      textColor: "111827",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      strikethrough: false,
      lineHeight: 1.5,
      spacingBefore: pt(0),
      spacingAfter: pt(0),
      textIndent: pt(0),
      indentLeft: pt(0),
      indentRight: pt(0),
      ...props,
    },
    children,
  }
}

function textRunSummary(node: ParagraphNode): unknown[] {
  return node.children.map((child) =>
    child.type === "text"
      ? { text: child.text, style: child.style }
      : child,
  )
}

describe("rich text draft command adapter", () => {
  it("turns inherited collapsed bold off with an explicit pending normal style", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "A", { fontWeight: "bold" })]),
      caretOffset: 1,
    })

    expect(getRichTextDraftSessionCommandState(started)?.bold).toEqual({
      active: true,
      mixed: false,
    })

    const pendingNormal = applyRichTextDraftSessionCommand(started, { type: "toggleBold" })
    const inserted = replaceRichTextDraftSessionSelection(pendingNormal, "x")

    expect(projectRichTextDraftSessionToWysiwygTextSession(pendingNormal)).toMatchObject({
      draftText: "A",
      dirtyVersion: 0,
    })
    expect(pendingNormal.draft?.pendingStyle).toEqual({ fontWeight: "normal" })
    expect(getRichTextDraftSessionCommandState(pendingNormal)?.bold).toEqual({
      active: false,
      mixed: false,
    })
    expect(textRunSummary(inserted.draft!.paragraph)).toEqual([
      { text: "A", style: { fontWeight: "bold" } },
      { text: "x", style: { fontWeight: "normal" } },
    ])
  })

  it("toggles a mixed selected range on by applying the active value to the whole range", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([
        textRun("t1", "A", { fontWeight: "bold" }),
        textRun("t2", "B", { fontWeight: "normal" }),
      ]),
      caretOffset: 2,
    })
    const selected = {
      ...started,
      draft: {
        ...started.draft!,
        selection: { anchorOffset: 0, focusOffset: 2 },
      },
    }

    expect(getRichTextDraftSessionCommandState(selected)?.bold).toEqual({
      active: false,
      mixed: true,
    })

    const bold = applyRichTextDraftSessionCommand(selected, { type: "toggleBold" })

    expect(projectRichTextDraftSessionToWysiwygTextSession(bold)).toMatchObject({
      draftText: "AB",
      dirtyVersion: 1,
    })
    expect(textRunSummary(bold.draft!.paragraph)).toEqual([
      { text: "AB", style: { fontWeight: "bold" } },
    ])
  })

  it("exposes the same patch resolver used by the live editor bridge", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "A", { fontStyle: "italic" })]),
      caretOffset: 1,
    })

    expect(getRichTextDraftSessionCommandPatch(started, { type: "toggleItalic" })).toEqual({
      fontStyle: "normal",
    })
    expect(getRichTextDraftSessionCommandPatch(started, {
      type: "setStyle",
      patch: { textColor: "DC2626" },
    })).toEqual({ textColor: "DC2626" })
  })

  it("toggles underline off with explicit none so paragraph defaults cannot leak through", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "Hello", { textDecoration: "underline" })]),
      caretOffset: 5,
    })
    const selected = {
      ...started,
      draft: {
        ...started.draft!,
        selection: { anchorOffset: 0, focusOffset: 5 },
      },
    }

    const plain = applyRichTextDraftSessionCommand(selected, { type: "toggleUnderline" })

    expect(getRichTextDraftSessionCommandState(selected)?.underline).toEqual({
      active: true,
      mixed: false,
    })
    expect(textRunSummary(plain.draft!.paragraph)).toEqual([
      { text: "Hello", style: { textDecoration: "none" } },
    ])
  })

  it("applies direct style patches through the same session dirty-version path", () => {
    const started = startWysiwygRichTextDraftSessionState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, {
      nodeId: "p1",
      paragraph: paragraph([textRun("t1", "A")]),
      caretOffset: 1,
    })
    const selected = {
      ...started,
      draft: {
        ...started.draft!,
        selection: { anchorOffset: 0, focusOffset: 1 },
      },
    }

    const styled = applyRichTextDraftSessionCommand(selected, {
      type: "setStyle",
      patch: { fontFamilyKey: "notoSansThai", textColor: "DC2626", fontSize: pt(16) },
    })

    expect(projectRichTextDraftSessionToWysiwygTextSession(styled)).toMatchObject({
      draftText: "A",
      dirtyVersion: 1,
    })
    expect(textRunSummary(styled.draft!.paragraph)).toEqual([
      {
        text: "A",
        style: { fontFamilyKey: "notoSansThai", textColor: "DC2626", fontSize: pt(16) },
      },
    ])
  })

  it("maps only safe primary-key rich text shortcuts", () => {
    expect(resolveRichTextDraftKeyboardCommand({ key: "b", ctrlKey: true })).toEqual({ type: "toggleBold" })
    expect(resolveRichTextDraftKeyboardCommand({ key: "I", metaKey: true })).toEqual({ type: "toggleItalic" })
    expect(resolveRichTextDraftKeyboardCommand({ key: "u", ctrlKey: true })).toEqual({ type: "toggleUnderline" })
    expect(resolveRichTextDraftKeyboardCommand({ key: "b" })).toBeNull()
    expect(resolveRichTextDraftKeyboardCommand({ key: "b", ctrlKey: true, altKey: true })).toBeNull()
    expect(resolveRichTextDraftKeyboardCommand({ key: "b", ctrlKey: true, isComposing: true })).toBeNull()
  })

  it("leaves inactive rich draft sessions unchanged", () => {
    expect(applyRichTextDraftSessionCommand(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION, { type: "toggleBold" }))
      .toBe(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION)
    expect(getRichTextDraftSessionCommandState(INACTIVE_WYSIWYG_RICH_TEXT_DRAFT_SESSION)).toBeNull()
  })
})
